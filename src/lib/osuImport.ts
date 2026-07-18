import JSZip from "jszip";
import type {
  Difficulty,
  LoadedFile,
  ManiaNote,
  SongMeta,
  TimingPoint,
} from "../types";
import {
  MAX_KEYS,
  MIN_KEYS,
  beatLengthToSv,
  makeGreenPoint,
  makeRedPoint,
  uid,
} from "../types";
import { xToColumn } from "./osuExport";

export type ParsedOsu = {
  meta: SongMeta;
  difficulty: Difficulty;
  timingPoints: TimingPoint[];
  audioFilename: string | null;
  backgroundFilename: string | null;
  videoFilename: string | null;
  videoOffsetMs: number;
};

export type ImportedMap = {
  meta: SongMeta;
  difficulties: Difficulty[];
  timingPoints: TimingPoint[];
  audioFiles: Record<string, LoadedFile>;
  backgroundFiles: Record<string, LoadedFile>;
  videoFiles: Record<string, LoadedFile>;
};

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

function hitSampleFields(
  hitSound: number,
  sample: string,
): Partial<ManiaNote> {
  const out: Partial<ManiaNote> = {};
  if (hitSound) out.hitSound = hitSound;
  const parts = sample.split(":");
  const normalSet = Math.round(Number(parts[0])) || 0;
  const additionSet = Math.round(Number(parts[1])) || 0;
  const index = Math.round(Number(parts[2])) || 0;
  const volume = Math.round(Number(parts[3])) || 0;
  const filename = (parts[4] ?? "").trim();
  if (normalSet) out.sampleSet = normalSet;
  if (additionSet) out.additionSet = additionSet;
  if (index) out.sampleIndex = index;
  if (volume) out.sampleVolume = volume;
  if (filename) out.sampleFile = filename;
  return out;
}

export function parseOsuFile(text: string): ParsedOsu {
  const sections = splitSections(text);
  const general = keyValues(sections["General"] ?? []);
  const meta = keyValues(sections["Metadata"] ?? []);
  const diff = keyValues(sections["Difficulty"] ?? []);
  const editor = keyValues(sections["Editor"] ?? []);

  const keyCount = Math.max(
    MIN_KEYS,
    Math.min(MAX_KEYS, Math.round(num(diff["CircleSize"], 4))),
  );

  const setId = Math.round(Number(meta["BeatmapSetID"]));
  const title = meta["Title"] ?? meta["TitleUnicode"] ?? "Untitled";
  const artist = meta["Artist"] ?? meta["ArtistUnicode"] ?? "Unknown Artist";
  // Only kept when it carries something the romanised field doesn't, so a
  // round-trip doesn't accumulate duplicate metadata. Losing these would
  // overwrite the original-script title and orphan the map from its upload.
  const titleUnicode = meta["TitleUnicode"];
  const artistUnicode = meta["ArtistUnicode"];
  const songMeta: SongMeta = {
    title,
    artist,
    creator: meta["Creator"] ?? "Mapper",
    tags: meta["Tags"] ?? "",
    ...(titleUnicode && titleUnicode !== title ? { titleUnicode } : {}),
    ...(artistUnicode && artistUnicode !== artist ? { artistUnicode } : {}),
    ...(Number.isFinite(setId) && setId > 0 ? { beatmapSetId: setId } : {}),
  };
  const beatmapId = Math.round(Number(meta["BeatmapID"]));

  const bookmarks = (editor["Bookmarks"] ?? "")
    .split(",")
    .map((s) => Math.round(Number(s.trim())))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  const timingPoints: TimingPoint[] = [];
  for (const line of sections["TimingPoints"] ?? []) {
    const p = line.split(",");
    if (p.length < 2) continue;
    const time = Math.round(Number(p[0]));
    const beatLength = Number(p[1]);
    if (!Number.isFinite(time) || !Number.isFinite(beatLength)) continue;
    const uninherited = p[6] === undefined ? 1 : Number(p[6]);
    const meter = p[2] !== undefined ? Math.round(Number(p[2])) || 4 : 4;
    const sampleSet = p[3] !== undefined ? Math.round(Number(p[3])) || 0 : 1;
    const sampleIndex = p[4] !== undefined ? Math.round(Number(p[4])) || 0 : 0;
    const volume = p[5] !== undefined ? Math.round(Number(p[5])) : 100;
    const effects = p[7] !== undefined ? Math.round(Number(p[7])) || 0 : 0;
    const kiai = (effects & 1) !== 0;
    const omitFirstBarline = (effects & 8) !== 0;
    const extra = { meter, sampleSet, sampleIndex, volume, kiai, omitFirstBarline };

    if (uninherited === 1 && beatLength > 0) {
      timingPoints.push(
        makeRedPoint(
          time,
          60000 / beatLength,
          extra,
        ),
      );
    } else if (uninherited === 0 || beatLength < 0) {
      timingPoints.push(makeGreenPoint(time, beatLengthToSv(beatLength), extra));
    }
  }
  if (timingPoints.length === 0) {
    timingPoints.push(makeRedPoint(0, 120));
  }
  timingPoints.sort((a, b) => a.time - b.time);

  let backgroundFilename: string | null = null;
  let videoFilename: string | null = null;
  let videoOffsetMs = 0;
  for (const line of sections["Events"] ?? []) {
    if (!backgroundFilename) {
      const m = line.match(/^0\s*,\s*0\s*,\s*"?([^",]+)"?/);
      if (m) {
        backgroundFilename = m[1];
        continue;
      }
    }
    if (!videoFilename) {
      const v = line.match(/^(?:Video|1)\s*,\s*(-?\d+)\s*,\s*"?([^",]+)"?/i);
      if (v) {
        videoOffsetMs = Math.round(Number(v[1])) || 0;
        videoFilename = v[2];
      }
    }
  }

  const notes: ManiaNote[] = [];
  for (const line of sections["HitObjects"] ?? []) {
    const p = line.split(",");
    if (p.length < 4) continue;
    const x = Number(p[0]);
    const time = Math.round(Number(p[2]));
    const type = Number(p[3]);
    if (!Number.isFinite(x) || !Number.isFinite(time)) continue;
    const column = xToColumn(x, keyCount);
    const hitSound = Math.round(Number(p[4])) || 0;

    if (type & 128) {
      const param = p[5] ?? "";
      const colon = param.indexOf(":");
      const endRaw = colon === -1 ? param : param.slice(0, colon);
      const sampleStr = colon === -1 ? "" : param.slice(colon + 1);
      const endTime = Math.round(Number(endRaw));
      notes.push({
        id: uid("n"),
        column,
        startTime: time,
        endTime: Number.isFinite(endTime) && endTime > time ? endTime : time + 1,
        ...hitSampleFields(hitSound, sampleStr),
      });
    } else {
      notes.push({
        id: uid("n"),
        column,
        startTime: time,
        ...hitSampleFields(hitSound, p[5] ?? ""),
      });
    }
  }
  notes.sort((a, b) => a.startTime - b.startTime || a.column - b.column);

  const difficulty: Difficulty = {
    id: uid("diff"),
    sourceFormat: "osu",
    name: meta["Version"] ?? "Imported",
    audioFilename: general["AudioFilename"] ?? undefined,
    keyCount,
    hpDrainRate: num(diff["HPDrainRate"], 7),
    overallDifficulty: num(diff["OverallDifficulty"], 7),
    previewTime: Math.round(num(general["PreviewTime"], -1)),
    bookmarks: bookmarks.length ? bookmarks : undefined,
    ...(Number.isFinite(beatmapId) && beatmapId > 0 ? { beatmapId } : {}),
    ...(general["SampleSet"] ? { sampleSet: general["SampleSet"] } : {}),
    timingPoints,
    notes,
  };

  return {
    meta: songMeta,
    difficulty,
    timingPoints,
    audioFilename: general["AudioFilename"] ?? null,
    backgroundFilename,
    videoFilename,
    videoOffsetMs,
  };
}

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

function mimeForVideo(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "webm") return "video/webm";
  if (ext === "avi") return "video/x-msvideo";
  if (ext === "flv") return "video/x-flv";
  if (ext === "mov") return "video/quicktime";
  if (ext === "wmv") return "video/x-ms-wmv";
  if (ext === "mpg" || ext === "mpeg") return "video/mpeg";
  return "video/mp4";
}

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
    if (/^\s*Mode\s*:\s*3\s*$/m.test(text)) parsed.push(parseOsuFile(text));
  }
  if (parsed.length === 0) {
    throw new Error("No osu!mania (Mode 3) difficulties found in the archive.");
  }

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

  const videoFiles: Record<string, LoadedFile> = {};
  for (const name of new Set(parsed.map((p) => p.videoFilename))) {
    if (!name || videoFiles[name]) continue;
    const entry = findEntry(zip, name);
    const loaded = await toLoadedFile(entry, mimeForVideo(name));
    if (loaded) videoFiles[name] = loaded;
  }

  const difficulties = parsed.map((p) => ({
    ...p.difficulty,
    backgroundFilename: p.backgroundFilename && backgroundFiles[p.backgroundFilename]
      ? p.backgroundFilename
      : undefined,
    videoFilename: p.videoFilename && videoFiles[p.videoFilename]
      ? p.videoFilename
      : undefined,
    videoOffsetMs:
      p.videoFilename && videoFiles[p.videoFilename] && p.videoOffsetMs
        ? p.videoOffsetMs
        : undefined,
  }));

  return {
    meta: first.meta,
    difficulties,
    timingPoints: first.timingPoints,
    audioFiles,
    backgroundFiles,
    videoFiles,
  };
}
