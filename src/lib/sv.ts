import {
  MIN_SV,
  clampSv,
  makeGreenPoint,
  type TimingPoint,
} from "../types";
import { activeTimingAt, beatLength, greenPoints } from "./timing";

// Scroll-velocity position map. osu!/Quaver style: green points multiply the
// scroll rate, red points reset it to 1x. Integrating that step function gives
// a "scroll position" for any time; rendering with position deltas instead of
// time deltas is what makes SV visible. Positions are anchored so that
// pos(t) === t everywhere before the first timing point, and maps with no
// effective SV collapse to the identity (empty segment list) so the editor's
// linear fast path stays byte-identical.

export type SvSegment = {
  /** Segment start in ms. */
  time: number;
  /** Effective scroll rate from `time` until the next segment. */
  sv: number;
  /** Cumulative scroll position at `time`, in "scroll ms". */
  pos: number;
};

export type SvMap = {
  /** Sorted by time; empty means the map is the identity (no SV). */
  segments: SvSegment[];
};

const IDENTITY: SvMap = { segments: [] };
const mapCache = new WeakMap<TimingPoint[], SvMap>();

/** Red points reset SV; a green at the same timestamp wins (osu semantics). */
function svEventOrder(a: TimingPoint, b: TimingPoint): number {
  if (a.time !== b.time) return a.time - b.time;
  if (a.uninherited === b.uninherited) return 0;
  return a.uninherited ? -1 : 1;
}

export function buildSvMap(points: TimingPoint[]): SvMap {
  const hit = mapCache.get(points);
  if (hit) return hit;

  const events = [...points].sort(svEventOrder);
  const segments: SvSegment[] = [];
  let sv = 1;
  let anySv = false;
  for (const p of events) {
    const next = p.uninherited ? 1 : clampSv(p.sv);
    if (next !== 1) anySv = true;
    const last = segments[segments.length - 1];
    if (last && last.time === p.time) {
      last.sv = next;
      sv = next;
      continue;
    }
    if (next === sv) continue;
    const pos = last
      ? last.pos + (p.time - last.time) * last.sv
      : p.time; // identity anchor: pos === t before the first rate change
    segments.push({ time: p.time, sv: next, pos });
    sv = next;
  }

  const map = anySv && segments.length ? { segments } : IDENTITY;
  mapCache.set(points, map);
  return map;
}

/** True when the map would actually warp scroll (any effective SV ≠ 1). */
export function hasSv(points: TimingPoint[]): boolean {
  return buildSvMap(points).segments.length > 0;
}

function segmentIndexForTime(segments: SvSegment[], t: number): number {
  // Last segment with time <= t, or -1 when t precedes them all.
  let lo = 0;
  let hi = segments.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].time <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * Scroll position at time `t`. `blend` fades the warp in and out (0 = linear,
 * 1 = full SV); the blended map is still piecewise linear with slope
 * `blend*sv + (1-blend)` >= MIN_SV, so it stays exactly invertible.
 */
export function svPositionAt(map: SvMap, t: number, blend = 1): number {
  const { segments } = map;
  if (!segments.length || blend <= 0) return t;
  const i = segmentIndexForTime(segments, t);
  const pos =
    i < 0
      ? segments[0].pos - (segments[0].time - t)
      : segments[i].pos + (t - segments[i].time) * segments[i].sv;
  return blend >= 1 ? pos : blend * pos + (1 - blend) * t;
}

/** Exact inverse of `svPositionAt` for the same `blend`. */
export function svTimeAt(map: SvMap, pos: number, blend = 1): number {
  const { segments } = map;
  if (!segments.length || blend <= 0) return pos;
  const b = Math.min(blend, 1);
  const boundary = (i: number) =>
    b >= 1 ? segments[i].pos : b * segments[i].pos + (1 - b) * segments[i].time;

  let lo = 0;
  let hi = segments.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (boundary(mid) <= pos) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (ans < 0) {
    // Pre-history rate is 1 in both the raw and blended maps.
    return segments[0].time - (boundary(0) - pos);
  }
  const seg = segments[ans];
  const slope = b * seg.sv + (1 - b);
  return seg.time + (pos - boundary(ans)) / slope;
}

// ---------------------------------------------------------------------------
// Generators. Each returns green points covering [start, end) of a range;
// the caller (SvModal) decides what happens at `end` (restore previous SV or
// hold the final value) and merges via applySvToRange.
// ---------------------------------------------------------------------------

export type SvEasing =
  | "linear"
  | "sineIn"
  | "sineOut"
  | "sineInOut"
  | "quadIn"
  | "quadOut"
  | "quadInOut"
  | "expoIn"
  | "expoOut"
  | "expoInOut";

export const SV_EASINGS: SvEasing[] = [
  "linear",
  "sineIn",
  "sineOut",
  "sineInOut",
  "quadIn",
  "quadOut",
  "quadInOut",
  "expoIn",
  "expoOut",
  "expoInOut",
];

export function easeProgress(easing: SvEasing, x: number): number {
  const t = Math.max(0, Math.min(1, x));
  switch (easing) {
    case "linear":
      return t;
    case "sineIn":
      return 1 - Math.cos((t * Math.PI) / 2);
    case "sineOut":
      return Math.sin((t * Math.PI) / 2);
    case "sineInOut":
      return -(Math.cos(Math.PI * t) - 1) / 2;
    case "quadIn":
      return t * t;
    case "quadOut":
      return 1 - (1 - t) * (1 - t);
    case "quadInOut":
      return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    case "expoIn":
      return t === 0 ? 0 : 2 ** (10 * t - 10);
    case "expoOut":
      return t === 1 ? 1 : 1 - 2 ** (-10 * t);
    case "expoInOut":
      if (t === 0 || t === 1) return t;
      return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
  }
}

/** One green point holding `sv` from `start`. */
export function constantSv(start: number, sv: number): TimingPoint[] {
  return [makeGreenPoint(start, sv)];
}

/**
 * Interpolate SV from `svStart` to `svEnd` across [start, end), one point per
 * 1/`density` beat (beat length follows the active red point, so ramps stay
 * even across BPM changes).
 */
export function rampSv(
  points: TimingPoint[],
  start: number,
  end: number,
  svStart: number,
  svEnd: number,
  easing: SvEasing,
  density: number,
): TimingPoint[] {
  if (!(end > start) || !(density > 0)) return [];
  const out: TimingPoint[] = [];
  const span = end - start;
  let t = start;
  let guard = 0;
  while (t < end - 0.5 && guard < 5000) {
    const progress = easeProgress(easing, (t - start) / span);
    out.push(makeGreenPoint(t, svStart + (svEnd - svStart) * progress));
    const interval = beatLength(activeTimingAt(t, points)?.bpm ?? 120) / density;
    t += Math.max(1, interval);
    guard += 1;
  }
  return out;
}

/**
 * Burst-then-compensate stutter: each cycle starts at `peakSv` for
 * `peakFraction` of the cycle, then drops to the SV that keeps the whole cycle
 * averaging 1.0 so the chart doesn't drift. The compensated value is clamped
 * to MIN_SV, so extreme peaks can still drift — `stutterLowSv` reports the
 * value so the UI can warn.
 */
export function stutterLowSv(peakSv: number, peakFraction: number): number {
  const f = Math.max(0.05, Math.min(0.95, peakFraction));
  return Math.max(MIN_SV, (1 - clampSv(peakSv) * f) / (1 - f));
}

export function stutterSv(
  points: TimingPoint[],
  start: number,
  end: number,
  peakSv: number,
  peakFraction: number,
  cycleBeats: number,
): TimingPoint[] {
  if (!(end > start) || !(cycleBeats > 0)) return [];
  const f = Math.max(0.05, Math.min(0.95, peakFraction));
  const low = stutterLowSv(peakSv, f);
  const out: TimingPoint[] = [];
  let t = start;
  let guard = 0;
  while (t < end - 0.5 && guard < 5000) {
    const cycle =
      beatLength(activeTimingAt(t, points)?.bpm ?? 120) * cycleBeats;
    out.push(makeGreenPoint(t, peakSv));
    const drop = t + cycle * f;
    if (drop < end - 0.5) out.push(makeGreenPoint(drop, low));
    t += Math.max(1, cycle);
    guard += 1;
  }
  return out;
}

/** New array without the green points inside [start, end] (reds untouched). */
export function removeGreensInRange(
  points: TimingPoint[],
  start: number,
  end: number,
): TimingPoint[] {
  return points.filter(
    (p) => p.uninherited || p.time < start || p.time > end,
  );
}

/** Greens inside [start, end], for "replaces N points" summaries. */
export function greensInRange(
  points: TimingPoint[],
  start: number,
  end: number,
): TimingPoint[] {
  return greenPoints(points).filter((p) => p.time >= start && p.time <= end);
}

/**
 * Replace the green points inside [start, end] with `generated`, returning a
 * fresh sorted array (identity-keyed caches elsewhere rely on the new
 * reference).
 */
export function applySvToRange(
  points: TimingPoint[],
  start: number,
  end: number,
  generated: TimingPoint[],
): TimingPoint[] {
  return [...removeGreensInRange(points, start, end), ...generated].sort(
    svEventOrder,
  );
}
