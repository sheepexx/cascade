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
  /** Notes per column, indexed by column. */
  columnCounts: number[];
  /**
   * Fraction of hand-assigned notes on the left hand (0-1). The middle column
   * of odd layouts belongs to neither hand and is excluded. 0.5 when nothing
   * is assignable.
   */
  handBalance: number;
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
  columnCounts: [],
  handBalance: 0.5,
};

export function computeMapStats(notes: ManiaNote[], keyCount = 0): MapStats {
  if (notes.length === 0)
    return keyCount > 0
      ? { ...EMPTY, columnCounts: new Array(keyCount).fill(0) }
      : EMPTY;

  let holds = 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  const perTime = new Map<number, number>();
  const starts: number[] = [];
  let columns = Math.max(0, Math.floor(keyCount));
  for (const n of notes) columns = Math.max(columns, n.column + 1);
  const columnCounts = new Array<number>(columns).fill(0);

  for (const n of notes) {
    if (n.endTime !== undefined && n.endTime > n.startTime) holds++;
    if (n.startTime < minStart) minStart = n.startTime;
    const end = n.endTime ?? n.startTime;
    if (end > maxEnd) maxEnd = end;
    perTime.set(n.startTime, (perTime.get(n.startTime) ?? 0) + 1);
    starts.push(n.startTime);
    if (n.column >= 0) columnCounts[n.column]++;
  }

  let leftNotes = 0;
  let handNotes = 0;
  for (let c = 0; c < columns; c++) {
    if (2 * c + 1 === columns) continue; // middle column of an odd layout
    handNotes += columnCounts[c];
    if (2 * c + 1 < columns) leftNotes += columnCounts[c];
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
    columnCounts,
    handBalance: handNotes > 0 ? leftNotes / handNotes : 0.5,
  };
}
