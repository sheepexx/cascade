# Cascade's Wry patch

This is Wry 0.57.0 from crates.io, retaining its upstream MIT and Apache licenses.
The crate's VCS metadata records commit `792d0359ba6501a4fc360ece17de2ae42329a47c`
(with its dirty flag set); the crates.io package is the source of this copy.

The Linux WebKit backend attaches a Settings object with
`PreferPageRenderingUpdatesNear60FPS` disabled **before** constructing WebView.
Setting it later from Tauri's setup hook leaves rendering near 60 FPS on the
tested WebKitGTK 2.54.1 / NVIDIA / Wayland stack. A minimal GTK/WebKit probe using
the same setting before construction reaches the display's native rate.

`src/webkitgtk/frame_rate.rs` resolves the public WebKit 2.42+ feature API
optionally because the Rust bindings cover only WebKit 2.40. Missing symbols or
a missing preference leave that runtime's behavior intact. The helper uses the
documented feature identifier, and releases its feature list after configuring
the Settings object. All existing Wry attribute settings still apply normally.

Local changes:

- `src/webkitgtk/mod.rs`: install the preference before `builder.build()` on Linux,
  and request accelerated rendering when the NVIDIA driver is present.
- `src/webkitgtk/frame_rate.rs`: optional feature API adapter.
- `Cargo.toml` and `Cargo.toml.orig`: Linux-only libloading dependency.

When updating Tauri/Wry, port this change or replace it with an upstream
pre-construction settings hook. Keep the refresh preference in place until an
actual high refresh rate display confirms the replacement. Do not patch the
global Cargo cache during builds.
