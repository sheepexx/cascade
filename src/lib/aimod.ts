import type { Difficulty, LoadedFile, ManiaNote, SongMeta, TimingPoint } from "../types";
import { difficultyRate } from "./rateChange";
import {
  STABLE_SNAP_DIVISORS,
  nearestStableSnap,
  redPoints,
  sortedPoints,
  type StableSnap,
} from "./timing";
import { formatUiNumber } from "./formatUiNumber";
import { analyzePatterns, readinessScore, type CriteriaPenalty, type PatternFeatures } from "./patternQuality";
import { compareToCorpus, formatCorpusValue, type CorpusComparison } from "./patternCorpus";
import { checkRankingCriteria, difficultyTier, type Tier } from "./rankingCriteria";

// osu! only recognises objects snapped to one of these beat divisors. Notes on a
// 1/5, 1/7, 1/9 or finer grid (or drifted off-grid by float rounding) are shown
// as "Object isn't snapped!" in the real editor's AiMod.
export const AIMOD_SNAP_DIVISORS = STABLE_SNAP_DIVISORS;

export type SnapResult = StableSnap;

/**
 * Mirror how osu! decides whether an object is snapped: the object time as the
 * whole millisecond osu! stores, against every recognised divisor of the active
 * red line, with each tick floored the way stable places it. If the object does
 * not land exactly on one of those ticks it is "unsnapped".
 */
export function nearestSnap(time: number, points: TimingPoint[]): SnapResult {
  return nearestStableSnap(time, points);
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
  | "Criteria"
  | "Guidelines"
  | "Patterns"
  | "Compose"
  | "Design"
  | "Timing"
  | "Meta"
  | "Mapset";

export const AIMOD_CATEGORIES: AiModCategory[] = [
  "Criteria",
  "Guidelines",
  "Patterns",
  "Compose",
  "Design",
  "Timing",
  "Meta",
  "Mapset",
];

export type AiModSeverity = "warning" | "error";

export const AIMOD_CONCURRENT_MS = 30;
export const AIMOD_MIN_LONG_NOTE_MS = 30;

export type AiModObject = { time: number; column: number };

export type AiModDetail = {
  time: number;
  label: string;
  /** End of the passage this detail covers, when it spans one rather than a moment. */
  endTime?: number;
  objects?: AiModObject[];
};

export type AiModIssue = {
  rule?: string;
  id: string;
  category: AiModCategory;
  severity: AiModSeverity;
  message: string;
  /** Difficulty this issue belongs to (omitted for whole-mapset issues). */
  diffId?: string;
  /** Time in ms to jump to when the issue is clicked. */
  time?: number;
  count?: number;
  details?: AiModDetail[];
};

export type AiModReport = {
  issues: AiModIssue[];
  warnings: number;
  errors: number;
  quality: {
    score: number | null;
    difficulties: { id: string; name: string; tier: Tier; score: number | null; features: PatternFeatures; comparison: CorpusComparison }[];
  };
};

export type AiModArgs = {
  meta: SongMeta;
  difficulties: Difficulty[];
  audioFiles: Record<string, LoadedFile>;
  bgFiles: Record<string, LoadedFile>;
  /**
   * Length of the source audio file in ms, unscaled by any difficulty rate.
   * Enables the length, drain and past-the-end-of-audio checks.
   */
  audioDurationMs?: number;
};

const MIN_MAP_LENGTH_MS = 30_000;
const RECOMMENDED_MAP_LENGTH_MS = 45_000;
const MAX_DETAILS = 1000;

export function formatAiModTime(ms: number): string {
  const v = Math.round(ms);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const minutes = Math.floor(abs / 60000);
  const seconds = Math.floor((abs % 60000) / 1000);
  return `${sign}${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}:${(abs % 1000).toString().padStart(3, "0")}`;
}

export function formatAiModObjects(objects?: AiModObject[]): string {
  if (!objects || objects.length === 0) return "";
  return `(${objects
    .map((o) => `${Math.round(o.time)}|${o.column + 1}`)
    .join(",")})`;
}

function objectRef(time: number, column: number): AiModObject {
  return { time: Math.round(time), column };
}

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
  const addGroup = (
    i: Omit<AiModIssue, "id" | "time" | "count" | "details">,
    details: AiModDetail[],
  ) => {
    if (details.length === 0) return;
    const sorted = [...details].sort((a, b) => a.time - b.time);
    add({
      ...i,
      time: sorted[0].time,
      count: sorted.length,
      details: sorted.slice(0, MAX_DETAILS),
    });
  };

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

  if (difficulties.length === 0)
    add({
      category: "Mapset",
      severity: "error",
      message: "The mapset has no difficulties.",
    });

  const keyCounts = new Set(difficulties.map((d) => d.keyCount));
  if (difficulties.length > 1 && keyCounts.size > 1) {
    // Not an error (mixed-key sets are legal) but worth surfacing.
    add({
      category: "Mapset",
      severity: "warning",
      message: `Mapset mixes key counts (${[...keyCounts].sort((a, b) => a - b).join("K, ")}K).`,
    });
  }

  const nameCounts = new Map<string, number>();
  for (const d of difficulties) {
    const key = d.name.trim().toLowerCase();
    if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const reportedNames = new Set<string>();
  for (const d of difficulties) {
    const key = d.name.trim().toLowerCase();
    const n = nameCounts.get(key) ?? 0;
    if (n < 2 || reportedNames.has(key)) continue;
    reportedNames.add(key);
    add({
      category: "Mapset",
      severity: "error",
      message: `${n} difficulties share the name "${d.name.trim()}".`,
    });
  }

  for (const d of difficulties) {
    const diffId = d.id;
    const points = d.timingPoints?.length ? d.timingPoints : [];
    const sortedNotes = [...d.notes].sort(
      (a, b) => a.startTime - b.startTime || a.column - b.column,
    );
    const audioEnd =
      audioDurationMs !== undefined && audioDurationMs > 0
        ? audioDurationMs / difficultyRate(d)
        : undefined;

    // --- Timing ---
    const reds = redPoints(points);
    if (reds.length === 0) {
      add({
        category: "Timing",
        severity: "error",
        message: `[${d.name}] No uninherited (red) timing point.`,
        diffId,
      });
    } else {
      const firstRed = reds[0];
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

    const badBpm: AiModDetail[] = [];
    const duplicatePoints: AiModDetail[] = [];
    const earlyGreens: AiModDetail[] = [];
    const seenPoints = new Set<string>();
    for (const p of sortedPoints(points)) {
      if (p.uninherited && !(Number.isFinite(p.bpm) && p.bpm > 0))
        badBpm.push({ time: p.time, label: `BPM is ${formatUiNumber(p.bpm)}.` });
      const key = `${p.uninherited ? "red" : "green"}@${Math.round(p.time)}`;
      if (seenPoints.has(key))
        duplicatePoints.push({
          time: p.time,
          label: `Two ${p.uninherited ? "red" : "green"} points share this time.`,
        });
      else seenPoints.add(key);
      if (!p.uninherited && reds.length > 0 && p.time < reds[0].time)
        earlyGreens.push({
          time: p.time,
          label: "Inherited point before the first timing point; osu! ignores it.",
        });
    }
    addGroup(
      {
        category: "Timing",
        severity: "error",
        message: `[${d.name}] Timing point with an invalid BPM.`,
        diffId,
      },
      badBpm,
    );
    addGroup(
      {
        category: "Timing",
        severity: "warning",
        message: `[${d.name}] Duplicate timing points.`,
        diffId,
      },
      duplicatePoints,
    );
    addGroup(
      {
        category: "Timing",
        severity: "warning",
        message: `[${d.name}] Inherited points before the first timing point.`,
        diffId,
      },
      earlyGreens,
    );

    // --- Compose: unsnapped objects ---
    if (reds.length > 0) {
      const unsnappedStarts: AiModDetail[] = [];
      const unsnappedEnds: AiModDetail[] = [];
      for (const n of sortedNotes) {
        const start = nearestSnap(n.startTime, points);
        if (start.unsnap > 0)
          unsnappedStarts.push({
            time: n.startTime,
            objects: [objectRef(n.startTime, n.column)],
            label: `Unsnapped by ${start.unsnap} ms (nearest 1/${start.divisor}).`,
          });
        if (n.endTime !== undefined) {
          const end = nearestSnap(n.endTime, points);
          if (end.unsnap > 0)
            unsnappedEnds.push({
              time: n.endTime,
              objects: [objectRef(n.endTime, n.column)],
              label: `Unsnapped by ${end.unsnap} ms (nearest 1/${end.divisor}).`,
            });
        }
      }
      addGroup(
        {
          category: "Compose",
          severity: "warning",
          message: `[${d.name}] Objects aren't snapped!`,
          diffId,
        },
        unsnappedStarts,
      );
      addGroup(
        {
          category: "Compose",
          severity: "warning",
          message: `[${d.name}] Object ends aren't snapped!`,
          diffId,
        },
        unsnappedEnds,
      );
    }

    // --- Compose: concurrent objects in the same column ---
    const byCol = new Map<number, ManiaNote[]>();
    for (const n of d.notes) {
      const arr = byCol.get(n.column);
      if (arr) arr.push(n);
      else byCol.set(n.column, [n]);
    }
    const concurrent: AiModDetail[] = [];
    for (const arr of byCol.values()) {
      arr.sort((a, b) => a.startTime - b.startTime);
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1];
        const cur = arr[i];
        const prevEnd = Math.max(prev.startTime, prev.endTime ?? prev.startTime);
        const gap = Math.round(cur.startTime - prevEnd);
        if (gap >= AIMOD_CONCURRENT_MS) continue;
        concurrent.push({
          time: prev.startTime,
          objects: [
            objectRef(prev.startTime, prev.column),
            objectRef(cur.startTime, cur.column),
          ],
          label:
            gap < 0
              ? `Overlapping by ${-gap} ms.`
              : `Within ${gap} ms of one another.`,
        });
      }
    }
    addGroup(
      {
        category: "Compose",
        severity: "error",
        message: `[${d.name}] Concurrent hit objects.`,
        diffId,
      },
      concurrent,
    );

    const shortHolds: AiModDetail[] = [];
    const invalidHolds: AiModDetail[] = [];
    for (const n of sortedNotes) {
      if (n.endTime === undefined) continue;
      const length = Math.round(n.endTime - n.startTime);
      const objects = [objectRef(n.startTime, n.column)];
      if (length <= 0)
        invalidHolds.push({
          time: n.startTime,
          objects,
          label:
            length === 0
              ? "Long note has no length."
              : `Long note ends ${-length} ms before it starts.`,
        });
      else if (length < AIMOD_MIN_LONG_NOTE_MS)
        shortHolds.push({
          time: n.startTime,
          objects,
          label: `Long note held for only ${length} ms.`,
        });
    }
    addGroup(
      {
        category: "Compose",
        severity: "error",
        message: `[${d.name}] Long notes that end before they start.`,
        diffId,
      },
      invalidHolds,
    );
    addGroup(
      {
        category: "Compose",
        severity: "warning",
        message: `[${d.name}] Too short long notes (less than ${AIMOD_MIN_LONG_NOTE_MS}ms).`,
        diffId,
      },
      shortHolds,
    );

    // --- Compose: objects outside the playfield or the audio ---
    const invalidCol: AiModDetail[] = [];
    const beforeAudio: AiModDetail[] = [];
    const afterAudio: AiModDetail[] = [];
    for (const n of sortedNotes) {
      const objects = [objectRef(n.startTime, n.column)];
      if (n.column < 0 || n.column >= d.keyCount)
        invalidCol.push({
          time: n.startTime,
          objects,
          label: `Column ${n.column + 1} is outside 1-${d.keyCount}K.`,
        });
      if (n.startTime < 0)
        beforeAudio.push({
          time: n.startTime,
          objects,
          label: `Starts ${Math.round(-n.startTime)} ms before the audio.`,
        });
      const end = n.endTime ?? n.startTime;
      if (audioEnd !== undefined && end > audioEnd)
        afterAudio.push({
          time: n.startTime,
          objects,
          label: `Ends ${Math.round(end - audioEnd)} ms past the end of the audio.`,
        });
    }
    addGroup(
      {
        category: "Compose",
        severity: "error",
        message: `[${d.name}] Objects in a column outside 1-${d.keyCount}K.`,
        diffId,
      },
      invalidCol,
    );
    addGroup(
      {
        category: "Compose",
        severity: "error",
        message: `[${d.name}] Objects before the start of the audio.`,
        diffId,
      },
      beforeAudio,
    );
    addGroup(
      {
        category: "Compose",
        severity: "warning",
        message: `[${d.name}] Objects past the end of the audio.`,
        diffId,
      },
      afterAudio,
    );

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

    // --- Meta: difficulty name ---
    if (!d.name.trim())
      add({
        category: "Meta",
        severity: "error",
        message: "A difficulty has no name.",
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
    else if (audioEnd !== undefined && d.previewTime > audioEnd)
      add({
        category: "Timing",
        severity: "warning",
        message: `[${d.name}] Preview point is past the end of the audio.`,
        diffId,
        time: d.previewTime,
      });

    // --- Mapset: audio reference ---
    if (
      d.audioFilename &&
      !audioFiles[d.audioFilename] &&
      Object.keys(audioFiles).length > 1
    )
      add({
        category: "Mapset",
        severity: "error",
        message: `[${d.name}] Audio file "${d.audioFilename}" is not in the mapset.`,
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
    else if (audioEnd !== undefined && audioEnd < RECOMMENDED_MAP_LENGTH_MS)
      add({
        category: "Mapset",
        severity: "warning",
        message: `[${d.name}] Your beatmap is shorter than 45 seconds. Consider making it longer.`,
        diffId,
      });
  }

  const criteriaPenalties = new Map<string, CriteriaPenalty[]>();
  const mapsetPenalties: CriteriaPenalty[] = [];
  for (const finding of checkRankingCriteria(difficulties, audioDurationMs)) {
    const shared = {
      category: (finding.guideline ? "Guidelines" : "Criteria") as AiModCategory,
      severity: finding.severity,
      rule: finding.rule,
      message: finding.message,
      diffId: finding.diffId,
    };
    if (finding.details && finding.details.length > 0) addGroup(shared, finding.details);
    else add({ ...shared, time: finding.time });
    const penalty: CriteriaPenalty = {
      severity: finding.severity,
      occurrences: Math.max(1, finding.details?.length ?? 1),
    };
    if (!finding.diffId) mapsetPenalties.push(penalty);
    else criteriaPenalties.set(finding.diffId, [...(criteriaPenalties.get(finding.diffId) ?? []), penalty]);
  }

  const qualityDiffs = difficulties.map(d => {
    const analysis = analyzePatterns(d);
    for (const finding of analysis.findings) addGroup({
      category: "Patterns", severity: "warning", rule: finding.rule,
      message: `[${d.name}] ${finding.message}.`, diffId: d.id,
    }, finding.details);
    const comparison = compareToCorpus(d.keyCount, analysis.windows);
    for (const outlier of comparison.outliers) addGroup({
      category: "Patterns", severity: "warning", rule: `corpus-${outlier.key}`,
      message: `[${d.name}] ${outlier.label[0].toUpperCase()}${outlier.label.slice(1)} runs heavier than ${Math.round(outlier.percentile * 100)}% of comparable ranked maps.`,
      diffId: d.id,
    }, outlier.spans.map(span => ({ time: span.start, endTime: span.end, label: `peaks at ${formatCorpusValue(outlier.key, span.peak)}, against a ranked 95th percentile of ${formatCorpusValue(outlier.key, outlier.threshold)}.` })));
    const rules = [...mapsetPenalties, ...(criteriaPenalties.get(d.id) ?? [])];
    return { id: d.id, name: d.name, tier: difficultyTier(d), score: readinessScore(d.notes.length, analysis.findings, rules), features: analysis.features, comparison };
  });
  const scores = qualityDiffs.map(d => d.score);
  const quality = { score: scores.length && scores.every(s => s !== null) ? Math.min(...scores as number[]) : null, difficulties: qualityDiffs };
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const errors = issues.filter((i) => i.severity === "error").length;
  return { issues, warnings, errors, quality };
}
