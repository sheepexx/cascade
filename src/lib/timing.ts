import type { SnapDivisor, TimingPoint } from "../types";

/** Length of one beat in milliseconds. */
export function beatLength(bpm: number): number {
  return 60000 / bpm;
}

/** Timing points sorted ascending by time (does not mutate the input). */
export function sortedPoints(points: TimingPoint[]): TimingPoint[] {
  return [...points].sort((a, b) => a.time - b.time);
}

/** The timing point in effect at a given time (the last one at/just before). */
export function activeTimingAt(
  time: number,
  points: TimingPoint[],
): TimingPoint {
  const sorted = sortedPoints(points);
  let active = sorted[0];
  for (const p of sorted) {
    if (p.time <= time) active = p;
    else break;
  }
  return active;
}

/** Length of one snap cell (a sub-beat) for the timing active at `time`. */
export function snapIntervalAt(
  time: number,
  points: TimingPoint[],
  divisor: SnapDivisor,
): number {
  const tp = activeTimingAt(time, points);
  return beatLength(tp.bpm) / divisor;
}

/** Snap an arbitrary time (ms) to the nearest grid line for its tempo section. */
export function snapTime(
  time: number,
  points: TimingPoint[],
  divisor: SnapDivisor,
): number {
  const tp = activeTimingAt(time, points);
  const interval = beatLength(tp.bpm) / divisor;
  if (interval <= 0) return Math.round(time);
  const snapped = tp.time + Math.round((time - tp.time) / interval) * interval;
  return Math.round(snapped);
}

/**
 * Step from `time` to the adjacent snap line in `dir` (+1 = later, -1 = earlier).
 * If `time` is between grid lines, the first step lands on the nearest line in
 * that direction; otherwise it advances by exactly one snap cell. Used so the
 * playhead always comes to rest on a snap line when scrubbing.
 */
export function stepToSnap(
  time: number,
  points: TimingPoint[],
  divisor: SnapDivisor,
  dir: 1 | -1,
): number {
  const interval = snapIntervalAt(time, points, divisor);
  if (interval <= 0) return Math.round(time + dir);
  const EPS = 1; // ms tolerance for "already on a line"
  const snapped = snapTime(time, points, divisor);
  if (dir > 0) {
    return snapped > time + EPS ? snapped : snapTime(time + interval, points, divisor);
  }
  return snapped < time - EPS ? snapped : snapTime(time - interval, points, divisor);
}

export type GridLine = {
  time: number;
  /** Index of this line within its beat (0 = on the beat). */
  idxInBeat: number;
};

/**
 * Generate every snap line within [fromTime, toTime], correctly switching
 * tempo at each timing point. Used to draw the editor grid.
 */
export function gridLinesInRange(
  fromTime: number,
  toTime: number,
  points: TimingPoint[],
  divisor: SnapDivisor,
): GridLine[] {
  const lines: GridLine[] = [];
  if (toTime <= fromTime) return lines;
  const sorted = sortedPoints(points);

  for (let i = 0; i < sorted.length; i++) {
    const tp = sorted[i];
    const segStart = tp.time;
    const segEnd = i + 1 < sorted.length ? sorted[i + 1].time : Infinity;

    const interval = beatLength(tp.bpm) / divisor;
    if (interval <= 0) continue;

    // Window of this tempo segment that is actually visible.
    const visibleStart = Math.max(segStart, fromTime);
    const visibleEnd = Math.min(segEnd, toTime);
    if (visibleEnd < visibleStart) continue;

    // First grid index (relative to the timing point) inside the window.
    const firstIdx = Math.ceil((visibleStart - segStart) / interval);
    const lastIdx = Math.floor((visibleEnd - segStart) / interval);
    // Guard against pathological zoom levels producing huge loops.
    if (lastIdx - firstIdx > 20000) continue;

    for (let k = firstIdx; k <= lastIdx; k++) {
      const time = segStart + k * interval;
      const idxInBeat = ((k % divisor) + divisor) % divisor;
      lines.push({ time, idxInBeat });
    }
  }
  return lines;
}

/** A tint color for a grid line based on its position within the beat. */
export function gridLineColor(idxInBeat: number, divisor: SnapDivisor): string {
  if (idxInBeat === 0) return "rgba(255,255,255,0.55)"; // full beat
  if (divisor % 2 === 0 && idxInBeat === divisor / 2)
    return "rgba(255,90,90,0.45)"; // 1/2
  if (divisor % 4 === 0 && idxInBeat % (divisor / 4) === 0)
    return "rgba(95,160,255,0.4)"; // 1/4
  if (divisor % 3 === 0 && idxInBeat % (divisor / 3) === 0)
    return "rgba(170,110,255,0.4)"; // triplets
  return "rgba(255,255,255,0.12)";
}

/** Format milliseconds as mm:ss.mmm for display. */
export function formatTime(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const abs = Math.abs(ms);
  const minutes = Math.floor(abs / 60000);
  const seconds = Math.floor((abs % 60000) / 1000);
  const millis = Math.floor(abs % 1000);
  return `${sign}${minutes}:${seconds.toString().padStart(2, "0")}.${millis
    .toString()
    .padStart(3, "0")}`;
}
