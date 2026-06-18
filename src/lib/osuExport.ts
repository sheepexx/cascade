import type {
  Difficulty,
  LoadedFile,
  ManiaNote,
  SongMeta,
  TimingPoint,
} from "../types";
import { sortedPoints } from "./timing";

/**
 * osu!mania export.
 *
 *  - Mode: 3            -> osu!mania
 *  - CircleSize         -> key count (1..18)
 *  - y in HitObjects    -> always 192 for mania
 *  - x in HitObjects    -> floor((col + 0.5) * 512 / keys)  → 0..512
 *  - Normal note type   -> 1
 *  - Long note type     -> 128, with the end time prefixed onto the hitSample:
 *                          "x,192,start,128,0,END:0:0:0:0:"
 *  - Every uninherited timing point is written; the first point's time is the
 *    offset. (Scroll speed / SV is a player-side choice and is not exported.)
 */

/** osu!-compatible X position (0..512) for a column. */
export function columnToX(column: number, keyCount: number): number {
  return Math.floor((column + 0.5) * 512 / keyCount);
}

/** Inverse: figure out which column an X belongs to (used when importing). */
export function xToColumn(x: number, keyCount: number): number {
  const col = Math.floor((x * keyCount) / 512);
  return Math.max(0, Math.min(keyCount - 1, col));
}

function formatHitObject(note: ManiaNote, keyCount: number): string {
  const x = columnToX(note.column, keyCount);
  const y = 192;
  const time = Math.round(note.startTime);

  if (note.endTime !== undefined && note.endTime > note.startTime) {
    const end = Math.round(note.endTime);
    return `${x},${y},${time},128,0,${end}:0:0:0:0:`;
  }
  return `${x},${y},${time},1,0,0:0:0:0:`;
}

export type BuildOsuArgs = {
  meta: SongMeta;
  difficulty: Difficulty;
  timingPoints: TimingPoint[];
  audioFilename: string;
  backgroundFilename?: string;
};

/** Produce the full text content of a `.osu` difficulty file. */
export function buildOsuFile({
  meta,
  difficulty,
  timingPoints,
  audioFilename,
  backgroundFilename,
}: BuildOsuArgs): string {
  const points = sortedPoints(
    timingPoints.length ? timingPoints : [{ id: "x", time: 0, bpm: 120 }],
  );
  const offset = Math.round(points[0].time);

  // time,beatLength,meter,sampleSet,sampleIndex,volume,uninherited(1),effects(0)
  const timingLines = points.map((p) => {
    const beatLengthMs = 60000 / p.bpm;
    return `${Math.round(p.time)},${beatLengthMs},4,1,0,100,1,0`;
  });

  const events = [
    "//Background and Video events",
    ...(backgroundFilename ? [`0,0,"${backgroundFilename}",0,0`] : []),
    "//Break Periods",
    "//Storyboard Layer 0 (Background)",
    "//Storyboard Layer 1 (Fail)",
    "//Storyboard Layer 2 (Pass)",
    "//Storyboard Layer 3 (Foreground)",
    "//Storyboard Layer 4 (Overlay)",
    "//Storyboard Sound Samples",
  ];

  const sortedNotes = [...difficulty.notes].sort(
    (a, b) => a.startTime - b.startTime || a.column - b.column,
  );
  const hitObjects = sortedNotes.map((n) =>
    formatHitObject(n, difficulty.keyCount),
  );

  void offset; // offset is implicit via the first timing point's time.

  const lines = [
    "osu file format v14",
    "",
    "[General]",
    `AudioFilename: ${audioFilename}`,
    "AudioLeadIn: 0",
    `PreviewTime: ${Math.round(difficulty.previewTime)}`,
    "Countdown: 0",
    "SampleSet: Normal",
    "StackLeniency: 0.7",
    "Mode: 3",
    "LetterboxInBreaks: 0",
    "SpecialStyle: 0",
    "WidescreenStoryboard: 0",
    "",
    "[Editor]",
    "DistanceSpacing: 1",
    "BeatDivisor: 4",
    "GridSize: 8",
    "TimelineZoom: 1",
    "",
    "[Metadata]",
    `Title:${meta.title}`,
    `TitleUnicode:${meta.title}`,
    `Artist:${meta.artist}`,
    `ArtistUnicode:${meta.artist}`,
    `Creator:${meta.creator}`,
    `Version:${difficulty.name}`,
    "Source:",
    "Tags:",
    "BeatmapID:0",
    "BeatmapSetID:-1",
    "",
    "[Difficulty]",
    `HPDrainRate:${difficulty.hpDrainRate}`,
    `CircleSize:${difficulty.keyCount}`,
    `OverallDifficulty:${difficulty.overallDifficulty}`,
    "ApproachRate:5",
    "SliderMultiplier:1.4",
    "SliderTickRate:1",
    "",
    "[Events]",
    ...events,
    "",
    "[TimingPoints]",
    ...timingLines,
    "",
    "",
    "[HitObjects]",
    ...hitObjects,
    "",
  ];

  return lines.join("\n");
}

/** Sanitize a string so it is safe to use inside a filename. */
function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").trim() || "untitled";
}

/** Standard osu! difficulty filename: Artist - Title (Creator) [Diff].osu */
export function osuFilename(meta: SongMeta, difficulty: Difficulty): string {
  return `${sanitize(meta.artist)} - ${sanitize(meta.title)} (${sanitize(
    meta.creator,
  )}) [${sanitize(difficulty.name)}].osu`;
}

/** Filename for the beatmap set (used for the .osz). */
export function setFilename(meta: SongMeta): string {
  return `${sanitize(meta.artist)} - ${sanitize(meta.title)}.osz`;
}

/** Trigger a browser download for a single standalone `.osu` file. */
export function downloadOsu(args: BuildOsuArgs): void {
  const content = buildOsuFile(args);
  const blob = new Blob([content], { type: "text/plain" });
  triggerDownload(blob, osuFilename(args.meta, args.difficulty));
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type { LoadedFile };
