//! Linux compositor compatibility and opt-in frame timing diagnostics.

#[cfg(target_os = "linux")]
use tauri::Manager;
use tauri::Runtime;

#[cfg(target_os = "linux")]
fn affected_webkit(major: u32, minor: u32, nvidia: bool) -> bool {
    nvidia && major == 2 && minor == 54
}

#[cfg(target_os = "linux")]
fn is_wayland(backend: Option<&str>, session: Option<&str>, has_wayland_display: bool) -> bool {
    if let Some(backend) = backend {
        for backend in backend.split(',').map(str::trim) {
            match backend {
                "wayland" => return true,
                "x11" => return false,
                _ => {}
            }
        }
    }
    match session {
        Some("wayland") => true,
        Some("x11") => false,
        _ => has_wayland_display,
    }
}

#[cfg(target_os = "linux")]
fn needs_compatibility() -> bool {
    // These version queries do not initialize GTK or start WebKit processes.
    let (major, minor) = unsafe {
        (
            webkit2gtk::ffi::webkit_get_major_version(),
            webkit2gtk::ffi::webkit_get_minor_version(),
        )
    };
    affected_webkit(
        major,
        minor,
        std::path::Path::new("/proc/driver/nvidia/version").exists(),
    )
}

pub fn prepare() {
    #[cfg(target_os = "linux")]
    {
        extern "C" {
            fn cascade_vblank_compat_init(enabled: i32);
        }
        let enabled = std::path::Path::new("/proc/driver/nvidia/version").exists()
            && std::env::var_os("CASCADE_DISABLE_VBLANK_FALLBACK").is_none();
        // Runs before GTK/WebKit starts its display-clock threads.
        unsafe { cascade_vblank_compat_init(i32::from(enabled)) };
    }
    #[cfg(target_os = "linux")]
    if needs_compatibility() {
        // WebKitGTK 2.54's new Skia compositor can leave stale/overlapping frames
        // on NVIDIA. TextureMapper retains GPU compositing on the same WebKit.
        // https://blogs.igalia.com/carlosgc/tag/webkit/
        if std::env::var_os("WEBKIT_USE_SKIA_FOR_COMPOSITION").is_none() {
            std::env::set_var("WEBKIT_USE_SKIA_FOR_COMPOSITION", "0");
        }
        let wayland = is_wayland(
            std::env::var("GDK_BACKEND").ok().as_deref(),
            std::env::var("XDG_SESSION_TYPE").ok().as_deref(),
            std::env::var_os("WAYLAND_DISPLAY").is_some(),
        );
        // Initialize GTK's GL painting before the first frame. Switching from
        // SHM to EGL during a paint violates NVIDIA's explicit-sync protocol.
        // Keep explicit sync and DMA-BUF enabled for correct frame ordering.
        // https://bugs.webkit.org/show_bug.cgi?id=324551
        if wayland && std::env::var_os("GDK_GL").is_none() {
            std::env::set_var("GDK_GL", "always");
        }
    }
}

pub fn configure<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    #[cfg(target_os = "linux")]
    if std::path::Path::new("/proc/driver/nvidia/version").exists()
        && is_wayland(
            std::env::var("GDK_BACKEND").ok().as_deref(),
            std::env::var("XDG_SESSION_TYPE").ok().as_deref(),
            std::env::var_os("WAYLAND_DISPLAY").is_some(),
        )
        && std::env::var_os("CASCADE_DISABLE_PRESENT_FALLBACK").is_none()
    {
        if let Some(window) = app.get_webview_window("main") {
            window.with_webview(|platform| {
                use gtk::prelude::*;
                schedule_pending_paints(platform.inner().downgrade());
            })?;
        }
    }
    if std::env::var_os("CASCADE_RENDER_DIAGNOSTICS").is_some() {
        use tauri::Listener;
        app.listen("cascade://frame-timing", |event| {
            eprintln!("[cascade rendering] {}", event.payload());
        });
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn presentation_poll_ms(refresh_millihz: i32, gtk_interval_us: i64) -> Option<u64> {
    if refresh_millihz <= 60_000 || gtk_interval_us <= 0 {
        return None;
    }
    let display_interval_us = 1_000_000_000 / i64::from(refresh_millihz);
    if gtk_interval_us <= display_interval_us * 5 / 4 {
        return None;
    }
    // Check pending paints at least twice per display frame, without spinning.
    Some((display_interval_us / 2_000).clamp(1, 8) as u64)
}

#[cfg(target_os = "linux")]
fn schedule_pending_paints(view: webkit2gtk::glib::WeakRef<webkit2gtk::WebView>) {
    use gtk::{gdk, prelude::*};
    use webkit2gtk::glib::{self, translate::ToGlibPtr};

    let Some(widget) = view.upgrade() else { return };
    let mut delay_ms = 250;
    if widget.is_drawable() {
        if let Some(window) = widget.window() {
            if !window.state().contains(gdk::WindowState::ICONIFIED) {
                if let (Some(monitor), Some(clock)) = (
                    window.display().monitor_at_window(&window),
                    widget.frame_clock(),
                ) {
                    let (interval, _) = clock.refresh_info(glib::monotonic_time());
                    if let Some(poll_ms) = presentation_poll_ms(monitor.refresh_rate(), interval) {
                        delay_ms = poll_ms;
                        // GTK 3's GL/Wayland path can retain its 60 Hz fallback
                        // instead of receiving compositor timing. Process only
                        // already-invalidated regions on GTK's main thread;
                        // WebKit and EGL still schedule and synchronize frames.
                        // This public API avoids private GTK structs or changes
                        // to system libraries. Do not force extra invalidations.
                        unsafe {
                            gdk::ffi::gdk_window_process_updates(window.to_glib_none().0, 1);
                        }
                    }
                }
            }
        }
    }
    // A weak reference stops the source after the WebView is destroyed. Hidden
    // windows and displays with working timing use a low-frequency check only.
    glib::timeout_add_local_once(std::time::Duration::from_millis(delay_ms), move || {
        schedule_pending_paints(view);
    });
}

pub fn page_loaded<R: Runtime>(
    webview: &tauri::Webview<R>,
    payload: &tauri::webview::PageLoadPayload<'_>,
) {
    if std::env::var_os("CASCADE_RENDER_DIAGNOSTICS").is_none()
        || payload.event() != tauri::webview::PageLoadEvent::Finished
    {
        return;
    }
    if let Err(error) = webview.eval(include_str!("rendering-diagnostics.js")) {
        eprintln!("[cascade rendering] Cannot measure frame timing: {error}");
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    extern "C" {
        fn cascade_frame_period_ns(
            clock: u32,
            htotal: u32,
            vtotal: u32,
            flags: u32,
            vscan: u32,
        ) -> u64;
        fn cascade_next_frame_ns(now: u64, period: u64) -> u64;
    }

    #[test]
    fn display_clock_uses_the_mode_rate_and_scan_flags() {
        unsafe {
            assert_eq!(
                cascade_frame_period_ns(729_000, 2700, 1500, 0, 1),
                5_555_555
            );
            assert_eq!(
                cascade_frame_period_ns(243_000, 2700, 1500, 0, 1),
                16_666_666
            );
            assert_eq!(
                cascade_frame_period_ns(243_000, 2700, 1500, 1 << 4, 1),
                8_333_333
            );
            assert_eq!(
                cascade_frame_period_ns(729_000, 2700, 1500, 1 << 5, 1),
                11_111_110
            );
            assert_eq!(
                cascade_frame_period_ns(729_000, 2700, 1500, 0, 2),
                11_111_110
            );
            assert_eq!(cascade_frame_period_ns(0, 2700, 1500, 0, 1), 0);
            assert_eq!(cascade_frame_period_ns(1, 2700, 1500, 0, 1), 0);
        }
    }

    #[test]
    fn display_clock_skips_late_frames_without_drift_or_catchup_loops() {
        unsafe {
            assert_eq!(cascade_next_frame_ns(19_999_999, 10_000_000), 20_000_000);
            assert_eq!(cascade_next_frame_ns(20_000_000, 10_000_000), 30_000_000);
            assert_eq!(cascade_next_frame_ns(95_000_000, 10_000_000), 100_000_000);
            assert_eq!(cascade_next_frame_ns(20_000_000, 0), 0);
        }
    }

    #[test]
    fn presentation_fallback_only_bypasses_a_slower_gtk_clock() {
        assert_eq!(presentation_poll_ms(180_000, 16_667), Some(2));
        assert_eq!(presentation_poll_ms(144_000, 16_667), Some(3));
        assert_eq!(presentation_poll_ms(240_000, 16_667), Some(2));
        assert_eq!(presentation_poll_ms(180_000, 5_556), None);
        assert_eq!(presentation_poll_ms(60_000, 16_667), None);
        assert_eq!(presentation_poll_ms(0, 16_667), None);
        assert_eq!(presentation_poll_ms(180_000, 0), None);
    }

    #[test]
    fn compatibility_is_limited_to_the_affected_driver_and_release() {
        assert!(affected_webkit(2, 54, true));
        assert!(!affected_webkit(2, 54, false));
        assert!(!affected_webkit(2, 52, true));
        assert!(!affected_webkit(2, 56, true));
        assert!(!affected_webkit(3, 54, true));
    }

    #[test]
    fn selected_backend_takes_precedence_over_the_desktop_session() {
        assert!(!is_wayland(Some("x11,wayland"), Some("wayland"), true));
        assert!(is_wayland(Some("wayland,x11"), Some("x11"), false));
        assert!(is_wayland(Some("broadway, wayland"), None, false));
        assert!(is_wayland(None, Some("wayland"), false));
        assert!(!is_wayland(None, Some("x11"), true));
        assert!(is_wayland(None, None, true));
        assert!(!is_wayland(None, None, false));
    }
}
