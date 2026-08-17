export type WaveformOverlayPeaks = {
  peaks: Float32Array;
  bucketMs: number;
};

function normalizedPeaks(peaks: Float32Array): Float32Array {
  const sorted = Float32Array.from(peaks).sort();
  const reference = sorted[Math.floor(sorted.length * 0.95)] || 1;
  if (reference <= 0) return peaks;
  for (let i = 0; i < peaks.length; i++) {
    peaks[i] = Math.min(1, peaks[i] / reference);
  }
  return peaks;
}

function bucketRms(
  samples: Float32Array,
  start: number,
  end: number,
  maxSamples: number,
): number {
  const length = end - start;
  if (length <= 0) return 0;
  const count = Math.min(length, Math.max(1, Math.floor(maxSamples)));
  const stride = length / count;
  let sumSq = 0;
  for (let i = 0; i < count; i++) {
    const index = Math.min(end - 1, Math.floor(start + (i + 0.5) * stride));
    const value = samples[index] ?? 0;
    sumSq += value * value;
  }
  return Math.sqrt(sumSq / count);
}

export function computeWaveformPeaks(
  samples: Float32Array,
  buckets: number,
  maxSamplesPerBucket = 512,
): Float32Array {
  const count = Math.max(1, Math.floor(buckets));
  const peaks = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * samples.length) / count);
    const end = Math.floor(((i + 1) * samples.length) / count);
    peaks[i] = bucketRms(samples, start, end, maxSamplesPerBucket);
  }
  return normalizedPeaks(peaks);
}

async function yieldToMain(): Promise<void> {
  const scheduler = (
    globalThis as typeof globalThis & {
      scheduler?: { yield?: () => Promise<void> };
    }
  ).scheduler;
  if (scheduler?.yield) {
    await scheduler.yield();
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export async function computeWaveformOverlay(
  samples: Float32Array,
  sampleRate: number,
  options: {
    targetBucketMs?: number;
    maxSamplesPerBucket?: number;
    yieldEveryBuckets?: number;
    shouldCancel?: () => boolean;
    yieldControl?: () => Promise<void>;
  } = {},
): Promise<WaveformOverlayPeaks | null> {
  const targetBucketMs = options.targetBucketMs ?? 2;
  const bucketSamples = Math.max(
    1,
    Math.round((sampleRate * targetBucketMs) / 1000),
  );
  const bucketMs = (bucketSamples / sampleRate) * 1000;
  const count = Math.ceil(samples.length / bucketSamples);
  const raw = new Float32Array(count);
  const yieldEvery = Math.max(1, options.yieldEveryBuckets ?? 4096);
  const maxSamples = options.maxSamplesPerBucket ?? 48;
  const shouldCancel = options.shouldCancel ?? (() => false);
  const yieldControl = options.yieldControl ?? yieldToMain;

  for (let i = 0; i < count; i++) {
    const start = i * bucketSamples;
    const end = Math.min(samples.length, start + bucketSamples);
    raw[i] = bucketRms(samples, start, end, maxSamples);
    if ((i + 1) % yieldEvery === 0) {
      await yieldControl();
      if (shouldCancel()) return null;
    }
  }

  const peaks = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const from = Math.max(0, i - 2);
    const to = Math.min(count - 1, i + 2);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += raw[j];
    peaks[i] = sum / (to - from + 1);
    if ((i + 1) % yieldEvery === 0) {
      await yieldControl();
      if (shouldCancel()) return null;
    }
  }

  const referenceSamples = new Float32Array(Math.min(count, 4096));
  for (let i = 0; i < referenceSamples.length; i++) {
    const index = Math.min(
      count - 1,
      Math.floor(((i + 0.5) * count) / referenceSamples.length),
    );
    referenceSamples[i] = peaks[index];
  }
  referenceSamples.sort();
  const reference =
    referenceSamples[Math.floor(referenceSamples.length * 0.95)] || 1;
  if (reference > 0) {
    for (let i = 0; i < peaks.length; i++) {
      peaks[i] = Math.min(1, peaks[i] / reference);
      if ((i + 1) % yieldEvery === 0) {
        await yieldControl();
        if (shouldCancel()) return null;
      }
    }
  }

  return shouldCancel() ? null : { peaks, bucketMs };
}
