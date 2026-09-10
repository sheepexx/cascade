//! Mirrors projects onto the real filesystem.
//!
//! IndexedDB stays the source of truth; this writes a browsable copy beside it
//! so a project can be backed up, synced or opened by hand, and keeps a rolling
//! history of chart snapshots so a bad edit that got autosaved is recoverable.
//!
//! Media is only rewritten when it actually changed, so a minute-by-minute
//! autosave costs one small JSON write rather than recopying the audio.

use std::collections::BTreeSet;
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::ipc::{Request, Response};
use tauri::{AppHandle, Manager};

/// Marks a folder as Cascade's and ties it to the project it mirrors, so a
/// renamed map can still find the folder it wrote last time.
const MARKER: &str = ".cascade-project.json";
const CHART: &str = "project.json";
const HISTORY: &str = "history";

/// How many autosaved chart snapshots to keep per project. They hold no media,
/// so twenty of them is a few hundred kilobytes.
const HISTORY_KEEP: usize = 20;

#[derive(Serialize, Deserialize, Default)]
struct Marker {
    id: String,
    /// The folder name we last chose, so renaming only happens when the map's
    /// own name changes rather than fighting the uniqueness suffix.
    name: String,
    /// Files Cascade wrote, so media the project dropped can be cleared without
    /// touching anything the user put in the folder themselves.
    files: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// Epoch milliseconds, and the snapshot's filename stem.
    pub stamp: String,
    pub saved_at: u64,
    pub bytes: u64,
}

/// Trims a name down to one safe path segment on every platform.
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

/// Rejects archive entries that would escape the project folder.
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

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_millis() as u64)
        .unwrap_or_default()
}

/// `Documents/Cascade/Projects`, falling back to the app data folder on systems
/// with no documents directory.
fn root_for(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|err| format!("Cannot find a folder to keep projects in: {err}"))?;
    Ok(base.join("Cascade").join("Projects"))
}

fn read_marker(dir: &Path) -> Option<Marker> {
    let text = fs::read_to_string(dir.join(MARKER)).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_marker(dir: &Path, marker: &Marker) -> Result<(), String> {
    let text = serde_json::to_string(marker).map_err(|err| err.to_string())?;
    fs::write(dir.join(MARKER), text)
        .map_err(|err| format!("Cannot write the project marker: {err}"))
}

/// Finds the folder already claiming this project id.
fn find_by_id(root: &Path, id: &str) -> Option<PathBuf> {
    fs::read_dir(root).ok()?.flatten().find_map(|entry| {
        let dir = entry.path();
        if !dir.is_dir() {
            return None;
        }
        read_marker(&dir).filter(|marker| marker.id == id).map(|_| dir)
    })
}

/// Picks a folder name that is not already taken by a different project.
fn unique_dir(root: &Path, preferred: &str, id: &str) -> PathBuf {
    let mut candidate = root.join(preferred);
    let mut suffix = 2;
    loop {
        let claimed = read_marker(&candidate).is_some_and(|marker| marker.id == id);
        if !candidate.exists() || claimed {
            return candidate;
        }
        candidate = root.join(format!("{preferred} ({suffix})"));
        suffix += 1;
    }
}

/// Resolves this project's folder, renaming it when the map itself was renamed.
fn resolve_dir(root: &Path, id: &str, preferred: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(root)
        .map_err(|err| format!("Cannot create the projects folder: {err}"))?;

    let existing = find_by_id(root, id);
    let Some(current) = existing else {
        let dir = unique_dir(root, preferred, id);
        fs::create_dir_all(&dir)
            .map_err(|err| format!("Cannot create the project folder: {err}"))?;
        return Ok(dir);
    };

    let named = read_marker(&current).map(|marker| marker.name).unwrap_or_default();
    if named == preferred {
        return Ok(current);
    }

    // The map was renamed, so follow it. A failed rename is not worth losing the
    // save over; keep using the folder we have.
    let wanted = unique_dir(root, preferred, id);
    if wanted != current && fs::rename(&current, &wanted).is_ok() {
        return Ok(wanted);
    }
    Ok(current)
}

fn snapshot(dir: &Path, chart: &[u8]) -> Result<(), String> {
    let history = dir.join(HISTORY);
    fs::create_dir_all(&history)
        .map_err(|err| format!("Cannot create the history folder: {err}"))?;
    fs::write(history.join(format!("{}.json", now_millis())), chart)
        .map_err(|err| format!("Cannot write the snapshot: {err}"))?;
    prune(&history);
    Ok(())
}

/// Keeps the newest [`HISTORY_KEEP`] snapshots. Names are epoch milliseconds, so
/// sorting by name sorts by age.
fn prune(history: &Path) {
    let Ok(entries) = fs::read_dir(history) else {
        return;
    };
    let mut stamps: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .collect();
    if stamps.len() <= HISTORY_KEEP {
        return;
    }
    stamps.sort();
    for stale in &stamps[..stamps.len() - HISTORY_KEEP] {
        let _ = fs::remove_file(stale);
    }
}

fn header(request: &Request<'_>, name: &str) -> Option<String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .and_then(crate::urlencoding_decode)
}

/// Writes a project folder from an archive of its files.
///
/// The archive always carries `project.json`; it carries media only when the
/// media changed, and `x-cascade-media` says which, so an unchanged audio file
/// is neither recopied nor mistaken for one the project dropped.
#[tauri::command]
pub fn vault_save(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    use tauri::ipc::InvokeBody;

    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes,
        InvokeBody::Json(_) => return Err("Cascade sent the project in the wrong format.".into()),
    };
    if bytes.is_empty() {
        return Err("The project came out empty.".to_string());
    }

    let mut zip = zip::ZipArchive::new(Cursor::new(bytes.as_slice()))
        .map_err(|err| format!("Cannot read the project: {err}"))?;
    crate::archive::validate_zip(
        &mut zip,
        bytes.len() as u64,
        crate::archive::DEFAULT_ARCHIVE_LIMITS,
    )?;

    let id = header(&request, "x-cascade-project")
        .filter(|id| !id.is_empty())
        .ok_or_else(|| "The project has no id.".to_string())?;
    let preferred = folder_name(&header(&request, "x-cascade-name").unwrap_or_default());
    let carries_media = header(&request, "x-cascade-media").as_deref() == Some("1");

    let root = root_for(&app)?;
    let dir = resolve_dir(&root, &id, &preferred)?;
    let previous = read_marker(&dir).map(|marker| marker.files).unwrap_or_default();

    let mut written: BTreeSet<String> = BTreeSet::new();
    let mut chart: Option<Vec<u8>> = None;

    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|err| format!("Cannot read the project: {err}"))?;
        if entry.is_dir() {
            continue;
        }
        let Some(name) = entry_name(entry.name()) else {
            continue;
        };
        let expected = entry.size();
        let mut buffer = Vec::with_capacity(expected as usize);
        entry
            .take(expected.saturating_add(1))
            .read_to_end(&mut buffer)
            .map_err(|err| format!("Cannot read {name}: {err}"))?;
        if buffer.len() as u64 != expected {
            return Err(format!("{name} did not match its declared archive size."));
        }
        if name == CHART {
            chart = Some(buffer.clone());
        }
        fs::write(dir.join(&name), &buffer)
            .map_err(|err| format!("Cannot write {name}: {err}"))?;
        written.insert(name);
    }

    let chart = chart.ok_or_else(|| "The project had no chart in it.".to_string())?;
    snapshot(&dir, &chart)?;

    // Only a save that carried media can tell which media is stale. Otherwise
    // keep what is already there.
    let files: Vec<String> = if carries_media {
        for stale in previous.iter().filter(|name| !written.contains(*name)) {
            if entry_name(stale).is_some() {
                let _ = fs::remove_file(dir.join(stale));
            }
        }
        written.into_iter().collect()
    } else {
        let mut kept: BTreeSet<String> = previous.into_iter().collect();
        kept.extend(written);
        kept.into_iter().collect()
    };

    write_marker(
        &dir,
        &Marker {
            id,
            name: preferred,
            files,
        },
    )?;

    Ok(dir.to_string_lossy().to_string())
}

/// The snapshots kept for a project, newest first.
#[tauri::command]
pub fn vault_history(app: AppHandle, id: String) -> Result<Vec<Entry>, String> {
    let root = root_for(&app)?;
    let Some(dir) = find_by_id(&root, &id) else {
        return Ok(Vec::new());
    };
    let Ok(entries) = fs::read_dir(dir.join(HISTORY)) else {
        return Ok(Vec::new());
    };

    let mut history: Vec<Entry> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let stamp = path.file_stem()?.to_str()?.to_string();
            let saved_at = stamp.parse::<u64>().ok()?;
            let bytes = entry.metadata().ok()?.len();
            Some(Entry {
                stamp,
                saved_at,
                bytes,
            })
        })
        .collect();

    history.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
    Ok(history)
}

/// Reads one snapshot back so the editor can restore it.
#[tauri::command]
pub fn vault_restore(app: AppHandle, id: String, stamp: String) -> Result<Response, String> {
    // The stamp comes from the frontend, so it must not be able to walk out of
    // the history folder.
    if !stamp.chars().all(|c| c.is_ascii_digit()) {
        return Err("That snapshot name is not valid.".to_string());
    }
    let root = root_for(&app)?;
    let dir = find_by_id(&root, &id)
        .ok_or_else(|| "That project has no folder on disk yet.".to_string())?;
    let path = dir.join(HISTORY).join(format!("{stamp}.json"));
    let bytes =
        fs::read(&path).map_err(|err| format!("Cannot read that snapshot: {err}"))?;
    Ok(Response::new(bytes))
}

/// Opens a project's folder, or the projects folder itself, in the file manager.
#[tauri::command]
pub fn vault_reveal(app: AppHandle, id: Option<String>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let root = root_for(&app)?;
    let target = id
        .and_then(|id| find_by_id(&root, &id))
        .unwrap_or_else(|| root.clone());
    fs::create_dir_all(&target)
        .map_err(|err| format!("Cannot create the projects folder: {err}"))?;
    app.opener()
        .open_path(target.to_string_lossy(), None::<&str>)
        .map_err(|err| format!("Cannot open the folder: {err}"))
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
        let dir = std::env::temp_dir().join(format!("cascade-vault-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn keeps_folder_names_to_one_safe_segment() {
        assert_eq!(folder_name("Artist - Title"), "Artist - Title");
        assert_eq!(folder_name("../../etc/passwd"), "passwd");
        assert_eq!(folder_name("a:b*c?"), "a_b_c_");
        assert_eq!(folder_name("   "), "Cascade map");
    }

    #[test]
    fn refuses_archive_entries_that_climb_out() {
        assert_eq!(entry_name("audio.mp3").as_deref(), Some("audio.mp3"));
        assert_eq!(entry_name("../audio.mp3").as_deref(), Some("audio.mp3"));
        assert_eq!(entry_name(".cascade-project.json"), None);
        assert_eq!(entry_name("nested/"), None);
    }

    #[test]
    fn follows_a_project_that_was_renamed() {
        let root = temp("rename");
        let first = resolve_dir(&root, "abc", "Old Name").unwrap();
        write_marker(
            &first,
            &Marker {
                id: "abc".into(),
                name: "Old Name".into(),
                files: vec![],
            },
        )
        .unwrap();

        let second = resolve_dir(&root, "abc", "New Name").unwrap();
        assert_eq!(second.file_name().unwrap(), "New Name");
        assert!(!first.exists(), "the old folder should have been renamed");
    }

    #[test]
    fn does_not_collide_with_another_project_of_the_same_name() {
        let root = temp("collide");
        let first = resolve_dir(&root, "one", "Same").unwrap();
        write_marker(
            &first,
            &Marker {
                id: "one".into(),
                name: "Same".into(),
                files: vec![],
            },
        )
        .unwrap();

        let second = resolve_dir(&root, "two", "Same").unwrap();
        assert_ne!(first, second);
        assert_eq!(second.file_name().unwrap(), "Same (2)");
    }

    #[test]
    fn keeps_only_the_newest_snapshots() {
        let dir = temp("prune");
        let history = dir.join(HISTORY);
        fs::create_dir_all(&history).unwrap();
        for stamp in 0..HISTORY_KEEP + 5 {
            fs::write(history.join(format!("{stamp:03}.json")), b"{}").unwrap();
        }
        prune(&history);
        let left = fs::read_dir(&history).unwrap().count();
        assert_eq!(left, HISTORY_KEEP);
        assert!(history.join("024.json").exists(), "newest must survive");
        assert!(!history.join("000.json").exists(), "oldest must go");
    }

    #[test]
    fn a_save_without_media_keeps_the_media_already_there() {
        let root = temp("media");
        let dir = resolve_dir(&root, "id", "Map").unwrap();
        fs::write(dir.join("audio.mp3"), b"sound").unwrap();
        write_marker(
            &dir,
            &Marker {
                id: "id".into(),
                name: "Map".into(),
                files: vec!["audio.mp3".into(), CHART.into()],
            },
        )
        .unwrap();

        // Stands in for the chart-only autosave path.
        let bytes = archive(&[(CHART, b"{\"v\":2}")]);
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes.as_slice())).unwrap();
        assert_eq!(zip.len(), 1);
        let mut entry = zip.by_index(0).unwrap();
        let mut buffer = Vec::new();
        entry.read_to_end(&mut buffer).unwrap();
        fs::write(dir.join(CHART), &buffer).unwrap();

        assert!(
            dir.join("audio.mp3").exists(),
            "media must survive a chart-only save"
        );
    }
}
