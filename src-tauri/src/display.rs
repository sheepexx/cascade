//! The desktop window: the splash shown while Cascade loads, how the window
//! is shown once it has (fullscreen, borderless or windowed), and quitting.
//!
//! The settings live here rather than in the web view because they are needed
//! before the web view exists: the window has to open in the right mode.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

const FILE: &str = "display.json";
pub const MAIN: &str = "main";
const SPLASH: &str = "splash";
/// Asks the page to play its outro and then quit.
const QUIT_EVENT: &str = "cascade://quit-requested";

/// Shown anyway if the page never says it is ready.
const REVEAL_FALLBACK: Duration = Duration::from_secs(20);
/// Quit anyway if the page never finishes its outro.
const QUIT_FALLBACK: Duration = Duration::from_secs(6);

const MIN_WIDTH: u32 = 900;
const MIN_HEIGHT: u32 = 600;
// No "unlimited": with vsync off, Windows' web view keeps drawing frames but
// stops showing them, and the window crawls at well under one frame a second.
const FRAME_LIMITS: &[&str] = &["vsync", "30", "60", "120", "144", "240"];

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Fullscreen,
    Borderless,
    Windowed,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub mode: Mode,
    /// The window's size in windowed mode, in logical pixels.
    pub width: u32,
    pub height: u32,
    /// "vsync", or a cap in frames per second, which the page applies.
    pub frame_limit: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            mode: Mode::Fullscreen,
            width: 1440,
            height: 900,
            frame_limit: "vsync".into(),
        }
    }
}

impl Settings {
    pub fn normalized(mut self) -> Self {
        self.width = self.width.clamp(MIN_WIDTH, 7680);
        self.height = self.height.clamp(MIN_HEIGHT, 4320);
        if !FRAME_LIMITS.contains(&self.frame_limit.as_str()) {
            self.frame_limit = "vsync".into();
        }
        self
    }
}

pub struct Display {
    settings: Mutex<Settings>,
    /// A window resize in windowed mode not yet written to disk.
    unsaved: AtomicBool,
    revealed: AtomicBool,
    quitting: AtomicBool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    settings: Settings,
    /// The monitor the window is on, in logical pixels.
    monitor_width: u32,
    monitor_height: u32,
}

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(FILE))
}

fn load(app: &AppHandle) -> Settings {
    settings_path(app)
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str::<Settings>(&text).ok())
        .unwrap_or_default()
        .normalized()
}

fn save(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app).ok_or_else(|| "Cannot reach the settings folder.".to_string())?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|err| format!("Cannot save display settings: {err}"))?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    fs::write(path, text).map_err(|err| format!("Cannot save display settings: {err}"))
}

/// Opens the splash, then the main window hidden behind it. The main window
/// shows once its page calls `app_ready`, or after a while regardless.
pub fn open_windows(app: &AppHandle) -> tauri::Result<()> {
    app.manage(Display {
        settings: Mutex::new(load(app)),
        unsaved: AtomicBool::new(false),
        revealed: AtomicBool::new(false),
        quitting: AtomicBool::new(false),
    });

    let splash = WebviewWindowBuilder::new(app, SPLASH, WebviewUrl::App("splash.html".into()))
        .title("Cascade")
        .inner_size(280.0, 280.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .center();
    // Cascade still starts without its splash.
    if let Err(err) = splash.build() {
        eprintln!("[cascade] Cannot show the splash: {err}");
    }

    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN)
        .cloned()
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
    config.visible = false;
    WebviewWindowBuilder::from_config(app, &config)?.build()?;

    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(REVEAL_FALLBACK);
        reveal(&handle);
    });
    Ok(())
}

/// Puts the window into the settings' mode. A hidden window only gets its
/// size and frame; fullscreen itself is entered once it is on screen.
fn apply(window: &WebviewWindow, settings: &Settings, visible: bool) -> tauri::Result<()> {
    let monitor = match window.current_monitor()? {
        Some(monitor) => Some(monitor),
        None => window.primary_monitor()?,
    };
    match settings.mode {
        Mode::Windowed => {
            if window.is_fullscreen()? {
                window.set_fullscreen(false)?;
            }
            window.set_decorations(true)?;
            window.set_resizable(true)?;
            let (mut width, mut height) = (settings.width as f64, settings.height as f64);
            if let Some(monitor) = &monitor {
                // Never larger than the screen it is on.
                let screen = monitor.size().to_logical::<f64>(monitor.scale_factor());
                width = width.min(screen.width * 0.95);
                height = height.min(screen.height * 0.9);
            }
            window.set_size(LogicalSize::new(width, height))?;
            window.center()?;
        }
        Mode::Borderless | Mode::Fullscreen => {
            if settings.mode == Mode::Borderless && window.is_fullscreen()? {
                window.set_fullscreen(false)?;
            }
            window.set_decorations(false)?;
            window.set_resizable(false)?;
            if let Some(monitor) = &monitor {
                window.set_position(*monitor.position())?;
                window.set_size(*monitor.size())?;
            }
            if settings.mode == Mode::Fullscreen && visible {
                window.set_fullscreen(true)?;
            }
        }
    }
    Ok(())
}

/// Shows the main window in its mode and closes the splash. Runs once.
pub fn reveal(app: &AppHandle) {
    // A second launch can ask before the windows exist; they show themselves.
    let Some(display) = app.try_state::<Display>() else {
        return;
    };
    if display.revealed.swap(true, Ordering::SeqCst) {
        return;
    }
    let settings = display
        .settings
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default();
    if let Some(main) = app.get_webview_window(MAIN) {
        if let Err(err) = apply(&main, &settings, false) {
            eprintln!("[cascade] Cannot set up the window: {err}");
        }
        let _ = main.show();
        let _ = main.set_focus();
        if settings.mode == Mode::Fullscreen {
            let _ = main.set_fullscreen(true);
        }
    }
    if let Some(splash) = app.get_webview_window(SPLASH) {
        let _ = splash.close();
    }
}

fn info(app: &AppHandle) -> Info {
    let display = app.state::<Display>();
    let settings = display
        .settings
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default();
    let (monitor_width, monitor_height) = app
        .get_webview_window(MAIN)
        .and_then(|window| window.current_monitor().ok().flatten())
        .map(|monitor| {
            let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
            (size.width.round() as u32, size.height.round() as u32)
        })
        .unwrap_or((1920, 1080));
    Info {
        settings,
        monitor_width,
        monitor_height,
    }
}

/// Keeps the size a windowed window was dragged to, and turns the window's
/// close button (or Alt+F4) into the page's outro.
pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() != MAIN {
        return;
    }
    let app = window.app_handle();
    let Some(display) = app.try_state::<Display>() else {
        return;
    };
    match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            // A second close, or one before the page could answer, quits now.
            if display.quitting.swap(true, Ordering::SeqCst)
                || !display.revealed.load(Ordering::SeqCst)
            {
                return;
            }
            api.prevent_close();
            let _ = app.emit(QUIT_EVENT, ());
            let handle = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(QUIT_FALLBACK);
                handle.exit(0);
            });
        }
        tauri::WindowEvent::Resized(size) => {
            if !display.revealed.load(Ordering::SeqCst)
                || window.is_fullscreen().unwrap_or(false)
                || window.is_maximized().unwrap_or(false)
                || window.is_minimized().unwrap_or(false)
            {
                return;
            }
            let Ok(scale) = window.scale_factor() else {
                return;
            };
            let logical = size.to_logical::<f64>(scale);
            if let Ok(mut settings) = display.settings.lock() {
                if settings.mode != Mode::Windowed || logical.width < 1.0 {
                    return;
                }
                settings.width = logical.width.round() as u32;
                settings.height = logical.height.round() as u32;
                *settings = settings.clone().normalized();
                display.unsaved.store(true, Ordering::SeqCst);
            }
        }
        _ => {}
    }
}

/// Writes a resized window's size as Cascade closes.
pub fn on_exit(app: &AppHandle) {
    let Some(display) = app.try_state::<Display>() else {
        return;
    };
    if !display.unsaved.swap(false, Ordering::SeqCst) {
        return;
    }
    let settings = display.settings.lock().map(|s| s.clone());
    if let Ok(settings) = settings {
        let _ = save(app, &settings);
    }
}

/// The page has loaded what it needs: show the window.
#[tauri::command]
pub fn app_ready(app: AppHandle) {
    reveal(&app);
}

#[tauri::command]
pub fn display_get(app: AppHandle) -> Info {
    info(&app)
}

#[tauri::command]
pub fn display_set(app: AppHandle, settings: Settings) -> Result<Info, String> {
    let settings = settings.normalized();
    save(&app, &settings)?;
    {
        let display = app.state::<Display>();
        let mut current = display
            .settings
            .lock()
            .map_err(|_| "Display settings are unavailable.".to_string())?;
        *current = settings.clone();
        display.unsaved.store(false, Ordering::SeqCst);
    }
    if let Some(main) = app.get_webview_window(MAIN) {
        if main.is_visible().unwrap_or(false) {
            apply(&main, &settings, true)
                .map_err(|err| format!("Cannot change the window: {err}"))?;
        }
    }
    Ok(info(&app))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_fullscreen_until_changed() {
        assert_eq!(Settings::default().mode, Mode::Fullscreen);
        let parsed: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(parsed, Settings::default());
    }

    #[test]
    fn reads_what_it_writes() {
        let settings = Settings {
            mode: Mode::Windowed,
            width: 1600,
            height: 900,
            frame_limit: "144".into(),
        };
        let text = serde_json::to_string(&settings).unwrap();
        assert!(text.contains("\"mode\":\"windowed\""));
        assert!(text.contains("\"frameLimit\":\"144\""));
        assert_eq!(serde_json::from_str::<Settings>(&text).unwrap(), settings);
    }

    #[test]
    fn repairs_impossible_values() {
        let settings = Settings {
            mode: Mode::Windowed,
            width: 10,
            height: 99_999,
            frame_limit: "9000".into(),
        }
        .normalized();
        assert_eq!((settings.width, settings.height), (MIN_WIDTH, 4320));
        assert_eq!(settings.frame_limit, "vsync");
    }

    #[test]
    fn an_old_unlimited_choice_falls_back_to_vsync() {
        let saved: Settings =
            serde_json::from_str(r#"{"mode":"fullscreen","frameLimit":"unlimited"}"#).unwrap();
        assert_eq!(saved.normalized().frame_limit, "vsync");
    }
}
