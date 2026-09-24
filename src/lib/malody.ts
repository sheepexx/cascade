import { t } from "./i18n/core";
import {
  MAX_KEYS,
  MIN_KEYS,
  clampSv,
  defaultTimingPoints,
  makeGreenPoint,
  makeRedPoint,
  uid,
  type Difficulty,
  type LoadedFile,
  type ManiaNote,
  type SongMeta,
  type TimingPoint,
} from "../types";
import { sortedPoints } from "./timing";

/**
 * Malody charts (.mc) are JSON. Every position is a beat written as
 * [whole, numerator, denominator], and the song itself is a special note of
 * type 1 whose `offset` places beat 0 at `-offset` ms in the audio. That is how
 * Malody and Quaver's converter both read it. A .mcz set is a zip of .mc charts
 * plus their audio and background.
 */

/** Malody's Key mode stops at 10 columns. */
export const MALODY_MAX_KEYS = 10;

type Json = Record<string, unknown>;
type MalodyBeat = [number, number, number];

export type ParsedMalody = {
  meta: SongMeta;
  difficulty: Difficulty;
  timingPoints: TimingPoint[];
  audioFilename: string | null;
  backgroundFilename: string | null;
};

export type BuildMalodyArgs = {
  meta: SongMeta;
  difficulty: Difficulty;
  timingPoints: TimingPoint[];
  audioFilename: string;
  backgroundFilename?: string;
};

const record = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};

const array = (value: unknown): Json[] =>
  Array.isArray(value) ? value.map(record) : [];

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const number = (value: unknown, fallback = NaN): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function beatValue(value: unknown): number {
  if (!Array.isArray(value) || value.length < 3) return NaN;
  const [whole, numerator, denominator] = value.map((part) => number(part));
  if (!denominator) return whole;
  return whole + numerator / denominator;
}

type Segment = { beat: number; time: number; bpm: number };

/** Beat -> ms along Malody's BPM changes, with beat 0 at `origin` ms. */
function beatClock(entries: { beat: number; bpm: number }[], origin: number) {
  const segments: Segment[] = [];
  let time = origin;
  let beat = 0;
  let bpm = entries[0].bpm;
  for (const entry of entries) {
    time += ((entry.beat - beat) * 60000) / bpm;
    beat = entry.beat;
    bpm = entry.bpm;
    segments.push({ beat, time, bpm });
  }
  return (at: number): number => {
    let segment = segments[0];
    for (const candidate of segments) {
      if (candidate.beat > at) break;
      segment = candidate;
    }
    return segment.time + ((at - segment.beat) * 60000) / segment.bpm;
  };
}

export function isMalodyChart(source: string): boolean {
  try {
    const root = record(JSON.parse(source));
    return Array.isArray(root.note) && Array.isArray(root.time);
  } catch {
    return false;
  }
}

export function parseMalodyChart(source: string): ParsedMalody {
  let root: Json;
  try {
    root = record(JSON.parse(source));
  } catch {
    throw new Error(t("malody.unreadable"));
  }
  const meta = record(root.meta);
  if (number(meta.mode, 0) !== 0) {
    throw new Error(t("malody.notKeyMode"));
  }
  const keyCount = Math.max(
    MIN_KEYS,
    Math.min(MAX_KEYS, Math.round(number(record(meta.mode_ext).column, 4))),
  );

  const bpmEntries = array(root.time)
    .map((entry) => ({ beat: beatValue(entry.beat), bpm: number(entry.bpm) }))
    .filter((entry) => Number.isFinite(entry.beat) && entry.bpm > 0)
    .sort((a, b) => a.beat - b.beat);
  if (!bpmEntries.length) {
    throw new Error(t("malody.noBpm"));
  }

  const notes = array(root.note);
  const song = notes.find((note) => number(note.type, 0) === 1);
  const offset = song ? number(song.offset, 0) : 0;
  const toMs = beatClock(bpmEntries, -offset);

  const effects = array(root.effect)
    .map((effect): Json & { at: number } => ({ ...effect, at: beatValue(effect.beat) }))
    .filter((effect) => Number.isFinite(effect.at))
    .sort((a, b) => a.at - b.at);

  // Meter changes ride on red points, so a signature change between BPM
  // changes gets a red point of its own at the tempo in force there.
  // A red point without its own signature keeps the one before it.
  const reds = new Map<number, { beat: number; bpm: number; meter: number | null }>();
  for (const entry of bpmEntries) {
    reds.set(entry.beat, { beat: entry.beat, bpm: entry.bpm, meter: null });
  }
  for (const effect of effects) {
    const sign = Math.round(number(effect.sign));
    if (!(sign > 0)) continue;
    const existing = reds.get(effect.at);
    if (existing) {
      existing.meter = sign;
      continue;
    }
    const bpm = [...bpmEntries].reverse().find((entry) => entry.beat <= effect.at)
      ?.bpm ?? bpmEntries[0].bpm;
    reds.set(effect.at, { beat: effect.at, bpm, meter: sign });
  }
  let meter = 4;
  const redPoints = [...reds.values()]
    .sort((a, b) => a.beat - b.beat)
    .map((red) => {
      meter = red.meter ?? meter;
      return makeRedPoint(toMs(red.beat), red.bpm, { meter });
    });

  // Cascade follows osu!, where a red point resets scroll speed, so each red
  // point also gets a green point carrying the Malody speed still in force.
  const scrolls = effects
    .filter((effect) => Number.isFinite(number(effect.scroll)))
    .map((effect) => ({
      time: toMs(effect.at),
      sv: clampSv(number(effect.scroll)),
    }));
  const greens = new Map<number, TimingPoint>();
  for (const scroll of scrolls) {
    greens.set(scroll.time, makeGreenPoint(scroll.time, scroll.sv));
  }
  for (const red of redPoints) {
    if (greens.has(red.time)) continue;
    const active = [...scrolls].reverse().find((scroll) => scroll.time <= red.time);
    if (active && active.sv !== 1) {
      greens.set(red.time, makeGreenPoint(red.time, active.sv));
    }
  }
  const timingPoints = [...redPoints, ...greens.values()].sort(
    (a, b) => a.time - b.time || Number(b.uninherited) - Number(a.uninherited),
  );

  const maniaNotes: ManiaNote[] = notes
    .filter((note) => !number(note.type, 0))
    .map((note) => {
      const startTime = Math.round(toMs(beatValue(note.beat)));
      const end = beatValue(note.endbeat);
      const endTime = Number.isFinite(end) ? Math.round(toMs(end)) : NaN;
      return {
        id: uid("n"),
        column: Math.round(number(note.column)),
        startTime,
        ...(endTime > startTime ? { endTime } : {}),
      };
    })
    .filter(
      (note) =>
        Number.isFinite(note.startTime) &&
        note.column >= 0 &&
        note.column < keyCount,
    )
    .sort((a, b) => a.startTime - b.startTime || a.column - b.column);

  const songMeta = record(meta.song);
  const title = text(songMeta.title) || text(songMeta.titleorg) || "Untitled";
  const artist =
    text(songMeta.artist) || text(songMeta.artistorg) || "Unknown Artist";
  const titleUnicode = text(songMeta.titleorg);
  const artistUnicode = text(songMeta.artistorg);
  const audioFilename = song ? text(song.sound) || null : null;
  const backgroundFilename = text(meta.background) || null;
  const resolvedTiming = timingPoints.length ? timingPoints : defaultTimingPoints();

  return {
    meta: {
      title,
      artist,
      creator: text(meta.creator) || "Mapper",
      tags: "",
      source: "",
      ...(titleUnicode && titleUnicode !== title ? { titleUnicode } : {}),
      ...(artistUnicode && artistUnicode !== artist ? { artistUnicode } : {}),
    },
    difficulty: {
      id: uid("diff"),
      sourceFormat: "mc",
      name: text(meta.version) || "Imported",
      audioFilename: audioFilename ?? undefined,
      backgroundFilename: backgroundFilename ?? undefined,
      keyCount,
      hpDrainRate: 7,
      overallDifficulty: 7,
      previewTime: Math.round(number(meta.preview, -1)),
      timingPoints: resolvedTiming,
      notes: maniaNotes,
    },
    timingPoints: resolvedTiming,
    audioFilename,
    backgroundFilename,
  };
}

// Denominators Malody's editor snaps to, tried smallest first so a note keeps
// the simplest fraction that lands within a millisecond of it.
const DENOMINATORS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 192];

function toMalodyBeat(beat: number, beatMs: number): MalodyBeat {
  const safe = Math.max(0, beat);
  const whole = Math.floor(safe);
  const fraction = safe - whole;
  for (const denominator of DENOMINATORS) {
    const numerator = Math.round(fraction * denominator);
    if (Math.abs(fraction - numerator / denominator) * beatMs <= 1) {
      return numerator === denominator
        ? [whole + 1, 0, 1]
        : [whole, numerator, denominator];
    }
  }
  const numerator = Math.round(fraction * 1920);
  return numerator === 1920 ? [whole + 1, 0, 1] : [whole, numerator, 1920];
}

const beatNumber = ([whole, numerator, denominator]: MalodyBeat): number =>
  whole + numerator / denominator;

/** Scroll speed changes as Malody sees them, with red points resetting to 1. */
function scrollChanges(points: TimingPoint[]): { time: number; sv: number }[] {
  const events = sortedPoints(points);
  const out: { time: number; sv: number }[] = [];
  let current = 1;
  let emitted = 1;
  let index = 0;
  while (index < events.length) {
    const time = events[index].time;
    const atTime: TimingPoint[] = [];
    while (index < events.length && events[index].time === time) {
      atTime.push(events[index]);
      index += 1;
    }
    if (atTime.some((point) => point.uninherited)) current = 1;
    for (const point of atTime.filter((point) => !point.uninherited)) {
      current = point.sv;
    }
    if (current !== emitted) {
      out.push({ time, sv: current });
      emitted = current;
    }
  }
  return out;
}

export function buildMalodyChart({
  meta,
  difficulty,
  timingPoints,
  audioFilename,
  backgroundFilename,
}: BuildMalodyArgs): string {
  const points = timingPoints.length ? timingPoints : defaultTimingPoints();
  const reds = sortedPoints(points).filter((point) => point.uninherited);
  const first = reds[0];
  const firstBeatMs = 60000 / first.bpm;

  // Malody's own charts start the beat grid at or before the start of the
  // song, so their offset is never negative. Beat 0 goes back from the first
  // red point by whole bars until it is at or before 0 ms and before every
  // note, which keeps the bar lines where they were and no beat negative.
  const earliest = Math.min(
    0,
    ...difficulty.notes.map((note) => note.startTime),
    ...points.map((point) => point.time),
  );
  const barMs = firstBeatMs * Math.max(1, Math.round(first.meter || 4));
  const leadBars = Math.max(0, Math.ceil((first.time - earliest - 0.5) / barMs));
  const offset = Math.round(-(first.time - leadBars * barMs));
  const origin = -offset;

  const segments: { time: number; beat: MalodyBeat; bpm: number }[] = [];
  const time: Json[] = [{ beat: [0, 0, 1], bpm: first.bpm }];
  const effect: Json[] = [];
  let meter = 4;
  let clock = { time: origin, beat: 0, bpm: first.bpm };
  segments.push({ time: origin, beat: [0, 0, 1], bpm: first.bpm });
  for (const [index, red] of reds.entries()) {
    const beatMs = 60000 / clock.bpm;
    // The first red point's tempo and meter already hold from beat 0.
    const beat: MalodyBeat = index === 0
      ? [0, 0, 1]
      : toMalodyBeat(clock.beat + (red.time - clock.time) / beatMs, beatMs);
    const exact = beatNumber(beat);
    const last = segments[segments.length - 1];
    if (beatNumber(last.beat) === exact) {
      // Two red points on one beat: the later one wins, as in osu!.
      last.bpm = red.bpm;
      time[time.length - 1] = { beat: time[time.length - 1].beat, bpm: red.bpm };
    } else if (red.bpm !== clock.bpm || exact > clock.beat) {
      segments.push({ time: red.time, beat, bpm: red.bpm });
      time.push({ beat, bpm: red.bpm });
    }
    const redMeter = Math.max(1, Math.round(red.meter || 4));
    if (redMeter !== meter) {
      effect.push({ beat, sign: redMeter });
      meter = redMeter;
    }
    clock = index === 0
      ? { time: origin, beat: 0, bpm: red.bpm }
      : { time: red.time, beat: exact, bpm: red.bpm };
  }

  const beatAt = (ms: number): MalodyBeat => {
    let segment = segments[0];
    for (const candidate of segments) {
      if (candidate.time > ms + 0.5) break;
      segment = candidate;
    }
    const beatMs = 60000 / segment.bpm;
    return toMalodyBeat(beatNumber(segment.beat) + (ms - segment.time) / beatMs, beatMs);
  };

  for (const change of scrollChanges(points)) {
    effect.push({ beat: beatAt(change.time), scroll: change.sv });
  }
  effect.sort((a, b) => beatNumber(a.beat as MalodyBeat) - beatNumber(b.beat as MalodyBeat));

  const note: Json[] = [...difficulty.notes]
    .sort((a, b) => a.startTime - b.startTime || a.column - b.column)
    .map((item) => ({
      beat: beatAt(item.startTime),
      ...(item.endTime !== undefined && item.endTime > item.startTime
        ? { endbeat: beatAt(item.endTime) }
        : {}),
      column: item.column,
    }));
  note.push({ beat: [0, 0, 1], sound: audioFilename, vol: 100, offset, type: 1 });

  const title = meta.title || "Untitled";
  const artist = meta.artist || "Unknown Artist";
  const chart = {
    meta: {
      $ver: 0,
      creator: meta.creator,
      background: backgroundFilename ?? "",
      version: difficulty.name,
      preview: Math.max(0, Math.round(difficulty.previewTime)),
      id: 0,
      mode: 0,
      time: Math.floor(Date.now() / 1000),
      song: {
        title,
        artist,
        id: 0,
        ...(meta.titleUnicode && meta.titleUnicode !== title
          ? { titleorg: meta.titleUnicode }
          : {}),
        ...(meta.artistUnicode && meta.artistUnicode !== artist
          ? { artistorg: meta.artistUnicode }
          : {}),
      },
      mode_ext: { column: difficulty.keyCount, bar_begin: 0 },
    },
    time,
    effect,
    note,
    extra: {
      test: { divide: 4, speed: 100, save: 0, lock: 0, edit_mode: 0 },
    },
  };
  return JSON.stringify(chart);
}

export type BuildMczArgs = {
  meta: SongMeta;
  difficulties: Difficulty[];
  timingPoints: TimingPoint[];
  audioFiles: Record<string, LoadedFile>;
  bgFiles?: Record<string, LoadedFile>;
};

const safeName = (value: string): string =>
  value.replace(/[\\/:*?"<>|]/g, "").trim() || "untitled";

export function mczFilename(meta: SongMeta): string {
  return `${safeName(meta.artist)} - ${safeName(meta.title)}.mcz`;
}

/** Difficulties Malody's Key mode can hold. */
export function malodyDifficulties(difficulties: Difficulty[]): Difficulty[] {
  return difficulties.filter((difficulty) => difficulty.keyCount <= MALODY_MAX_KEYS);
}

/**
 * A .mcz with one chart per difficulty in a single song folder, sharing the
 * audio and background files the charts point at.
 */
export async function buildMcz(args: BuildMczArgs): Promise<Blob> {
  const difficulties = malodyDifficulties(args.difficulties);
  if (!difficulties.length) {
    throw new Error(t("malody.maxKeys", { count: MALODY_MAX_KEYS }));
  }
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const folder = zip.folder("0")!;
  const allAudio = Object.values(args.audioFiles);
  const fallbackAudio = allAudio.length === 1 ? allAudio[0] : null;
  const usedNames = new Set<string>();

  for (const difficulty of difficulties) {
    const audio =
      (difficulty.audioFilename && args.audioFiles[difficulty.audioFilename]) ||
      fallbackAudio;
    if (!audio) {
      throw new Error(t("malody.noAudio", { name: difficulty.name }));
    }
    if (!folder.file(audio.name)) folder.file(audio.name, audio.blob);
    const background = difficulty.backgroundFilename
      ? args.bgFiles?.[difficulty.backgroundFilename]
      : undefined;
    if (background && !folder.file(background.name)) {
      folder.file(background.name, background.blob);
    }
    let name = `${safeName(difficulty.name)}.mc`;
    for (let n = 2; usedNames.has(name.toLowerCase()); n += 1) {
      name = `${safeName(difficulty.name)} (${n}).mc`;
    }
    usedNames.add(name.toLowerCase());
    folder.file(
      name,
      buildMalodyChart({
        meta: args.meta,
        difficulty,
        timingPoints: difficulty.timingPoints?.length
          ? difficulty.timingPoints
          : args.timingPoints,
        audioFilename: audio.name,
        backgroundFilename: background?.name,
      }),
    );
  }
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export async function downloadMcz(args: BuildMczArgs): Promise<void> {
  const url = URL.createObjectURL(await buildMcz(args));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = mczFilename(args.meta);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
