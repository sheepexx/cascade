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
const mapCache = new WeakMap<TimingPoint[], Map<string, SvMap>>();

/**
 * osu!mania stable scrolls faster at higher BPM, so mappers build effects out
 * of red points as often as green ones (freezes via a huge beat length,
 * teleports via a tiny one). With `bpmScroll` on, the rate is
 * `sv * bpm / baseBpm`, matching the game; off, it is Quaver-style pure SV.
 */
export type SvMapOptions = {
  bpmScroll?: boolean;
  /** Reference BPM that scrolls at 1x; defaults to the map's dominant BPM. */
  baseBpm?: number;
};

// Rates stay strictly positive (invertibility) and bounded (a 10000 BPM
// teleport point must not produce absurd geometry).
const MIN_RATE = MIN_SV;
const MAX_RATE = 100;

// BPMs outside this range are gimmick points (stops, teleports), never the
// song's real tempo, so they are ignored when picking the reference BPM.
const MUSICAL_BPM_MIN = 30;
const MUSICAL_BPM_MAX = 400;

/** Red points reset SV; a green at the same timestamp wins (osu semantics). */
function svEventOrder(a: TimingPoint, b: TimingPoint): number {
  if (a.time !== b.time) return a.time - b.time;
  if (a.uninherited === b.uninherited) return 0;
  return a.uninherited ? -1 : 1;
}

/**
 * The BPM the map spends most of its time at - what osu! shows as "the" BPM
 * and what mappers set their scroll speed against. Gimmick points are filtered
 * out first so a map full of freezes still resolves to its musical tempo.
 */
export function dominantBpm(points: TimingPoint[]): number {
  const reds = points
    .filter((p) => p.uninherited && p.bpm > 0)
    .sort((a, b) => a.time - b.time);
  if (!reds.length) return 120;
  const durations = new Map<number, number>();
  for (let i = 0; i < reds.length; i++) {
    const bpm = reds[i].bpm;
    if (bpm < MUSICAL_BPM_MIN || bpm > MUSICAL_BPM_MAX) continue;
    const span = Math.max(0, (reds[i + 1]?.time ?? reds[i].time) - reds[i].time);
    durations.set(bpm, (durations.get(bpm) ?? 0) + span);
  }
  let best = 0;
  let bestSpan = -1;
  for (const [bpm, span] of durations) {
    if (span > bestSpan) {
      best = bpm;
      bestSpan = span;
    }
  }
  if (best) return best;
  // Every point is a gimmick (or all spans are zero): fall back to the first
  // musical BPM, else the first red.
  const musical = reds.find(
    (p) => p.bpm >= MUSICAL_BPM_MIN && p.bpm <= MUSICAL_BPM_MAX,
  );
  return musical?.bpm ?? reds[0].bpm;
}

export function buildSvMap(
  points: TimingPoint[],
  options: SvMapOptions = {},
): SvMap {
  const bpmScroll = options.bpmScroll === true;
  const base =
    bpmScroll
      ? options.baseBpm && options.baseBpm > 0
        ? options.baseBpm
        : dominantBpm(points)
      : 0;
  const cacheKey = bpmScroll ? `bpm:${base}` : "sv";
  let byMode = mapCache.get(points);
  const hit = byMode?.get(cacheKey);
  if (hit) return hit;

  const events = [...points].sort(svEventOrder);
  const segments: SvSegment[] = [];
  let sv = 1;
  let bpm = base || 120;
  let rate = 1;
  let warped = false;
  for (const p of events) {
    if (p.uninherited) {
      sv = 1;
      if (p.bpm > 0) bpm = p.bpm;
    } else {
      sv = clampSv(p.sv);
    }
    const next = Math.max(
      MIN_RATE,
      Math.min(MAX_RATE, bpmScroll ? (sv * bpm) / base : sv),
    );
    if (next !== 1) warped = true;
    const last = segments[segments.length - 1];
    if (last && last.time === p.time) {
      last.sv = next;
      rate = next;
      continue;
    }
    if (next === rate) continue;
    const pos = last
      ? last.pos + (p.time - last.time) * last.sv
      : p.time; // identity anchor: pos === t before the first rate change
    segments.push({ time: p.time, sv: next, pos });
    rate = next;
  }

  const map = warped && segments.length ? { segments } : IDENTITY;
  if (!byMode) {
    byMode = new Map();
    mapCache.set(points, byMode);
  }
  byMode.set(cacheKey, map);
  return map;
}

/**
 * The scroll rate in effect at `t`: the slope of the position map, which is
 * what actually moves notes. Unlike `effectiveSvAt` this includes the BPM
 * contribution when the map was built with `bpmScroll`, so previews can plot
 * the same thing the renderer scrolls.
 */
export function effectiveRateAt(map: SvMap, t: number): number {
  const { segments } = map;
  if (!segments.length) return 1;
  const i = segmentIndexForTime(segments, t);
  return i < 0 ? 1 : segments[i].sv;
}

/** True when the map would actually warp scroll under these options. */
export function hasSv(
  points: TimingPoint[],
  options: SvMapOptions = {},
): boolean {
  return buildSvMap(points, options).segments.length > 0;
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
