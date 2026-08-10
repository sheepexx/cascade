import { SNAP_DIVISORS, uid, type ManiaNote, type TimingPoint } from "../types";
import { beatsBetween, timeAtBeatOffset } from "./timing";

export type PatternNote = {
  column: number;
  startTime: number;
  endTime?: number;
  beat?: number;
  endBeat?: number;
  hitSound?: number;
  sampleSet?: number;
  additionSet?: number;
  sampleIndex?: number;
  sampleVolume?: number;
  sampleFile?: string;
};

const SNAP_TOLERANCE_BEATS = 0.01;

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

export function notesToPattern(
  notes: ManiaNote[],
  points: TimingPoint[],
): PatternNote[] {
  if (!notes.length) return [];
  const anchor = Math.min(...notes.map((n) => n.startTime));
  return notes
    .map((n) => {
      const note: PatternNote = {
        column: n.column,
        startTime: n.startTime - anchor,
        beat: beatsBetween(anchor, n.startTime, points),
        ...hitsoundOf(n),
      };
      if (n.endTime !== undefined) {
        note.endTime = n.endTime - anchor;
        note.endBeat = beatsBetween(anchor, n.endTime, points);
      }
      return note;
    })
    .sort((a, b) => a.startTime - b.startTime || a.column - b.column);
}

export function patternToNotes(
  pattern: PatternNote[],
  baseTime: number,
  keyCount: number,
  points: TimingPoint[],
): ManiaNote[] {
  return pattern
    .filter((n) => n.column >= 0 && n.column < keyCount)
    .map((n) => {
      const startTime =
        n.beat === undefined
          ? n.startTime + baseTime
          : Math.round(timeAtBeatOffset(baseTime, n.beat, points));
      const tail =
        n.endBeat !== undefined
          ? Math.round(timeAtBeatOffset(baseTime, n.endBeat, points))
          : n.endTime !== undefined
            ? n.endTime + baseTime
            : undefined;
      return {
        id: uid("n"),
        column: n.column,
        startTime,
        endTime: tail !== undefined && tail > startTime ? tail : undefined,
        ...hitsoundOf(n),
      };
    });
}

export function patternKeySpan(pattern: PatternNote[]): number {
  return pattern.reduce((max, n) => Math.max(max, n.column + 1), 0);
}

function divisorFor(beats: number): number | null {
  for (const divisor of SNAP_DIVISORS) {
    const scaled = beats * divisor;
    if (Math.abs(scaled - Math.round(scaled)) <= SNAP_TOLERANCE_BEATS * divisor) {
      return divisor;
    }
  }
  return null;
}

export function patternSnap(pattern: PatternNote[]): number | null {
  let finest = 1;
  let spread = false;
  for (const n of pattern) {
    if (n.beat === undefined) return null;
    const offsets = n.endBeat === undefined ? [n.beat] : [n.beat, n.endBeat];
    for (const offset of offsets) {
      if (Math.abs(offset) > SNAP_TOLERANCE_BEATS) spread = true;
      const divisor = divisorFor(offset);
      if (divisor === null) return null;
      if (divisor > finest) finest = divisor;
    }
  }
  return spread ? finest : null;
}

export function formatSnap(divisor: number): string {
  return `1/${divisor}`;
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
