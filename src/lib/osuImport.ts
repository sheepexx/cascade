import JSZip from "jszip";
import type {
  Difficulty,
  LoadedFile,
  ManiaNote,
  SongMeta,
  TimingPoint,
} from "../types";
import { MAX_KEYS, MIN_KEYS, uid } from "../types";
import { xToColumn } from "./osuExport";

/** Result of parsing a single `.osu` file (without its referenced media). */
export type ParsedOsu = {
  meta: SongMeta;
  difficulty: Difficulty;
  timingPoints: TimingPoint[];
  audioFilename: string | null;
  backgroundFilename: string | null;
};

/** A fully imported beatmap set, with media resolved from the `.osz`. */
export type ImportedMap = {
  meta: SongMeta;
  difficulties: Difficulty[];
  timingPoints: TimingPoint[];
  /** Every distinct audio file in the set, keyed by its filename. */
  audioFiles: Record<string, LoadedFile>;
  /** Every distinct background image in the set, keyed by filename. */
  backgroundFiles: Record<string, LoadedFile>;
};

/** Split the file into `[Section] -> lines` while ignoring comments/blanks. */
function splitSections(text: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let current = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      current = header[1];
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  return sections;
}

function keyValues(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse the text of a `.osu` file into editor state. Assumes osu!mania. */
export function parseOsuFile(text: string): ParsedOsu {
  const sections = splitSections(text);
  const general = keyValues(sections["General"] ?? []);
  const meta = keyValues(sections["Metadata"] ?? []);
  const diff = keyValues(sections["Difficulty"] ?? []);

  const keyCount = Math.max(
    MIN_KEYS,
    Math.min(MAX_KEYS, Math.round(num(diff["CircleSize"], 4))),
  );

  const songMeta: SongMeta = {
    title: meta["Title"] ?? meta["TitleUnicode"] ?? "Untitled",
    artist: meta["Artist"] ?? meta["ArtistUnicode"] ?? "Unknown Artist",
    creator: meta["Creator"] ?? "Mapper",
  };

  // ---- Timing points: every uninherited point ----
  const timingPoints: TimingPoint[] = [];
  for (const line of sections["TimingPoints"] ?? []) {
    const p = line.split(",");
    const beatLength = Number(p[1]);
    const uninherited = p[6] === undefined ? 1 : Number(p[6]);
    if (uninherited === 1 && beatLength > 0) {
      timingPoints.push({
        id: uid("tp"),
        time: Math.round(Number(p[0])),
        bpm: Math.round((60000 / beatLength) * 1000) / 1000,
      });
    }
  }
  if (timingPoints.length === 0) {
    timingPoints.push({ id: uid("tp"), time: 0, bpm: 120 });
  }
  timingPoints.sort((a, b) => a.time - b.time);

  // ---- Background event ----
  let backgroundFilename: string | null = null;
  for (const line of sections["Events"] ?? []) {
    const m = line.match(/^0\s*,\s*0\s*,\s*"?([^",]+)"?/);
    if (m) {
      backgroundFilename = m[1];
      break;
    }
  }

  // ---- Hit objects ----
  const notes: ManiaNote[] = [];
  for (const line of sections["HitObjects"] ?? []) {
    const p = line.split(",");
    if (p.length < 4) continue;
    const x = Number(p[0]);
    const time = Math.round(Number(p[2]));
    const type = Number(p[3]);
    if (!Number.isFinite(x) || !Number.isFinite(time)) continue;
    const column = xToColumn(x, keyCount);

    if (type & 128) {
      const endTime = Math.round(Number((p[5] ?? "").split(":")[0]));
      notes.push({
        id: uid("n"),
        column,
        startTime: time,
        endTime: Number.isFinite(endTime) && endTime > time ? endTime : time + 1,
      });
    } else {
      notes.push({ id: uid("n"), column, startTime: time });
    }
  }
  notes.sort((a, b) => a.startTime - b.startTime || a.column - b.column);

  const difficulty: Difficulty = {
    id: uid("diff"),
    name: meta["Version"] ?? "Imported",
    audioFilename: general["AudioFilename"] ?? undefined,
    keyCount,
    hpDrainRate: num(diff["HPDrainRate"], 7),
    overallDifficulty: num(diff["OverallDifficulty"], 7),
    previewTime: Math.round(num(general["PreviewTime"], -1)),
    timingPoints,
    notes,
  };

  return {
    meta: songMeta,
    difficulty,
    timingPoints,
    audioFilename: general["AudioFilename"] ?? null,
    backgroundFilename,
  };
}

/** Case-insensitive lookup of a zip entry by filename. */
function findEntry(zip: JSZip, name: string | null) {
  if (!name) return null;
  const target = name.toLowerCase();
  let found: JSZip.JSZipObject | null = null;
  zip.forEach((path, file) => {
    if (found) return;
    const base = path.split("/").pop()?.toLowerCase();
    if (base === target || path.toLowerCase() === target) found = file;
  });
  return found;
}

async function toLoadedFile(
  file: JSZip.JSZipObject | null,
  mime: string,
): Promise<LoadedFile | null> {
  if (!file) return null;
  const raw = await file.async("blob");
  const blob = new Blob([raw], { type: mime });
  const name = file.name.split("/").pop() ?? file.name;
  return { name, url: URL.createObjectURL(blob), blob };
}

function mimeForImage(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function mimeForAudio(name: string): string {
  return name.split(".").pop()?.toLowerCase() === "ogg"
    ? "audio/ogg"
    : "audio/mpeg";
}

/**
 * Import a `.osz` (zip): parse every `.osu` difficulty (mania only) into one
 * mapset and resolve the shared audio + background out of the archive.
 */
export async function importOsz(blob: Blob): Promise<ImportedMap> {
  const zip = await JSZip.loadAsync(blob);

  const osuPaths: string[] = [];
  zip.forEach((path) => {
    if (path.toLowerCase().endsWith(".osu")) osuPaths.push(path);
  });
  if (osuPaths.length === 0) {
    throw new Error("No .osu difficulty found inside the .osz archive.");
  }
  osuPaths.sort();

  const parsed: ParsedOsu[] = [];
  for (const path of osuPaths) {
    const text = await zip.file(path)!.async("string");
    // Only keep osu!mania difficulties (Mode: 3).
    if (/^\s*Mode\s*:\s*3\s*$/m.test(text)) parsed.push(parseOsuFile(text));
  }
  if (parsed.length === 0) {
    throw new Error("No osu!mania (Mode 3) difficulties found in the archive.");
  }

  // Metadata + timing come from the first difficulty.
  // Audio is resolved per filename. Background is also resolved per difficulty.
  const first = parsed[0];

  const audioFiles: Record<string, LoadedFile> = {};
  for (const name of new Set(parsed.map((p) => p.audioFilename))) {
    if (!name || audioFiles[name]) continue;
    const loaded = await toLoadedFile(findEntry(zip, name), mimeForAudio(name));
    if (loaded) audioFiles[name] = loaded;
  }

  const backgroundFiles: Record<string, LoadedFile> = {};
  for (const name of new Set(parsed.map((p) => p.backgroundFilename))) {
    if (!name || backgroundFiles[name]) continue;
    const entry = findEntry(zip, name);
    const loaded = await toLoadedFile(entry, mimeForImage(name));
    if (loaded) backgroundFiles[name] = loaded;
  }

  const difficulties = parsed.map((p) => ({
    ...p.difficulty,
    backgroundFilename: p.backgroundFilename && backgroundFiles[p.backgroundFilename]
      ? p.backgroundFilename
      : undefined,
  }));

  return {
    meta: first.meta,
    difficulties,
    timingPoints: first.timingPoints,
    audioFiles,
    backgroundFiles,
  };
}
