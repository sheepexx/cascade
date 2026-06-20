import { uid, type ManiaNote } from "../types";

/**
 * Shared pattern model for reusable note snippets (presets) and the editor
 * clipboard. A pattern is a list of notes normalized so the earliest starts at
 * time 0; columns stay absolute so the pattern lands in the same lanes. This is
 * the same shape as the editor's internal `Clip.notes`
 * (src/components/ManiaEditor.tsx).
 */
export type PatternNote = {
  column: number;
  /** Relative start time in ms (earliest note in the pattern = 0). */
  startTime: number;
  endTime?: number;
  hitSound?: number;
  sampleSet?: number;
  additionSet?: number;
  sampleIndex?: number;
  sampleVolume?: number;
  sampleFile?: string;
};

function hitsoundOf(n: Partial<ManiaNote>): Partial<PatternNote> {
  return {
    hitSound: n.hitSound,
    sampleSet: n.sampleSet,
    additionSet: n.additionSet,
    sampleIndex: n.sampleIndex,
    sampleVolume: n.sampleVolume,
    sampleFile: n.sampleFile,
  };
}

/** Normalize editor notes into a pattern (earliest at t=0, sorted). */
export function notesToPattern(notes: ManiaNote[]): PatternNote[] {
  if (!notes.length) return [];
  const minTime = Math.min(...notes.map((n) => n.startTime));
  return notes
    .map((n) => ({
      column: n.column,
      startTime: n.startTime - minTime,
      endTime: n.endTime !== undefined ? n.endTime - minTime : undefined,
      ...hitsoundOf(n),
    }))
    .sort((a, b) => a.startTime - b.startTime || a.column - b.column);
}

/**
 * Materialise a pattern into placeable notes at `baseTime`, dropping notes that
 * fall outside `keyCount`. Mirrors the editor's paste math.
 */
export function patternToNotes(
  pattern: PatternNote[],
  baseTime: number,
  keyCount: number,
): ManiaNote[] {
  return pattern
    .filter((n) => n.column >= 0 && n.column < keyCount)
    .map((n) => ({
      id: uid("n"),
      column: n.column,
      startTime: n.startTime + baseTime,
      endTime: n.endTime !== undefined ? n.endTime + baseTime : undefined,
      ...hitsoundOf(n),
    }));
}

/** Number of lanes the pattern spans (highest column + 1). */
export function patternKeySpan(pattern: PatternNote[]): number {
  return pattern.reduce((max, n) => Math.max(max, n.column + 1), 0);
}

/**
 * Stable content hash of a pattern's note geometry (column + start/end times)
 * for a given key count. Order-independent. Used to detect duplicate preset
 * submissions across all users — hitsounds are intentionally ignored so two
 * identical layouts count as the same pattern.
 */
export async function patternHash(
  pattern: PatternNote[],
  keyCount: number,
): Promise<string> {
  const canonical =
    `k${keyCount}|` +
    pattern
      .map((n) => `${n.column},${n.startTime},${n.endTime ?? ""}`)
      .sort()
      .join(";");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
