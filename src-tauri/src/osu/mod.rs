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
fn locate(app: &tauri::AppHandle) -> Option<(std::path::PathBuf, std::path::PathBuf)> {
    let dir = config_dir(app);
    let root = install::discover_root(dir.as_deref()).or_else(memory::running_root)?;
    let songs = install::songs_for(&root);
    Some((root, songs))
}

#[cfg(windows)]
fn status_for(app: &tauri::AppHandle) -> OsuStatus {
    let running = memory::is_running();
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
pub fn osu_selected_map() -> Result<serde_json::Value, String> {
    #[cfg(windows)]
    {
        let map = memory::selected_map()?;
        serde_json::to_value(map).map_err(|err| err.to_string())
    }
    #[cfg(not(windows))]
    {
        Err(WINDOWS_ONLY.to_string())
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
