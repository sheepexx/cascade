import { FREE_SNAP, type SnapDivisor, type TimingPoint } from "../types";

export function beatLength(bpm: number): number {
  return 60000 / bpm;
}

const sortedCache = new WeakMap<TimingPoint[], TimingPoint[]>();
const redCache = new WeakMap<TimingPoint[], TimingPoint[]>();
const greenCache = new WeakMap<TimingPoint[], TimingPoint[]>();

export function sortedPoints(points: TimingPoint[]): TimingPoint[] {
  const hit = sortedCache.get(points);
  if (hit) return hit;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  sortedCache.set(points, sorted);
  return sorted;
}

export function redPoints(points: TimingPoint[]): TimingPoint[] {
  const hit = redCache.get(points);
  if (hit) return hit;
  const reds = [...points].filter((p) => p.uninherited).sort((a, b) => a.time - b.time);
  redCache.set(points, reds);
  return reds;
}

export function greenPoints(points: TimingPoint[]): TimingPoint[] {
  const hit = greenCache.get(points);
  if (hit) return hit;
  const greens = [...points].filter((p) => !p.uninherited).sort((a, b) => a.time - b.time);
  greenCache.set(points, greens);
  return greens;
}

/**
 * Index of the last point at or before `time` in a time-sorted list, or -1.
 * Among points sharing a time the later one wins, as a forward scan would.
 * The editor asks this per visible note per frame, and SV-heavy maps carry
 * thousands of points, so it must not walk the list.
 */
function lastPointAtOrBefore(sorted: TimingPoint[], time: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].time > time) hi = mid;
    else lo = mid + 1;
  }
  return lo - 1;
}

export function activeTimingAt(
  time: number,
  points: TimingPoint[],
): TimingPoint {
  const reds = redPoints(points);
  return reds[Math.max(0, lastPointAtOrBefore(reds, time))];
}

export function bpmAt(time: number, points: TimingPoint[]): number {
  return activeTimingAt(time, points)?.bpm ?? 120;
}

export function effectiveSvAt(time: number, points: TimingPoint[]): number {
  const sorted = sortedPoints(points);
  const index = lastPointAtOrBefore(sorted, time);
  if (index < 0 || sorted[index].uninherited) return 1;
  return sorted[index].sv;
}

export function volumeAt(time: number, points: TimingPoint[]): number {
  const sorted = sortedPoints(points);
  const index = lastPointAtOrBefore(sorted, time);
  return index < 0 ? 100 : sorted[index].volume;
}

export function kiaiAt(time: number, points: TimingPoint[]): boolean {
  const sorted = sortedPoints(points);
  const index = lastPointAtOrBefore(sorted, time);
  return index < 0 ? false : sorted[index].kiai;
}

export type KiaiRange = { start: number; end: number };

export function kiaiRanges(
  points: TimingPoint[],
  songEnd: number,
): KiaiRange[] {
  const sorted = sortedPoints(points);
  const ranges: KiaiRange[] = [];
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

type BpmSegment = { start: number; end: number; length: number };

function bpmSegments(points: TimingPoint[]): BpmSegment[] {
  const reds = redPoints(points);
  return reds.map((p, i) => ({
    start: i === 0 ? -Infinity : p.time,
    end: i + 1 < reds.length ? reds[i + 1].time : Infinity,
    length: beatLength(p.bpm),
  }));
}

export function beatsBetween(
  from: number,
  to: number,
  points: TimingPoint[],
): number {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  let beats = 0;
  for (const seg of bpmSegments(points)) {
    if (!(seg.length > 0)) continue;
    const start = Math.max(lo, seg.start);
    const end = Math.min(hi, seg.end);
    if (end > start) beats += (end - start) / seg.length;
  }
  return to < from ? -beats : beats;
}

export function timeAtBeatOffset(
  from: number,
  beats: number,
  points: TimingPoint[],
): number {
  if (!beats) return from;
  const forward = beats > 0;
  const segments = bpmSegments(points);
  if (!segments.length) return from;
  let remaining = Math.abs(beats);
  let cursor = from;
  for (const seg of forward ? segments : [...segments].reverse()) {
    if (!(seg.length > 0)) continue;
    const start = forward ? Math.max(cursor, seg.start) : seg.start;
    const end = forward ? seg.end : Math.min(cursor, seg.end);
    if (end <= start) continue;
    const capacity = (end - start) / seg.length;
    if (capacity >= remaining) {
      return forward
        ? start + remaining * seg.length
        : end - remaining * seg.length;
    }
    remaining -= capacity;
    cursor = forward ? seg.end : seg.start;
  }
  return cursor;
}

/**
 * Free snap has no grid, but the playhead still has to move by *something* per
 * scroll step, and the Full LN tool still has to have a tick length. Both
 * borrow the finest divisor; stepping by 1ms would make the wheel unusable.
 */
export function snapTickDivisor(divisor: SnapDivisor): number {
  return divisor === FREE_SNAP ? 16 : divisor;
}

export function snapIntervalAt(
  time: number,
  points: TimingPoint[],
  divisor: SnapDivisor,
): number {
  const tp = activeTimingAt(time, points);
  return beatLength(tp.bpm) / snapTickDivisor(divisor);
}

export function snapTime(
  time: number,
  points: TimingPoint[],
  divisor: SnapDivisor,
): number {
  if (divisor === FREE_SNAP) return Math.round(time);
  const tp = activeTimingAt(time, points);
  const interval = beatLength(tp.bpm) / divisor;
  if (interval <= 0) return Math.round(time);
  const snapped = tp.time + Math.round((time - tp.time) / interval) * interval;
  return Math.round(snapped);
}

export function stepToSnap(
  time: number,
  points: TimingPoint[],
  divisor: SnapDivisor,
  dir: 1 | -1,
): number {
  const interval = snapIntervalAt(time, points, divisor);
  if (interval <= 0) return Math.round(time + dir);
  const EPS = 1;
  const snapped = snapTime(time, points, divisor);
  if (dir > 0) {
    return snapped > time + EPS ? snapped : snapTime(time + interval, points, divisor);
  }
  return snapped < time - EPS ? snapped : snapTime(time - interval, points, divisor);
}

export type GridLine = {
  time: number;
  idxInBeat: number;
  barline: boolean;
};

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

  // Free snap draws no subdivisions, but keeping the beat and bar lines leaves
  // the field readable - notes just aren't pulled onto them.
  const grid = divisor === FREE_SNAP ? 1 : divisor;

  for (let i = 0; i < reds.length; i++) {
    const tp = reds[i];
    const origin = tp.time;
    const segStart = i === 0 ? -Infinity : origin;
    const segEnd = i + 1 < reds.length ? reds[i + 1].time : Infinity;
    const meter = Math.max(1, Math.round(tp.meter || 4));

    const interval = beatLength(tp.bpm) / grid;
    if (interval <= 0) continue;

    const visibleStart = Math.max(segStart, fromTime);
    const visibleEnd = Math.min(segEnd, toTime);
    if (visibleEnd < visibleStart) continue;

    const firstIdx = Math.ceil((visibleStart - origin) / interval);
    let lastIdx = Math.floor((visibleEnd - origin) / interval);
    if (i + 1 < reds.length && origin + lastIdx * interval >= segEnd - 1e-6) {
      lastIdx -= 1;
    }
    if (lastIdx - firstIdx > 20000) continue;

    for (let k = firstIdx; k <= lastIdx; k++) {
      const time = origin + k * interval;
      const idxInBeat = ((k % grid) + grid) % grid;
      const beatIdx = k / grid;
      const barline =
        idxInBeat === 0 &&
        Math.abs(beatIdx - Math.round(beatIdx)) < 1e-6 &&
        ((Math.round(beatIdx) % meter) + meter) % meter === 0;
      lines.push({ time, idxInBeat, barline });
    }
  }
  return lines;
}

export function gridLineColor(idxInBeat: number, divisor: number): string {
  if (idxInBeat === 0) return "rgba(255,255,255,0.85)";

  const reducedDivisor = divisor / gcd(Math.abs(idxInBeat), divisor);
  switch (reducedDivisor) {
    case 2:
      return "rgba(255,105,105,0.8)";
    case 3:
    case 6:
      return "rgba(200,130,255,0.8)";
    case 4:
      return "rgba(115,175,255,0.8)";
    case 5:
    case 7:
    case 8:
    case 9:
      return "rgba(255,230,90,0.8)";
    case 12:
    case 16:
      return "rgba(195,200,210,0.75)";
    default:
      return "rgba(255,255,255,0.3)";
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

/**
 * Parse a user-entered timestamp into ms. Accepts osu-style `mm:ss:ms` and
 * `mm:ss.ms`, plain `m:ss`, and a raw millisecond count. Short millisecond
 * parts are read as a leading fraction of a second (`1:23.4` = 1:23.400).
 * Anything after the timestamp is ignored, so osu editor copies like
 * `01:23:456 (1|2)` paste straight in.
 */
export function parseTimestamp(input: string): number | null {
  const text = input.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const m = text.match(/^(\d+):(\d{1,2})(?:[:.](\d{1,3}))?(?:[\s(]|$)/);
  if (!m) return null;
  const minutes = Number(m[1]);
  const seconds = Number(m[2]);
  if (seconds >= 60) return null;
  const millis = m[3] ? Number(m[3].padEnd(3, "0")) : 0;
  return minutes * 60000 + seconds * 1000 + millis;
}
