import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  compareCharts,
  formatIssues,
  knownOsuLosses,
  osuInventory,
  svChanges,
  type ChartLike,
} from "./roundTrip";
import { makeDifficulty, makeGreenPoint, makeRedPoint, type Difficulty } from "../types";

function chart(overrides: Partial<Difficulty> = {}, meta: Partial<ChartLike["meta"]> = {}): ChartLike {
  const difficulty: Difficulty = {
    ...makeDifficulty("Hard", 4),
    timingPoints: [makeRedPoint(0, 120), makeGreenPoint(1000, 1.5, { kiai: true })],
    notes: [
      { id: "a", column: 0, startTime: 0 },
      { id: "b", column: 1, startTime: 250, hitSound: 2 },
      { id: "c", column: 2, startTime: 500, endTime: 750 },
    ],
    ...overrides,
  };
  return {
    meta: { title: "T", artist: "A", creator: "C", tags: "one two", ...meta },
    timingPoints: difficulty.timingPoints,
    difficulties: [difficulty],
  };
}

const withIds = (c: ChartLike): ChartLike => ({
  ...c,
  difficulties: c.difficulties.map((d) => ({
    ...d,
    id: `${d.id}-copy`,
    notes: d.notes.map((n) => ({ ...n, id: `${n.id}-copy` })),
    timingPoints: d.timingPoints.map((p) => ({ ...p, id: `${p.id}-copy` })),
  })),
});

describe("compareCharts", () => {
  it("finds nothing between a map and a copy with new ids", () => {
    const a = chart();
    expect(compareCharts(a, withIds(a))).toEqual([]);
  });

  it("reports missing, extra and moved notes with times and lanes", () => {
    const a = chart();
    const b = chart({
      notes: [
        { id: "a", column: 0, startTime: 1 },
        { id: "b", column: 1, startTime: 250, hitSound: 2 },
        { id: "c", column: 2, startTime: 500, endTime: 750 },
        { id: "d", column: 3, startTime: 900 },
      ],
    });
    const issues = compareCharts(a, b);
    expect(issues.map((i) => i.message)).toEqual([
      "1 of 3 notes are missing",
      "2 notes appeared that were not there",
    ]);
    expect(issues[0].examples).toEqual(["00:00:000 lane 1"]);
  });

  it("allows the format's own time resolution", () => {
    const a = chart();
    const b = chart({ notes: a.difficulties[0].notes.map((n) => ({ ...n, startTime: n.startTime + 1 })) });
    expect(compareCharts(a, b, CAPABILITIES.osu).length).toBeGreaterThan(0);
    expect(compareCharts(a, b, { ...CAPABILITIES.sm, noteToleranceMs: 2 })).toEqual([]);
  });

  it("reports holds that changed length and hitsounds that changed", () => {
    const a = chart();
    const b = chart({
      notes: [
        { id: "a", column: 0, startTime: 0 },
        { id: "b", column: 1, startTime: 250, hitSound: 8 },
        { id: "c", column: 2, startTime: 500, endTime: 760 },
      ],
    });
    const paths = compareCharts(a, b).map((i) => i.path);
    expect(paths).toEqual(["Hard › long notes", "Hard › hitsounds"]);
    // StepMania has no hitsounds, so only the hold is a difference there.
    expect(compareCharts(a, b, CAPABILITIES.sm).map((i) => i.path)).toEqual(["Hard › long notes"]);
  });

  it("reports timing, SV and their extras", () => {
    const a = chart();
    const b = chart({
      timingPoints: [makeRedPoint(0, 121), makeGreenPoint(1000, 1.5, { kiai: false })],
    });
    const issues = compareCharts(a, b);
    expect(issues.map((i) => `${i.path}: ${i.message}`)).toEqual([
      "Hard › timing: 1 red lines changed",
      "Hard › SV: 1 green lines changed",
    ]);
    expect(issues[1].examples?.[0]).toContain("kiai");
  });

  it("accepts a first red line moved by whole beats where the format keeps only an offset", () => {
    const a = chart({ timingPoints: [makeRedPoint(1000, 120)] });
    const b = chart({ timingPoints: [makeRedPoint(-500, 120)] });
    expect(compareCharts(a, b, CAPABILITIES.sm)).toEqual([]);
    expect(compareCharts(a, chart({ timingPoints: [makeRedPoint(-400, 120)] }), CAPABILITIES.sm)).not.toEqual([]);
  });

  it("compares the scroll speed in force where the format stores speed changes", () => {
    const a = chart({
      timingPoints: [makeRedPoint(0, 120), makeGreenPoint(0, 1), makeGreenPoint(500, 2), makeGreenPoint(800, 2)],
    });
    const b = chart({ timingPoints: [makeRedPoint(0, 120), makeGreenPoint(500, 2)] });
    expect(compareCharts(a, b, CAPABILITIES.qua)).toEqual([]);
    expect(compareCharts(a, b, CAPABILITIES.osu).length).toBeGreaterThan(0);
    const c = chart({ timingPoints: [makeRedPoint(0, 120), makeGreenPoint(500, 2.5)] });
    expect(compareCharts(a, c, CAPABILITIES.qua)[0].examples?.[0]).toContain("2.500x");
  });

  it("ignores the Cascade tag when asked and reads absent settings as their defaults", () => {
    const a = chart({}, { tags: "one two" });
    const b = chart({ sampleSet: "Normal", beatmapId: 0 }, { tags: "one  two Cascade" });
    expect(compareCharts(a, b, CAPABILITIES.osu, { ignoreWatermarkTag: true })).toEqual([]);
    expect(compareCharts(a, b).map((i) => i.path)).toEqual(["metadata › tags"]);
  });

  it("pairs difficulties by name and reports one that went missing", () => {
    const easy = { ...makeDifficulty("Easy", 4), notes: [] };
    const hard = { ...makeDifficulty("Hard", 4), notes: [] };
    const a: ChartLike = { meta: chart().meta, timingPoints: [], difficulties: [easy, hard] };
    const b: ChartLike = { ...a, difficulties: [hard, easy] };
    expect(compareCharts(a, b)).toEqual([]);
    const issues = compareCharts(a, { ...a, difficulties: [hard] });
    expect(issues).toEqual([{ path: "Easy", message: "difficulty is missing" }]);
  });

  it("formats a readable report", () => {
    const report = formatIssues(
      [{ path: "Hard › notes", message: "1 of 3 notes are missing", examples: ["00:00:000 lane 1"] }],
      "map.osu",
    );
    expect(report).toBe("map.osu\n- Hard › notes: 1 of 3 notes are missing\n    · 00:00:000 lane 1");
  });
});

describe("svChanges", () => {
  it("resets to 1x at a red line and drops lines that change nothing", () => {
    expect(
      svChanges([
        makeRedPoint(0, 120),
        makeGreenPoint(100, 1),
        makeGreenPoint(200, 0.5),
        makeGreenPoint(300, 0.5),
        makeRedPoint(400, 120),
        makeGreenPoint(400, 0.5),
        makeRedPoint(600, 120),
      ]),
    ).toEqual([
      { time: 200, sv: 0.5 },
      { time: 600, sv: 1 },
    ]);
  });
});

describe("osuInventory", () => {
  it("counts objects and timing points and spots what Cascade leaves out", () => {
    const text = [
      "[General]",
      "SpecialStyle: 1",
      "[Events]",
      "//Background",
      '0,0,"bg.jpg",0,0',
      "2,1000,2000",
      'Sprite,Foreground,Centre,"sb/a.png",320,240',
      " F,0,1000,2000,0,1",
      "[TimingPoints]",
      "0,500,4,1,0,100,1,0",
      "1000,-50,4,1,0,100,0,0",
      "",
      "[HitObjects]",
      "64,192,0,1,0,0:0:0:0:",
      "192,192,500,128,0,800:0:0:0:0:",
    ].join("\n");
    const inventory = osuInventory(text);
    expect(inventory).toEqual({
      hitObjects: 2,
      timingPoints: 2,
      storyboardLines: 2,
      breaks: 1,
      specialStyle: true,
    });
    expect(knownOsuLosses(inventory, { ...inventory, storyboardLines: 0, specialStyle: false })).toEqual([
      "storyboard (2 event lines)",
      "SpecialStyle scratch layout",
    ]);
  });
});
