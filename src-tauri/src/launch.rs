use std::path::Path;
use std::sync::Mutex;

use tauri::ipc::Response;

pub const OPEN_EVENT: &str = "cascade://open-files";

pub const SUPPORTED: [&str; 6] = ["osu", "osz", "sm", "ssc", "qua", "osk"];

pub const MAX_LAUNCH_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Default)]
pub struct Pending(pub Mutex<Vec<String>>);

pub fn is_supported(arg: &str) -> bool {
    if arg.starts_with('-') {
        return false;
    }
    Path::new(arg)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| SUPPORTED.iter().any(|known| ext.eq_ignore_ascii_case(known)))
        .unwrap_or(false)
}

pub fn launch_paths<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|arg| is_supported(arg))
        .filter(|arg| Path::new(arg).is_file())
        .collect()
}

pub fn queue(pending: &Pending, paths: Vec<String>) -> bool {
    if paths.is_empty() {
        return false;
    }
    match pending.0.lock() {
        Ok(mut queued) => {
            queued.extend(paths);
            true
        }
        Err(_) => false,
    }
}

#[tauri::command]
pub fn take_launch_files(pending: tauri::State<'_, Pending>) -> Vec<String> {
    match pending.0.lock() {
        Ok(mut queued) => std::mem::take(&mut *queued),
        Err(_) => Vec::new(),
    }
}

#[tauri::command]
pub fn read_launch_file(path: String) -> Result<Response, String> {
    if !is_supported(&path) {
        return Err("Cascade cannot open that kind of file.".to_string());
    }
    let file = Path::new(&path);
    if !file.is_file() {
        return Err("That file is not there any more.".to_string());
    }
    let size = file
        .metadata()
        .map_err(|err| format!("Cannot read that file: {err}"))?
        .len();
    if size > MAX_LAUNCH_BYTES {
        return Err("That file is larger than 512 MB.".to_string());
    }
    let bytes = std::fs::read(file).map_err(|err| format!("Cannot read that file: {err}"))?;
    Ok(Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_every_format_the_editor_can_open() {
        for name in [
            "map.osu", "set.osz", "chart.sm", "chart.ssc", "map.qua", "skin.osk",
        ] {
            assert!(is_supported(name), "{name} should be supported");
        }
    }

    #[test]
    fn ignores_extensions_and_flags_it_cannot_open() {
        assert!(!is_supported("song.mp3"));
        assert!(!is_supported("notes.txt"));
        assert!(!is_supported("noextension"));
        assert!(!is_supported("--flag"));
        assert!(!is_supported("-osu"));
    }

    #[test]
    fn matches_extensions_regardless_of_case() {
        assert!(is_supported("Map.OSU"));
        assert!(is_supported("Set.Osz"));
    }

    #[test]
    fn drops_the_executable_and_any_missing_files() {
        let dir = std::env::temp_dir().join(format!("cascade-launch-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let real = dir.join("real.osu");
        std::fs::write(&real, b"osu file format v14").unwrap();

        let args = vec![
            "C:\\Program Files\\Cascade\\cascade.exe".to_string(),
            real.to_str().unwrap().to_string(),
            dir.join("missing.osu").to_str().unwrap().to_string(),
            "song.mp3".to_string(),
        ];
        assert_eq!(launch_paths(args), vec![real.to_str().unwrap().to_string()]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn never_treats_the_first_argument_as_a_file() {
        let dir = std::env::temp_dir().join(format!("cascade-argv0-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let map = dir.join("only.osu");
        std::fs::write(&map, b"osu file format v14").unwrap();

        let args = vec![map.to_str().unwrap().to_string()];
        assert!(launch_paths(args).is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn queues_only_when_there_is_something_to_open() {
        let pending = Pending::default();
        assert!(!queue(&pending, Vec::new()));
        assert!(queue(&pending, vec!["a.osu".to_string()]));
        assert_eq!(pending.0.lock().unwrap().len(), 1);
        assert!(queue(&pending, vec!["b.osz".to_string()]));
        assert_eq!(pending.0.lock().unwrap().len(), 2);
    }
}
