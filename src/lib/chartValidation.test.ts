import { describe, expect, it } from "vitest";
import { makeDifficulty, makeGreenPoint, makeRedPoint } from "../types";
import {
  assertChartDocument,
  assertExportable,
  checkChartDocument,
  InvalidChartDataError,
  noteProblem,
  timingPointProblem,
} from "./chartValidation";

function chart(overrides: Record<string, unknown> = {}) {
  const difficulty = {
    ...makeDifficulty("Hard", 4),
    id: "d1",
    notes: [
      { id: "n1", column: 0, startTime: 1000 },
      { id: "n2", column: 3, startTime: 1500, endTime: 2000 },
    ],
  };
  return {
    meta: { title: "Song", artist: "Artist", creator: "Mapper" },
    timingPoints: [makeRedPoint(0, 180)],
    difficulties: [difficulty],
    ...overrides,
  };
}

describe("noteProblem", () => {
  it("accepts taps, holds and the edges of the layout", () => {
    expect(noteProblem({ id: "a", column: 0, startTime: 0 }, 4)).toBeNull();
    expect(noteProblem({ id: "a", column: 3, startTime: -500, endTime: -10 }, 4)).toBeNull();
    expect(noteProblem({ id: "a", column: 17, startTime: 12.5 }, 18)).toBeNull();
    expect(noteProblem({ id: "a", column: 0, startTime: 0, hitSound: 8, sampleFile: "" }, 1)).toBeNull();
  });

  it("refuses times that are not finite numbers", () => {
    expect(noteProblem({ id: "a", column: 0, startTime: Number.NaN }, 4)?.problem).toBe("time");
    expect(noteProblem({ id: "a", column: 0, startTime: Infinity }, 4)?.problem).toBe("time");
    expect(noteProblem({ id: "a", column: 0, startTime: "1000" }, 4)?.problem).toBe("time");
    expect(noteProblem({ id: "a", column: 0, startTime: 0, endTime: null }, 4)?.problem).toBe("time");
    expect(noteProblem({ id: "a", column: 0, startTime: 3e9 }, 4)?.problem).toBe("time");
  });

  it("refuses columns outside the difficulty's key count or not whole", () => {
    expect(noteProblem({ id: "a", column: 4, startTime: 0 }, 4)?.problem).toBe("column");
    expect(noteProblem({ id: "a", column: 17, startTime: 0 }, 4)?.problem).toBe("column");
    expect(noteProblem({ id: "a", column: -1, startTime: 0 }, 4)?.problem).toBe("column");
    expect(noteProblem({ id: "a", column: 1.5, startTime: 0 }, 4)?.problem).toBe("column");
  });

  it("refuses a hold that does not end after it starts", () => {
    expect(noteProblem({ id: "a", column: 0, startTime: 100, endTime: 100 }, 4)?.problem).toBe("hold");
    expect(noteProblem({ id: "a", column: 0, startTime: 100, endTime: 50 }, 4)?.problem).toBe("hold");
  });

  it("refuses a missing id and non-numeric sample values", () => {
    expect(noteProblem({ column: 0, startTime: 0 }, 4)?.problem).toBe("id");
    expect(noteProblem({ id: "", column: 0, startTime: 0 }, 4)?.problem).toBe("id");
    expect(noteProblem({ id: "a", column: 0, startTime: 0, sampleVolume: Number.NaN }, 4)).toEqual({
      problem: "number",
      field: "sampleVolume",
    });
  });
});

describe("timingPointProblem", () => {
  it("accepts the editor's points and the first builds' {id, time, bpm}", () => {
    expect(timingPointProblem(makeRedPoint(0, 200))).toBeNull();
    expect(timingPointProblem(makeGreenPoint(500, 0.5))).toBeNull();
    expect(timingPointProblem({ id: "tp", time: 0, bpm: 120 })).toBeNull();
  });

  it("refuses a red point with no usable BPM and non-finite values", () => {
    expect(timingPointProblem({ ...makeRedPoint(0, 120), bpm: 0 })?.problem).toBe("bpm");
    expect(timingPointProblem({ ...makeRedPoint(0, 120), bpm: Number.NaN })?.problem).toBe("number");
    expect(timingPointProblem({ ...makeRedPoint(Number.NaN, 120), time: Number.NaN })?.problem).toBe("time");
    expect(timingPointProblem({ ...makeGreenPoint(0, 1), sv: 0 })?.problem).toBe("number");
    expect(timingPointProblem({ ...makeGreenPoint(0, 1), kiai: "yes" })?.problem).toBe("shape");
  });
});

describe("checkChartDocument", () => {
  it("accepts a normal chart and keeps fields it does not know", () => {
    const value = { ...chart(), activeId: "d1", somethingNewer: { x: 1 } };
    const result = checkChartDocument(value);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(value);
  });

  it("reports where each problem is, without changing the data", () => {
    const value = chart();
    value.difficulties[0].notes[1] = { id: "n2", column: 17, startTime: 1500 };
    value.difficulties[0].notes.push({ id: "n3", column: 0, startTime: Number.NaN });
    const snapshot = JSON.stringify(value.difficulties[0].notes.slice(0, 2));
    const result = checkChartDocument(value);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { problem: "column", path: "difficulties[0].notes[1].column" },
      { problem: "time", path: "difficulties[0].notes[2].startTime" },
    ]);
    expect(JSON.stringify(value.difficulties[0].notes.slice(0, 2))).toBe(snapshot);
  });

  it("refuses a chart with no difficulties, a duplicate id or a bad key count", () => {
    expect(checkChartDocument(chart({ difficulties: [] })).ok).toBe(false);
    const twice = chart();
    twice.difficulties.push({ ...twice.difficulties[0] });
    const result = checkChartDocument(twice);
    expect(!result.ok && result.issues.map((i) => i.problem)).toEqual(["duplicateId"]);
    const wide = chart();
    wide.difficulties[0].keyCount = 19;
    expect(checkChartDocument(wide).ok).toBe(false);
  });

  it("refuses values that are not a chart at all", () => {
    expect(checkChartDocument(null).ok).toBe(false);
    expect(checkChartDocument("chart").ok).toBe(false);
    expect(checkChartDocument({ meta: {}, difficulties: "x", timingPoints: [] }).ok).toBe(false);
  });

  it("caps the report and counts the rest", () => {
    const value = chart();
    value.difficulties[0].notes = Array.from({ length: 50 }, (_, i) => ({
      id: `n${i}`,
      column: 9,
      startTime: i,
    }));
    const result = checkChartDocument(value);
    expect(!result.ok && result.issues.length).toBe(20);
    expect(!result.ok && result.total).toBe(50);
  });
});

describe("assertChartDocument", () => {
  it("throws a readable report naming the source", () => {
    const value = chart();
    value.difficulties[0].notes[0] = { id: "n1", column: 0, startTime: Number.NaN };
    expect(() => assertChartDocument(value, "The cloud copy")).toThrow(InvalidChartDataError);
    expect(() => assertChartDocument(value, "The cloud copy")).toThrow(
      /The cloud copy has 1 invalid value[\s\S]*difficulties\[0\]\.notes\[0\]\.startTime/,
    );
  });
});

describe("assertExportable", () => {
  it("passes a difficulty the format can hold", () => {
    const d = chart().difficulties[0];
    expect(() => assertExportable(d, d.timingPoints)).not.toThrow();
  });

  it("refuses a NaN note time, a column past the key count and a NaN BPM", () => {
    const d = chart().difficulties[0];
    expect(() =>
      assertExportable({ ...d, notes: [{ id: "x", column: 0, startTime: Number.NaN }] }, d.timingPoints),
    ).toThrow(/can't hold/);
    expect(() =>
      assertExportable({ ...d, notes: [{ id: "x", column: 7, startTime: 0 }] }, d.timingPoints),
    ).toThrow(InvalidChartDataError);
    expect(() =>
      assertExportable(d, [{ ...makeRedPoint(0, 120), bpm: Number.NaN }]),
    ).toThrow(InvalidChartDataError);
  });
});
