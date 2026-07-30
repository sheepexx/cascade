import { describe, expect, it } from "vitest";
import type { ManiaNote } from "../types";
import {
  computeNpsSeries,
  npsAt,
  resampleNpsPeaks,
  rollingNpsAt,
} from "./nps";

function note(id: string, column: number, startTime: number, endTime?: number): ManiaNote {
  return { id, column, startTime, ...(endTime === undefined ? {} : { endTime }) };
}

describe("computeNpsSeries", () => {
  it("returns an empty series for no notes", () => {
    const series = computeNpsSeries([]);
    expect(series.values).toEqual([]);
    expect(series.peak).toBe(0);
  });

  it("converts a bin count into notes per second", () => {
    const notes = [
      note("a", 0, 0),
      note("b", 1, 100),
      note("c", 2, 200),
      note("d", 3, 300),
    ];
    const series = computeNpsSeries(notes, 500);
    expect(series.values[0]).toBe(8);
    expect(series.peak).toBe(8);
  });

  it("separates notes into their own bins", () => {
    const notes = [note("a", 0, 0), note("b", 0, 1200)];
    const series = computeNpsSeries(notes, 500);
    expect(series.values).toHaveLength(3);
    expect(series.values[0]).toBe(2);
    expect(series.values[1]).toBe(0);
    expect(series.values[2]).toBe(2);
  });

  it("counts a long note once, at its head", () => {
    const series = computeNpsSeries([note("ln", 0, 0, 5000)], 500);
    expect(series.values[0]).toBe(2);
    expect(series.values.slice(1).every((v) => v === 0)).toBe(true);
  });

  it("starts at the first note when no duration is given", () => {
    const series = computeNpsSeries([note("a", 0, 10_000)], 500);
    expect(series.startMs).toBe(10_000);
    expect(series.values).toHaveLength(1);
  });

  it("spans the whole song when a duration is given", () => {
    const series = computeNpsSeries([note("a", 0, 10_000)], 1000, 20_000);
    expect(series.startMs).toBe(0);
    expect(series.values).toHaveLength(20);
    expect(series.values[10]).toBe(1);
  });

  it("extends past the duration if a note sits beyond it", () => {
    const series = computeNpsSeries([note("a", 0, 30_000)], 1000, 10_000);
    expect(series.values.length).toBeGreaterThan(30);
  });

  it("pads an empty chart across the duration", () => {
    const series = computeNpsSeries([], 1000, 5000);
    expect(series.values).toHaveLength(5);
    expect(series.peak).toBe(0);
  });

  it("guards against a zero or negative bin width", () => {
    expect(computeNpsSeries([note("a", 0, 0)], 0).binMs).toBe(1);
    expect(computeNpsSeries([note("a", 0, 0)], -5).binMs).toBe(1);
  });
});

describe("npsAt", () => {
  const series = computeNpsSeries(
    [note("a", 0, 0), note("b", 1, 100), note("c", 0, 2000)],
    500,
  );

  it("reads the bin containing the time", () => {
    expect(npsAt(series, 0)).toBe(4);
    expect(npsAt(series, 499)).toBe(4);
    expect(npsAt(series, 2000)).toBe(2);
  });

  it("reads zero in a gap", () => {
    expect(npsAt(series, 1000)).toBe(0);
  });

  it("reads zero outside the series", () => {
    expect(npsAt(series, -1)).toBe(0);
    expect(npsAt(series, 999_999)).toBe(0);
  });
});

describe("rollingNpsAt", () => {
  it("averages the bins in the trailing window", () => {
    const notes = [
      note("a", 0, 0),
      note("b", 1, 500),
      note("c", 2, 1000),
      note("d", 3, 1500),
    ];
    const series = computeNpsSeries(notes, 500);
    expect(rollingNpsAt(series, 1500, 2000)).toBe(2);
  });

  it("smooths a spike next to a gap", () => {
    const notes = [note("a", 0, 0), note("b", 1, 0), note("c", 2, 0)];
    const series = computeNpsSeries(notes, 500, 2000);
    expect(npsAt(series, 0)).toBe(6);
    expect(rollingNpsAt(series, 1500, 2000)).toBeLessThan(6);
  });

  it("returns zero for an empty series", () => {
    expect(rollingNpsAt(computeNpsSeries([]), 100)).toBe(0);
  });
});

describe("resampleNpsPeaks", () => {
  it("returns the values untouched when they already fit", () => {
    const series = computeNpsSeries([note("a", 0, 0)], 500);
    expect(resampleNpsPeaks(series, 10)).toEqual(series.values);
  });

  it("keeps the peak of each group rather than the average", () => {
    const notes = [
      note("a", 0, 0),
      note("b", 1, 0),
      note("c", 2, 0),
      note("d", 3, 0),
      note("e", 0, 3000),
    ];
    const series = computeNpsSeries(notes, 500, 4000);
    const out = resampleNpsPeaks(series, 2);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(8);
  });

  it("handles degenerate inputs", () => {
    const series = computeNpsSeries([note("a", 0, 0)], 500);
    expect(resampleNpsPeaks(series, 0)).toEqual([]);
    expect(resampleNpsPeaks(computeNpsSeries([]), 5)).toEqual([]);
  });
});
