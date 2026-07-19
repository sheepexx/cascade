import { describe, it, expect } from "vitest";
import { MIN_SV, makeGreenPoint, makeRedPoint } from "../types";
import { effectiveSvAt } from "./timing";
import {
  applySvToRange,
  buildSvMap,
  EASING_HANDLES,
  constantSv,
  cubicBezierEase,
  dominantBpm,
  effectiveRateAt,
  type BezierHandles,
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

describe("dominantBpm", () => {
  it("picks the BPM the map spends the most time at", () => {
    const points = [
      makeRedPoint(0, 140),
      makeRedPoint(10000, 122.5),
      makeRedPoint(100000, 140),
    ];
    // 122.5 spans 90s, 140 spans 10s (the trailing point has no span).
    expect(dominantBpm(points)).toBe(122.5);
  });

  it("ignores freeze/teleport gimmick points", () => {
    // polyriddim-style: near-zero and huge BPMs used as scroll effects.
    const points = [
      makeRedPoint(0, 140),
      makeRedPoint(1000, 0.001),
      makeRedPoint(60000, 10000),
      makeRedPoint(60001, 0.001),
    ];
    expect(dominantBpm(points)).toBe(140);
  });

  it("falls back sensibly with no musical BPM at all", () => {
    expect(dominantBpm([makeRedPoint(0, 0.001)])).toBe(0.001);
    expect(dominantBpm([])).toBe(120);
  });
});

describe("BPM-driven scroll (osu!mania semantics)", () => {
  const points = [
    makeRedPoint(0, 100),
    makeRedPoint(10000, 200), // double tempo -> double scroll
  ];

  it("ignores BPM by default (Quaver-style)", () => {
    expect(buildSvMap(points).segments).toHaveLength(0);
    expect(hasSv(points)).toBe(false);
  });

  it("scales the rate by bpm / dominant bpm", () => {
    const map = buildSvMap(points, { bpmScroll: true, baseBpm: 100 });
    expect(hasSv(points, { bpmScroll: true, baseBpm: 100 })).toBe(true);
    // 1x until 10000, then 2x.
    expect(svPositionAt(map, 10000)).toBe(10000);
    expect(svPositionAt(map, 11000)).toBe(12000);
  });

  it("multiplies SV and BPM together", () => {
    const withSv = [...points, makeGreenPoint(10000, 1.5)];
    const map = buildSvMap(withSv, { bpmScroll: true, baseBpm: 100 });
    // 200bpm (2x) * 1.5sv = 3x
    expect(svPositionAt(map, 11000) - svPositionAt(map, 10000)).toBeCloseTo(
      3000,
    );
  });

  it("stays invertible through freezes and teleports", () => {
    // A polyriddim-style stop/jump pair.
    const gimmick = [
      makeRedPoint(0, 140),
      makeRedPoint(5000, 0.001), // freeze
      makeRedPoint(5100, 10000), // teleport
      makeRedPoint(5101, 140),
    ];
    const opts = { bpmScroll: true };
    const map = buildSvMap(gimmick, opts);
    expect(hasSv(gimmick, opts)).toBe(true);
    let prev = -Infinity;
    for (let t = -500; t <= 8000; t += 13) {
      const pos = svPositionAt(map, t);
      expect(pos).toBeGreaterThan(prev);
      expect(svTimeAt(map, pos)).toBeCloseTo(t, 6);
      prev = pos;
    }
  });

  it("caches per mode rather than colliding", () => {
    const sv = buildSvMap(points);
    const bpm = buildSvMap(points, { bpmScroll: true, baseBpm: 100 });
    expect(sv).not.toBe(bpm);
    expect(buildSvMap(points)).toBe(sv);
    expect(buildSvMap(points, { bpmScroll: true, baseBpm: 100 })).toBe(bpm);
  });
});

describe("effectiveRateAt", () => {
  it("is 1 before the first change and on an identity map", () => {
    expect(effectiveRateAt(buildSvMap([]), 500)).toBe(1);
    const map = buildSvMap([makeRedPoint(0, 120), makeGreenPoint(1000, 3)]);
    expect(effectiveRateAt(map, 0)).toBe(1);
    expect(effectiveRateAt(map, 999)).toBe(1);
    expect(effectiveRateAt(map, 1000)).toBe(3);
  });

  it("matches the slope of the position map", () => {
    const points = [
      makeRedPoint(0, 100),
      makeGreenPoint(1000, 2.5),
      makeRedPoint(3000, 200),
    ];
    for (const opts of [{}, { bpmScroll: true, baseBpm: 100 }]) {
      const map = buildSvMap(points, opts);
      for (const t of [500, 1500, 2900, 3500]) {
        const slope = svPositionAt(map, t + 1) - svPositionAt(map, t);
        expect(effectiveRateAt(map, t)).toBeCloseTo(slope, 6);
      }
    }
  });

  it("reports the combined BPM and SV rate", () => {
    const points = [
      makeRedPoint(0, 100),
      makeRedPoint(2000, 200),
      makeGreenPoint(2000, 1.5),
    ];
    const map = buildSvMap(points, { bpmScroll: true, baseBpm: 100 });
    // SV-only would say 1.5; the real scroll is 200/100 * 1.5 = 3.
    expect(effectiveSvAt(2500, points)).toBe(1.5);
    expect(effectiveRateAt(map, 2500)).toBeCloseTo(3);
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

describe("cubicBezierEase", () => {
  const linear: BezierHandles = { x1: 0.25, y1: 0.25, x2: 0.75, y2: 0.75 };

  it("pins the endpoints", () => {
    for (const h of Object.values(EASING_HANDLES)) {
      expect(cubicBezierEase(h, 0)).toBe(0);
      expect(cubicBezierEase(h, 1)).toBe(1);
    }
  });

  it("reproduces a straight line", () => {
    for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(cubicBezierEase(linear, x)).toBeCloseTo(x, 4);
    }
  });

  it("eases in below the diagonal and out above it", () => {
    expect(cubicBezierEase(EASING_HANDLES.quadIn, 0.5)).toBeLessThan(0.5);
    expect(cubicBezierEase(EASING_HANDLES.quadOut, 0.5)).toBeGreaterThan(0.5);
  });

  it("tracks the named easings it approximates", () => {
    for (const name of ["quadIn", "quadOut", "sineInOut"] as const) {
      for (const x of [0.25, 0.5, 0.75]) {
        expect(cubicBezierEase(EASING_HANDLES[name], x)).toBeCloseTo(
          easeProgress(name, x),
          1,
        );
      }
    }
  });

  it("allows overshoot above 1 without breaking the solve", () => {
    const overshoot: BezierHandles = { x1: 0.3, y1: 1.6, x2: 0.6, y2: 1.6 };
    expect(cubicBezierEase(overshoot, 0.5)).toBeGreaterThan(1);
    expect(cubicBezierEase(overshoot, 1)).toBe(1);
  });

  it("clamps x input and out-of-range control points", () => {
    expect(cubicBezierEase(linear, -2)).toBe(0);
    expect(cubicBezierEase(linear, 5)).toBe(1);
    const wild: BezierHandles = { x1: -3, y1: 0, x2: 4, y2: 1 };
    const mid = cubicBezierEase(wild, 0.5);
    expect(Number.isFinite(mid)).toBe(true);
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
