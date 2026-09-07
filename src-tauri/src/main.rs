#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::time::Duration;

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

fn urlencoding_decode(raw: &str) -> Option<String> {
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                focus(&window);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![start_oauth_listener])
        .setup(|app| {
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
