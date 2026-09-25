import { describe, it, expect } from "vitest";
import {
  maniaJudgementWindows,
  maniaReleaseWindows,
  judgeHitError,
  emptyJudgementCounts,
  RELEASE_WINDOW_SCALE,
  scaleWindows,
  clampPlaytestRate,
} from "./playtestJudgements";

describe("maniaJudgementWindows", () => {
  it("matches osu!lazer's ManiaHitWindows at OD 8", () => {
    const w = maniaJudgementWindows(8);
    expect(w).toEqual({
      max: 16.5,
      hit300: 40.5,
      hit200: 73.5,
      hit100: 103.5,
      hit50: 127.5,
      miss: 164.5,
    });
  });

  it("narrows MAX with OD, as lazer does", () => {
    expect(maniaJudgementWindows(0).max).toBe(22.5);
    expect(maniaJudgementWindows(5).max).toBe(19.5);
    expect(maniaJudgementWindows(10).max).toBe(13.5);
  });

  it("widens the song-time windows with the playback rate before flooring", () => {
    const w = maniaJudgementWindows(8, 1.5);
    expect(w.hit300).toBe(60.5);
    expect(w.miss).toBe(Math.floor(164 * 1.5) + 0.5);
    expect(maniaJudgementWindows(8, 0.75).hit300).toBe(30.5);
  });

  it("clamps OD into 0..10", () => {
    expect(maniaJudgementWindows(-5)).toEqual(maniaJudgementWindows(0));
    expect(maniaJudgementWindows(99)).toEqual(maniaJudgementWindows(10));
  });

  it("keeps windows strictly widening from MAX outward at every OD", () => {
    for (let od = 0; od <= 10; od++) {
      const w = maniaJudgementWindows(od);
      expect(w.max).toBeLessThan(w.hit300);
      expect(w.hit300).toBeLessThan(w.hit200);
      expect(w.hit200).toBeLessThan(w.hit100);
      expect(w.hit100).toBeLessThan(w.hit50);
      expect(w.hit50).toBeLessThan(w.miss);
    }
  });
});

describe("maniaReleaseWindows", () => {
  it("scales every tail window by 1.5x except MAX stays scaled too", () => {
    const od = 6;
    const hit = maniaJudgementWindows(od);
    const rel = maniaReleaseWindows(od);
    expect(rel.hit300).toBeCloseTo(hit.hit300 * RELEASE_WINDOW_SCALE);
    expect(rel.miss).toBeCloseTo(hit.miss * RELEASE_WINDOW_SCALE);
    expect(rel.max).toBeCloseTo(hit.max * RELEASE_WINDOW_SCALE);
  });
});

describe("judgeHitError", () => {
  const w = maniaJudgementWindows(8);

  it("is symmetric for early vs late errors", () => {
    expect(judgeHitError(10, w)).toBe(judgeHitError(-10, w));
  });

  it("classifies by absolute error magnitude", () => {
    expect(judgeHitError(0, w)).toBe("max");
    expect(judgeHitError(w.max, w)).toBe("max");
    expect(judgeHitError(w.max + 0.1, w)).toBe("300");
    expect(judgeHitError(w.hit300, w)).toBe("300");
    expect(judgeHitError(w.hit100, w)).toBe("100");
    expect(judgeHitError(w.hit50, w)).toBe("50");
    expect(judgeHitError(w.miss, w)).toBe("miss");
  });

  it("returns null when the press is outside the miss window", () => {
    expect(judgeHitError(w.miss + 1, w)).toBeNull();
  });
});

describe("emptyJudgementCounts", () => {
  it("starts every bucket at zero and is a fresh copy", () => {
    const a = emptyJudgementCounts();
    expect(a).toEqual({ max: 0, "300": 0, "200": 0, "100": 0, "50": 0, miss: 0 });
    a.max = 5;
    expect(emptyJudgementCounts().max).toBe(0);
  });
});

describe("scaleWindows / clampPlaytestRate", () => {
  it("widens windows proportionally with the rate", () => {
    const base = maniaJudgementWindows(8);
    const fast = scaleWindows(base, 1.5);
    expect(fast.max).toBeCloseTo(base.max * 1.5);
    expect(fast.miss).toBeCloseTo(base.miss * 1.5);
  });

  it("returns the same windows at 1x", () => {
    const base = maniaJudgementWindows(5);
    expect(scaleWindows(base, 1)).toBe(base);
  });

  it("clamps the rate to the supported range", () => {
    expect(clampPlaytestRate(0.1)).toBe(0.75);
    expect(clampPlaytestRate(5)).toBe(2);
    expect(clampPlaytestRate(NaN)).toBe(1);
    const base = maniaJudgementWindows(8);
    // out-of-range rate is clamped before scaling
    expect(scaleWindows(base, 10).max).toBeCloseTo(base.max * 2);
  });
});
