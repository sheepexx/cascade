import { describe, expect, it, vi } from "vitest";
import { computeWaveformOverlay, computeWaveformPeaks } from "./waveform";

describe("computeWaveformPeaks", () => {
  it("computes normalized RMS buckets", () => {
    const peaks = computeWaveformPeaks(
      new Float32Array([1, -1, 0.5, -0.5]),
      2,
      10,
    );
    expect(Array.from(peaks)).toEqual([1, 0.5]);
  });

  it("handles empty and short channels", () => {
    expect(Array.from(computeWaveformPeaks(new Float32Array(), 3))).toEqual([
      0, 0, 0,
    ]);
    expect(computeWaveformPeaks(new Float32Array([1]), 4)).toHaveLength(4);
  });

  it("bounds the number of sampled values per bucket", () => {
    const samples = new Float32Array(100);
    samples[0] = 1;
    expect(computeWaveformPeaks(samples, 1, 1)[0]).toBe(0);
    expect(computeWaveformPeaks(samples, 1, 100)[0]).toBe(1);
  });
});

describe("computeWaveformOverlay", () => {
  it("keeps the requested time resolution and yields between chunks", async () => {
    const yieldControl = vi.fn(async () => {});
    const result = await computeWaveformOverlay(
      new Float32Array(1000).fill(0.25),
      1000,
      { targetBucketMs: 10, yieldEveryBuckets: 20, yieldControl },
    );
    expect(result?.bucketMs).toBe(10);
    expect(result?.peaks).toHaveLength(100);
    expect(result?.peaks.every((value) => value === 1)).toBe(true);
    expect(yieldControl).toHaveBeenCalled();
  });

  it("stops work when the consumer is gone", async () => {
    let cancelled = false;
    const result = await computeWaveformOverlay(
      new Float32Array(1000).fill(0.25),
      1000,
      {
        yieldEveryBuckets: 10,
        shouldCancel: () => cancelled,
        yieldControl: async () => {
          cancelled = true;
        },
      },
    );
    expect(result).toBeNull();
  });
});
