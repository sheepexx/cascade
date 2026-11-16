import type { ManiaNote } from "../types";

export type NpsSeries = {
  startMs: number;
  binMs: number;
  values: number[];
  peak: number;
};

export const DEFAULT_NPS_BIN_MS = 500;

/**
 * How widely each note is spread when counting notes per second: the
 * standard deviation, in ms, of the bell curve a note adds. Dropping notes
 * into fixed bins instead makes an even rhythm read uneven, because when the
 * gap between notes doesn't divide the bin, neighbouring bins catch one note
 * more or less: a steady stream draws as two alternating heights and a 1/1
 * section as bars with holes. A curve this wide reads level for any rhythm
 * with notes up to a second apart.
 */
export const NPS_SMOOTHING_MS = 500;

const EMPTY_SERIES: NpsSeries = {
  startMs: 0,
  binMs: DEFAULT_NPS_BIN_MS,
  values: [],
  peak: 0,
};

/**
 * Notes per second at the middle of `count` steps of `stepMs` from
 * `startMs`, each note counted as a bell curve rather than a hit in one bin
 * (see NPS_SMOOTHING_MS). The curve is never narrower than about half a step,
 * so a sample can't fall between two notes. Values under a twentieth of one
 * lone note are 0, so the curve's tail doesn't draw slivers into a break.
 */
export function noteDensity(
  times: readonly number[],
  startMs: number,
  stepMs: number,
  count: number,
  smoothingMs = Math.max(NPS_SMOOTHING_MS, stepMs * 0.6),
): number[] {
  if (count <= 0 || !(stepMs > 0)) return [];
  const sigma = Math.max(1, smoothingMs);
  // Notes are counted on a fine grid first, at most an eighth of the curve's
  // width apart, so the work grows with the note count plus the samples
  // rather than with their product.
  const perStep = Math.max(1, Math.ceil((8 * stepMs) / sigma));
  const cell = stepMs / perStep;
  const radius = Math.ceil((3 * sigma) / cell);
  // Cell 0 sits `radius` cells before the first sample, so sample j is the
  // middle of the kernel at cell j * perStep + radius.
  const origin = startMs + stepMs / 2 - radius * cell;
  const cells = (count - 1) * perStep + 2 * radius + 1;
  const counts = new Float64Array(cells);
  for (const time of times) {
    const index = Math.round((time - origin) / cell);
    if (index >= 0 && index < cells) counts[index] += 1;
  }
  const scale = 1000 / (sigma * Math.sqrt(2 * Math.PI));
  const kernel = new Float64Array(2 * radius + 1);
  for (let k = -radius; k <= radius; k++) {
    const distance = k * cell;
    kernel[k + radius] = Math.exp(-(distance * distance) / (2 * sigma * sigma)) * scale;
  }
  const floor = scale / 20;
  const values = new Array<number>(count);
  for (let j = 0; j < count; j++) {
    const base = j * perStep;
    let sum = 0;
    for (let k = 0; k < kernel.length; k++) {
      const c = counts[base + k];
      if (c) sum += c * kernel[k];
    }
    values[j] = sum < floor ? 0 : sum;
  }
  return values;
}

/**
 * Notes per second through the song in steps of `binMs`, counting each
 * note's head. Spans 0 to `durationMs` when a duration is given, otherwise
 * the first note to the last.
 */
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
  const times = new Array<number>(notes.length);
  for (let i = 0; i < notes.length; i++) {
    const time = notes[i].startTime;
    times[i] = time;
    if (time < min) min = time;
    if (time > max) max = time;
  }

  const startMs = spanned ? 0 : min;
  const spanBins = spanned ? Math.ceil((durationMs - startMs) / width) : 0;
  const noteBins = notes.length ? Math.floor((max - startMs) / width) + 1 : 0;
  const binCount = Math.max(1, spanBins, noteBins);
  const values = noteDensity(times, startMs, width, binCount);
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
