import type { ManiaNote, TimingPoint } from "../types";
import { STABLE_SNAP_DIVISORS, nearestStableSnap, type StableSnap } from "./timing";

/**
 * The snapping checks AiMod, Resnap, the note inspector and share cards
 * share. Kept apart from the AiMod report so that showing a note's time does
 * not load the whole ranking-criteria engine with it.
 */

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
