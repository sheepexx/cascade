use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use serde::Serialize;
use tauri::{AppHandle, Manager};

const LEFTOVER: &str = ".cascade-old";
const HANDOFF_FLAG: &str = "--updated";
const HANDOFF_TIMEOUT: Duration = Duration::from_secs(10);
const HANDOFF_POLL: Duration = Duration::from_millis(150);

#[derive(Serialize)]
pub struct PortableApp {
    name: String,
    directory: String,
}

pub fn is_portable(name: &str) -> bool {
    name.to_ascii_lowercase().contains("portable")
}

pub fn next_name(current: &str, from: &str, to: &str) -> String {
    if from.is_empty() || from == to || !current.contains(from) {
        return current.to_string();
    }
    current.replacen(from, to, 1)
}

fn exe() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|err| format!("Cascade cannot locate its own file. {err}"))
}

fn file_name(path: &Path) -> Option<String> {
    Some(path.file_name()?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn portable_app() -> Option<PortableApp> {
    let exe = exe().ok()?;
    let name = file_name(&exe)?;
    if !is_portable(&name) {
        return None;
    }
    Some(PortableApp {
        directory: exe.parent()?.to_string_lossy().into_owned(),
        name,
    })
}

fn header(request: &tauri::ipc::Request<'_>, key: &str) -> Result<String, String> {
    request
        .headers()
        .get(key)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
        .ok_or_else(|| format!("The update is missing its {key}."))
}

fn from_base64(value: &str) -> Result<String, String> {
    let raw = base64::engine::general_purpose::STANDARD
        .decode(value)
        .map_err(|err| format!("The update signature is malformed. {err}"))?;
    String::from_utf8(raw).map_err(|err| format!("The update signature is malformed. {err}"))
}

fn verify(app: &AppHandle, payload: &[u8], signature: &str) -> Result<(), String> {
    let configured = app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|updater| updater.get("pubkey"))
        .and_then(|key| key.as_str())
        .ok_or("This build cannot check that an update is genuine.")?
        .to_string();
    let key = PublicKey::decode(&from_base64(&configured)?)
        .map_err(|err| format!("This build cannot check that an update is genuine. {err}"))?;
    let signature = Signature::decode(&from_base64(signature)?)
        .map_err(|err| format!("The update signature is malformed. {err}"))?;
    key.verify(payload, &signature, true)
        .map_err(|_| "The update was not signed by Cascade, so it was discarded.".to_string())
}

fn hand_off(target: &Path) -> Result<(), String> {
    let mut command = std::process::Command::new(target);
    command.arg(HANDOFF_FLAG);
    if let Some(directory) = target.parent() {
        command.current_dir(directory);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("Cascade updated itself but could not start the new copy. {err}"))
}

#[tauri::command]
pub fn portable_install(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(payload) = request.body() else {
        return Err("The update did not arrive intact.".to_string());
    };
    if payload.is_empty() {
        return Err("The update arrived empty.".to_string());
    }
    let version = header(&request, "x-update-version")?;
    let signature = header(&request, "x-update-signature")?;
    verify(&app, payload, &signature)?;

    let exe = exe()?;
    let name = file_name(&exe).ok_or("Cascade cannot locate its own file.")?;
    if !is_portable(&name) {
        return Err("This copy of Cascade is not the portable build.".to_string());
    }
    let directory = exe
        .parent()
        .ok_or("Cascade cannot locate its own folder.")?
        .to_path_buf();

    let next = next_name(&name, &app.package_info().version.to_string(), &version);
    let target = directory.join(&next);
    let aside = directory.join(format!("{name}{LEFTOVER}"));
    let in_place = next.eq_ignore_ascii_case(&name);

    let _ = std::fs::remove_file(&aside);
    if in_place {
        std::fs::rename(&exe, &aside)
            .map_err(|err| format!("Cascade could not move its old file aside. {err}"))?;
    }
    if let Err(err) = std::fs::write(&target, payload) {
        if in_place {
            let _ = std::fs::rename(&aside, &exe);
        }
        return Err(format!("Cascade could not write the update. {err}"));
    }
    if !in_place {
        let _ = std::fs::rename(&exe, &aside);
    }

    hand_off(&target)?;
    app.exit(0);
    Ok(next)
}

pub fn sweep() -> bool {
    let Ok(exe) = exe() else { return true };
    let Some(directory) = exe.parent() else {
        return true;
    };
    let Ok(entries) = std::fs::read_dir(directory) else {
        return true;
    };
    let mut cleared = true;
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = file_name(&path) else { continue };
        if !name.to_ascii_lowercase().ends_with(LEFTOVER) {
            continue;
        }
        if std::fs::remove_file(&path).is_err() {
            cleared = false;
        }
    }
    cleared
}

pub fn take_over<I: IntoIterator<Item = String>>(args: I) {
    if !args.into_iter().any(|arg| arg == HANDOFF_FLAG) {
        return;
    }
    let deadline = Instant::now() + HANDOFF_TIMEOUT;
    while Instant::now() < deadline {
        if sweep() {
            return;
        }
        std::thread::sleep(HANDOFF_POLL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_portable_download_is_portable() {
        assert!(is_portable("Cascade_1.2.293_portable.exe"));
        assert!(is_portable("cascade_PORTABLE.exe"));
        assert!(!is_portable("Cascade.exe"));
        assert!(!is_portable("cascade_1.2.293_x64-setup.exe"));
    }

    #[test]
    fn carries_the_new_version_into_the_file_name() {
        assert_eq!(
            next_name("Cascade_1.2.280_portable.exe", "1.2.280", "1.2.293"),
            "Cascade_1.2.293_portable.exe"
        );
    }

    #[test]
    fn keeps_a_renamed_file_where_the_version_is_missing() {
        assert_eq!(
            next_name("my portable cascade.exe", "1.2.280", "1.2.293"),
            "my portable cascade.exe"
        );
        assert_eq!(
            next_name("Cascade_1.2.280_portable.exe", "1.2.280", "1.2.280"),
            "Cascade_1.2.280_portable.exe"
        );
    }
}
