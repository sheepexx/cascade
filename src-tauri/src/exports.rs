//! Where exports land on desktop: the Downloads folder, or a folder the user
//! picked in Settings. The choice lives here rather than in the web view, so
//! the page can only ever write an export file into one of those two folders.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

const CHOICE_FILE: &str = "export-folder.txt";

/// The kinds of file Cascade exports. Anything else is refused, so nothing
/// that runs when opened can be written this way.
const EXTENSIONS: &[&str] = &[
    "osz", "osu", "zip", "sm", "ssc", "qua", "mcz", "png", "jpg", "jpeg", "jfif", "webp", "gif",
    "bmp", "avif",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFolder {
    pub path: String,
    /// False while exports go to Downloads.
    pub chosen: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Written {
    pub path: String,
    pub folder: String,
    /// The chosen folder could not be reached, so this went to Downloads.
    pub fell_back: bool,
}

fn downloads(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .download_dir()
        .map_err(|err| format!("Cannot find your Downloads folder: {err}"))
}

fn choice_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(CHOICE_FILE))
        .map_err(|err| format!("Cannot reach the settings folder: {err}"))
}

fn chosen(app: &AppHandle) -> Option<PathBuf> {
    let text = fs::read_to_string(choice_path(app).ok()?).ok()?;
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| PathBuf::from(trimmed))
}

fn current(app: &AppHandle) -> Result<ExportFolder, String> {
    Ok(match chosen(app) {
        Some(path) => ExportFolder {
            path: path.to_string_lossy().into_owned(),
            chosen: true,
        },
        None => ExportFolder {
            path: downloads(app)?.to_string_lossy().into_owned(),
            chosen: false,
        },
    })
}

/// One safe file name with an export extension, or an error saying why not.
pub fn file_name(raw: &str) -> Result<String, String> {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or(raw);
    let cleaned: String = base
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches('.').trim();
    let (stem, ext) = trimmed
        .rsplit_once('.')
        .ok_or_else(|| "The export has no file type.".to_string())?;
    let ext = ext.to_ascii_lowercase();
    if !EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("Cascade does not export .{ext} files."));
    }
    let stem = stem.trim().trim_start_matches('.').trim();
    let stem: String = stem.chars().take(180).collect();
    let stem = if stem.trim().is_empty() {
        "Cascade export".to_string()
    } else {
        stem.trim().to_string()
    };
    Ok(format!("{stem}.{ext}"))
}

/// `name` in `dir`, numbered like a browser download if it is taken.
pub fn free_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = name.rsplit_once('.').unwrap_or((name, ""));
    for n in 1..10_000 {
        let candidate = dir.join(format!("{stem} ({n}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem} ({}).{ext}", std::process::id()))
}

#[tauri::command]
pub fn export_folder(app: AppHandle) -> Result<ExportFolder, String> {
    current(&app)
}

/// Asks for a folder. None when the dialog was closed without one.
#[tauri::command(async)]
pub fn export_choose_folder(app: AppHandle) -> Result<Option<ExportFolder>, String> {
    use tauri_plugin_dialog::DialogExt;

    let mut dialog = app.dialog().file().set_title("Choose where exports go");
    let start = chosen(&app)
        .filter(|dir| dir.is_dir())
        .or_else(|| downloads(&app).ok());
    if let Some(start) = start {
        dialog = dialog.set_directory(start);
    }
    let Some(picked) = dialog.blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|err| format!("That folder cannot be used: {err}"))?;
    let text = path
        .to_str()
        .ok_or_else(|| "That folder's name cannot be saved.".to_string())?;
    let file = choice_path(&app)?;
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|err| format!("Cannot save the export folder: {err}"))?;
    }
    fs::write(&file, text).map_err(|err| format!("Cannot save the export folder: {err}"))?;
    current(&app).map(Some)
}

#[tauri::command]
pub fn export_reset_folder(app: AppHandle) -> Result<ExportFolder, String> {
    match fs::remove_file(choice_path(&app)?) {
        Ok(()) => {}
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(format!("Cannot reset the export folder: {err}")),
    }
    current(&app)
}

/// Writes one export. The body is the file; `x-cascade-name` its name.
#[tauri::command(async)]
pub fn export_write(app: AppHandle, request: Request<'_>) -> Result<Written, String> {
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes,
        InvokeBody::Json(_) => return Err("Cascade sent the export in the wrong format.".into()),
    };
    let raw_name = request
        .headers()
        .get("x-cascade-name")
        .and_then(|value| value.to_str().ok())
        .and_then(crate::urlencoding_decode)
        .unwrap_or_default();
    let name = file_name(&raw_name)?;

    let (dir, fell_back) = match chosen(&app) {
        Some(dir) if dir.is_dir() => (dir, false),
        Some(_) => (downloads(&app)?, true),
        None => (downloads(&app)?, false),
    };
    fs::create_dir_all(&dir).map_err(|err| format!("Cannot open {}: {err}", dir.display()))?;
    let path = free_path(&dir, &name);
    fs::write(&path, bytes).map_err(|err| format!("Cannot write {}: {err}", path.display()))?;
    Ok(Written {
        path: path.to_string_lossy().into_owned(),
        folder: dir.to_string_lossy().into_owned(),
        fell_back,
    })
}

/// Opens the file's folder with the file selected.
#[tauri::command]
pub fn export_reveal(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|err| format!("Cannot show the file: {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_a_plain_export_name() {
        assert_eq!(
            file_name("Artist - Title.osz").unwrap(),
            "Artist - Title.osz"
        );
        assert_eq!(file_name("A - B [Hard].osu").unwrap(), "A - B [Hard].osu");
    }

    #[test]
    fn cannot_leave_the_folder() {
        assert_eq!(file_name("../../evil.png").unwrap(), "evil.png");
        assert_eq!(file_name("C:\\Windows\\x.png").unwrap(), "x.png");
        assert_eq!(file_name(".hidden.png").unwrap(), "hidden.png");
    }

    #[test]
    fn replaces_characters_windows_refuses() {
        assert_eq!(file_name("What? \"Yes\".osz").unwrap(), "What_ _Yes_.osz");
    }

    #[test]
    fn refuses_anything_that_is_not_an_export() {
        assert!(file_name("setup.exe").is_err());
        assert!(file_name("run.bat").is_err());
        assert!(file_name("no extension").is_err());
        assert_eq!(file_name("Card.PNG").unwrap(), "Card.png");
    }

    #[test]
    fn numbers_a_name_that_is_taken() {
        let dir = std::env::temp_dir().join(format!("cascade-export-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("Map.osz"), b"x").unwrap();
        fs::write(dir.join("Map (1).osz"), b"x").unwrap();
        assert_eq!(free_path(&dir, "Map.osz"), dir.join("Map (2).osz"));
        assert_eq!(free_path(&dir, "Other.osz"), dir.join("Other.osz"));
        fs::remove_dir_all(&dir).unwrap();
    }
}
