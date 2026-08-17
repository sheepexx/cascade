import { describe, expect, it } from "vitest";
import {
  SCRUB_GLIDE_MS,
  SEEK_GLIDE_MS,
  createSeekVisualClock,
} from "./seekVisualClock";

describe("seek visual clock", () => {
  it("glides a paused click and lands exactly at its fixed deadline", () => {
    const clock = createSeekVisualClock();
    clock.begin(1_000, 180_000, "smooth", 10);

    expect(clock.read(180_000, 10)).toBe(1_000);
    const middle = clock.read(180_000, 10 + SEEK_GLIDE_MS / 2);
    expect(middle).toBeGreaterThan(1_000);
    expect(middle).toBeLessThan(180_000);
    expect(clock.read(180_000, 10 + SEEK_GLIDE_MS)).toBe(180_000);
    expect(clock.active(10 + SEEK_GLIDE_MS)).toBe(false);
  });

  it("keeps the first 50 ms visibly close to the starting position", () => {
    const clock = createSeekVisualClock();
    const from = 1_000;
    const target = 181_000;
    clock.begin(from, target, "smooth", 0);
    const visual = clock.read(target, 50);
    const progress = (visual - from) / (target - from);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(0.4);
  });

  it("follows an advancing playback clock without a terminal snap", () => {
    const clock = createSeekVisualClock();
    clock.begin(1_000, 100_000, "smooth", 0);

    const middleLive = 100_000 + SEEK_GLIDE_MS / 2;
    const middle = clock.read(middleLive, SEEK_GLIDE_MS / 2);
    expect(middle).toBeGreaterThan(1_000);
    expect(middle).toBeLessThan(middleLive);

    const deadlineLive = 100_000 + SEEK_GLIDE_MS;
    expect(clock.read(deadlineLive, SEEK_GLIDE_MS)).toBe(deadlineLive);
    expect(clock.read(deadlineLive + 16, SEEK_GLIDE_MS + 16)).toBe(
      deadlineLive + 16,
    );
  });

  it("retargets a reversing drag continuously from the current visual time", () => {
    const clock = createSeekVisualClock();
    clock.begin(1_000, 50_000, "scrub", 0);
    const beforeReverse = clock.read(50_000, 40);

    clock.begin(beforeReverse, 20_000, "scrub", 40);
    expect(clock.read(20_000, 40)).toBeCloseTo(beforeReverse, 8);
    expect(clock.read(20_000, 40 + SCRUB_GLIDE_MS)).toBe(20_000);
  });

  it("uses a shorter bounded profile for active scrubbing", () => {
    const clock = createSeekVisualClock();
    clock.begin(0, 10_000, "scrub", 0);
    expect(clock.active(SCRUB_GLIDE_MS - 1)).toBe(true);
    expect(clock.read(10_000, SCRUB_GLIDE_MS)).toBe(10_000);
    expect(clock.active(SCRUB_GLIDE_MS)).toBe(false);
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

  it("lands exactly on the first frame after a long stall", () => {
    const clock = createSeekVisualClock();
    clock.begin(1_000, 180_000, "smooth", 0);
    expect(clock.read(180_000, SEEK_GLIDE_MS + 500)).toBe(180_000);
  });

  it("returns one shared visual sample to every canvas in the same frame", () => {
    const clock = createSeekVisualClock();
    clock.begin(1_000, 100_000, "smooth", 0);
    const first = clock.read(100_016, 16);
    expect(clock.read(100_020, 16)).toBe(first);
  });
});
