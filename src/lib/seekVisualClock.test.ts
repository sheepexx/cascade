import { describe, expect, it } from "vitest";
import {
  SCRUB_EASE_PER_SECOND,
  SEEK_EASE_PER_SECOND,
  SEEK_SETTLE_MS,
  createSeekVisualClock,
} from "./seekVisualClock";

const frames = (
  clock: ReturnType<typeof createSeekVisualClock>,
  liveAt: (now: number) => number,
  from: number,
  to: number,
  step = 16,
) => {
  const samples: { now: number; visual: number }[] = [];
  for (let now = from; now <= to; now += step) {
    samples.push({ now, visual: clock.read(liveAt(now), now) });
  }
  return samples;
};

describe("seek visual clock", () => {
  it("glides a paused click and converges on the target", () => {
    const clock = createSeekVisualClock();
    clock.begin(1_000, 180_000, "smooth", 0);

    expect(clock.read(180_000, 0)).toBe(1_000);
    const middle = clock.read(180_000, 80);
    expect(middle).toBeGreaterThan(1_000);
    expect(middle).toBeLessThan(180_000);
    expect(clock.read(180_000, 1_000)).toBe(180_000);
    expect(clock.active(1_000)).toBe(false);
  });

  it("keeps the first 50 ms visibly close to the starting position", () => {
    const clock = createSeekVisualClock();
    const from = 1_000;
    const target = 181_000;
    clock.begin(from, target, "smooth", 0);
    const visual = clock.read(target, 50);
    const progress = (visual - from) / (target - from);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(0.8);
  });

  it("moves monotonically toward the target every frame", () => {
    const clock = createSeekVisualClock();
    clock.begin(1_000, 100_000, "smooth", 0);
    const samples = frames(clock, () => 100_000, 0, 1_200);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].visual).toBeGreaterThanOrEqual(samples[i - 1].visual);
      expect(samples[i].visual).toBeLessThanOrEqual(100_000);
    }
    expect(samples[samples.length - 1].visual).toBe(100_000);
  });

  it("follows an advancing playback clock without a terminal snap", () => {
    const clock = createSeekVisualClock();
    clock.begin(1_000, 100_000, "smooth", 0);
    const live = (now: number) => 100_000 + now;

    const samples = frames(clock, live, 0, 1_200);
    let previousJump = Number.POSITIVE_INFINITY;
    for (let i = 1; i < samples.length; i++) {
      const jump = samples[i].visual - samples[i - 1].visual;
      expect(jump).toBeGreaterThan(0);
      expect(jump).toBeLessThanOrEqual(previousJump + SEEK_SETTLE_MS);
      previousJump = jump;
    }
    expect(samples[samples.length - 1].visual).toBe(live(1_200));
  });

  it("retargets a reversing drag continuously from the current visual time", () => {
    const clock = createSeekVisualClock();
    clock.begin(1_000, 50_000, "scrub", 0);
    const beforeReverse = clock.read(50_000, 40);

    clock.begin(beforeReverse, 20_000, "scrub", 40);
    expect(clock.read(20_000, 40)).toBeCloseTo(beforeReverse, 8);
    expect(clock.read(20_000, 640)).toBe(20_000);
  });

  it("tracks a streamed scrub without compounding lag", () => {
    const clock = createSeekVisualClock();
    let live = 0;
    for (let frame = 0; frame < 60; frame++) {
      const now = frame * 16;
      const visual = clock.read(live, now);
      const nextLive = live + 500;
      clock.begin(visual, nextLive, "scrub", now);
      live = nextLive;
    }
    const settled = clock.read(live, 60 * 16);
    expect(live - settled).toBeLessThan(1_500);
  });

  it("hugs the cursor more tightly while scrubbing than on a click", () => {
    const scrub = createSeekVisualClock();
    const smooth = createSeekVisualClock();
    scrub.begin(0, 10_000, "scrub", 0);
    smooth.begin(0, 10_000, "smooth", 0);
    expect(SCRUB_EASE_PER_SECOND).toBeGreaterThan(SEEK_EASE_PER_SECOND);
    expect(scrub.read(10_000, 48)).toBeGreaterThan(smooth.read(10_000, 48));
  });

  it("cancels motion for instant seeks and explicit cancellation", () => {
    const clock = createSeekVisualClock();
    clock.begin(0, 10_000, "smooth", 0);
    clock.begin(clock.read(10_000, 20), 20_000, "instant", 20);
    expect(clock.read(20_000, 20)).toBe(20_000);

    clock.begin(20_000, 30_000, "smooth", 30);
    clock.cancel();
    expect(clock.read(30_000, 31)).toBe(30_000);
  });

  it("freezes a transition at its current displayed position", () => {
    const clock = createSeekVisualClock();
    clock.begin(1_000, 100_000, "smooth", 0);
    const frozen = clock.freeze(100_000, 40);

    expect(frozen).toBeGreaterThan(1_000);
    expect(frozen).toBeLessThan(100_000);
    expect(clock.active(40)).toBe(false);
    expect(clock.read(frozen, 1_000)).toBe(frozen);
  });

  it("ignores sub-pixel offsets rather than easing them", () => {
    const clock = createSeekVisualClock();
    clock.begin(10_000, 10_000 + SEEK_SETTLE_MS / 2, "smooth", 0);
    expect(clock.active(0)).toBe(false);
    expect(clock.read(10_000, 0)).toBe(10_000);
  });

  it("lands exactly on the first frame after a long stall", () => {
    const clock = createSeekVisualClock();
    clock.begin(1_000, 180_000, "smooth", 0);
    expect(clock.read(180_000, 5_000)).toBe(180_000);
  });

  it("returns one shared visual sample to every canvas in the same frame", () => {
    const clock = createSeekVisualClock();
    clock.begin(1_000, 100_000, "smooth", 0);
    const first = clock.read(100_016, 16);
    expect(clock.read(100_020, 16)).toBe(first);
  });
});
