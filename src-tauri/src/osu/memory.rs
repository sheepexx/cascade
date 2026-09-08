use std::path::PathBuf;
use std::str::FromStr;

use rosu_mem::process::{Process, ProcessTraits};
use rosu_mem::signature::Signature;
use serde::Serialize;

const BASE_SIGNATURE: &str = "F8 01 74 04 83 65";
const EXCLUDE_WORDS: [&str; 2] = ["umu-run", "waitforexitandrun"];

const BEATMAP_PTR: i32 = 0xC;
const ARTIST: i32 = 0x18;
const TITLE: i32 = 0x24;
const FOLDER: i32 = 0x78;
const CREATOR: i32 = 0x7C;
const FILE: i32 = 0x90;
const DIFFICULTY: i32 = 0xAC;
const MAP_ID: i32 = 0xC8;
const SET_ID: i32 = 0xCC;

const STRING_LIMIT: usize = 300;
const SHORT_LIMIT: usize = 100;

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SelectedMap {
    pub folder: String,
    pub file: String,
    pub artist: String,
    pub title: String,
    pub creator: String,
    pub difficulty: String,
    pub map_id: i32,
    pub set_id: i32,
    pub osu_root: Option<String>,
}

pub fn selected_map() -> Result<SelectedMap, String> {
    let process = Process::initialize("osu!.exe", &EXCLUDE_WORDS)
        .map_err(|_| "osu! is not running. Start it and pick a map first.".to_string())?;

    let signature = Signature::from_str(BASE_SIGNATURE)
        .map_err(|_| "Cascade's osu! signature is malformed.".to_string())?;

    let base: i32 = process.read_signature(&signature).map_err(|_| {
        "Could not find osu!'s beatmap data. This usually means osu! updated its internals; \
         Cascade needs an update to follow it."
            .to_string()
    })?;

    let beatmap_ptr = process
        .read_i32(base - BEATMAP_PTR)
        .map_err(|_| "Lost track of osu! while reading. Try again.".to_string())?;
    if beatmap_ptr == 0 {
        return Err("osu! has no map selected yet.".to_string());
    }

    let beatmap = process
        .read_i32(beatmap_ptr)
        .map_err(|_| "Lost track of osu! while reading. Try again.".to_string())?;
    if beatmap == 0 {
        return Err("osu! has no map selected yet.".to_string());
    }

    let file = text(&process, beatmap + FILE, STRING_LIMIT);
    let folder = text(&process, beatmap + FOLDER, STRING_LIMIT);

    if file.is_empty() || folder.is_empty() {
        return Err("osu! has no map selected yet.".to_string());
    }
    if !file.to_ascii_lowercase().ends_with(".osu") {
        return Err("osu! is not sitting on a beatmap right now.".to_string());
    }

    Ok(SelectedMap {
        folder,
        file,
        artist: text(&process, beatmap + ARTIST, SHORT_LIMIT),
        title: text(&process, beatmap + TITLE, STRING_LIMIT),
        creator: text(&process, beatmap + CREATOR, SHORT_LIMIT),
        difficulty: text(&process, beatmap + DIFFICULTY, SHORT_LIMIT),
        map_id: process.read_i32(beatmap + MAP_ID).unwrap_or(0),
        set_id: process.read_i32(beatmap + SET_ID).unwrap_or(0),
        osu_root: process
            .executable_dir
            .as_ref()
            .and_then(|dir| dir.to_str())
            .map(str::to_string),
    })
}

pub fn running_root() -> Option<PathBuf> {
    Process::initialize("osu!.exe", &EXCLUDE_WORDS)
        .ok()
        .and_then(|process| process.executable_dir)
}

pub fn is_running() -> bool {
    Process::initialize("osu!.exe", &EXCLUDE_WORDS).is_ok()
}

fn text(process: &Process, addr: i32, limit: usize) -> String {
    process
        .read_string_with_limit_from_ptr(addr, limit)
        .unwrap_or_default()
}
