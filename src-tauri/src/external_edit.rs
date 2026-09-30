//! Hands one difficulty's `.osu` to a text editor and reads it back.
//!
//! The file goes to a private folder under the app cache, never the osu! songs
//! folder, and only files inside that folder can be read back or shown, so the
//! web view can't use these commands to reach anything else on disk.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

const FOLDER: &str = "external-edit";
/// A difficulty's `.osu` rarely passes a few megabytes; this stops a runaway read.
const MAX_BYTES: u64 = 32 * 1024 * 1024;
/// Sessions older than this were abandoned by a crash or a closed app.
const STALE_AFTER: Duration = Duration::from_secs(24 * 60 * 60);
const GONE: &str = "The file is gone. It may have been moved or deleted.";

/// An editor every install of the system has. Opening a `.osu` with its
/// default app would hand it to osu!, which imports it instead.
#[cfg(target_os = "macos")]
const TEXT_EDITOR: Option<&str> = Some("TextEdit");
#[cfg(target_os = "windows")]
const TEXT_EDITOR: Option<&str> = Some("notepad");
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const TEXT_EDITOR: Option<&str> = None;

fn root_for(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_cache_dir()
        .map_err(|err| format!("Cannot find a folder for the file: {err}"))?;
    Ok(base.join(FOLDER))
}

/// Names the file after the difficulty, always ending in `.osu`.
pub fn file_name(raw: &str) -> String {
    let name = crate::vault::folder_name(raw);
    let cut = name.len().saturating_sub(4);
    let stem = match name.get(cut..) {
        Some(ext) if ext.eq_ignore_ascii_case(".osu") => name[..cut].trim_end(),
        _ => name.as_str(),
    };
    let stem = if stem.is_empty() { "difficulty" } else { stem };
    format!("{stem}.osu")
}

/// Resolves `path` and refuses anything but a file inside `root`.
fn inside(root: &Path, path: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).map_err(|_| GONE.to_string())?;
    let file = fs::canonicalize(path).map_err(|_| GONE.to_string())?;
    if file.starts_with(&root) && file != root && file.is_file() {
        Ok(file)
    } else {
        Err("Cascade can only open the file it handed out.".to_string())
    }
}

/// Clears out sessions nobody finished.
fn sweep(root: &Path) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let stale = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|modified| modified.elapsed().ok())
            .is_some_and(|age| age > STALE_AFTER);
        if stale {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
}

/// A fresh folder per session, so two sessions never share a file.
fn session_dir(root: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(root)
        .map_err(|err| format!("Cannot create a folder for the file: {err}"))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_millis())
        .unwrap_or_default();
    for attempt in 0..100 {
        let dir = root.join(format!("{stamp}-{attempt}"));
        match fs::create_dir(&dir) {
            Ok(()) => return Ok(dir),
            Err(err) if err.kind() == ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(format!("Cannot create a folder for the file: {err}")),
        }
    }
    Err("Cannot create a folder for the file.".to_string())
}

fn read_text(file: &Path) -> Result<String, String> {
    let size = fs::metadata(file).map_err(|_| GONE.to_string())?.len();
    if size > MAX_BYTES {
        return Err("The file has grown too large to be a difficulty.".to_string());
    }
    let bytes = fs::read(file).map_err(|err| format!("Cannot read the file: {err}"))?;
    let text = String::from_utf8(bytes)
        .map_err(|_| "The file isn't UTF-8 text. Save it as UTF-8 and try again.".to_string())?;
    // Notepad has saved UTF-8 with a byte order mark; osu! doesn't expect one.
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_string())
}

/// Writes the difficulty to a new session folder and returns the file's path.
#[tauri::command(async)]
pub fn external_edit_start(
    app: AppHandle,
    name: String,
    contents: String,
) -> Result<String, String> {
    let root = root_for(&app)?;
    sweep(&root);
    let path = session_dir(&root)?.join(file_name(&name));
    fs::write(&path, contents).map_err(|err| format!("Cannot write the file: {err}"))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Opens the file in a text editor, or shows it in its folder.
#[tauri::command(async)]
pub fn external_edit_show(app: AppHandle, path: String, in_folder: bool) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let file = inside(&root_for(&app)?, &path)?;
    match TEXT_EDITOR {
        Some(editor) if !in_folder => app
            .opener()
            .open_path(file.to_string_lossy(), Some(editor))
            .map_err(|err| format!("Cannot open a text editor: {err}")),
        _ => app
            .opener()
            .reveal_item_in_dir(&file)
            .map_err(|err| format!("Cannot show the file: {err}")),
    }
}

#[tauri::command(async)]
pub fn external_edit_read(app: AppHandle, path: String) -> Result<String, String> {
    read_text(&inside(&root_for(&app)?, &path)?)
}

/// Deletes the session folder once the edit is applied or cancelled.
#[tauri::command(async)]
pub fn external_edit_finish(app: AppHandle, path: String) -> Result<(), String> {
    let root = root_for(&app)?;
    let Ok(file) = inside(&root, &path) else {
        return Ok(());
    };
    let root = fs::canonicalize(&root).map_err(|_| GONE.to_string())?;
    if let Some(dir) = file.parent().filter(|dir| *dir != root) {
        let _ = fs::remove_dir_all(dir);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("cascade-external-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn names_the_file_after_the_difficulty() {
        assert_eq!(file_name("Hard"), "Hard.osu");
        assert_eq!(file_name("Insane.OSU"), "Insane.osu");
        assert_eq!(file_name("a/b: c?"), "b_ c_.osu");
        assert_eq!(file_name(""), "Cascade map.osu");
        assert_eq!(file_name("Hard .osu"), "Hard.osu");
    }

    #[test]
    fn reads_back_only_files_inside_the_root() {
        let base = scratch("inside");
        let root = base.join(FOLDER);
        let dir = session_dir(&root).unwrap();
        let file = dir.join("Hard.osu");
        fs::write(&file, "osu file format v14").unwrap();
        let outside = base.join("secret.txt");
        fs::write(&outside, "nope").unwrap();

        assert!(inside(&root, &file.to_string_lossy()).is_ok());
        assert!(inside(&root, &outside.to_string_lossy()).is_err());
        let escape = dir.join("..").join("..").join("secret.txt");
        assert!(inside(&root, &escape.to_string_lossy()).is_err());
        assert!(inside(&root, &root.to_string_lossy()).is_err());
        assert!(inside(&root, &dir.to_string_lossy()).is_err());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn strips_a_byte_order_mark() {
        let base = scratch("bom");
        let file = base.join("Hard.osu");
        fs::write(&file, "\u{feff}osu file format v14").unwrap();
        assert_eq!(read_text(&file).unwrap(), "osu file format v14");
        fs::write(&file, [0xff, 0xfe, 0x00]).unwrap();
        assert!(read_text(&file).is_err());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn gives_every_session_its_own_folder() {
        let base = scratch("sessions");
        let root = base.join(FOLDER);
        let first = session_dir(&root).unwrap();
        let second = session_dir(&root).unwrap();
        assert_ne!(first, second);
        let _ = fs::remove_dir_all(&base);
    }
}
