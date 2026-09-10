use std::collections::BTreeSet;
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const MARKER: &str = ".cascade-sync.json";

#[derive(Serialize, Deserialize, Default)]
pub struct Marker {
    pub files: Vec<String>,
}

pub fn folder_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or(raw);
    let cleaned: String = base
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' | '/' | '\\' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').trim();
    if trimmed.is_empty() {
        return "Cascade map".to_string();
    }
    trimmed.chars().take(120).collect::<String>().trim().to_string()
}

pub fn entry_name(raw: &str) -> Option<String> {
    if raw.ends_with('/') || raw.ends_with('\\') {
        return None;
    }
    let base = raw.rsplit(['/', '\\']).next().unwrap_or(raw);
    if base.is_empty() || base == "." || base == ".." || base.starts_with('.') {
        return None;
    }
    if base.chars().any(|c| c.is_control()) {
        return None;
    }
    Some(base.to_string())
}

pub fn read_marker(dir: &Path) -> Option<Marker> {
    let text = fs::read_to_string(dir.join(MARKER)).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn sync_archive(songs: &Path, folder: &str, archive: &[u8]) -> Result<PathBuf, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(archive))
        .map_err(|err| format!("Cannot read the exported map: {err}"))?;
    crate::archive::validate_zip(
        &mut zip,
        archive.len() as u64,
        crate::archive::DEFAULT_ARCHIVE_LIMITS,
    )?;

    let name = folder_name(folder);
    let dir = songs.join(&name);

    let previous = if dir.exists() {
        match read_marker(&dir) {
            Some(marker) => marker.files,
            None => {
                return Err(format!(
                    "\"{name}\" already exists in your Songs folder and Cascade did not create \
                     it. Rename your map, or delete that folder first."
                ))
            }
        }
    } else {
        fs::create_dir_all(&dir).map_err(|err| format!("Cannot create the map folder: {err}"))?;
        Vec::new()
    };

    let mut written: BTreeSet<String> = BTreeSet::new();
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|err| format!("Cannot read the exported map: {err}"))?;
        if entry.is_dir() {
            continue;
        }
        let name = match entry_name(entry.name()) {
            Some(name) => name,
            None => continue,
        };
        let expected = entry.size();
        let mut bytes = Vec::with_capacity(expected as usize);
        entry
            .take(expected.saturating_add(1))
            .read_to_end(&mut bytes)
            .map_err(|err| format!("Cannot read {name}: {err}"))?;
        if bytes.len() as u64 != expected {
            return Err(format!("{name} did not match its declared archive size."));
        }
        fs::write(dir.join(&name), &bytes)
            .map_err(|err| format!("Cannot write {name}: {err}"))?;
        written.insert(name);
    }

    if written.is_empty() {
        return Err("The exported map had no files in it.".to_string());
    }

    for stale in previous.iter().filter(|name| !written.contains(*name)) {
        if entry_name(stale).is_some() {
            let _ = fs::remove_file(dir.join(stale));
        }
    }

    let marker = Marker {
        files: written.into_iter().collect(),
    };
    let text = serde_json::to_string(&marker).map_err(|err| err.to_string())?;
    fs::write(dir.join(MARKER), text)
        .map_err(|err| format!("Cannot write the sync marker: {err}"))?;

    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn archive(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, bytes) in files {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn temp(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cascade-sync-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn keeps_folder_names_to_one_safe_segment() {
        assert_eq!(folder_name("Artist - Title"), "Artist - Title");
        assert_eq!(folder_name("..\\..\\Windows"), "Windows");
        assert_eq!(folder_name("a/b"), "b");
        assert_eq!(folder_name("a:b?c"), "a_b_c");
        assert_eq!(folder_name("   "), "Cascade map");
    }

    #[test]
    fn ignores_nested_and_hidden_archive_entries() {
        assert_eq!(entry_name("map.osu"), Some("map.osu".to_string()));
        assert_eq!(entry_name("sb/sprite.png"), Some("sprite.png".to_string()));
        assert_eq!(entry_name("folder/"), None);
        assert_eq!(entry_name(".hidden"), None);
    }

    #[test]
    fn writes_a_new_folder_and_marks_it() {
        let songs = temp("new");
        let bytes = archive(&[("Map [Easy].osu", b"osu"), ("audio.mp3", b"snd")]);

        let dir = sync_archive(&songs, "Artist - Title", &bytes).unwrap();
        assert!(dir.join("Map [Easy].osu").is_file());
        assert!(dir.join("audio.mp3").is_file());
        assert_eq!(
            read_marker(&dir).unwrap().files,
            vec!["Map [Easy].osu".to_string(), "audio.mp3".to_string()]
        );

        let _ = fs::remove_dir_all(&songs);
    }

    #[test]
    fn refuses_to_touch_a_folder_cascade_did_not_create() {
        let songs = temp("foreign");
        let existing = songs.join("Artist - Title");
        fs::create_dir_all(&existing).unwrap();
        fs::write(existing.join("Downloaded [Hard].osu"), b"precious").unwrap();

        let bytes = archive(&[("Map [Easy].osu", b"osu")]);
        let err = sync_archive(&songs, "Artist - Title", &bytes).unwrap_err();

        assert!(err.contains("did not create it"), "unexpected: {err}");
        assert!(existing.join("Downloaded [Hard].osu").is_file());
        assert!(!existing.join("Map [Easy].osu").exists());

        let _ = fs::remove_dir_all(&songs);
    }

    #[test]
    fn removes_only_files_it_wrote_last_time() {
        let songs = temp("stale");
        let first = archive(&[("Map [Old].osu", b"osu"), ("audio.mp3", b"snd")]);
        let dir = sync_archive(&songs, "Artist - Title", &first).unwrap();
        fs::write(dir.join("user-note.txt"), b"mine").unwrap();

        let second = archive(&[("Map [New].osu", b"osu"), ("audio.mp3", b"snd")]);
        sync_archive(&songs, "Artist - Title", &second).unwrap();

        assert!(!dir.join("Map [Old].osu").exists());
        assert!(dir.join("Map [New].osu").is_file());
        assert!(dir.join("audio.mp3").is_file());
        assert!(dir.join("user-note.txt").is_file());

        let _ = fs::remove_dir_all(&songs);
    }
}
