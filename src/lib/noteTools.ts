import type { ManiaNote, SnapDivisor, TimingPoint } from "../types";
import { snapIntervalAt } from "./timing";

/**
 * Convert every note into a long note (hold).
 *
 * Each note is extended so it ends `ticksGap` snap ticks before the next note
 * in the same column. A "tick" is one snap cell for the active divisor at the
 * note's time. Notes with no successor in their column (the last note in a
 * lane) are left untouched, as there is nothing to extend toward.
 *
 * Existing long notes only ever get *longer*: an end time that would shorten an
 * already-placed hold is ignored.
 */
export function fullLongNotes(
  notes: ManiaNote[],
  timingPoints: TimingPoint[],
  divisor: SnapDivisor,
  ticksGap: number,
): ManiaNote[] {
  // Find each note's successor within the same column.
  const byColumn = new Map<number, ManiaNote[]>();
  for (const n of notes) {
    const arr = byColumn.get(n.column);
    if (arr) arr.push(n);
    else byColumn.set(n.column, [n]);
  }
  const nextStart = new Map<string, number>();
  for (const arr of byColumn.values()) {
    arr.sort((a, b) => a.startTime - b.startTime);
    for (let i = 0; i < arr.length - 1; i++) {
      nextStart.set(arr[i].id, arr[i + 1].startTime);
    }
  }

  const gap = Math.max(0, ticksGap);
  return notes.map((n) => {
    const next = nextStart.get(n.id);
    if (next === undefined) return n; // last note in its column
    const interval = snapIntervalAt(n.startTime, timingPoints, divisor);
    const newEnd = Math.round(next - gap * interval);
    const curEnd = n.endTime ?? n.startTime;
    if (newEnd <= n.startTime) return n; // no room for a hold
    if (newEnd <= curEnd) return n; // never shorten existing holds
    return { ...n, endTime: newEnd };
  });
}

/** Convert every long note back into a single rice note (drops `endTime`). */
export function fullRiceNotes(notes: ManiaNote[]): ManiaNote[] {
  return notes.map((n) => {
    if (n.endTime === undefined) return n;
    const { endTime: _drop, ...rice } = n;
    return rice;
  });
}

/**
 * Mirror notes horizontally across the playfield: lane `c` maps to
 * `keyCount - 1 - c`, so the leftmost column swaps with the rightmost. Note ids,
 * times, hold lengths and hitsounds are untouched - only the column flips. This
 * is the osu!mania "Mirror" transform.
 */
export function mirrorColumns(
  notes: ManiaNote[],
  keyCount: number,
): ManiaNote[] {
  return notes.map((n) => ({ ...n, column: keyCount - 1 - n.column }));
}
