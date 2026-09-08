#[cfg(windows)]
mod install;
#[cfg(windows)]
mod memory;
#[cfg(windows)]
mod pack;

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
    pub root: Option<String>,
    pub songs: Option<String>,
}

#[cfg(windows)]
fn locate() -> Option<(std::path::PathBuf, std::path::PathBuf)> {
    let root = install::discover_root().or_else(memory::running_root)?;
    let songs = install::songs_for(&root);
    Some((root, songs))
}

#[tauri::command]
pub fn osu_status() -> OsuStatus {
    #[cfg(windows)]
    {
        let running = memory::is_running();
        match locate() {
            Some((root, songs)) => OsuStatus {
                supported: true,
                installed: true,
                running,
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
    #[cfg(not(windows))]
    {
        OsuStatus::default()
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
pub fn osu_read_map(folder: String) -> Result<Response, String> {
    #[cfg(windows)]
    {
        let (_, songs) = locate().ok_or_else(|| NOT_FOUND.to_string())?;
        let name = install::safe_folder(&folder)
            .ok_or_else(|| "That map folder name is not valid.".to_string())?;
        let dir = songs.join(name);
        if !dir.is_dir() {
            return Err("That map folder is not in your osu! Songs folder any more.".to_string());
        }
        if !install::within(&songs, &dir) {
            return Err("That map folder is outside your osu! Songs folder.".to_string());
        }
        Ok(Response::new(pack::pack_folder(&dir)?))
    }
    #[cfg(not(windows))]
    {
        let _ = folder;
        Err(WINDOWS_ONLY.to_string())
    }
}

#[tauri::command]
pub fn osu_send_map(request: Request<'_>) -> Result<String, String> {
    #[cfg(windows)]
    {
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

        let requested = request
            .headers()
            .get("x-cascade-name")
            .and_then(|value| value.to_str().ok())
            .and_then(crate::urlencoding_decode)
            .unwrap_or_default();
        let file_name = install::osz_file_name(&requested);

        let (root, _) = locate().ok_or_else(|| NOT_FOUND.to_string())?;
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
        let _ = request;
        Err(WINDOWS_ONLY.to_string())
    }
}
