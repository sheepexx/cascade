import { type SnapDivisor, type TimingPoint } from "../types";

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

export function bpmAt(time: number, points: TimingPoint[]): number {
  return activeTimingAt(time, points)?.bpm ?? 120;
}

export function effectiveSvAt(time: number, points: TimingPoint[]): number {
  const sorted = sortedPoints(points);
  let sv = 1;
  for (const p of sorted) {
    if (p.time > time) break;
    sv = p.uninherited ? 1 : p.sv;
  }
  return sv;
}

export function volumeAt(time: number, points: TimingPoint[]): number {
  const sorted = sortedPoints(points);
  let vol = 100;
  for (const p of sorted) {
    if (p.time > time) break;
    vol = p.volume;
  }
  return vol;
}

export function kiaiAt(time: number, points: TimingPoint[]): boolean {
  const sorted = sortedPoints(points);
  let kiai = false;
  for (const p of sorted) {
    if (p.time > time) break;
    kiai = p.kiai;
  }
  return kiai;
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

export function snapIntervalAt(
  time: number,
  points: TimingPoint[],
  divisor: SnapDivisor,
): number {
  const tp = activeTimingAt(time, points);
  return beatLength(tp.bpm) / divisor;
}

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

  for (let i = 0; i < reds.length; i++) {
    const tp = reds[i];
    const segStart = tp.time;
    const segEnd = i + 1 < reds.length ? reds[i + 1].time : Infinity;
    const meter = Math.max(1, Math.round(tp.meter || 4));

    const interval = beatLength(tp.bpm) / divisor;
    if (interval <= 0) continue;

    const visibleStart = Math.max(segStart, fromTime);
    const visibleEnd = Math.min(segEnd, toTime);
    if (visibleEnd < visibleStart) continue;

    const firstIdx = Math.ceil((visibleStart - segStart) / interval);
    let lastIdx = Math.floor((visibleEnd - segStart) / interval);
    if (i + 1 < reds.length && segStart + lastIdx * interval >= segEnd - 1e-6) {
      lastIdx -= 1;
    }
    if (lastIdx - firstIdx > 20000) continue;

    for (let k = firstIdx; k <= lastIdx; k++) {
      const time = segStart + k * interval;
      const idxInBeat = ((k % divisor) + divisor) % divisor;
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

export function gridLineColor(idxInBeat: number, divisor: SnapDivisor): string {
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
