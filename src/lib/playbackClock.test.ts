import { describe, it, expect } from "vitest";
import {
  createPlaybackClock,
  latencyCompensatedPosition,
  sourcePositionForAudible,
} from "./playbackClock";

/**
 * Drive a clock through `frames` of 144Hz playback against a backend that only
 * updates every `granularityMs`, and report how the smoothed output moves.
 */
function run(granularityMs: number, rate: number, frames = 400) {
  const clock = createPlaybackClock();
  const frame = 1000 / 144;
  const deltas: number[] = [];
  let prev: number | null = null;
  for (let i = 0; i < frames; i++) {
    const wall = i * frame;
    // Backend position in seconds, quantised to its update granularity.
    const source = (Math.floor(wall / granularityMs) * granularityMs * rate) / 1000;
    const out = clock.read(source, rate, wall);
    if (prev !== null) deltas.push(out - prev);
    prev = out;
  }
  const warm = deltas.slice(60);
  const mean = warm.reduce((a, b) => a + b, 0) / warm.length;
  return {
    frozen: warm.filter((d) => d === 0).length,
    total: warm.length,
    maxDeviationMs: Math.max(...warm.map((d) => Math.abs(d - mean))) * 1000,
    meanMs: mean * 1000,
    idealMs: (frame * rate) / 1000 * 1000,
  };
}

describe("createPlaybackClock", () => {
  it("never freezes on a coarse backend clock", () => {
    // The element path updates far more slowly than the frame rate; before
    // smoothing this froze on the large majority of frames.
    for (const granularity of [16, 32, 64]) {
      const r = run(granularity, 1);
      expect(r.frozen).toBe(0);
    }
  });

  it("advances at the true average rate", () => {
    for (const rate of [1, 1.2, 1.5, 2]) {
      const r = run(32, rate);
      expect(r.meanMs).toBeCloseTo(r.idealMs, 1);
    }
  });

  it("keeps jitter far below one frame even when very coarse", () => {
    const frameMs = 1000 / 144;
    for (const granularity of [16, 32, 64]) {
      const r = run(granularity, 1.2);
      expect(r.maxDeviationMs).toBeLessThan(frameMs);
    }
  });

  it("degrades gracefully as the rate rises", () => {
    // Higher rates cover more audio per frozen frame, so smoothing matters
    // more, not less.
    for (const rate of [1, 1.5, 2]) {
      expect(run(64, rate).frozen).toBe(0);
    }
  });

  it("snaps on a seek instead of gliding across it", () => {
    const clock = createPlaybackClock();
    clock.read(10, 1, 0);
    clock.read(10.01, 1, 7);
    // Forward jump well beyond clock coarseness.
    expect(clock.read(60, 1, 14)).toBeCloseTo(60, 6);
    // Backward seek.
    expect(clock.read(5, 1, 21)).toBeCloseTo(5, 6);
  });

  it("re-anchors after reset", () => {
    const clock = createPlaybackClock();
    clock.read(10, 1, 0);
    clock.reset();
    expect(clock.read(42, 1, 7)).toBeCloseTo(42, 6);
  });

  it("tolerates junk input", () => {
    const clock = createPlaybackClock();
    clock.read(5, 1, 0);
    expect(Number.isFinite(clock.read(NaN, 1, 7))).toBe(true);
    expect(Number.isFinite(clock.read(6, 0, 14))).toBe(true);
    expect(Number.isFinite(clock.read(7, -3, 21))).toBe(true);
  });

  it("stays monotonic while playing forward", () => {
    const clock = createPlaybackClock();
    const frame = 1000 / 144;
    let prev = -Infinity;
    for (let i = 0; i < 500; i++) {
      const wall = i * frame;
      const source = (Math.floor(wall / 32) * 32 * 1.2) / 1000;
      const out = clock.read(source, 1.2, wall);
      expect(out).toBeGreaterThanOrEqual(prev);
      prev = out;
    }
  });
});

describe("output latency position conversion", () => {
  it("keeps the displayed position identical across pause and resume", () => {
    const source = 12;
    const latency = 0.05;
    const rate = 1.5;
    const audible = latencyCompensatedPosition(source, latency, rate);
    const resumedSource = sourcePositionForAudible(audible, latency, rate);

    expect(audible).toBeCloseTo(11.925, 8);
    expect(resumedSource).toBeCloseTo(source, 8);
    expect(
      latencyCompensatedPosition(resumedSource, latency, rate),
    ).toBeCloseTo(audible, 8);
  });

  it("preserves map time when an audio source has a time scale", () => {
    const audioSeconds = latencyCompensatedPosition(12, 0.05, 1.5);
    expect((audioSeconds * 1000) / 1.2).toBeCloseTo(9_937.5, 8);
  });

  it("never reports a point before the playback region", () => {
    expect(latencyCompensatedPosition(5.02, 0.05, 1, 5)).toBe(5);
    expect(latencyCompensatedPosition(0.02, 0.05, 1)).toBe(0);
  });
});
