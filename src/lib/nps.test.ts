import { describe, expect, it } from "vitest";
import type { ManiaNote } from "../types";
import {
  computeNpsSeries,
  noteDensity,
  npsAt,
  resampleNpsPeaks,
  rollingNpsAt,
} from "./nps";

function note(id: string, column: number, startTime: number, endTime?: number): ManiaNote {
  return { id, column, startTime, ...(endTime === undefined ? {} : { endTime }) };
}

/** Notes every `gapMs` from 0 up to `untilMs`. */
function stream(gapMs: number, untilMs: number): ManiaNote[] {
  const notes: ManiaNote[] = [];
  for (let i = 0; i * gapMs < untilMs; i++) notes.push(note(`n${i}`, i % 4, i * gapMs));
  return notes;
}

/** How far the highest value sits above the lowest, as a share of the highest. */
function ripple(values: number[]): number {
  const high = Math.max(...values);
  return high > 0 ? (high - Math.min(...values)) / high : 0;
}

describe("noteDensity", () => {
  it("reads an even rhythm level wherever the samples fall", () => {
    // 240 samples over three minutes, as the timeline draws them: 750 ms
    // apart. Fixed bins read 1/1 at 60 BPM as 0 or 1 note and a 1/4 stream
    // at 170 BPM as 8 or 9.
    for (const gap of [1000, 500, 60000 / 170, 60000 / 170 / 4]) {
      const times = stream(gap, 180_000).map((n) => n.startTime);
      const values = noteDensity(times, 0, 750, 240).slice(8, -8);
      expect(ripple(values), `notes ${gap.toFixed(1)} ms apart`).toBeLessThan(0.03);
      for (const value of values) expect(value).toBeCloseTo(1000 / gap, 0);
    }
  });

  it("leaves a break empty past the reach of its last note", () => {
    const values = noteDensity([0, 100, 200, 6000], 0, 500, 12);
    expect(values[0]).toBeGreaterThan(0);
    expect(values.slice(4, 10)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(values[11]).toBeGreaterThan(0);
  });

  it("returns nothing for no samples", () => {
    expect(noteDensity([0], 0, 500, 0)).toEqual([]);
    expect(noteDensity([0], 0, 0, 5)).toEqual([]);
  });
});

describe("computeNpsSeries", () => {
  it("returns an empty series for no notes", () => {
    const series = computeNpsSeries([]);
    expect(series.values).toEqual([]);
    expect(series.peak).toBe(0);
  });

  it("reads a steady stream at its rate in notes per second", () => {
    const series = computeNpsSeries(stream(100, 10_000), 500);
    for (const value of series.values.slice(4, -4)) expect(value).toBeCloseTo(10, 1);
    expect(series.peak).toBeCloseTo(10, 1);
  });

  it("keeps notes far apart in separate bumps", () => {
    const series = computeNpsSeries([note("a", 0, 0), note("b", 0, 5000)], 500);
    expect(series.values).toHaveLength(11);
    expect(series.values[0]).toBeGreaterThan(0);
    expect(series.values.slice(4, 8).every((v) => v === 0)).toBe(true);
    expect(series.values[10]).toBeGreaterThan(0);
  });

  it("counts a long note once, at its head", () => {
    const hold = computeNpsSeries([note("ln", 0, 0, 5000)], 500, 6000);
    const tap = computeNpsSeries([note("tap", 0, 0)], 500, 6000);
    expect(hold.values).toEqual(tap.values);
    expect(hold.values.slice(4).every((v) => v === 0)).toBe(true);
  });

  it("starts at the first note when no duration is given", () => {
    const series = computeNpsSeries([note("a", 0, 10_000)], 500);
    expect(series.startMs).toBe(10_000);
    expect(series.values).toHaveLength(1);
    expect(series.values[0]).toBeGreaterThan(0);
  });

  it("spans the whole song when a duration is given", () => {
    const series = computeNpsSeries([note("a", 0, 10_000)], 1000, 20_000);
    expect(series.startMs).toBe(0);
    expect(series.values).toHaveLength(20);
    expect(series.values[0]).toBe(0);
    expect(series.values[9]).toBe(series.peak);
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
    [note("a", 0, 0), note("b", 1, 100), note("c", 0, 6000)],
    500,
  );

  it("reads the bin containing the time", () => {
    expect(npsAt(series, 0)).toBe(series.values[0]);
    expect(npsAt(series, 499)).toBe(series.values[0]);
    expect(npsAt(series, 6000)).toBe(series.values[12]);
    expect(npsAt(series, 0)).toBeGreaterThan(npsAt(series, 6000));
  });

  it("reads zero in a gap", () => {
    expect(npsAt(series, 3000)).toBe(0);
  });

  it("reads zero outside the series", () => {
    expect(npsAt(series, -1)).toBe(0);
    expect(npsAt(series, 999_999)).toBe(0);
  });
});

describe("rollingNpsAt", () => {
  it("averages the bins in the trailing window", () => {
    const series = computeNpsSeries(stream(500, 10_000), 500);
    expect(rollingNpsAt(series, 5000, 2000)).toBeCloseTo(2, 1);
  });

  it("smooths a spike next to a gap", () => {
    const notes = [note("a", 0, 0), note("b", 1, 0), note("c", 2, 0)];
    const series = computeNpsSeries(notes, 500, 2000);
    expect(npsAt(series, 0)).toBeGreaterThan(0);
    expect(rollingNpsAt(series, 1500, 2000)).toBeLessThan(npsAt(series, 0));
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
    expect(out[0]).toBe(Math.max(...series.values.slice(0, 4)));
    expect(out[0]).toBeGreaterThan(series.values[1]);
  });

  it("handles degenerate inputs", () => {
    const series = computeNpsSeries([note("a", 0, 0)], 500);
    expect(resampleNpsPeaks(series, 0)).toEqual([]);
    expect(resampleNpsPeaks(computeNpsSeries([]), 5)).toEqual([]);
  });
});
