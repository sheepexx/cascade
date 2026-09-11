#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

mod archive;
mod launch;
mod osu;
mod portable;
mod presence;
mod native_audio;
mod vault;

use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

const OAUTH_EVENT: &str = "cascade://oauth-session";
const OAUTH_TIMEOUT_SECS: u64 = 300;

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Signed in to Cascade</title>\
<style>html{color-scheme:dark}body{margin:0;height:100vh;display:grid;place-items:center;\
background:#0b0b10;color:#e2e8f0;font:16px/1.5 system-ui,Segoe UI,sans-serif}\
p{margin:.4rem 0;color:#94a3b8}strong{font-size:1.25rem;color:#f8fafc}</style>\
<div style=text-align:center><strong>Signed in to Cascade</strong>\
<p>You can close this tab and go back to the app.</p></div>";

fn focus(window: &WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

fn session_from_request(line: &str) -> Option<String> {
    let target = line.split_whitespace().nth(1)?;
    let query = target.split_once('?')?.1;
    for pair in query.split('&') {
        if let Some(value) = pair.strip_prefix("session=") {
            return urlencoding_decode(value);
        }
    }
    None
}

pub(crate) fn urlencoding_decode(raw: &str) -> Option<String> {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
                out.push(u8::from_str_radix(hex, 16).ok()?);
                i += 3;
            }
            byte => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}

fn answer(stream: &mut TcpStream, body: &str) {
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

#[tauri::command]
fn start_oauth_listener(app: AppHandle) -> Result<u16, String> {
    let listener =
        TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).map_err(|err| err.to_string())?;
    let port = listener.local_addr().map_err(|err| err.to_string())?.port();

    std::thread::spawn(move || {
        let _ = listener.set_nonblocking(false);
        let deadline = std::time::Instant::now() + Duration::from_secs(OAUTH_TIMEOUT_SECS);
        for incoming in listener.incoming() {
            if std::time::Instant::now() > deadline {
                break;
            }
            let Ok(mut stream) = incoming else { continue };
            let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
            let mut line = String::new();
            if BufReader::new(&stream).read_line(&mut line).is_err() {
                continue;
            }
            let session = session_from_request(&line);
            answer(&mut stream, DONE_PAGE);
            if let Some(session) = session {
                let _ = app.emit(OAUTH_EVENT, session);
                if let Some(window) = app.get_webview_window("main") {
                    focus(&window);
                }
                break;
            }
        }
    });

    Ok(port)
}

/// Appends any panic, with where it happened, to crash.log in the app's log
/// folder. Release builds abort on a panic and have no console, so otherwise a
/// crash leaves nothing behind but an exit code.
fn install_crash_log(dir: std::path::PathBuf, version: String) {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("crash.log"))
        {
            let secs = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|elapsed| elapsed.as_secs())
                .unwrap_or(0);
            let thread = std::thread::current();
            let _ = writeln!(
                file,
                "[{secs}] Cascade {version} panicked on thread '{}': {info}\n{}\n",
                thread.name().unwrap_or("unnamed"),
                std::backtrace::Backtrace::force_capture(),
            );
        }
        previous(info);
    }));
}

/// Returns straight away: the Discord work happens on the presence thread, so
/// a slow or wedged Discord can no longer freeze the window.
#[tauri::command]
fn presence_update(
    presence: tauri::State<'_, presence::Presence>,
    mode: String,
    details: Option<String>,
    state: Option<String>,
) -> Result<(), String> {
    presence.submit(
        presence::parse_mode(&mode),
        details.as_deref(),
        state.as_deref(),
    )
}

fn main() {
    portable::take_over(std::env::args());
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = launch::launch_paths(argv);
            if launch::queue(app.state::<launch::Pending>().inner(), paths) {
                let _ = app.emit(launch::OPEN_EVENT, ());
            }
            if let Some(window) = app.get_webview_window("main") {
                focus(&window);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(launch::Pending::default())
        .manage(presence::Presence::default())
        .manage(native_audio::NativeAudio::default())
        .invoke_handler(tauri::generate_handler![
            native_audio::native_audio_load,
            native_audio::native_audio_control,
            native_audio::native_audio_status,
            native_audio::native_audio_close,
            native_audio::native_audio_effect,
            start_oauth_listener,
            presence_update,
            launch::take_launch_files,
            launch::read_launch_file,
            osu::osu_status,
            osu::osu_live,
            osu::osu_selected_map,
            osu::osu_read_map,
            osu::osu_map_background,
            osu::osu_send_map,
            osu::osu_sync_map,
            osu::osu_list_skins,
            osu::osu_read_skin,
            osu::osu_choose_root,
            osu::osu_forget_root,
            portable::portable_app,
            portable::portable_install,
            vault::vault_save,
            vault::vault_history,
            vault::vault_restore,
            vault::vault_reveal
        ])
        .setup(|app| {
            if let Ok(dir) = app.path().app_log_dir() {
                install_crash_log(dir, app.package_info().version.to_string());
            }
            let paths = launch::launch_paths(std::env::args());
            launch::queue(app.state::<launch::Pending>().inner(), paths);
            osu::spawn_watcher(app.handle().clone());
            std::thread::spawn(portable::sweep);
            if std::env::var("CASCADE_DEVTOOLS").is_ok() {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Cascade");
}
