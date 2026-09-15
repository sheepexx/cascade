import { describe, expect, it } from "vitest";
import {
  HANDOFF_GIVE_UP_MS,
  HANDOFF_LOCK_FRAMES,
  HANDOFF_LOCK_SECONDS,
  handoffCatchUpRate,
  learnHandoffStartup,
} from "./pitchHandoff";

describe("handoffCatchUpRate", () => {
  it("slows an element that is ahead and speeds up one that is behind", () => {
    expect(handoffCatchUpRate(0.01, 0.5)).toBeLessThan(0.5);
    expect(handoffCatchUpRate(-0.01, 0.5)).toBeGreaterThan(0.5);
    expect(handoffCatchUpRate(0, 0.5)).toBe(0.5);
  });

  it("never runs the element more than a quarter fast or slow", () => {
    expect(handoffCatchUpRate(5, 0.25)).toBeCloseTo(0.25 * 0.75, 9);
    expect(handoffCatchUpRate(-5, 0.25)).toBeCloseTo(0.25 * 1.25, 9);
    expect(handoffCatchUpRate(Number.NaN, 0.25)).toBe(0.25);
  });

  it("lines the engines up well before the handoff gives up", () => {
    const frame = 1 / 60;
    for (const rate of [0.25, 0.5, 0.75]) {
      // The element started this many wall seconds early (+) or late (-).
      for (const startupError of [-0.15, -0.05, 0.05, 0.15]) {
        let buffer = 10;
        let element = buffer + startupError * rate;
        let lined = 0;
        let seconds = 0;
        while (lined < HANDOFF_LOCK_FRAMES && seconds < 5) {
          const gap = element - buffer;
          lined = Math.abs(gap) <= HANDOFF_LOCK_SECONDS ? lined + 1 : 0;
          element += frame * handoffCatchUpRate(gap, rate);
          buffer += frame * rate;
          seconds += frame;
        }
        expect(seconds * 1000).toBeLessThan(HANDOFF_GIVE_UP_MS / 2);
      }
    }
  });
});

describe("learnHandoffStartup", () => {
  it("moves the guess to how long the element really took to start", () => {
    // Aimed 0.15 s ahead at half speed, it took 0.25 s: 0.05 media s behind.
    expect(learnHandoffStartup(0.15, -0.05, 0.5)).toBeCloseTo(0.25, 9);
    expect(learnHandoffStartup(0.15, 0.025, 0.5)).toBeCloseTo(0.1, 9);
  });

  it("stays within reason on junk", () => {
    expect(learnHandoffStartup(0.15, -10, 0.5)).toBe(1);
    expect(learnHandoffStartup(0.15, 10, 0.5)).toBe(0.02);
    expect(learnHandoffStartup(0.15, Number.NaN, 0.5)).toBe(0.15);
    expect(learnHandoffStartup(0.15, 0.01, 0)).toBe(0.15);
  });
});
