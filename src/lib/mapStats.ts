import type { ManiaNote } from "../types";

export type MapStats = {
  notes: number;
  rice: number;
  holds: number;
  /** Long notes as a fraction of all notes (0-1). */
  lnRatio: number;
  /** Distinct timestamps that carry 2+ notes at once. */
  chords: number;
  /** Notes that land in a chord as a fraction of all notes (0-1). */
  chordRatio: number;
  /** Highest note count inside any one-second window (by start time). */
  peakNps: number;
  /** Notes divided by the mapped span in seconds. */
  avgNps: number;
  /** Span from the first note to the last note end, in ms. */
  spanMs: number;
};

const EMPTY: MapStats = {
  notes: 0,
  rice: 0,
  holds: 0,
  lnRatio: 0,
  chords: 0,
  chordRatio: 0,
  peakNps: 0,
  avgNps: 0,
  spanMs: 0,
};

export function computeMapStats(notes: ManiaNote[]): MapStats {
  if (notes.length === 0) return EMPTY;

  let holds = 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  const perTime = new Map<number, number>();
  const starts: number[] = [];

  for (const n of notes) {
    if (n.endTime !== undefined && n.endTime > n.startTime) holds++;
    if (n.startTime < minStart) minStart = n.startTime;
    const end = n.endTime ?? n.startTime;
    if (end > maxEnd) maxEnd = end;
    perTime.set(n.startTime, (perTime.get(n.startTime) ?? 0) + 1);
    starts.push(n.startTime);
  }

  let chords = 0;
  let chordNotes = 0;
  for (const count of perTime.values()) {
    if (count >= 2) {
      chords++;
      chordNotes += count;
    }
  }

  // Peak NPS: widest bunching of note starts inside any 1000 ms window.
  starts.sort((a, b) => a - b);
  let peak = 0;
  let lo = 0;
  for (let hi = 0; hi < starts.length; hi++) {
    while (starts[hi] - starts[lo] >= 1000) lo++;
    const windowCount = hi - lo + 1;
    if (windowCount > peak) peak = windowCount;
  }

  const spanMs = Math.max(0, maxEnd - minStart);
  const spanSec = spanMs / 1000;

  return {
    notes: notes.length,
    rice: notes.length - holds,
    holds,
    lnRatio: notes.length ? holds / notes.length : 0,
    chords,
    chordRatio: notes.length ? chordNotes / notes.length : 0,
    peakNps: peak,
    avgNps: spanSec > 0 ? notes.length / spanSec : 0,
    spanMs,
  };
}
