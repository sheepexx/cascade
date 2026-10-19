// Cascade: configure the display-rate preference before WebView construction.
pub(super) fn configure(settings: &webkit2gtk::Settings) -> bool {
    use std::ffi::{c_char, c_void, CStr};
    use webkit2gtk::glib::translate::ToGlibPtr;

    type GetAll = unsafe extern "C" fn() -> *mut c_void;
    type GetLength = unsafe extern "C" fn(*mut c_void) -> usize;
    type GetFeature = unsafe extern "C" fn(*mut c_void, usize) -> *mut c_void;
    type GetIdentifier = unsafe extern "C" fn(*mut c_void) -> *const c_char;
    type SetEnabled = unsafe extern "C" fn(*mut webkit2gtk::ffi::WebKitSettings, *mut c_void, i32);
    type GetEnabled = unsafe extern "C" fn(*mut webkit2gtk::ffi::WebKitSettings, *mut c_void) -> i32;
    type Unref = unsafe extern "C" fn(*mut c_void);

    // The Rust bindings stop at WebKit 2.40; the public feature API arrived in
    // 2.42. Resolve it optionally so older supported WebKit installations still
    // load the app. These signatures match WebKitSettings.h / WebKitFeature.h.
    // All calls run on GTK's main thread while settings and the list are alive.
    unsafe {
        let library = libloading::os::unix::Library::this();
        let api = (
            library.get::<GetAll>(b"webkit_settings_get_all_features\0"),
            library.get::<GetLength>(b"webkit_feature_list_get_length\0"),
            library.get::<GetFeature>(b"webkit_feature_list_get\0"),
            library.get::<GetIdentifier>(b"webkit_feature_get_identifier\0"),
            library.get::<SetEnabled>(b"webkit_settings_set_feature_enabled\0"),
            library.get::<GetEnabled>(b"webkit_settings_get_feature_enabled\0"),
            library.get::<Unref>(b"webkit_feature_list_unref\0"),
        );
        let (Ok(get_all), Ok(length), Ok(get), Ok(identifier), Ok(set_enabled), Ok(get_enabled), Ok(unref)) = api
        else {
            return false;
        };
        let features = get_all();
        if features.is_null() {
            return false;
        }
        let mut configured = false;
        for index in 0..length(features) {
            let feature = get(features, index);
            if feature.is_null() {
                continue;
            }
            let id = identifier(feature);
            if !id.is_null()
                && matches!(
                    CStr::from_ptr(id).to_bytes(),
                    b"PreferPageRenderingUpdatesNear60FPS"
                        | b"PreferPageRenderingUpdatesNear60FPSEnabled"
                )
            {
                set_enabled(settings.to_glib_none().0, feature, 0);
                configured = get_enabled(settings.to_glib_none().0, feature) == 0;
                break;
            }
        }
        unref(features);
        configured
    }
}
