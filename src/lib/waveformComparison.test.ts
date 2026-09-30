import { describe, expect, it } from "vitest";
import { makeRedPoint } from "../types";
import { comparisonRows, windowPeaks } from "./waveformComparison";

describe("comparisonRows", () => {
  it("centres rows on the beats around the playhead", () => {
    const layout = comparisonRows([makeRedPoint(1000, 120)], 3100, 2, 2)!;
    // 120 BPM is a beat every 500 ms; 3100 ms sits in beat 4.
    expect(layout.beatMs).toBe(500);
    expect(layout.rows.map((r) => r.time)).toEqual([2000, 2500, 3000, 3500, 4000]);
    expect(layout.rows.map((r) => r.label)).toEqual(["1.3", "1.4", "2.1", "2.2", "2.3"]);
    expect(layout.rows.map((r) => r.downbeat)).toEqual([false, false, true, false, false]);
  });

  it("stays inside the red line's section", () => {
    const layout = comparisonRows([makeRedPoint(0, 120), makeRedPoint(1200, 180)], 900, 1, 5)!;
    expect(layout.rows.map((r) => r.time)).toEqual([0, 500, 1000]);
    const before = comparisonRows([makeRedPoint(1000, 120)], 0, 3, 1)!;
    expect(before.rows[0].time).toBe(1000);
  });

  it("has nothing to show without a usable red line", () => {
    expect(comparisonRows([], 0, 2, 2)).toBeNull();
    expect(comparisonRows([makeRedPoint(0, 0)], 0, 2, 2)).toBeNull();
  });
});

describe("windowPeaks", () => {
  it("finds the loudest excursion per pixel, channels mixed", () => {
    const left = new Float32Array(100);
    const right = new Float32Array(100);
    left[10] = 1;
    right[10] = 0.5;
    left[70] = -0.8;
    right[70] = -0.8;
    const peaks = windowPeaks([left, right], 100, 0, 1, 4);
    expect(Array.from(peaks).map((v) => Math.round(v * 100) / 100)).toEqual([0, 0.75, 0, 0, -0.8, 0, 0, 0]);
  });

  it("treats time before or after the song as silence", () => {
    const channel = new Float32Array(10).fill(0.5);
    const peaks = windowPeaks([channel], 10, -1, 0, 2);
    expect(Array.from(peaks)).toEqual([0, 0, 0, 0]);
  });
});
