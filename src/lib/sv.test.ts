import { describe, it, expect } from "vitest";
import { MIN_SV, makeGreenPoint, makeRedPoint } from "../types";
import {
  applySvToRange,
  buildSvMap,
  constantSv,
  easeProgress,
  greensInRange,
  hasSv,
  rampSv,
  removeGreensInRange,
  stutterLowSv,
  stutterSv,
  svPositionAt,
  svTimeAt,
} from "./sv";

describe("buildSvMap", () => {
  it("is the identity when there is no effective SV", () => {
    expect(buildSvMap([]).segments).toHaveLength(0);
    expect(buildSvMap([makeRedPoint(0, 120)]).segments).toHaveLength(0);
    expect(
      buildSvMap([makeRedPoint(0, 120), makeGreenPoint(500, 1)]).segments,
    ).toHaveLength(0);
    expect(hasSv([makeRedPoint(0, 120)])).toBe(false);
  });

  it("anchors positions so pos(t) === t before the first rate change", () => {
    const map = buildSvMap([makeRedPoint(0, 120), makeGreenPoint(1000, 2)]);
    expect(svPositionAt(map, -500)).toBe(-500);
    expect(svPositionAt(map, 0)).toBe(0);
    expect(svPositionAt(map, 1000)).toBe(1000);
  });

  it("integrates SV across segments", () => {
    const map = buildSvMap([
      makeRedPoint(0, 120),
      makeGreenPoint(1000, 2),
      makeGreenPoint(2000, 0.5),
    ]);
    // [1000,2000) at 2x -> pos(2000) = 1000 + 1000*2 = 3000
    expect(svPositionAt(map, 2000)).toBe(3000);
    // [2000,∞) at 0.5x -> pos(3000) = 3000 + 1000*0.5 = 3500
    expect(svPositionAt(map, 3000)).toBe(3500);
  });

  it("resets SV to 1 at red points", () => {
    const points = [
      makeRedPoint(0, 120),
      makeGreenPoint(1000, 4),
      makeRedPoint(2000, 180),
    ];
    const map = buildSvMap(points);
    // 4x through [1000,2000), reset to 1x after the red.
    expect(svPositionAt(map, 2000)).toBe(1000 + 1000 * 4);
    expect(svPositionAt(map, 2500)).toBe(5000 + 500);
  });

  it("lets a green co-located with a red win (red-first tiebreak)", () => {
    // Green listed before the red in array order; the map must still apply
    // red-reset first, then the green's 2x.
    const points = [
      makeGreenPoint(1000, 2),
      makeRedPoint(1000, 180),
      makeRedPoint(0, 120),
    ];
    const map = buildSvMap(points);
    expect(svPositionAt(map, 1500)).toBe(1000 + 500 * 2);
  });

  it("caches by array identity", () => {
    const points = [makeRedPoint(0, 120), makeGreenPoint(500, 2)];
    expect(buildSvMap(points)).toBe(buildSvMap(points));
    expect(buildSvMap([...points])).not.toBe(buildSvMap(points));
  });
});

describe("svTimeAt round-trip", () => {
  const points = [
    makeRedPoint(0, 120),
    makeGreenPoint(1000, 2),
    makeGreenPoint(2000, 0.25),
    makeRedPoint(3000, 200),
    makeGreenPoint(3500, 6),
  ];
  const map = buildSvMap(points);
  const times = [-800, 0, 500, 1000, 1500, 2000, 2400, 3000, 3250, 3500, 9000];

  it("inverts exactly at blend 1", () => {
    for (const t of times) {
      expect(svTimeAt(map, svPositionAt(map, t))).toBeCloseTo(t, 6);
    }
  });

  it("inverts exactly at partial blends", () => {
    for (const blend of [0, 0.25, 0.6180339887, 1]) {
      for (const t of times) {
        expect(svTimeAt(map, svPositionAt(map, t, blend), blend)).toBeCloseTo(
          t,
          6,
        );
      }
    }
  });

  it("degenerates to the identity at blend 0", () => {
    expect(svPositionAt(map, 1234, 0)).toBe(1234);
    expect(svTimeAt(map, 1234, 0)).toBe(1234);
  });

  it("stays strictly monotonic", () => {
    let prev = -Infinity;
    for (let t = -1000; t <= 10000; t += 37) {
      const pos = svPositionAt(map, t);
      expect(pos).toBeGreaterThan(prev);
      prev = pos;
    }
  });
});

describe("easeProgress", () => {
  it("hits the endpoints for every easing", () => {
    for (const easing of [
      "linear",
      "sineIn",
      "sineOut",
      "sineInOut",
      "quadIn",
      "quadOut",
      "quadInOut",
      "expoIn",
      "expoOut",
      "expoInOut",
    ] as const) {
      expect(easeProgress(easing, 0)).toBeCloseTo(0, 9);
      expect(easeProgress(easing, 1)).toBeCloseTo(1, 9);
    }
  });
});

describe("generators", () => {
  const reds = [makeRedPoint(0, 120)]; // 500ms beats

  it("constantSv emits a single green", () => {
    const out = constantSv(1000, 2.5);
    expect(out).toHaveLength(1);
    expect(out[0].uninherited).toBe(false);
    expect(out[0].time).toBe(1000);
    expect(out[0].sv).toBe(2.5);
  });

  it("rampSv interpolates linearly at the requested density", () => {
    // 2 beats at density 2 -> points every 250ms: 0, 250, 500, 750.
    const out = rampSv(reds, 0, 1000, 1, 2, "linear", 2);
    expect(out.map((p) => p.time)).toEqual([0, 250, 500, 750]);
    expect(out[0].sv).toBeCloseTo(1);
    expect(out[2].sv).toBeCloseTo(1.5);
    expect(out.every((p) => !p.uninherited)).toBe(true);
  });

  it("rampSv follows BPM changes for spacing", () => {
    const points = [makeRedPoint(0, 120), makeRedPoint(500, 240)]; // 250ms beats after 500
    const out = rampSv(points, 0, 1000, 1, 2, "linear", 1);
    expect(out.map((p) => p.time)).toEqual([0, 500, 750]);
  });

  it("stutter compensates to average 1.0 per cycle", () => {
    const low = stutterLowSv(1.5, 0.5);
    expect(0.5 * 1.5 + 0.5 * low).toBeCloseTo(1);
    const out = stutterSv(reds, 0, 1000, 1.5, 0.5, 1);
    expect(out.map((p) => p.time)).toEqual([0, 250, 500, 750]);
    expect(out[0].sv).toBe(1.5);
    expect(out[1].sv).toBeCloseTo(low);
    // A full cycle of the generated map travels exactly its own length.
    const map = buildSvMap([...reds, ...out]);
    expect(svPositionAt(map, 500) - svPositionAt(map, 0)).toBeCloseTo(500);
  });

  it("stutter clamps the compensation at MIN_SV", () => {
    expect(stutterLowSv(10, 0.9)).toBe(MIN_SV);
  });
});

describe("range editing", () => {
  const points = [
    makeRedPoint(0, 120),
    makeGreenPoint(400, 2),
    makeGreenPoint(800, 3),
    makeGreenPoint(1600, 0.5),
  ];

  it("removeGreensInRange keeps reds and outside greens", () => {
    const out = removeGreensInRange(points, 300, 1000);
    expect(out.map((p) => p.time)).toEqual([0, 1600]);
    expect(out[0].uninherited).toBe(true);
  });

  it("greensInRange counts replacements", () => {
    expect(greensInRange(points, 300, 1000)).toHaveLength(2);
    expect(greensInRange(points, 0, 2000)).toHaveLength(3);
  });

  it("applySvToRange swaps the range and returns a sorted fresh array", () => {
    const generated = constantSv(500, 4);
    const out = applySvToRange(points, 300, 1000, generated);
    expect(out).not.toBe(points);
    expect(out.map((p) => p.time)).toEqual([0, 500, 1600]);
    expect(out[1].sv).toBe(4);
    // Original untouched.
    expect(points).toHaveLength(4);
  });
});
