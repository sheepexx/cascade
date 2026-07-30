import type { ManiaNote } from "../types";

export type NpsSeries = {
  startMs: number;
  binMs: number;
  values: number[];
  peak: number;
};

export const DEFAULT_NPS_BIN_MS = 500;

const EMPTY_SERIES: NpsSeries = {
  startMs: 0,
  binMs: DEFAULT_NPS_BIN_MS,
  values: [],
  peak: 0,
};

export function computeNpsSeries(
  notes: ManiaNote[],
  binMs: number = DEFAULT_NPS_BIN_MS,
  durationMs?: number,
): NpsSeries {
  const width = Math.max(1, Math.floor(binMs));
  const spanned = durationMs !== undefined && durationMs > 0;
  if (notes.length === 0 && !spanned) return EMPTY_SERIES;

  let min = Infinity;
  let max = -Infinity;
  for (const n of notes) {
    if (n.startTime < min) min = n.startTime;
    if (n.startTime > max) max = n.startTime;
  }

  const startMs = spanned ? 0 : min;
  const spanBins = spanned ? Math.ceil((durationMs - startMs) / width) : 0;
  const noteBins = notes.length ? Math.floor((max - startMs) / width) + 1 : 0;
  const binCount = Math.max(1, spanBins, noteBins);
  const counts = new Array<number>(binCount).fill(0);

  for (const n of notes) {
    const index = Math.floor((n.startTime - startMs) / width);
    if (index < 0 || index >= binCount) continue;
    counts[index] += 1;
  }

  const perSecond = width / 1000;
  const values = counts.map((c) => c / perSecond);
  let peak = 0;
  for (const v of values) if (v > peak) peak = v;

  return { startMs, binMs: width, values, peak };
}

export function npsAt(series: NpsSeries, timeMs: number): number {
  if (series.values.length === 0) return 0;
  const index = Math.floor((timeMs - series.startMs) / series.binMs);
  if (index < 0 || index >= series.values.length) return 0;
  return series.values[index];
}

export function rollingNpsAt(
  series: NpsSeries,
  timeMs: number,
  windowMs = 2000,
): number {
  if (series.values.length === 0) return 0;
  const span = Math.max(series.binMs, windowMs);
  const from = timeMs - span;
  const firstIndex = Math.max(
    0,
    Math.floor((from - series.startMs) / series.binMs),
  );
  const lastIndex = Math.min(
    series.values.length - 1,
    Math.floor((timeMs - series.startMs) / series.binMs),
  );
  if (lastIndex < firstIndex) return 0;
  let sum = 0;
  for (let i = firstIndex; i <= lastIndex; i++) sum += series.values[i];
  return sum / (lastIndex - firstIndex + 1);
}

export function resampleNpsPeaks(series: NpsSeries, buckets: number): number[] {
  const count = series.values.length;
  if (count === 0 || buckets <= 0) return [];
  if (count <= buckets) return [...series.values];
  const out = new Array<number>(buckets).fill(0);
  for (let i = 0; i < count; i++) {
    const slot = Math.min(buckets - 1, Math.floor((i / count) * buckets));
    if (series.values[i] > out[slot]) out[slot] = series.values[i];
  }
  return out;
}
