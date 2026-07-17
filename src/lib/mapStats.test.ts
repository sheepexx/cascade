import { describe, it, expect } from "vitest";
import type { ManiaNote } from "../types";
import { computeMapStats } from "./mapStats";

function n(id: string, column: number, startTime: number, endTime?: number): ManiaNote {
  return endTime === undefined
    ? { id, column, startTime }
    : { id, column, startTime, endTime };
}

describe("computeMapStats", () => {
  it("returns zeros for an empty map", () => {
    const s = computeMapStats([]);
    expect(s.notes).toBe(0);
    expect(s.peakNps).toBe(0);
    expect(s.avgNps).toBe(0);
  });

  it("counts rice, holds and LN ratio", () => {
    const s = computeMapStats([
      n("a", 0, 0),
      n("b", 1, 100, 400),
      n("c", 2, 200, 500),
    ]);
    expect(s.notes).toBe(3);
    expect(s.holds).toBe(2);
    expect(s.rice).toBe(1);
    expect(s.lnRatio).toBeCloseTo(2 / 3);
  });

  it("detects chords by shared start time", () => {
    const s = computeMapStats([
      n("a", 0, 100),
      n("b", 1, 100),
      n("c", 2, 100),
      n("d", 3, 500),
    ]);
    expect(s.chords).toBe(1); // one timestamp with 2+ notes
    expect(s.chordRatio).toBeCloseTo(3 / 4); // 3 of 4 notes are in a chord
  });

  it("computes peak NPS from the busiest one-second window", () => {
    // 4 notes within 300ms, then a gap, then 1 more.
    const s = computeMapStats([
      n("a", 0, 0),
      n("b", 1, 100),
      n("c", 2, 200),
      n("d", 3, 300),
      n("e", 0, 5000),
    ]);
    expect(s.peakNps).toBe(4);
  });

  it("computes average NPS over the mapped span", () => {
    // 3 notes across 2000ms span -> 1.5 nps
    const s = computeMapStats([n("a", 0, 0), n("b", 1, 1000), n("c", 2, 2000)]);
    expect(s.avgNps).toBeCloseTo(1.5);
    expect(s.spanMs).toBe(2000);
  });
});
