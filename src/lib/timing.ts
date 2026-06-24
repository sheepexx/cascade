import { type SnapDivisor, type TimingPoint } from "../types";

/** Length of one beat in milliseconds. */
export function beatLength(bpm: number): number {
  return 60000 / bpm;
}

/** Timing points sorted ascending by time (does not mutate the input). */
export function sortedPoints(points: TimingPoint[]): TimingPoint[] {
  return [...points].sort((a, b) => a.time - b.time);
}

/** Only the red (uninherited) points, sorted by time - these drive the grid. */
export function redPoints(points: TimingPoint[]): TimingPoint[] {
  return sortedPoints(points.filter((p) => p.uninherited));
}

/** Only the green (inherited) points, sorted by time. */
export function greenPoints(points: TimingPoint[]): TimingPoint[] {
  return sortedPoints(points.filter((p) => !p.uninherited));
}

/**
 * The red timing point in effect at a given time (the last one at/just before).
 * Falls back to the earliest red point when `time` precedes them all so callers
 * always get a tempo to work with.
 */
export function activeTimingAt(
  time: number,
  points: TimingPoint[],
): TimingPoint {
  const reds = redPoints(points);
  let active = reds[0];
  for (const p of reds) {
    if (p.time <= time) active = p;
    else break;
  }
  return active;
}

/** BPM in effect at a time. */
export function bpmAt(time: number, points: TimingPoint[]): number {
  return activeTimingAt(time, points)?.bpm ?? 120;
}

/**
 * Effective scroll velocity (SV) at a time. A green point sets SV until the next
 * point; a red point resets SV to 1.0 (osu! semantics). Returns the multiplier
 * from whichever point - red or green - most recently took effect.
 */
export function effectiveSvAt(time: number, points: TimingPoint[]): number {
  const sorted = sortedPoints(points);
  let sv = 1;
  for (const p of sorted) {
    if (p.time > time) break;
    sv = p.uninherited ? 1 : p.sv;
  }
  return sv;
}

/** Hit-sound volume (0..100) in effect at a time. */
export function volumeAt(time: number, points: TimingPoint[]): number {
  const sorted = sortedPoints(points);
  let vol = 100;
  for (const p of sorted) {
    if (p.time > time) break;
    vol = p.volume;
  }
  return vol;
}

/** Whether kiai time is active at a given time. */
export function kiaiAt(time: number, points: TimingPoint[]): boolean {
  const sorted = sortedPoints(points);
  let kiai = false;
  for (const p of sorted) {
    if (p.time > time) break;
    kiai = p.kiai;
  }
  return kiai;
}

/**
 * Kiai sections as [start, end] ms ranges. Kiai turns on at a point with
 * `kiai: true` and off at the next point that has `kiai: false`.
 */
export function kiaiRanges(
  points: TimingPoint[],
  songEnd: number,
): { start: number; end: number }[] {
  const sorted = sortedPoints(points);
  const ranges: { start: number; end: number }[] = [];
  let openStart: number | null = null;
  for (const p of sorted) {
    if (p.kiai && openStart === null) {
      openStart = p.time;
    } else if (!p.kiai && openStart !== null) {
      ranges.push({ start: openStart, end: p.time });
      openStart = null;
    }
  }
  if (openStart !== null) ranges.push({ start: openStart, end: songEnd });
  return ranges;
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
  /** True when this line falls on a measure (bar) boundary. */
  barline: boolean;
};

/**
 * Generate every snap line within [fromTime, toTime], correctly switching
 * tempo at each red timing point. Used to draw the editor grid.
 */
export function gridLinesInRange(
  fromTime: number,
  toTime: number,
  points: TimingPoint[],
  divisor: SnapDivisor,
): GridLine[] {
  const lines: GridLine[] = [];
  if (toTime <= fromTime) return lines;
  const reds = redPoints(points);
  if (reds.length === 0) return lines;

  for (let i = 0; i < reds.length; i++) {
    const tp = reds[i];
    const segStart = tp.time;
    const segEnd = i + 1 < reds.length ? reds[i + 1].time : Infinity;
    const meter = Math.max(1, Math.round(tp.meter || 4));

    const interval = beatLength(tp.bpm) / divisor;
    if (interval <= 0) continue;

    // Window of this tempo segment that is actually visible.
    const visibleStart = Math.max(segStart, fromTime);
    const visibleEnd = Math.min(segEnd, toTime);
    if (visibleEnd < visibleStart) continue;

    // First grid index (relative to the timing point) inside the window.
    const firstIdx = Math.ceil((visibleStart - segStart) / interval);
    let lastIdx = Math.floor((visibleEnd - segStart) / interval);
    // The next red point owns the grid line at its own time (it re-emits it as a
    // bar start). If this non-final segment's last line lands exactly on that
    // boundary, drop it so the tempo change doesn't draw two lines at one spot.
    if (i + 1 < reds.length && segStart + lastIdx * interval >= segEnd - 1e-6) {
      lastIdx -= 1;
    }
    // Guard against pathological scroll speeds producing huge loops.
    if (lastIdx - firstIdx > 20000) continue;

    for (let k = firstIdx; k <= lastIdx; k++) {
      const time = segStart + k * interval;
      const idxInBeat = ((k % divisor) + divisor) % divisor;
      // A barline falls on whole beats that are a multiple of the meter.
      const beatIdx = k / divisor;
      const barline =
        idxInBeat === 0 &&
        Math.abs(beatIdx - Math.round(beatIdx)) < 1e-6 &&
        ((Math.round(beatIdx) % meter) + meter) % meter === 0;
      lines.push({ time, idxInBeat, barline });
    }
  }
  return lines;
}

/** A tint color for a grid line based on its position within the beat. */
export function gridLineColor(idxInBeat: number, divisor: SnapDivisor): string {
  if (idxInBeat === 0) return "rgba(255,255,255,0.55)"; // full beat

  const reducedDivisor = divisor / gcd(Math.abs(idxInBeat), divisor);
  switch (reducedDivisor) {
    case 2:
      return "rgba(255,90,90,0.55)"; // 1/2 red
    case 3:
    case 6:
      return "rgba(190,110,255,0.55)"; // 1/3, 1/6 purple
    case 4:
      return "rgba(95,160,255,0.55)"; // 1/4 blue
    case 5:
    case 7:
    case 8:
    case 9:
      return "rgba(255,225,70,0.6)"; // 1/5, 1/7, 1/8, 1/9 yellow
    case 12:
    case 16:
      return "rgba(180,185,195,0.55)"; // 1/12, 1/16 grey
    default:
      return "rgba(255,255,255,0.12)";
  }
}

function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
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
