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

pub fn pack_folder(dir: &Path, required_ext: Option<&str>) -> Result<Vec<u8>, String> {
    pack_folder_where(dir, required_ext, "That folder is empty.", |_| true)
}

/// Packs only the files `keep` accepts, reporting `empty_error` when that
/// leaves nothing. A whole osu! skin folder routinely runs past 100 MB of
/// standard-mode art that mania never draws, and every byte of it would
/// otherwise cross the bridge and go through the browser's unzipper.
pub fn pack_folder_where(
    dir: &Path,
    required_ext: Option<&str>,
    empty_error: &str,
    keep: impl Fn(&str) -> bool,
) -> Result<Vec<u8>, String> {
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
        if !is_packable(name) || !keep(name) {
            continue;
        }
        total = total.saturating_add(meta.len());
        if total > MAX_PACK_BYTES {
            return Err("This map folder is larger than 512 MB.".to_string());
        }
        files.push(entry.path());
    }

    if files.is_empty() {
        return Err(empty_error.to_string());
    }
    if let Some(ext) = required_ext {
        if !files.iter().any(|path| has_extension(path, ext)) {
            return Err(format!("That folder has no .{ext} file in it."));
        }
    }

    files.sort();

    let entries: Vec<(PathBuf, String)> = files
        .into_iter()
        .filter_map(|path| {
            let name = path.file_name()?.to_str()?.to_string();
            Some((path, name))
        })
        .collect();
    write_zip(entries)
}

fn write_zip(entries: Vec<(PathBuf, String)>) -> Result<Vec<u8>, String> {
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    for (path, name) in entries {
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

/// Whether a skin file is one the editor actually reads. This mirrors what
/// `src/lib/skinImport.ts` looks for — the mania elements, the hit samples and
/// the judgement and combo art — so a skin arrives whole while its standard,
/// taiko and catch art, menu videos and backgrounds stay behind.
pub fn is_skin_element(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    if lower == "skin.ini" {
        return true;
    }

    let (stem, ext) = match lower.rsplit_once('.') {
        Some((stem, ext)) => (stem, ext),
        None => return false,
    };

    if matches!(ext, "wav" | "mp3" | "ogg") {
        // normal-hitclap3.wav and friends; anything else audio is menu noise.
        return ["normal-", "soft-", "drum-"]
            .iter()
            .any(|set| stem.starts_with(set))
            && stem.contains("-hit");
    }

    if !matches!(ext, "png" | "jpg" | "jpeg") {
        return false;
    }

    stem.starts_with("mania-")
        || stem.starts_with("combo-")
        || stem.starts_with("score-")
        || stem.starts_with("hit0")
        || stem.starts_with("hit50")
        || stem.starts_with("hit100")
        || stem.starts_with("hit200")
        || stem.starts_with("hit300")
        || stem.starts_with("hitmiss")
        || stem.starts_with("miss")
}

/// Packs a skin folder for the editor: the mania elements sitting at the root,
/// plus every file skin.ini points at by name.
///
/// That second half is the important one. osu! never goes looking inside a
/// skin's subfolders — the only way it reaches `mania/arrows/k_left.png` is an
/// explicit `KeyImage0: mania/arrows/k_left` — and half the skins people have
/// installed are laid out exactly that way. Packing the root alone hands over a
/// skin whose every image reference dangles.
pub fn pack_skin(dir: &Path) -> Result<Vec<u8>, String> {
    fn push(
        entries: &mut Vec<(PathBuf, String)>,
        total: &mut u64,
        path: PathBuf,
        name: String,
    ) -> Result<(), String> {
        let len = path.metadata().map(|meta| meta.len()).unwrap_or(0);
        *total = total.saturating_add(len);
        if *total > MAX_PACK_BYTES {
            return Err("This skin folder is larger than 512 MB.".to_string());
        }
        entries.push((path, name));
        Ok(())
    }

    let mut entries: Vec<(PathBuf, String)> = Vec::new();
    let mut total: u64 = 0;
    let listing = fs::read_dir(dir).map_err(|err| format!("Cannot read the skin: {err}"))?;
    let mut ini: Option<String> = None;
    for entry in listing.flatten() {
        let meta = match entry.metadata() {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        if !meta.is_file() {
            continue;
        }
        let name = match entry.file_name().to_str() {
            Some(name) => name.to_string(),
            None => continue,
        };
        if name.eq_ignore_ascii_case("skin.ini") {
            ini = fs::read(entry.path())
                .ok()
                .map(|bytes| String::from_utf8_lossy(&bytes).into_owned());
        }
        if !is_packable(&name) || !is_skin_element(&name) {
            continue;
        }
        push(&mut entries, &mut total, entry.path(), name)?;
    }

    let mut seen: std::collections::HashSet<String> = entries
        .iter()
        .map(|(_, name)| name.to_ascii_lowercase())
        .collect();
    for reference in ini.as_deref().map(referenced_paths).unwrap_or_default() {
        for candidate in reference_candidates(&reference) {
            if seen.contains(&candidate.to_ascii_lowercase()) {
                continue;
            }
            let path = dir.join(&candidate);
            if !path.is_file() || !within(dir, &path) {
                continue;
            }
            seen.insert(candidate.to_ascii_lowercase());
            push(&mut entries, &mut total, path, candidate)?;
        }
    }

    if entries.is_empty() {
        return Err("That skin has no osu!mania elements or hitsounds in it.".to_string());
    }
    entries.sort_by(|a, b| a.1.cmp(&b.1));
    write_zip(entries)
}

/// Image names a skin.ini points at, as written. Only the keys that name an
/// element are read, so a stray colon in a comment cannot drag a file in.
fn referenced_paths(ini: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in ini.lines() {
        let line = line.trim();
        if line.starts_with("//") {
            continue;
        }
        let (key, value) = match line.split_once(':') {
            Some(pair) => pair,
            None => continue,
        };
        let key = key.trim().to_ascii_lowercase();
        if !(key.starts_with("noteimage")
            || key.starts_with("keyimage")
            || key.starts_with("stage")
            || key.starts_with("lighting")
            || key.starts_with("hit")
            || key.starts_with("score")
            || key.starts_with("combo"))
        {
            continue;
        }
        let value = value.trim().replace('\\', "/");
        // A reference escaping the skin folder, or naming nothing, is not a file.
        if value.is_empty()
            || value.eq_ignore_ascii_case("_blank")
            || value.starts_with('/')
            || value.contains("..")
            || value.contains(':')
        {
            continue;
        }
        out.push(value);
    }
    out
}

/// The file names one reference can mean: plain and @2x, each of the image
/// extensions osu! accepts, plus the first frame of an animated element.
fn reference_candidates(reference: &str) -> Vec<String> {
    let has_ext = ["png", "jpg", "jpeg"]
        .iter()
        .any(|ext| reference.to_ascii_lowercase().ends_with(&format!(".{ext}")));
    if has_ext {
        return vec![reference.to_string()];
    }
    let mut out = Vec::new();
    for stem in [reference.to_string(), format!("{reference}-0")] {
        for ext in ["png", "jpg", "jpeg"] {
            out.push(format!("{stem}.{ext}"));
            out.push(format!("{stem}@2x.{ext}"));
        }
    }
    out
}

fn within(parent: &Path, child: &Path) -> bool {
    match (parent.canonicalize(), child.canonicalize()) {
        (Ok(parent), Ok(child)) => child.starts_with(parent),
        _ => false,
    }
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

        let bytes = pack_folder(&dir, Some("osu")).unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        names.sort();
        assert_eq!(names, vec!["Map [Easy].osu", "audio.mp3"]);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn keeps_only_the_skin_pieces_mania_draws() {
        assert!(is_skin_element("skin.ini"));
        assert!(is_skin_element("mania-note1.png"));
        assert!(is_skin_element("mania-key1@2x.png"));
        assert!(is_skin_element("mania-stage-light.png"));
        assert!(is_skin_element("combo-3.png"));
        assert!(is_skin_element("score-7.png"));
        assert!(is_skin_element("hit300g-0.png"));
        assert!(is_skin_element("normal-hitnormal.wav"));
        assert!(is_skin_element("soft-hitclap3.ogg"));
        assert!(is_skin_element("DRUM-HitFinish.MP3"));

        // The heavy standard-mode and menu art a mania skin never draws.
        assert!(!is_skin_element("hitcircle.png"));
        assert!(!is_skin_element("menu-background.jpg"));
        assert!(!is_skin_element("cursortrail.png"));
        assert!(!is_skin_element("taiko-bar-left.png"));
        assert!(!is_skin_element("welcome.mp3"));
        assert!(!is_skin_element("applause.wav"));
        assert!(!is_skin_element("intro.mp4"));
        assert!(!is_skin_element("readme.txt"));
    }

    #[test]
    fn packs_a_skin_without_its_standard_mode_art() {
        let dir = std::env::temp_dir().join(format!("cascade-skin-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("skin.ini"), b"[Mania]\nKeys: 4").unwrap();
        fs::write(dir.join("mania-note1.png"), b"note").unwrap();
        fs::write(dir.join("normal-hitnormal.wav"), b"sample").unwrap();
        fs::write(dir.join("menu-background.jpg"), b"huge").unwrap();
        fs::write(dir.join("hitcircle.png"), b"standard").unwrap();

        let bytes = pack_folder_where(&dir, None, "empty", is_skin_element).unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        names.sort();
        assert_eq!(
            names,
            vec!["mania-note1.png", "normal-hitnormal.wav", "skin.ini"]
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn reports_a_skin_folder_with_nothing_mania_can_use() {
        let dir = std::env::temp_dir().join(format!("cascade-noskin-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("hitcircle.png"), b"standard").unwrap();

        let err = pack_folder_where(&dir, None, "no mania elements", is_skin_element).unwrap_err();
        assert_eq!(err, "no mania elements");

        let _ = fs::remove_dir_all(&dir);
    }


    #[test]
    fn reads_the_paths_a_skin_ini_points_at() {
        let ini = "[Mania]
Keys: 4
NoteImage0: mania/arrows/left
KeyImage0D: mania\\arrows\\kd_left
StageLeft: frames/left.png
NoteImage1: _blank
ColumnWidth: 30,30
// NoteImage2: commented/out
NoteImage3: ../escape
";
        let refs = referenced_paths(ini);
        assert_eq!(
            refs,
            vec![
                "mania/arrows/left".to_string(),
                "mania/arrows/kd_left".to_string(),
                "frames/left.png".to_string(),
            ]
        );
    }

    #[test]
    fn expands_a_reference_into_the_names_it_could_mean() {
        let c = reference_candidates("mania/note");
        assert!(c.contains(&"mania/note.png".to_string()));
        assert!(c.contains(&"mania/note@2x.png".to_string()));
        assert!(c.contains(&"mania/note-0.png".to_string()));
        // An extension already written is taken as final.
        assert_eq!(reference_candidates("a/b.png"), vec!["a/b.png".to_string()]);
    }

    #[test]
    fn packs_the_subfolder_art_a_skin_references() {
        let dir = std::env::temp_dir().join(format!("cascade-skinref-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("mania/arrows")).unwrap();
        fs::write(
            dir.join("skin.ini"),
            b"[Mania]
Keys: 4
NoteImage0: mania/arrows/left
",
        )
        .unwrap();
        fs::write(dir.join("mania/arrows/left.png"), b"note").unwrap();
        fs::write(dir.join("mania-note1.png"), b"shared").unwrap();
        fs::write(dir.join("menu-background.jpg"), b"huge").unwrap();

        let bytes = pack_skin(&dir).unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        names.sort();
        assert_eq!(
            names,
            vec!["mania-note1.png", "mania/arrows/left.png", "skin.ini"]
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_a_skin_folder_with_nothing_mania_can_use() {
        let dir = std::env::temp_dir().join(format!("cascade-noskin2-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("hitcircle.png"), b"standard").unwrap();

        let err = pack_skin(&dir).unwrap_err();
        assert!(err.contains("osu!mania"), "unexpected error: {err}");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_a_folder_with_no_difficulty() {
        let dir = std::env::temp_dir().join(format!("cascade-nodiff-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("audio.mp3"), b"audio").unwrap();

        let err = pack_folder(&dir, Some("osu")).unwrap_err();
        assert!(err.contains(".osu"), "unexpected error: {err}");

        let _ = fs::remove_dir_all(&dir);
    }
}
