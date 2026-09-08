use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

pub const MAX_PACK_BYTES: u64 = 512 * 1024 * 1024;

pub fn is_packable(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".osb") || lower.ends_with(".db") {
        return false;
    }
    !lower.starts_with('.')
}

pub fn pack_folder(dir: &Path) -> Result<Vec<u8>, String> {
    let entries = fs::read_dir(dir).map_err(|err| format!("Cannot read the map folder: {err}"))?;

    let mut files: Vec<PathBuf> = Vec::new();
    let mut total: u64 = 0;
    for entry in entries {
        let entry = entry.map_err(|err| format!("Cannot read the map folder: {err}"))?;
        let meta = match entry.metadata() {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        if !meta.is_file() {
            continue;
        }
        let name = entry.file_name();
        let name = match name.to_str() {
            Some(name) => name,
            None => continue,
        };
        if !is_packable(name) {
            continue;
        }
        total = total.saturating_add(meta.len());
        if total > MAX_PACK_BYTES {
            return Err("This map folder is larger than 512 MB.".to_string());
        }
        files.push(entry.path());
    }

    if files.is_empty() {
        return Err("That map folder is empty.".to_string());
    }
    if !files
        .iter()
        .any(|path| has_extension(path, "osu"))
    {
        return Err("That folder has no .osu difficulty in it.".to_string());
    }

    files.sort();

    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    for path in files {
        let name = match path.file_name().and_then(|name| name.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let bytes = fs::read(&path).map_err(|err| format!("Cannot read {name}: {err}"))?;
        writer
            .start_file(name, options)
            .map_err(|err| format!("Cannot pack the map: {err}"))?;
        writer
            .write_all(&bytes)
            .map_err(|err| format!("Cannot pack the map: {err}"))?;
    }
    let cursor = writer
        .finish()
        .map_err(|err| format!("Cannot pack the map: {err}"))?;
    Ok(cursor.into_inner())
}

pub fn has_extension(path: &Path, ext: &str) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case(ext))
        .unwrap_or(false)
}

pub fn write_temp_osz(bytes: &[u8], file_name: &str) -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join("cascade-osu");
    fs::create_dir_all(&dir).map_err(|err| format!("Cannot create a temp folder: {err}"))?;
    prune(&dir);
    let path = dir.join(file_name);
    let mut file =
        fs::File::create(&path).map_err(|err| format!("Cannot write the .osz: {err}"))?;
    file.write_all(bytes)
        .map_err(|err| format!("Cannot write the .osz: {err}"))?;
    file.flush()
        .map_err(|err| format!("Cannot write the .osz: {err}"))?;
    Ok(path)
}

fn prune(dir: &Path) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(60 * 60);
    for entry in entries.flatten() {
        let stale = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .map(|modified| modified < cutoff)
            .unwrap_or(false);
        if stale {
            let _ = fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_storyboards_databases_and_dotfiles() {
        assert!(is_packable("Artist - Title (Creator) [Insane].osu"));
        assert!(is_packable("audio.mp3"));
        assert!(is_packable("bg.jpg"));
        assert!(!is_packable("Artist - Title.osb"));
        assert!(!is_packable("osu!.db"));
        assert!(!is_packable(".DS_Store"));
    }

    #[test]
    fn matches_extensions_without_case_sensitivity() {
        assert!(has_extension(Path::new("a/b/Map.OSU"), "osu"));
        assert!(has_extension(Path::new("a/b/Map.osu"), "osu"));
        assert!(!has_extension(Path::new("a/b/Map.mp3"), "osu"));
        assert!(!has_extension(Path::new("a/b/Map"), "osu"));
    }

    #[test]
    fn packs_a_folder_into_a_readable_archive() {
        let dir = std::env::temp_dir().join(format!("cascade-pack-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("Map [Easy].osu"), b"osu file format v14").unwrap();
        fs::write(dir.join("audio.mp3"), b"not really audio").unwrap();
        fs::write(dir.join("story.osb"), b"skipped").unwrap();

        let bytes = pack_folder(&dir).unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        names.sort();
        assert_eq!(names, vec!["Map [Easy].osu", "audio.mp3"]);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_a_folder_with_no_difficulty() {
        let dir = std::env::temp_dir().join(format!("cascade-nodiff-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("audio.mp3"), b"audio").unwrap();

        let err = pack_folder(&dir).unwrap_err();
        assert!(err.contains(".osu"), "unexpected error: {err}");

        let _ = fs::remove_dir_all(&dir);
    }
}
