#[cfg(windows)]
mod background;
#[cfg(windows)]
mod install;
#[cfg(windows)]
mod memory;
#[cfg(windows)]
mod pack;
#[cfg(windows)]
mod sync;

use serde::Serialize;
use tauri::ipc::{Request, Response};

#[cfg(not(windows))]
const WINDOWS_ONLY: &str = "The osu! integration is only available on Windows.";

#[cfg(windows)]
const NOT_FOUND: &str =
    "Cascade could not find your osu! installation. Install osu! stable, or open it once so \
     Cascade can locate it.";

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OsuStatus {
    pub supported: bool,
    pub installed: bool,
    pub running: bool,
    pub chosen: bool,
    pub root: Option<String>,
    pub songs: Option<String>,
}

#[cfg(windows)]
fn config_dir(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    app.path().app_config_dir().ok()
}

#[cfg(windows)]
fn watcher(app: &tauri::AppHandle) -> tauri::State<'_, memory::Watcher> {
    use tauri::Manager;
    app.state::<memory::Watcher>()
}

#[cfg(windows)]
fn locate(app: &tauri::AppHandle) -> Option<(std::path::PathBuf, std::path::PathBuf)> {
    let dir = config_dir(app);
    let root = install::discover_root(dir.as_deref())
        .or_else(|| watcher(app).running_root())?;
    let songs = install::songs_for(&root);
    Some((root, songs))
}

#[cfg(windows)]
fn status_for(app: &tauri::AppHandle) -> OsuStatus {
    let running = watcher(app).poll().running;
    let chosen = config_dir(app)
        .as_deref()
        .and_then(install::read_override)
        .is_some();
    match locate(app) {
        Some((root, songs)) => OsuStatus {
            supported: true,
            installed: true,
            running,
            chosen,
            root: root.to_str().map(str::to_string),
            songs: songs.to_str().map(str::to_string),
        },
        None => OsuStatus {
            supported: true,
            running,
            ..OsuStatus::default()
        },
    }
}

#[tauri::command]
pub fn osu_status(app: tauri::AppHandle) -> OsuStatus {
    #[cfg(windows)]
    {
        status_for(&app)
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        OsuStatus::default()
    }
}

#[tauri::command]
pub fn osu_choose_root(app: tauri::AppHandle) -> Result<OsuStatus, String> {
    #[cfg(windows)]
    {
        use tauri_plugin_dialog::DialogExt;

        let mut dialog = app.dialog().file().set_title("Select your osu! folder");
        if let Some(start) = install::dialog_start_dir() {
            dialog = dialog.set_directory(start);
        }
        let picked = match dialog.blocking_pick_folder() {
            Some(picked) => picked,
            None => return Ok(status_for(&app)),
        };
        let path = picked
            .into_path()
            .map_err(|err| format!("That folder cannot be used: {err}"))?;
        let root = install::validate_root(&path)?;
        let dir = config_dir(&app).ok_or_else(|| "Cannot reach the settings folder.".to_string())?;
        install::write_override(&dir, &root)?;
        Ok(status_for(&app))
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err(WINDOWS_ONLY.to_string())
    }
}

#[tauri::command]
pub fn osu_forget_root(app: tauri::AppHandle) -> Result<OsuStatus, String> {
    #[cfg(windows)]
    {
        let dir = config_dir(&app).ok_or_else(|| "Cannot reach the settings folder.".to_string())?;
        install::clear_override(&dir)?;
        Ok(status_for(&app))
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err(WINDOWS_ONLY.to_string())
    }
}

#[tauri::command]
pub fn osu_selected_map(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(windows)]
    {
        let map = watcher(&app).selected_map()?;
        serde_json::to_value(map).map_err(|err| err.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err(WINDOWS_ONLY.to_string())
    }
}

/// Event carrying a changed connection snapshot to the frontend.
pub const LIVE_EVENT: &str = "cascade://osu-live";

/// Watches osu! in the background and emits [`LIVE_EVENT`] whenever what it can
/// see changes: the client opening or closing, and the map song select sits on.
/// Only changes are emitted, so an idle osu! costs the frontend nothing.
pub fn spawn_watcher(app: tauri::AppHandle) {
    #[cfg(windows)]
    {
        use tauri::{Emitter, Manager};

        // Registered here rather than in main so the Windows-only type stays
        // inside this module. Commands only run once setup has returned.
        app.manage(memory::Watcher::default());

        std::thread::spawn(move || {
            let mut last: Option<memory::Live> = None;
            loop {
                let live = app.state::<memory::Watcher>().poll();
                let pause = live.interval();
                if last.as_ref() != Some(&live) {
                    let _ = app.emit(LIVE_EVENT, &live);
                    last = Some(live);
                }
                std::thread::sleep(pause);
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = app;
    }
}

/// The current connection snapshot. The watcher also pushes this on the
/// `cascade://osu-live` event whenever it changes; this is for the first read
/// when a window mounts.
#[tauri::command]
pub fn osu_live(app: tauri::AppHandle) -> serde_json::Value {
    #[cfg(windows)]
    {
        serde_json::to_value(watcher(&app).poll()).unwrap_or(serde_json::Value::Null)
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        serde_json::json!({
            "running": false,
            "connected": false,
            "map": null,
            "problem": null,
        })
    }
}

#[tauri::command]
pub fn osu_read_map(app: tauri::AppHandle, folder: String) -> Result<Response, String> {
    #[cfg(windows)]
    {
        let (_, songs) = locate(&app).ok_or_else(|| NOT_FOUND.to_string())?;
        let name = install::safe_folder(&folder)
            .ok_or_else(|| "That map folder name is not valid.".to_string())?;
        let dir = songs.join(name);
        if !dir.is_dir() {
            return Err("That map folder is not in your osu! Songs folder any more.".to_string());
        }
        if !install::within(&songs, &dir) {
            return Err("That map folder is outside your osu! Songs folder.".to_string());
        }
        Ok(Response::new(pack::pack_folder(&dir, Some("osu"))?))
    }
    #[cfg(not(windows))]
    {
        let _ = (app, folder);
        Err(WINDOWS_ONLY.to_string())
    }
}

/// The background image of a map in the osu! Songs folder, as raw bytes.
///
/// Empty when the map has no background — a normal state the banner draws a
/// fallback for, not an error worth surfacing.
#[tauri::command]
pub fn osu_map_background(
    app: tauri::AppHandle,
    folder: String,
    file: String,
) -> Result<Response, String> {
    #[cfg(windows)]
    {
        let (_, songs) = locate(&app).ok_or_else(|| NOT_FOUND.to_string())?;
        let name = install::safe_folder(&folder)
            .ok_or_else(|| "That map folder name is not valid.".to_string())?;
        let dir = songs.join(name);
        if !dir.is_dir() || !install::within(&songs, &dir) {
            return Err("That map folder is not in your osu! Songs folder any more.".to_string());
        }

        let Some(chart) = difficulty_file(&dir, &file) else {
            return Ok(Response::new(Vec::new()));
        };
        let text = std::fs::read(&chart)
            .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
            .map_err(|err| format!("Cannot read that map: {err}"))?;

        let Some(image) = background::background_name(&text)
            .and_then(|name| background::resolve(&dir, &name))
        else {
            return Ok(Response::new(Vec::new()));
        };
        // The map folder is the boundary: a storyboard may nest the image, but
        // a symlink or a reference this side missed must not reach past it.
        if !image.is_file() || !install::within(&dir, &image) {
            return Ok(Response::new(Vec::new()));
        }
        let oversized = std::fs::metadata(&image)
            .map(|meta| meta.len() > background::MAX_IMAGE_BYTES)
            .unwrap_or(true);
        if oversized {
            return Ok(Response::new(Vec::new()));
        }

        Ok(Response::new(std::fs::read(&image).unwrap_or_default()))
    }
    #[cfg(not(windows))]
    {
        let _ = (app, folder, file);
        Err(WINDOWS_ONLY.to_string())
    }
}

/// The `.osu` the watcher named, falling back to any difficulty in the folder.
/// osu! occasionally reports an empty file name while song select is still
/// settling, and every difficulty in a set shares one background anyway.
#[cfg(windows)]
fn difficulty_file(dir: &std::path::Path, file: &str) -> Option<std::path::PathBuf> {
    if let Some(name) = install::safe_folder(file) {
        let named = dir.join(name);
        if pack::has_extension(&named, "osu") && named.is_file() {
            return Some(named);
        }
    }
    let mut charts: Vec<std::path::PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && pack::has_extension(path, "osu"))
        .collect();
    charts.sort();
    charts.into_iter().next()
}
#[tauri::command]
pub fn osu_list_skins(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        let (root, _) = locate(&app).ok_or_else(|| NOT_FOUND.to_string())?;
        let skins = root.join("Skins");
        if !skins.is_dir() {
            return Ok(Vec::new());
        }
        let entries =
            std::fs::read_dir(&skins).map_err(|err| format!("Cannot read your skins: {err}"))?;
        let mut names: Vec<String> = entries
            .flatten()
            .filter(|entry| entry.path().is_dir())
            .filter_map(|entry| entry.file_name().to_str().map(str::to_string))
            .filter(|name| install::safe_folder(name).is_some())
            .collect();
        names.sort_by_key(|name| name.to_lowercase());
        Ok(names)
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err(WINDOWS_ONLY.to_string())
    }
}

#[tauri::command]
pub fn osu_read_skin(app: tauri::AppHandle, name: String) -> Result<Response, String> {
    #[cfg(windows)]
    {
        let (root, _) = locate(&app).ok_or_else(|| NOT_FOUND.to_string())?;
        let skins = root.join("Skins");
        let safe = install::safe_folder(&name)
            .ok_or_else(|| "That skin name is not valid.".to_string())?;
        let dir = skins.join(safe);
        if !dir.is_dir() {
            return Err("That skin is not in your osu! Skins folder any more.".to_string());
        }
        if !install::within(&skins, &dir) {
            return Err("That skin is outside your osu! Skins folder.".to_string());
        }
        Ok(Response::new(pack::pack_folder(&dir, None)?))
    }
    #[cfg(not(windows))]
    {
        let _ = (app, name);
        Err(WINDOWS_ONLY.to_string())
    }
}

#[tauri::command]
pub fn osu_sync_map(app: tauri::AppHandle, request: Request<'_>) -> Result<String, String> {
    #[cfg(windows)]
    {
        let bytes = archive_body(&request)?;
        let folder = header_name(&request);
        let (_, songs) = locate(&app).ok_or_else(|| NOT_FOUND.to_string())?;
        if !songs.is_dir() {
            return Err("Your osu! Songs folder is not where Cascade expected it.".to_string());
        }
        let dir = sync::sync_archive(&songs, &folder, bytes)?;
        if !install::within(&songs, &dir) {
            return Err("That map folder is outside your osu! Songs folder.".to_string());
        }
        Ok(dir.to_string_lossy().to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, request);
        Err(WINDOWS_ONLY.to_string())
    }
}

#[cfg(windows)]
fn archive_body<'a>(request: &'a Request<'_>) -> Result<&'a [u8], String> {
    use tauri::ipc::InvokeBody;

    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes,
        InvokeBody::Json(_) => {
            return Err("Cascade sent the map in the wrong format.".to_string())
        }
    };
    if bytes.is_empty() {
        return Err("The exported map came out empty.".to_string());
    }
    Ok(bytes)
}

#[cfg(windows)]
fn header_name(request: &Request<'_>) -> String {
    request
        .headers()
        .get("x-cascade-name")
        .and_then(|value| value.to_str().ok())
        .and_then(crate::urlencoding_decode)
        .unwrap_or_default()
}

#[tauri::command]
pub fn osu_send_map(app: tauri::AppHandle, request: Request<'_>) -> Result<String, String> {
    #[cfg(windows)]
    {
        let bytes = archive_body(&request)?;
        let file_name = install::osz_file_name(&header_name(&request));

        let (root, _) = locate(&app).ok_or_else(|| NOT_FOUND.to_string())?;
        let exe = root.join("osu!.exe");
        if !exe.is_file() {
            return Err(NOT_FOUND.to_string());
        }

        let path = pack::write_temp_osz(bytes, &file_name)?;
        std::process::Command::new(&exe)
            .arg(&path)
            .spawn()
            .map_err(|err| format!("Could not start osu!: {err}"))?;

        Ok(file_name)
    }
    #[cfg(not(windows))]
    {
        let _ = (app, request);
        Err(WINDOWS_ONLY.to_string())
    }
}
