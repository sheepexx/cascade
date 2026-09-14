import { describe, it, expect } from "vitest";
import {
  createPlaybackClock,
  createSteadyClock,
  latencyCompensatedPosition,
  sourcePositionForAudible,
  type PlaybackClock,
} from "./playbackClock";

/**
 * 60Hz frames against a media element whose currentTime is a snapshot taken a
 * varying 0 to `staleMs` before each frame, as on a busy page. Reports the
 * largest frame-to-frame departure from an even pace.
 */
function runStale(
  makeClock: () => PlaybackClock,
  rate: number,
  staleMs: number,
  frames = 600,
) {
  const clock = makeClock();
  const frame = 1000 / 60;
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const deltas: number[] = [];
  let prev: number | null = null;
  for (let i = 0; i < frames; i++) {
    const wall = i * frame;
    const source = (Math.max(0, wall - random() * staleMs) * rate) / 1000;
    const out = clock.read(source, rate, wall);
    if (prev !== null) deltas.push(out - prev);
    prev = out;
  }
  const ideal = (frame * rate) / 1000;
  const warm = deltas.slice(120);
  return {
    maxDeviationMs: Math.max(...warm.map((d) => Math.abs(d - ideal))) * 1000,
    backwards: warm.filter((d) => d < 0).length,
  };
}

describe("createSteadyClock", () => {
  it("keeps an even pace when the element's readings arrive stale", () => {
    for (const rate of [0.25, 0.5, 0.75]) {
      const steady = runStale(createSteadyClock, rate, 12);
      expect(steady.backwards).toBe(0);
      expect(steady.maxDeviationMs).toBeLessThan(0.5);
      // The blending clock turns the same staleness into visible jitter.
      expect(steady.maxDeviationMs).toBeLessThan(
        runStale(createPlaybackClock, rate, 12).maxDeviationMs / 3,
      );
    }
  });

  it("catches up with an element that started late without moving backwards", () => {
    const clock = createSteadyClock();
    const frame = 1000 / 60;
    const rate = 0.75;
    let prev = -Infinity;
    let source = 0;
    let out = 0;
    for (let i = 0; i <= 180; i++) {
      const wall = i * frame;
      // The element only starts moving 90 ms after play.
      source = (Math.max(0, wall - 90) * rate) / 1000;
      out = clock.read(source, rate, wall);
      expect(out).toBeGreaterThanOrEqual(prev);
      prev = out;
    }
    expect(Math.abs(out - source) * 1000).toBeLessThan(1);
  });

  it("follows a gradual rate change", () => {
    const clock = createSteadyClock();
    const frame = 1000 / 60;
    let source = 0;
    let prev = -Infinity;
    for (let i = 0; i <= 60; i++) {
      const wall = i * frame;
      // 0.75 easing down to 0.5 over 340 ms, integrated into the position.
      const rate = 0.75 - 0.25 * Math.min(1, wall / 340);
      if (i > 0) source += (frame * rate) / 1000;
      const out = clock.read(source, rate, wall);
      expect(Math.abs(out - source) * 1000).toBeLessThan(1);
      expect(out).toBeGreaterThanOrEqual(prev);
      prev = out;
    }
  });

  it("snaps across a seek or a stall instead of gliding over it", () => {
    const clock = createSteadyClock();
    clock.read(10, 1, 0);
    clock.read(10.016, 1, 16);
    expect(clock.read(60, 1, 32)).toBeCloseTo(60, 6);
    expect(clock.read(5, 1, 48)).toBeCloseTo(5, 6);

    // The element stalls while buffering; once its position has fallen far
    // enough behind, the clock rejoins it.
    let out = 0;
    for (let wall = 64; wall <= 1000; wall += 16) out = clock.read(5.02, 1, wall);
    expect(out).toBeGreaterThan(5.02);
    expect(clock.read(5.021, 1, 1016)).toBeCloseTo(5.021, 6);
  });

  it("holds still once the element stops reporting progress", () => {
    const clock = createSteadyClock();
    const frame = 1000 / 60;
    let prev = -Infinity;
    let out = 0;
    for (let i = 0; i <= 120; i++) {
      const wall = i * frame;
      // Plays for 200 ms, then the element's position stops moving.
      const source = (Math.min(wall, 200) * 0.75) / 1000;
      out = clock.read(source, 0.75, wall);
      expect(out).toBeGreaterThanOrEqual(prev);
      prev = out;
    }
    // It ran on for at most the half second a reading may go unrefreshed.
    expect(out).toBeLessThanOrEqual((200 + 500 + frame) * 0.75 / 1000);
    expect(clock.read(0.15, 0.75, 121 * frame)).toBeCloseTo(out, 6);
    // Playback resumes from where the element stopped.
    expect(clock.read(0.151, 0.75, 122 * frame)).toBeCloseTo(0.151, 6);
  });

  it("re-anchors after reset and tolerates junk input", () => {
    const clock = createSteadyClock();
    clock.read(10, 1, 0);
    clock.reset();
    expect(clock.read(42, 1, 7)).toBeCloseTo(42, 6);
    expect(Number.isFinite(clock.read(NaN, 1, 14))).toBe(true);
    expect(Number.isFinite(clock.read(42.02, 0, 21))).toBe(true);
    expect(Number.isFinite(clock.read(42.03, -3, 28))).toBe(true);
  });
});

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
