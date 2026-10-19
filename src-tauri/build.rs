fn main() {
    println!("cargo:rerun-if-changed=src/linux_vblank.c");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
        let drm = pkg_config::Config::new()
            .probe("libdrm")
            .expect("Linux desktop builds require libdrm development headers");
        cc::Build::new()
            .file("src/linux_vblank.c")
            .includes(drm.include_paths)
            .flag_if_supported("-std=c11")
            .compile("cascade_vblank");
        println!("cargo:rustc-link-lib=dl");
        // WebKit calls through libdrm's public symbol. Keep the compatibility
        // adapter local to Cascade rather than changing any system library.
        println!("cargo:rustc-link-arg=-Wl,--export-dynamic-symbol=drmWaitVBlank");
    }
    tauri_build::build();
}
