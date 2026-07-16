import { uid, type ManiaNote } from "../types";

export type PatternNote = {
  column: number;
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

export function patternKeySpan(pattern: PatternNote[]): number {
  return pattern.reduce((max, n) => Math.max(max, n.column + 1), 0);
}

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
