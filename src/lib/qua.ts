import { parse, stringify } from "yaml";
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
import { bookmarkKey } from "./bookmarks";
import { isQuaverKeyCount } from "./formatLimits";
import { sortedPoints } from "./timing";
import { zipEntryOptions } from "./zipEntry";

type QuaRecord = Record<string, unknown>;

/** Parts of a Quaver map that Cascade reads past and cannot export again. */
export type QuaverLeftOut = "mines" | "scrollGroups";

export type ParsedQua = {
  meta: SongMeta;
  difficulty: Difficulty;
  timingPoints: TimingPoint[];
  audioFilename: string | null;
  backgroundFilename: string | null;
  bpmAffectsScroll: boolean;
  /** What the map had that the editor leaves out, for telling the mapper. */
  leftOut: QuaverLeftOut[];
};

export type BuildQuaArgs = {
  meta: SongMeta;
  difficulty: Difficulty;
  timingPoints: TimingPoint[];
  audioFilename: string;
  backgroundFilename?: string;
  bpmAffectsScroll: boolean;
};

const record = (value: unknown): QuaRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as QuaRecord)
    : {};

const array = (value: unknown): QuaRecord[] =>
  Array.isArray(value) ? value.map(record) : [];

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const number = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

// A 7K+1 map is Keys7 with a scratch lane added after the last column.
const modeKeys = (value: unknown, scratch: boolean): number => {
  const match = text(value).match(/Keys(\d+)/i);
  const keys = (match ? Number(match[1]) : 4) + (scratch ? 1 : 0);
  return Math.max(MIN_KEYS, Math.min(MAX_KEYS, Math.round(keys)));
};

// Quaver writes `Signature: Triple` for 3/4 and 0, or nothing, for 4/4.
// Older Cascade exports wrote `TimeSignature: 3/4` instead.
const meterOf = (point: QuaRecord): number => {
  const signature = point.Signature;
  if (signature !== undefined && signature !== null) {
    if (/^triple$/i.test(text(signature).trim())) return 3;
    const beats = Math.round(number(signature, 0));
    return beats >= 1 ? beats : 4;
  }
  const first = text(point.TimeSignature, "4/4").split("/")[0];
  return Math.max(1, Math.round(number(first, 4)));
};

// HitObjectType is Normal or Mine, written by name; 1 is Mine as a number.
const isMine = (object: QuaRecord): boolean =>
  /^mine$/i.test(text(object.Type).trim()) || object.Type === 1;

// Notes outside the default group scroll by their own SV, which Cascade has
// no way to hold; they still import, at the map's main scroll speed.
const inOtherScrollGroup = (object: QuaRecord): boolean => {
  const group = text(object.TimingGroup).trim();
  return group !== "" && group.toLowerCase() !== "$default";
};

const activeQuaSv = (
  velocities: { time: number; sv: number }[],
  time: number,
  initial: number,
): number => {
  let value = initial;
  for (const velocity of velocities) {
    if (velocity.time > time) break;
    value = velocity.sv;
  }
  return value;
};

export function parseQuaFile(source: string): ParsedQua {
  const root = record(parse(source));
  const keyCount = modeKeys(root.Mode, bool(root.HasScratchKey));
  const meta: SongMeta = {
    title: text(root.Title, "Untitled"),
    artist: text(root.Artist, "Unknown Artist"),
    creator: text(root.Creator, "Mapper"),
    tags: text(root.Tags),
    source: text(root.Source),
  };
  const reds = array(root.TimingPoints)
    .map((point) => ({
      time: number(point.StartTime, NaN),
      bpm: number(point.Bpm, NaN),
      meter: meterOf(point),
    }))
    .filter((point) => Number.isFinite(point.time) && point.bpm > 0)
    .map((point) => makeRedPoint(point.time, point.bpm, { meter: point.meter }));
  const velocities = array(root.SliderVelocities)
    .map((point) => ({
      time: number(point.StartTime, NaN),
      sv: clampSv(number(point.Multiplier, 1)),
    }))
    .filter((point) => Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
  const initialSv = clampSv(number(root.InitialScrollVelocity, 1));
  const greenByTime = new Map<number, TimingPoint>();
  if (initialSv !== 1) {
    const initialTime = Math.min(0, reds[0]?.time ?? 0);
    greenByTime.set(initialTime, makeGreenPoint(initialTime, initialSv));
  }
  for (const velocity of velocities) {
    greenByTime.set(velocity.time, makeGreenPoint(velocity.time, velocity.sv));
  }
  for (const red of reds) {
    if (!greenByTime.has(red.time)) {
      greenByTime.set(
        red.time,
        makeGreenPoint(
          red.time,
          activeQuaSv(velocities, red.time, initialSv),
        ),
      );
    }
  }
  const timingPoints = [...reds, ...greenByTime.values()]
    .filter(
      (point) =>
        point.uninherited ||
        point.sv !== 1 ||
        velocities.some((velocity) => velocity.time === point.time),
    )
    .sort(
      (a, b) =>
        a.time - b.time || Number(b.uninherited) - Number(a.uninherited),
    );
  const objects = array(root.HitObjects);
  const leftOut: QuaverLeftOut[] = [];
  if (objects.some(isMine)) leftOut.push("mines");
  if (objects.some(inOtherScrollGroup)) leftOut.push("scrollGroups");
  const notes: ManiaNote[] = objects
    .filter((object) => !isMine(object))
    .map((object) => {
      const startTime = Math.round(number(object.StartTime, NaN));
      const lane = Math.round(number(object.Lane, NaN)) - 1;
      const endTime = Math.round(number(object.EndTime, 0));
      return {
        id: uid("n"),
        column: lane,
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
  const bookmarks = array(root.Bookmarks)
    .map((bookmark) => ({
      time: Math.round(number(bookmark.StartTime, NaN)),
      label: text(bookmark.Note).trim(),
    }))
    .filter((bookmark) => Number.isFinite(bookmark.time))
    .sort((a, b) => a.time - b.time);
  const bookmarkLabels: Record<string, string> = {};
  for (const bookmark of bookmarks) {
    if (bookmark.label) {
      bookmarkLabels[bookmarkKey(bookmark.time)] = bookmark.label;
    }
  }
  const resolvedTiming = reds.length
    ? timingPoints
    : [...defaultTimingPoints(), ...timingPoints].sort(
        (a, b) =>
          a.time - b.time || Number(b.uninherited) - Number(a.uninherited),
      );
  const difficulty: Difficulty = {
    id: uid("diff"),
    sourceFormat: "qua",
    name: text(root.DifficultyName, "Imported"),
    audioFilename: text(root.AudioFile) || undefined,
    backgroundFilename: text(root.BackgroundFile) || undefined,
    keyCount,
    hpDrainRate: 7,
    overallDifficulty: 7,
    previewTime: Math.round(number(root.SongPreviewTime, -1)),
    bookmarks: bookmarks.length ? bookmarks.map((bookmark) => bookmark.time) : undefined,
    bookmarkLabels: Object.keys(bookmarkLabels).length ? bookmarkLabels : undefined,
    timingPoints: resolvedTiming,
    notes,
  };
  return {
    meta,
    difficulty,
    timingPoints: resolvedTiming,
    audioFilename: text(root.AudioFile) || null,
    backgroundFilename: text(root.BackgroundFile) || null,
    bpmAffectsScroll: !bool(root.BPMDoesNotAffectScrollVelocity),
    leftOut,
  };
}

function quaVelocities(
  points: TimingPoint[],
): { StartTime: number; Multiplier: number }[] {
  const events = sortedPoints(points);
  const out: { StartTime: number; Multiplier: number }[] = [];
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
      out.push({ StartTime: time, Multiplier: current });
      emitted = current;
    }
  }
  return out;
}

export function buildQuaFile({
  meta,
  difficulty,
  timingPoints,
  audioFilename,
  backgroundFilename,
  bpmAffectsScroll,
}: BuildQuaArgs): string {
  const given = sortedPoints(timingPoints);
  // Quaver refuses a map without a timing point, so a map that has only
  // green lines still gets the default red one.
  const points = given.some((point) => point.uninherited)
    ? given
    : sortedPoints([...defaultTimingPoints(), ...given]);
  const reds = points.filter((point) => point.uninherited);
  // Keys and order follow Quaver's own Qua class. Unknown keys are ignored
  // there, so anything it lacks (other time signatures) is left out rather
  // than written under a name it would skip.
  const document = {
    AudioFile: audioFilename,
    SongPreviewTime: Math.round(difficulty.previewTime),
    BackgroundFile: backgroundFilename ?? "",
    BannerFile: "",
    MapId: -1,
    MapSetId: -1,
    Mode: `Keys${difficulty.keyCount}`,
    Title: meta.title,
    Artist: meta.artist,
    Source: meta.source ?? "",
    Tags: meta.tags ?? "",
    Creator: meta.creator,
    DifficultyName: difficulty.name,
    Description: "Converted with Cascade",
    Genre: "",
    LegacyLNRendering: false,
    BPMDoesNotAffectScrollVelocity: !bpmAffectsScroll,
    InitialScrollVelocity: 1,
    HasScratchKey: false,
    EditorLayers: [],
    Bookmarks: (difficulty.bookmarks ?? []).map((time) => ({
      StartTime: Math.round(time),
      Note: difficulty.bookmarkLabels?.[bookmarkKey(time)] ?? "",
    })),
    CustomAudioSamples: [],
    SoundEffects: [],
    TimingPoints: reds.map((point) => ({
      StartTime: point.time,
      Bpm: point.bpm,
      // Quaver knows 4/4 (the default) and 3/4 only.
      ...(Math.round(point.meter || 4) === 3 ? { Signature: "Triple" } : {}),
      Hidden: false,
    })),
    SliderVelocities: quaVelocities(points),
    HitObjects: [...difficulty.notes]
      .sort((a, b) => a.startTime - b.startTime || a.column - b.column)
      .map((note) => ({
        StartTime: Math.round(note.startTime),
        Lane: note.column + 1,
        ...(note.endTime !== undefined && Math.round(note.endTime) > Math.round(note.startTime)
          ? { EndTime: Math.round(note.endTime) }
          : {}),
      })),
  };
  return stringify(document, { lineWidth: 0 });
}

const safeName = (value: string): string =>
  value.replace(/[\\/:*?"<>|]/g, "").trim() || "untitled";

export function quaFilename(args: Pick<BuildQuaArgs, "meta" | "difficulty">): string {
  return `${safeName(args.meta.artist)} - ${safeName(args.meta.title)} [${safeName(args.difficulty.name)}].qua`;
}

export function qpFilename(meta: SongMeta): string {
  return `${safeName(meta.artist)} - ${safeName(meta.title)}.qp`;
}

/** Difficulties a Quaver mapset can hold. */
export function quaverDifficulties(difficulties: Difficulty[]): Difficulty[] {
  return difficulties.filter((difficulty) => isQuaverKeyCount(difficulty.keyCount));
}

export type BuildQpArgs = {
  meta: SongMeta;
  difficulties: Difficulty[];
  timingPoints: TimingPoint[];
  audioFiles: Record<string, LoadedFile>;
  bgFiles?: Record<string, LoadedFile>;
  bpmAffectsScroll: boolean;
};

/**
 * A Quaver mapset (.qp): a zip with one .qua per difficulty beside the audio
 * and backgrounds they name. The game imports .qp and not a loose .qua, so
 * this is what a mapper drags into Quaver.
 */
export async function buildQp(args: BuildQpArgs): Promise<Blob> {
  const difficulties = quaverDifficulties(args.difficulties);
  if (!difficulties.length) throw new Error(t("app.quaverKeys"));
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const allAudio = Object.values(args.audioFiles);
  const fallbackAudio = allAudio.length === 1 ? allAudio[0] : null;
  const usedNames = new Set<string>();

  for (const difficulty of difficulties) {
    const audio =
      (difficulty.audioFilename && args.audioFiles[difficulty.audioFilename]) ||
      fallbackAudio;
    if (!audio) throw new Error(t("malody.noAudio", { name: difficulty.name }));
    if (!zip.file(audio.name)) zip.file(audio.name, audio.blob, zipEntryOptions(audio.name));
    const background = difficulty.backgroundFilename
      ? args.bgFiles?.[difficulty.backgroundFilename]
      : undefined;
    if (background && !zip.file(background.name)) {
      zip.file(background.name, background.blob, zipEntryOptions(background.name));
    }
    const stem = quaFilename({ meta: args.meta, difficulty }).replace(/\.qua$/, "");
    let name = `${stem}.qua`;
    for (let n = 2; usedNames.has(name.toLowerCase()); n += 1) name = `${stem} (${n}).qua`;
    usedNames.add(name.toLowerCase());
    zip.file(
      name,
      buildQuaFile({
        meta: args.meta,
        difficulty,
        timingPoints: difficulty.timingPoints?.length
          ? difficulty.timingPoints
          : args.timingPoints,
        audioFilename: audio.name,
        backgroundFilename: background?.name,
        bpmAffectsScroll: args.bpmAffectsScroll,
      }),
    );
  }
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
