import corpusData from "./patternCorpus.json";
import { WINDOW_FEATURE_KEYS, type PatternWindow, type WindowFeatureKey } from "./patternQuality";

export type CorpusBucket = {
  keyCount: number;
  band: number;
  npsMin: number;
  npsMax: number | null;
  maps: number;
  exactMaps: number;
  windows: number;
  starMin: number;
  starMax: number;
  windowQuantiles: Record<WindowFeatureKey, number[]>;
  extremeQuantiles: Record<WindowFeatureKey, number[]>;
};

export type PatternCorpus = {
  version: number;
  generatedAt: string;
  quantiles: number[];
  shareQuantiles: number[];
  source: {
    difficulties: number;
    mapsets: number;
    mappers: number;
    rankedFrom: string;
    rankedTo: string;
  };
  buckets: CorpusBucket[];
};

export const patternCorpus = corpusData as PatternCorpus;

export const CORPUS_FEATURE_LABELS: Record<WindowFeatureKey, string> = {
  nps: "density spikes",
  jack: "jack density",
  hand: "hand imbalance",
  anchor: "anchor use",
  ln: "long-note density",
  chord: "chord density",
};

const FLAGGED_FEATURES: WindowFeatureKey[] = ["nps", "jack", "hand", "anchor"];

const FLAG_PERCENTILE = 0.9;
const MIN_FLAGGED_WINDOWS = 3;
const MIN_SHARE_MARGIN = 0.02;
const MIN_COMPARABLE_WINDOWS = 8;
const BRIDGE_MS = 2000;

export type CorpusSpan = { start: number; end: number; peak: number; windows: number };

export type CorpusOutlier = {
  key: WindowFeatureKey;
  label: string;
  share: number;
  typicalShare: number;
  percentile: number;
  threshold: number;
  spans: CorpusSpan[];
};

export type CorpusComparison = {
  bucket: CorpusBucket | null;
  outliers: CorpusOutlier[];
  profile: { key: WindowFeatureKey; label: string; percentile: number }[];
};

export const EMPTY_COMPARISON: CorpusComparison = { bucket: null, outliers: [], profile: [] };

function quantileOf(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function percentileIn(value: number, values: number[], quantiles: number[]): number {
  if (values.length === 0 || quantiles.length === 0) return 0;
  if (value <= values[0]) return quantiles[0];
  for (let i = 1; i < values.length; i++) {
    if (value <= values[i]) {
      const span = values[i] - values[i - 1];
      const t = span > 0 ? (value - values[i - 1]) / span : 1;
      return quantiles[i - 1] + (quantiles[i] - quantiles[i - 1]) * t;
    }
  }
  return quantiles[quantiles.length - 1];
}

export function findCorpusBucket(keyCount: number, medianNps: number): CorpusBucket | null {
  for (const bucket of patternCorpus.buckets) {
    if (bucket.keyCount !== keyCount) continue;
    if (medianNps < bucket.npsMin) continue;
    if (bucket.npsMax !== null && medianNps >= bucket.npsMax) continue;
    return bucket;
  }
  return null;
}

function mergeWindows(windows: PatternWindow[], key: WindowFeatureKey): CorpusSpan[] {
  const spans: CorpusSpan[] = [];
  for (const w of windows) {
    const last = spans[spans.length - 1];
    if (last && w.time <= last.end + Math.max(BRIDGE_MS, w.span * 0.75)) {
      last.end = Math.max(last.end, w.time + w.span);
      last.peak = Math.max(last.peak, w[key]);
      last.windows += 1;
    } else spans.push({ start: w.time, end: w.time + w.span, peak: w[key], windows: 1 });
  }
  return spans;
}

export function compareToCorpus(keyCount: number, windows: PatternWindow[]): CorpusComparison {
  if (windows.length < MIN_COMPARABLE_WINDOWS) return EMPTY_COMPARISON;
  const medianNps = quantileOf(windows.map((w) => w.nps).sort((a, b) => a - b), 0.5);
  const bucket = findCorpusBucket(keyCount, medianNps);
  if (!bucket) return EMPTY_COMPARISON;

  const outliers: CorpusOutlier[] = [];
  const profile: { key: WindowFeatureKey; label: string; percentile: number }[] = [];
  for (const key of WINDOW_FEATURE_KEYS) {
    const windowValues = bucket.windowQuantiles[key];
    const shareValues = bucket.extremeQuantiles[key];
    if (!windowValues || !shareValues) continue;
    const threshold = windowValues[windowValues.length - 2] ?? windowValues[windowValues.length - 1];
    const above = windows.filter((w) => w[key] > threshold);
    const share = above.length / windows.length;
    const percentile = percentileIn(share, shareValues, patternCorpus.shareQuantiles);
    profile.push({ key, label: CORPUS_FEATURE_LABELS[key], percentile });
    if (!FLAGGED_FEATURES.includes(key)) continue;
    if (above.length < MIN_FLAGGED_WINDOWS) continue;
    if (percentile < FLAG_PERCENTILE) continue;
    if (share <= shareValues[0] + MIN_SHARE_MARGIN) continue;
    outliers.push({
      key,
      label: CORPUS_FEATURE_LABELS[key],
      share,
      typicalShare: shareValues[0],
      percentile,
      threshold,
      spans: mergeWindows(above, key),
    });
  }
  outliers.sort((a, b) => b.percentile - a.percentile || b.share - a.share);
  return { bucket, outliers, profile };
}

export function formatCorpusValue(key: WindowFeatureKey, value: number): string {
  if (key === "nps") return `${value.toFixed(1)} nps`;
  return `${Math.round(value * 100)}%`;
}

export function describeCorpusBucket(bucket: CorpusBucket): string {
  const range = bucket.npsMax === null ? `${bucket.npsMin}+ nps` : `${bucket.npsMin}-${bucket.npsMax} nps`;
  return `${bucket.maps} ranked ${bucket.keyCount}K maps at ${range} (${bucket.starMin}-${bucket.starMax} stars)`;
}
