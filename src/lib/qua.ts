import { parse, stringify } from "yaml";
import {
  MAX_KEYS,
  MIN_KEYS,
  clampSv,
  defaultTimingPoints,
  makeGreenPoint,
  makeRedPoint,
  uid,
  type Difficulty,
  type ManiaNote,
  type SongMeta,
  type TimingPoint,
} from "../types";
import { bookmarkKey } from "./bookmarks";
import { sortedPoints } from "./timing";

type QuaRecord = Record<string, unknown>;

export type ParsedQua = {
  meta: SongMeta;
  difficulty: Difficulty;
  timingPoints: TimingPoint[];
  audioFilename: string | null;
  backgroundFilename: string | null;
  bpmAffectsScroll: boolean;
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

const modeKeys = (value: unknown): number => {
  const match = text(value).match(/Keys(\d+)/i);
  const keys = match ? Number(match[1]) : 4;
  return Math.max(MIN_KEYS, Math.min(MAX_KEYS, Math.round(keys)));
};

const meterOf = (value: unknown): number => {
  const first = text(value, "4/4").split("/")[0];
  return Math.max(1, Math.round(number(first, 4)));
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
  const keyCount = modeKeys(root.Mode);
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
      meter: meterOf(point.TimeSignature),
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
  const notes: ManiaNote[] = array(root.HitObjects)
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
  const points = timingPoints.length ? timingPoints : defaultTimingPoints();
  const reds = sortedPoints(points).filter((point) => point.uninherited);
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
    BPMDoesNotAffectScrollVelocity: !bpmAffectsScroll,
    InitialScrollVelocity: 1,
    HasScratchKey: false,
    EditorLayers: [],
    Bookmarks: (difficulty.bookmarks ?? []).map((time) => ({
      StartTime: Math.round(time),
      Note: difficulty.bookmarkLabels?.[bookmarkKey(time)] ?? "",
    })),
    SoundEffects: [],
    TimingPoints: reds.map((point) => ({
      StartTime: point.time,
      Bpm: point.bpm,
      TimeSignature: `${Math.max(1, Math.round(point.meter || 4))}/4`,
      Hidden: false,
    })),
    SliderVelocities: quaVelocities(points),
    HitObjects: [...difficulty.notes]
      .sort((a, b) => a.startTime - b.startTime || a.column - b.column)
      .map((note) => ({
        StartTime: Math.round(note.startTime),
        Lane: note.column + 1,
        ...(note.endTime !== undefined && note.endTime > note.startTime
          ? { EndTime: Math.round(note.endTime) }
          : {}),
      })),
  };
  return stringify(document, { lineWidth: 0 });
}

const safeName = (value: string): string =>
  value.replace(/[\\/:*?"<>|]/g, "").trim() || "untitled";

export function downloadQua(args: BuildQuaArgs): void {
  const blob = new Blob([buildQuaFile(args)], {
    type: "application/x-yaml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName(args.meta.artist)} - ${safeName(args.meta.title)} [${safeName(args.difficulty.name)}].qua`;
  anchor.click();
  URL.revokeObjectURL(url);
}
