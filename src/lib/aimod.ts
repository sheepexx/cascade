import type { Difficulty, LoadedFile, ManiaNote, SongMeta, TimingPoint } from "../types";
import { activeTimingAt, beatLength, redPoints, sortedPoints } from "./timing";

// osu! only recognises objects snapped to one of these beat divisors. Notes on a
// 1/5, 1/7, 1/9 or finer grid (or drifted off-grid by float rounding) are shown
// as "Object isn't snapped!" in the real editor's AiMod.
export const AIMOD_SNAP_DIVISORS = [1, 2, 3, 4, 6, 8, 12, 16] as const;

export type SnapResult = {
  /** Integer ms position of the closest osu! snap. */
  snapped: number;
  /** Distance in ms from the (rounded) object time to that snap. 0 = on-grid. */
  unsnap: number;
  divisor: number;
};

/**
 * Mirror how osu! decides whether an object is snapped: round the object time to
 * an integer (osu! stores integer ms), then find the nearest snap across the
 * recognised divisors relative to the active red timing point. If the object
 * time does not land exactly on that grid it is "unsnapped".
 */
export function nearestSnap(time: number, points: TimingPoint[]): SnapResult {
  const t = Math.round(time);
  const reds = redPoints(points);
  if (reds.length === 0) return { snapped: t, unsnap: 0, divisor: 1 };
  const tp = activeTimingAt(t, points);
  const beat = beatLength(tp.bpm);
  let best: SnapResult = { snapped: t, unsnap: Infinity, divisor: 1 };
  for (const d of AIMOD_SNAP_DIVISORS) {
    const interval = beat / d;
    if (!(interval > 0)) continue;
    const k = Math.round((t - tp.time) / interval);
    const snapped = Math.round(tp.time + k * interval);
    const unsnap = Math.abs(t - snapped);
    if (unsnap < best.unsnap) best = { snapped, unsnap, divisor: d };
    if (best.unsnap === 0) break;
  }
  return best;
}

export function isUnsnapped(time: number, points: TimingPoint[]): boolean {
  return nearestSnap(time, points).unsnap > 0;
}

/**
 * Move every off-grid note onto its nearest osu! snap. Notes already on the grid
 * are left untouched, so this only removes rounding / offset drift (the reason
 * `.sm`-imported maps read as unsnapped) plus any 1/5-style divisors osu! can't
 * represent. Optionally cap how far a note may move so intentional off-grid
 * patterns are preserved.
 */
export function resnapNotes(
  notes: ManiaNote[],
  points: TimingPoint[],
  maxShiftMs = Infinity,
): { notes: ManiaNote[]; moved: number } {
  let moved = 0;
  const out = notes.map((n) => {
    let next = n;
    const start = nearestSnap(n.startTime, points);
    if (start.unsnap > 0 && start.unsnap <= maxShiftMs) {
      next = { ...next, startTime: start.snapped };
      moved++;
    }
    if (next.endTime !== undefined) {
      const end = nearestSnap(next.endTime, points);
      if (end.unsnap > 0 && end.unsnap <= maxShiftMs) {
        // Keep the hold valid: a resnapped tail must stay past its head.
        const endTime = end.snapped > next.startTime ? end.snapped : next.endTime;
        if (endTime !== next.endTime) {
          next = { ...next, endTime };
          moved++;
        }
      }
    }
    return next;
  });
  return { notes: out, moved };
}

export function countUnsnapped(notes: ManiaNote[], points: TimingPoint[]): number {
  let count = 0;
  for (const n of notes) {
    if (isUnsnapped(n.startTime, points)) count++;
    else if (n.endTime !== undefined && isUnsnapped(n.endTime, points)) count++;
  }
  return count;
}

export type AiModCategory =
  | "Compose"
  | "Design"
  | "Timing"
  | "Meta"
  | "Mapset";

export const AIMOD_CATEGORIES: AiModCategory[] = [
  "Compose",
  "Design",
  "Timing",
  "Meta",
  "Mapset",
];

export type AiModSeverity = "warning" | "error";

export type AiModIssue = {
  id: string;
  category: AiModCategory;
  severity: AiModSeverity;
  message: string;
  /** Difficulty this issue belongs to (omitted for whole-mapset issues). */
  diffId?: string;
  /** Time in ms to jump to when the issue is clicked. */
  time?: number;
};

export type AiModReport = {
  issues: AiModIssue[];
  warnings: number;
  errors: number;
};

export type AiModArgs = {
  meta: SongMeta;
  difficulties: Difficulty[];
  audioFiles: Record<string, LoadedFile>;
  bgFiles: Record<string, LoadedFile>;
  /** Song length in ms, if the audio is loaded. Enables length/drain checks. */
  audioDurationMs?: number;
};

const MIN_MAP_LENGTH_MS = 30_000;
const RECOMMENDED_MAP_LENGTH_MS = 45_000;

/** Total time spanned by the notes of a difficulty (first to last). */
function mappedSpanMs(d: Difficulty): number {
  if (d.notes.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const n of d.notes) {
    if (n.startTime < min) min = n.startTime;
    const end = n.endTime ?? n.startTime;
    if (end > max) max = end;
  }
  return max - min;
}

export function runAiMod({
  meta,
  difficulties,
  audioFiles,
  bgFiles,
  audioDurationMs,
}: AiModArgs): AiModReport {
  const issues: AiModIssue[] = [];
  let seq = 0;
  const add = (i: Omit<AiModIssue, "id">) =>
    issues.push({ ...i, id: `ai_${seq++}` });

  // --- Mapset-wide metadata (Meta) ---
  if (!meta.title.trim())
    add({ category: "Meta", severity: "error", message: "Missing romanised title." });
  if (!meta.artist.trim())
    add({ category: "Meta", severity: "error", message: "Missing romanised artist." });
  if (!meta.creator.trim())
    add({ category: "Meta", severity: "error", message: "Missing creator." });
  if (!(meta.tags ?? "").trim())
    add({
      category: "Meta",
      severity: "warning",
      message: "Tags field is empty. Consider adding search tags.",
    });

  // --- Mapset (audio + set-wide) ---
  if (Object.keys(audioFiles).length === 0)
    add({ category: "Mapset", severity: "error", message: "No audio file loaded." });

  const keyCounts = new Set(difficulties.map((d) => d.keyCount));
  if (difficulties.length > 1 && keyCounts.size > 1) {
    // Not an error (mixed-key sets are legal) but worth surfacing.
    add({
      category: "Mapset",
      severity: "warning",
      message: `Mapset mixes key counts (${[...keyCounts].sort((a, b) => a - b).join("K, ")}K).`,
    });
  }

  for (const d of difficulties) {
    const diffId = d.id;
    const points = d.timingPoints?.length ? d.timingPoints : [];
    const sortedNotes = [...d.notes].sort((a, b) => a.startTime - b.startTime);

    // --- Timing ---
    const reds = points.filter((p) => p.uninherited);
    if (reds.length === 0) {
      add({
        category: "Timing",
        severity: "error",
        message: `[${d.name}] No uninherited (red) timing point.`,
        diffId,
      });
    } else {
      const firstRed = sortedPoints(points).find((p) => p.uninherited)!;
      const firstNote = sortedNotes[0];
      if (firstNote && firstNote.startTime < firstRed.time - 1) {
        add({
          category: "Timing",
          severity: "warning",
          message: `[${d.name}] First object starts before the first timing point.`,
          diffId,
          time: firstNote.startTime,
        });
      }
    }

    // --- Compose: unsnapped objects ---
    if (reds.length > 0) {
      let unsnappedStarts = 0;
      let unsnappedEnds = 0;
      let firstStartTime: number | undefined;
      let firstEndTime: number | undefined;
      for (const n of sortedNotes) {
        if (isUnsnapped(n.startTime, points)) {
          unsnappedStarts++;
          if (firstStartTime === undefined) firstStartTime = n.startTime;
        }
        if (n.endTime !== undefined && isUnsnapped(n.endTime, points)) {
          unsnappedEnds++;
          if (firstEndTime === undefined) firstEndTime = n.endTime;
        }
      }
      if (unsnappedStarts > 0)
        add({
          category: "Compose",
          severity: "warning",
          message:
            unsnappedStarts === 1
              ? `[${d.name}] Object isn't snapped!`
              : `[${d.name}] ${unsnappedStarts} objects aren't snapped!`,
          diffId,
          time: firstStartTime,
        });
      if (unsnappedEnds > 0)
        add({
          category: "Compose",
          severity: "warning",
          message:
            unsnappedEnds === 1
              ? `[${d.name}] Object's end isn't snapped!`
              : `[${d.name}] ${unsnappedEnds} object ends aren't snapped!`,
          diffId,
          time: firstEndTime,
        });
    }

    // --- Compose: overlaps / duplicates in a column ---
    const byCol = new Map<number, ManiaNote[]>();
    for (const n of d.notes) {
      const arr = byCol.get(n.column);
      if (arr) arr.push(n);
      else byCol.set(n.column, [n]);
    }
    let overlaps = 0;
    let overlapTime: number | undefined;
    for (const arr of byCol.values()) {
      arr.sort((a, b) => a.startTime - b.startTime);
      for (let i = 1; i < arr.length; i++) {
        const prevEnd = arr[i - 1].endTime ?? arr[i - 1].startTime;
        if (arr[i].startTime <= prevEnd) {
          overlaps++;
          if (overlapTime === undefined) overlapTime = arr[i].startTime;
        }
      }
    }
    if (overlaps > 0)
      add({
        category: "Compose",
        severity: "error",
        message: `[${d.name}] ${overlaps} overlapping object(s) in the same column.`,
        diffId,
        time: overlapTime,
      });

    // --- Compose: notes in an invalid column ---
    let invalidCol = 0;
    let invalidColTime: number | undefined;
    for (const n of sortedNotes) {
      if (n.column < 0 || n.column >= d.keyCount) {
        invalidCol++;
        if (invalidColTime === undefined) invalidColTime = n.startTime;
      }
    }
    if (invalidCol > 0)
      add({
        category: "Compose",
        severity: "error",
        message: `[${d.name}] ${invalidCol} object(s) in a column outside 1-${d.keyCount}K.`,
        diffId,
        time: invalidColTime,
      });

    // --- Compose: empty difficulty / no hitsounds ---
    if (d.notes.length === 0) {
      add({
        category: "Compose",
        severity: "error",
        message: `[${d.name}] There are no objects in this difficulty.`,
        diffId,
      });
    } else {
      const anyHitsound = d.notes.some(
        (n) => (n.hitSound ?? 0) !== 0 || (n.sampleFile ?? "") !== "",
      );
      if (!anyHitsound)
        add({
          category: "Compose",
          severity: "warning",
          message: `[${d.name}] There are no hitsounds. Consider adding some.`,
          diffId,
        });
    }

    // --- Design: difficulty settings ---
    if (d.overallDifficulty < 0 || d.overallDifficulty > 10)
      add({
        category: "Design",
        severity: "error",
        message: `[${d.name}] Overall Difficulty (${d.overallDifficulty}) must be between 0 and 10.`,
        diffId,
      });
    if (d.hpDrainRate < 0 || d.hpDrainRate > 10)
      add({
        category: "Design",
        severity: "error",
        message: `[${d.name}] HP Drain Rate (${d.hpDrainRate}) must be between 0 and 10.`,
        diffId,
      });

    // --- Design: background ---
    if (!d.backgroundFilename || !bgFiles[d.backgroundFilename])
      add({
        category: "Design",
        severity: "warning",
        message: `[${d.name}] No background image.`,
        diffId,
      });

    // --- Timing: preview point ---
    if (d.previewTime < 0)
      add({
        category: "Timing",
        severity: "warning",
        message: `[${d.name}] No preview point set.`,
        diffId,
      });

    // --- Mapset: length / drain ---
    const span = mappedSpanMs(d);
    if (d.notes.length > 0 && span < MIN_MAP_LENGTH_MS)
      add({
        category: "Mapset",
        severity: "error",
        message: `[${d.name}] Drain time should be over 30 seconds.`,
        diffId,
      });
    else if (
      audioDurationMs !== undefined &&
      audioDurationMs > 0 &&
      audioDurationMs < RECOMMENDED_MAP_LENGTH_MS
    )
      add({
        category: "Mapset",
        severity: "warning",
        message: `[${d.name}] Your beatmap is shorter than 45 seconds. Consider making it longer.`,
        diffId,
      });
  }

  const warnings = issues.filter((i) => i.severity === "warning").length;
  const errors = issues.filter((i) => i.severity === "error").length;
  return { issues, warnings, errors };
}
