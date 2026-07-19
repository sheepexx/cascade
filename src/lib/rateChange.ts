import { uid, type Difficulty, type ManiaNote, type TimingPoint } from "../types";
import { remapBookmarkLabels } from "./bookmarks";
import { beatLength, redPoints } from "./timing";

export const RATE_MIN = 0.5;
export const RATE_MAX = 2;
export const RATE_STEP = 0.05;
export const RATE_PRESETS: readonly number[] = [
  0.75, 0.9, 1, 1.1, 1.2, 1.25, 1.5,
];

const RATE_EPSILON = 1e-6;

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.max(RATE_MIN, Math.min(RATE_MAX, rate));
}

/**
 * Kills binary float noise so values like 1.0500000000000003 never reach the
 * beatmap model. Deliberately finer than the slider's 0.05 step: entering a
 * target BPM produces whatever rate hits it exactly.
 */
export function quantizeRate(rate: number): number {
  return Math.round(clampRate(rate) * 10000) / 10000;
}

export function isNeutralRate(rate: number): boolean {
  return Math.abs(rate - 1) < RATE_EPSILON;
}

/** Parses free-form numeric input ("1.2", "1.2x", "120%"). */
export function parseRateInput(raw: string): number | null {
  const text = raw.trim().replace(/x$/i, "").trim();
  if (!text) return null;
  const percent = text.endsWith("%");
  const n = Number(percent ? text.slice(0, -1) : text);
  if (!Number.isFinite(n)) return null;
  const rate = percent ? n / 100 : n;
  if (rate < RATE_MIN - RATE_EPSILON || rate > RATE_MAX + RATE_EPSILON) {
    return null;
  }
  return quantizeRate(rate);
}

/** Compact form used in difficulty names: 1.2 -> "1.2", 1.25 -> "1.25". */
export function formatRate(rate: number): string {
  return String(quantizeRate(rate));
}

/** Padded form used in the panel readout: 1.2 -> "1.20", 0.6318 -> "0.6318". */
export function formatRateDisplay(rate: number): string {
  const q = quantizeRate(rate);
  const padded = q.toFixed(2);
  return Number(padded) === q ? padded : String(q);
}

/** Parses a BPM field. Returns null for anything unusable. */
export function parseBpmInput(raw: string): number | null {
  const text = raw.trim().replace(/bpm$/i, "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "3:30" — song-length style, distinct from timing.formatTime's ms precision. */
export function formatSongLength(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** The rate a difficulty's times are written against. */
export function difficultyRate(
  difficulty: Pick<Difficulty, "audioRate"> | null | undefined,
): number {
  const rate = difficulty?.audioRate;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return 1;
  return rate;
}

/** True when this difficulty's times are written against a non-1 rate. */
export function isRateDifficulty(
  difficulty: Pick<Difficulty, "audioRate"> | null | undefined,
): boolean {
  return !isNeutralRate(difficultyRate(difficulty));
}

/** Map time (what the editor shows) -> audio time (position in the source file). */
export function toAudioTime(mapMs: number, rate: number): number {
  return mapMs * rate;
}

/** Audio time (position in the source file) -> map time (what the editor shows). */
export function toMapTime(audioMs: number, rate: number): number {
  return audioMs / rate;
}

/** Length of the rate-adjusted song. */
export function scaledDuration(durationMs: number, rate: number): number {
  return durationMs / rate;
}

/**
 * Core transform, matching osu!'s DT/HT: a 1.2x map is played 1.2x faster, so
 * everything happens 1/1.2 as late. Kept unrounded — callers round only where
 * the model stores integer milliseconds.
 */
export function scaleTime(timeMs: number, rate: number): number {
  return timeMs / rate;
}

const scaleMs = (timeMs: number, rate: number): number =>
  Math.round(scaleTime(timeMs, rate));

const scaleOptionalMs = (
  timeMs: number | undefined,
  rate: number,
): number | undefined => (timeMs === undefined ? undefined : scaleMs(timeMs, rate));

export function applyRateToNotes(
  notes: readonly ManiaNote[],
  rate: number,
): ManiaNote[] {
  return notes.map((n) => {
    const next: ManiaNote = { ...n, id: uid("n"), startTime: scaleMs(n.startTime, rate) };
    if (n.endTime !== undefined) next.endTime = scaleMs(n.endTime, rate);
    return next;
  });
}

/**
 * Times compress by 1/rate and BPM grows by rate. SV is a dimensionless
 * multiplier and meter is a bar count, so both are copied untouched — the
 * faster scroll speed falls out of the shortened beat length, exactly as it
 * does under DT in osu!.
 */
export function applyRateToTimingPoints(
  points: readonly TimingPoint[],
  rate: number,
): TimingPoint[] {
  return points.map((p) => ({
    ...p,
    id: uid("tp"),
    time: scaleMs(p.time, rate),
    bpm: p.bpm * rate,
  }));
}

export type RateNameOptions = {
  onlyRateAsName?: boolean;
  /** Pre-formatted BPM to append, e.g. "361" or "120-240". Omit for none. */
  bpmLabel?: string | null;
};

export function rateDifficultyName(
  baseName: string,
  rate: number,
  { onlyRateAsName = false, bpmLabel }: RateNameOptions = {},
): string {
  const suffix = bpmLabel
    ? `x${formatRate(rate)} (${bpmLabel} BPM)`
    : `x${formatRate(rate)}`;
  if (onlyRateAsName) return suffix;
  const base = baseName.trim();
  return base ? `${base} ${suffix}` : suffix;
}

/**
 * The BPM a map reads as: the one governing the most playing time, so a short
 * intro or outro section can't hijack the label. Falls back to the first red
 * point when there's nothing to weigh sections against.
 */
export function dominantBpm(
  points: TimingPoint[],
  durationMs?: number | null,
): number {
  const reds = redPoints(points);
  if (!reds.length) return 0;
  if (reds.length === 1) return reds[0].bpm;

  const last = reds[reds.length - 1];
  const end =
    typeof durationMs === "number" && durationMs > last.time
      ? durationMs
      : last.time + beatLength(last.bpm) * 4;

  const spans = new Map<number, number>();
  for (let i = 0; i < reds.length; i++) {
    const stop = i + 1 < reds.length ? reds[i + 1].time : end;
    const span = Math.max(0, stop - reds[i].time);
    spans.set(reds[i].bpm, (spans.get(reds[i].bpm) ?? 0) + span);
  }

  let best = reds[0].bpm;
  let bestSpan = -1;
  for (const [bpm, span] of spans) {
    if (span > bestSpan) {
      bestSpan = span;
      best = bpm;
    }
  }
  return best;
}

/** The rate that turns `baseBpm` into `targetBpm`, or null if out of range. */
export function rateForBpm(baseBpm: number, targetBpm: number): number | null {
  if (!Number.isFinite(baseBpm) || baseBpm <= 0) return null;
  if (!Number.isFinite(targetBpm) || targetBpm <= 0) return null;
  const rate = targetBpm / baseBpm;
  if (rate < RATE_MIN - RATE_EPSILON || rate > RATE_MAX + RATE_EPSILON) return null;
  return quantizeRate(rate);
}

/** BPM (or BPM range) a map ends up at, formatted for a difficulty name. */
export function scaledBpmLabel(points: TimingPoint[], rate: number): string {
  const range = bpmRange(points);
  if (!range) return "";
  const lo = Math.round(range.min * rate);
  const hi = Math.round(range.max * rate);
  return range.varies && lo !== hi ? `${lo}-${hi}` : String(lo);
}

/** "Insane x1.2" -> "Insane x1.2 (2)" when the name is already taken. */
export function uniqueDifficultyName(
  name: string,
  existingNames: Iterable<string>,
): string {
  const taken = new Set(existingNames);
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} (${n})`)) n += 1;
  return `${name} (${n})`;
}

export type RateDifficultyOptions = {
  rate: number;
  onlyRateAsName?: boolean;
  /** Append the resulting BPM to the name. */
  showBpm?: boolean;
  /** Time-stretch instead of resampling, keeping the original pitch. */
  preservePitch?: boolean;
  existingNames?: Iterable<string>;
};

/** What the panel decides; the caller supplies the source and existing names. */
export type RateCreateOptions = Omit<RateDifficultyOptions, "existingNames">;

/**
 * Builds a rate-shifted copy of `source`. The source is never mutated: notes,
 * timing points, bookmarks and metadata are all cloned, and every gameplay
 * value (OD, HP, key count, and anything else osu! reads as difficulty) is
 * copied through verbatim.
 */
export function createRateDifficulty(
  source: Difficulty,
  {
    rate: requestedRate,
    onlyRateAsName = false,
    showBpm = true,
    preservePitch = false,
    existingNames = [],
  }: RateDifficultyOptions,
): Difficulty {
  const rate = quantizeRate(requestedRate);
  const name = uniqueDifficultyName(
    rateDifficultyName(source.name, rate, {
      onlyRateAsName,
      bpmLabel: showBpm ? scaledBpmLabel(source.timingPoints, rate) : null,
    }),
    existingNames,
  );

  // Rating off an already-rated difficulty compounds: its times are relative to
  // audioRate, so the new copy plays the same source file at the product.
  const composedRate =
    Math.round(difficultyRate(source) * rate * 10000) / 10000;

  return {
    ...source,
    id: uid("diff"),
    name,
    audioRate: composedRate,
    preservePitch: preservePitch ? true : undefined,
    // A new difficulty is unsubmitted; sharing the source's id would collide
    // with it inside the beatmapset.
    beatmapId: undefined,
    notes: applyRateToNotes(source.notes, rate),
    timingPoints: applyRateToTimingPoints(source.timingPoints, rate),
    previewTime:
      source.previewTime >= 0 ? scaleMs(source.previewTime, rate) : source.previewTime,
    bookmarks: source.bookmarks
      ? source.bookmarks.map((b) => scaleMs(b, rate))
      : undefined,
    bookmarkLabels: remapBookmarkLabels(
      source.bookmarks,
      source.bookmarkLabels,
      (ms) => scaleMs(ms, rate),
    ),
    trimStartMs: scaleOptionalMs(source.trimStartMs, rate),
    trimEndMs: scaleOptionalMs(source.trimEndMs, rate),
    fadeInMs: scaleOptionalMs(source.fadeInMs, rate),
    fadeOutMs: scaleOptionalMs(source.fadeOutMs, rate),
    videoOffsetMs: scaleOptionalMs(source.videoOffsetMs, rate),
    smMeta: source.smMeta
      ? {
          ...source.smMeta,
          sampleLength: scaleOptionalMs(source.smMeta.sampleLength, rate),
        }
      : source.smMeta,
  };
}

export type RateBpmRange = {
  min: number;
  max: number;
  varies: boolean;
};

export function bpmRange(points: TimingPoint[]): RateBpmRange | null {
  const reds = redPoints(points);
  if (!reds.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const p of reds) {
    if (p.bpm < min) min = p.bpm;
    if (p.bpm > max) max = p.bpm;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max, varies: Math.abs(max - min) > 0.01 };
}

export function formatBpmRange(range: RateBpmRange | null): string {
  if (!range) return "—";
  const show = (bpm: number) => String(Math.round(bpm * 100) / 100);
  return range.varies ? `${show(range.min)}–${show(range.max)}` : show(range.min);
}

export type RatePreview = {
  rate: number;
  name: string;
  bpmBefore: string;
  bpmAfter: string;
  lengthBefore: string | null;
  lengthAfter: string | null;
  /** BPM the editable field shows: the dominant section, scaled. */
  targetBpm: number;
  baseBpm: number;
};

/** Everything the panel needs to describe the pending change, UI-free. */
export function describeRateChange(
  source: Difficulty,
  options: RateDifficultyOptions & { durationMs?: number | null },
): RatePreview {
  const rate = quantizeRate(options.rate);
  const before = bpmRange(source.timingPoints);
  const after = before
    ? { min: before.min * rate, max: before.max * rate, varies: before.varies }
    : null;
  const duration = options.durationMs;
  const hasDuration = typeof duration === "number" && duration > 0;
  const baseBpm = dominantBpm(source.timingPoints, duration);

  return {
    rate,
    name: uniqueDifficultyName(
      rateDifficultyName(source.name, rate, {
        onlyRateAsName: options.onlyRateAsName,
        bpmLabel:
          (options.showBpm ?? true)
            ? scaledBpmLabel(source.timingPoints, rate)
            : null,
      }),
      options.existingNames ?? [],
    ),
    bpmBefore: formatBpmRange(before),
    bpmAfter: formatBpmRange(after),
    lengthBefore: hasDuration ? formatSongLength(duration) : null,
    lengthAfter: hasDuration ? formatSongLength(scaledDuration(duration, rate)) : null,
    baseBpm,
    targetBpm: baseBpm * rate,
  };
}
