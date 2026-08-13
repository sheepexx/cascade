import type {
  Difficulty,
  LoadedFile,
  ManiaNote,
  SongMeta,
  TimingPoint,
} from "../types";
import { makeRedPoint, svToBeatLength } from "../types";
import { sortedPoints } from "./timing";

export function columnToX(column: number, keyCount: number): number {
  return Math.floor((column + 0.5) * 512 / keyCount);
}

export function xToColumn(x: number, keyCount: number): number {
  const col = Math.floor((x * keyCount) / 512);
  return Math.max(0, Math.min(keyCount - 1, col));
}

function formatHitObject(note: ManiaNote, keyCount: number): string {
  const x = columnToX(note.column, keyCount);
  const y = 192;
  const time = Math.round(note.startTime);
  const hitSound = note.hitSound ?? 0;
  const sample = [
    note.sampleSet ?? 0,
    note.additionSet ?? 0,
    note.sampleIndex ?? 0,
    note.sampleVolume ?? 0,
    note.sampleFile ?? "",
  ].join(":");

  if (note.endTime !== undefined && note.endTime > note.startTime) {
    const end = Math.round(note.endTime);
    return `${x},${y},${time},128,${hitSound},${end}:${sample}`;
  }
  return `${x},${y},${time},1,${hitSound},${sample}`;
}

export const CASCADE_WATERMARK =
  "// Made with Cascade - https://cascade.sheepex.net";

function formatDecimal(value: number): string {
  return String(Number(value.toFixed(6)));
}

export function tagsWithCascade(tags: string | undefined): string {
  const list = (tags ?? "").split(/\s+/).filter(Boolean);
  if (!list.some((t) => t.toLowerCase() === "cascade")) list.push("Cascade");
  return list.join(" ");
}

export type BuildOsuArgs = {
  meta: SongMeta;
  difficulty: Difficulty;
  timingPoints: TimingPoint[];
  audioFilename: string;
  backgroundFilename?: string;
  videoFilename?: string;
  videoOffsetMs?: number;
};

export function buildOsuFile({
  meta,
  difficulty,
  timingPoints,
  audioFilename,
  backgroundFilename,
  videoFilename,
  videoOffsetMs,
}: BuildOsuArgs): string {
  const points = sortedPoints(
    timingPoints.length ? timingPoints : [makeRedPoint(0, 120)],
  );
  const timingLines = points.map((p) => {
    const beatLengthMs = p.uninherited
      ? 60000 / p.bpm
      : svToBeatLength(p.sv);
    const effects = (p.kiai ? 1 : 0) | (p.omitFirstBarline ? 8 : 0);
    return [
      formatDecimal(p.time),
      beatLengthMs,
      Math.max(1, Math.round(p.meter || 4)),
      p.sampleSet,
      p.sampleIndex,
      Math.round(p.volume),
      p.uninherited ? 1 : 0,
      effects,
    ].join(",");
  });

  const events = [
    "//Background and Video events",
    ...(videoFilename
      ? [`Video,${Math.round(videoOffsetMs ?? 0)},"${videoFilename}"`]
      : []),
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

  const lines = [
    "osu file format v14",
    CASCADE_WATERMARK,
    "",
    "[General]",
    `AudioFilename: ${audioFilename}`,
    "AudioLeadIn: 0",
    `PreviewTime: ${Math.round(difficulty.previewTime)}`,
    "Countdown: 0",
    `SampleSet: ${difficulty.sampleSet ?? "Normal"}`,
    "StackLeniency: 0.7",
    "Mode: 3",
    "LetterboxInBreaks: 0",
    "SpecialStyle: 0",
    "WidescreenStoryboard: 0",
    "",
    "[Editor]",
    ...(difficulty.bookmarks?.length
      ? [`Bookmarks: ${difficulty.bookmarks.map((b) => Math.round(b)).join(",")}`]
      : []),
    "DistanceSpacing: 1",
    "BeatDivisor: 4",
    "GridSize: 8",
    "TimelineZoom: 1",
    "",
    "[Metadata]",
    `Title:${meta.title}`,
    `TitleUnicode:${meta.titleUnicode ?? meta.title}`,
    `Artist:${meta.artist}`,
    `ArtistUnicode:${meta.artistUnicode ?? meta.artist}`,
    `Creator:${meta.creator}`,
    `Version:${difficulty.name}`,
    "Source:",
    `Tags:${tagsWithCascade(meta.tags)}`,
    // Preserved from the import so an export updates the existing submission
    // rather than looking like a new one. Map Settings can override these with
    // 0/-1 to deliberately detach the map, which osu! then imports as local.
    `BeatmapID:${difficulty.beatmapId ?? 0}`,
    `BeatmapSetID:${meta.beatmapSetId ?? -1}`,
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

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").trim() || "untitled";
}

export function osuFilename(meta: SongMeta, difficulty: Difficulty): string {
  return `${sanitize(meta.artist)} - ${sanitize(meta.title)} (${sanitize(
    meta.creator,
  )}) [${sanitize(difficulty.name)}].osu`;
}

export function setFilename(meta: SongMeta): string {
  return `${sanitize(meta.artist)} - ${sanitize(meta.title)}.osz`;
}

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
