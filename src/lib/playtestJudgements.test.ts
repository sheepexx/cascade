import { describe, it, expect } from "vitest";
import {
  maniaJudgementWindows,
  maniaReleaseWindows,
  judgeHitError,
  emptyJudgementCounts,
  RELEASE_WINDOW_SCALE,
} from "./playtestJudgements";

describe("maniaJudgementWindows", () => {
  it("matches the osu!mania stable formula at OD 8", () => {
    const w = maniaJudgementWindows(8);
    expect(w).toEqual({
      max: 16.5,
      hit300: 64 - 24,
      hit200: 97 - 24,
      hit100: 127 - 24,
      hit50: 151 - 24,
      miss: 188 - 24,
    });
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
