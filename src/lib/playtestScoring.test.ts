import { describe, it, expect } from "vitest";
import type { HitResult, JudgementCounts } from "./playtestJudgements";
import {
  addJudgement,
  accuracyFromCounts,
  scoreFromResults,
} from "./playtestScoring";

function counts(partial: Partial<JudgementCounts>): JudgementCounts {
  return { max: 0, "300": 0, "200": 0, "100": 0, "50": 0, miss: 0, ...partial };
}

function result(judgement: HitResult["judgement"]): HitResult {
  return { noteId: "n", column: 0, time: 0, hitError: 0, judgement, part: "rice" };
}

describe("addJudgement", () => {
  it("increments one bucket immutably", () => {
    const base = counts({});
    const next = addJudgement(base, "300");
    expect(next["300"]).toBe(1);
    expect(base["300"]).toBe(0);
  });
});

describe("accuracyFromCounts", () => {
  it("returns 100% with no judgements yet", () => {
    expect(accuracyFromCounts(counts({}))).toBe(100);
  });

  it("treats MAX and 300 as a perfect 100%", () => {
    expect(accuracyFromCounts(counts({ max: 5 }))).toBe(100);
    expect(accuracyFromCounts(counts({ "300": 5 }))).toBe(100);
    expect(accuracyFromCounts(counts({ max: 3, "300": 2 }))).toBe(100);
  });

  it("drops to 0% on all misses", () => {
    expect(accuracyFromCounts(counts({ miss: 4 }))).toBe(0);
  });

  it("computes the weighted osu!mania accuracy", () => {
    expect(accuracyFromCounts(counts({ "300": 1, "100": 1 }))).toBeCloseTo(
      66.6667,
      3,
    );
  });
});

describe("scoreFromResults", () => {
  it("returns 0 for no results", () => {
    expect(scoreFromResults([])).toBe(0);
  });

  it("awards the full 1,000,000 for an all-MAX run", () => {
    expect(scoreFromResults([result("max"), result("max")])).toBe(1_000_000);
  });

  it("scores a 300 below MAX (320 weight)", () => {
    expect(scoreFromResults([result("300")])).toBe(937_500);
  });

  it("gives zero score for all misses", () => {
    expect(scoreFromResults([result("miss"), result("miss")])).toBe(0);
  });
});
