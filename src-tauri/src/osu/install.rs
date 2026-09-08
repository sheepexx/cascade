use std::path::{Path, PathBuf};

pub const UNINSTALL_ROOTS: [&str; 2] = [
    "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
];

pub fn uninstall_key(id: &str) -> String {
    let trimmed = id.trim().trim_start_matches('{').trim_end_matches('}');
    format!("{{{}}}", trimmed)
}

pub fn root_from_display_icon(icon: &str) -> Option<PathBuf> {
    let cleaned = icon.trim();
    let cleaned = cleaned.split(',').next().unwrap_or(cleaned);
    let cleaned = cleaned.trim().trim_matches('"').trim();
    if cleaned.is_empty() {
        return None;
    }
    let exe = PathBuf::from(cleaned);
    if !exe
        .file_name()
        .map(|name| name.eq_ignore_ascii_case("osu!.exe"))
        .unwrap_or(false)
    {
        return None;
    }
    exe.parent().map(Path::to_path_buf)
}

pub fn beatmap_directory(cfg: &str) -> Option<String> {
    for line in cfg.lines() {
        let line = line.trim();
        if line.starts_with('#') {
            continue;
        }
        let (key, value) = match line.split_once('=') {
            Some(pair) => pair,
            None => continue,
        };
        if !key.trim().eq_ignore_ascii_case("BeatmapDirectory") {
            continue;
        }
        let value = value.trim();
        if value.is_empty() {
            return None;
        }
        return Some(value.to_string());
    }
    None
}

pub fn resolve_songs(root: &Path, configured: Option<&str>) -> PathBuf {
    match configured {
        Some(value) => {
            let candidate = Path::new(value);
            if candidate.is_absolute() {
                candidate.to_path_buf()
            } else {
                root.join(candidate)
            }
        }
        None => root.join("Songs"),
    }
}

pub fn is_user_config(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.starts_with("osu!.")
        && lower.ends_with(".cfg")
        && !lower.eq_ignore_ascii_case("osu!.cfg")
}

pub fn safe_folder(name: &str) -> Option<&str> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.len() > 260 {
        return None;
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return None;
    }
    if trimmed.contains(':') || trimmed.starts_with('.') {
        return None;
    }
    if trimmed.chars().any(|c| c.is_control()) {
        return None;
    }
    Some(trimmed)
}

pub fn within(parent: &Path, child: &Path) -> bool {
    let parent = parent.canonicalize().ok();
    let child = child.canonicalize().ok();
    match (parent, child) {
        (Some(parent), Some(child)) => child.starts_with(parent),
        _ => false,
    }
}

pub fn osz_file_name(requested: &str) -> String {
    let base = requested.rsplit(['/', '\\']).next().unwrap_or(requested);
    let cleaned: String = base
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').to_string();
    let with_ext = if cleaned.to_ascii_lowercase().ends_with(".osz") {
        cleaned
    } else {
        format!("{}.osz", cleaned)
    };
    if with_ext.len() <= 4 || with_ext.len() > 200 {
        return "cascade-map.osz".to_string();
    }
    with_ext
}

#[cfg(windows)]
pub fn discover_root() -> Option<PathBuf> {
    from_registry().or_else(local_appdata_root)
}

#[cfg(windows)]
fn local_appdata_root() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA")?;
    let root = PathBuf::from(base).join("osu!");
    root.join("osu!.exe").is_file().then_some(root)
}

#[cfg(windows)]
fn from_registry() -> Option<PathBuf> {
    use winreg::enums::{
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY,
    };
    use winreg::RegKey;

    let id: String = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("SOFTWARE\\osu!")
        .ok()?
        .get_value("UninstallId")
        .ok()?;
    let key_name = uninstall_key(&id);

    for base in UNINSTALL_ROOTS {
        for (hive, flags) in [
            (HKEY_LOCAL_MACHINE, KEY_READ | KEY_WOW64_64KEY),
            (HKEY_LOCAL_MACHINE, KEY_READ | KEY_WOW64_32KEY),
            (HKEY_CURRENT_USER, KEY_READ | KEY_WOW64_64KEY),
            (HKEY_CURRENT_USER, KEY_READ | KEY_WOW64_32KEY),
        ] {
            let path = format!("{}\\{}", base, key_name);
            let key = match RegKey::predef(hive).open_subkey_with_flags(&path, flags) {
                Ok(key) => key,
                Err(_) => continue,
            };
            let icon: String = match key.get_value("DisplayIcon") {
                Ok(value) => value,
                Err(_) => continue,
            };
            if let Some(root) = root_from_display_icon(&icon) {
                if root.join("osu!.exe").is_file() {
                    return Some(root);
                }
            }
        }
    }
    None
}

pub fn songs_for(root: &Path) -> PathBuf {
    let configured = configured_beatmap_directory(root);
    resolve_songs(root, configured.as_deref())
}

fn configured_beatmap_directory(root: &Path) -> Option<String> {
    let entries = std::fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_str()?;
        if !is_user_config(name) {
            continue;
        }
        let text = match std::fs::read_to_string(entry.path()) {
            Ok(text) => text,
            Err(_) => continue,
        };
        if let Some(value) = beatmap_directory(&text) {
            return Some(value);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wraps_uninstall_ids_in_braces_exactly_once() {
        assert_eq!(uninstall_key("abc"), "{abc}");
        assert_eq!(uninstall_key("{abc}"), "{abc}");
        assert_eq!(uninstall_key("  {abc}  "), "{abc}");
    }

    #[test]
    fn reads_the_install_root_out_of_a_display_icon() {
        assert_eq!(
            root_from_display_icon("C:\\Games\\osu!\\osu!.exe"),
            Some(PathBuf::from("C:\\Games\\osu!"))
        );
        assert_eq!(
            root_from_display_icon("\"C:\\Games\\osu!\\osu!.exe\",0"),
            Some(PathBuf::from("C:\\Games\\osu!"))
        );
    }

    #[test]
    fn rejects_display_icons_that_are_not_osu() {
        assert_eq!(root_from_display_icon("C:\\Windows\\notepad.exe"), None);
        assert_eq!(root_from_display_icon(""), None);
    }

    #[test]
    fn finds_a_custom_beatmap_directory() {
        let cfg = "Username = sheepex\r\nBeatmapDirectory = D:\\maps\r\nVolume = 50\r\n";
        assert_eq!(beatmap_directory(cfg), Some("D:\\maps".to_string()));
    }

    #[test]
    fn ignores_a_blank_or_missing_beatmap_directory() {
        assert_eq!(beatmap_directory("BeatmapDirectory = \nVolume = 5"), None);
        assert_eq!(beatmap_directory("Volume = 5"), None);
    }

    #[test]
    fn treats_a_relative_beatmap_directory_as_relative_to_the_install() {
        let root = Path::new("C:\\osu!");
        assert_eq!(resolve_songs(root, None), PathBuf::from("C:\\osu!\\Songs"));
        assert_eq!(
            resolve_songs(root, Some("Songs2")),
            PathBuf::from("C:\\osu!\\Songs2")
        );
        assert_eq!(
            resolve_songs(root, Some("D:\\maps")),
            PathBuf::from("D:\\maps")
        );
    }

    #[test]
    fn picks_the_per_user_config_only() {
        assert!(is_user_config("osu!.sheepex.cfg"));
        assert!(!is_user_config("osu!.cfg"));
        assert!(!is_user_config("scores.db"));
    }

    #[test]
    fn refuses_folder_names_that_could_escape_the_songs_directory() {
        assert_eq!(safe_folder("123 Artist - Title"), Some("123 Artist - Title"));
        assert_eq!(safe_folder("..\\..\\Windows"), None);
        assert_eq!(safe_folder("sub/dir"), None);
        assert_eq!(safe_folder("C:\\Windows"), None);
        assert_eq!(safe_folder(".hidden"), None);
        assert_eq!(safe_folder("   "), None);
    }

    #[test]
    fn keeps_osz_names_inside_one_path_segment() {
        assert_eq!(osz_file_name("Artist - Title.osz"), "Artist - Title.osz");
        assert_eq!(osz_file_name("Artist - Title"), "Artist - Title.osz");
        assert_eq!(osz_file_name("..\\..\\evil.osz"), "evil.osz");
        assert_eq!(osz_file_name("a:b?c.osz"), "a_b_c.osz");
        assert_eq!(osz_file_name(""), "cascade-map.osz");
    }
}
