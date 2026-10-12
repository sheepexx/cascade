import { describe, expect, it } from "vitest";
import { makeDifficulty, makeRedPoint, type Difficulty, type ManiaNote } from "../types";
import { mergeCharts, sameValue, type MergeableChart } from "./chartMerge";

const note = (id: string, column: number, startTime: number, extra: Partial<ManiaNote> = {}): ManiaNote => ({
  id,
  column,
  startTime,
  ...extra,
});

function diff(id: string, notes: ManiaNote[], extra: Partial<Difficulty> = {}): Difficulty {
  return { ...makeDifficulty(id, 4), id, timingPoints: [], notes, ...extra };
}

function chart(difficulties: Difficulty[], extra: Partial<MergeableChart> = {}): MergeableChart {
  return {
    meta: { title: "Song", artist: "Artist", creator: "Mapper" },
    timingPoints: [{ ...makeRedPoint(0, 120), id: "tp0" }],
    difficulties,
    ...extra,
  };
}

/** A copy edited as a collaborator's would be, through JSON like a cloud snapshot. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const notesOf = (c: MergeableChart, diffId = "d1") =>
  c.difficulties.find((d) => d.id === diffId)!.notes;

describe("mergeCharts", () => {
  const a = note("a", 0, 1000);
  const b = note("b", 1, 2000);
  const base = chart([diff("d1", [a, b])]);

  it("keeps both sides' edits to different notes", () => {
    const local = chart([diff("d1", [{ ...a, startTime: 1100 }, b])]);
    const remote = copy(chart([diff("d1", [a, { ...b, column: 3 }])]));
    const merged = mergeCharts(base, local, remote);
    expect(merged.conflicts).toBe(0);
    expect(notesOf(merged.value)).toEqual([{ ...a, startTime: 1100 }, { ...b, column: 3 }]);
  });

  it("combines edits to different fields of one note", () => {
    const local = chart([diff("d1", [{ ...a, startTime: 1100 }, b])]);
    const remote = copy(chart([diff("d1", [{ ...a, column: 2 }, b])]));
    const merged = mergeCharts(base, local, remote);
    expect(merged.conflicts).toBe(0);
    expect(notesOf(merged.value)[0]).toEqual({ ...a, startTime: 1100, column: 2 });
  });

  it("lets the saved copy win when both changed the same field, and counts it", () => {
    const local = chart([diff("d1", [{ ...a, startTime: 1100 }, b])]);
    const remote = copy(chart([diff("d1", [{ ...a, startTime: 1200 }, b])]));
    const merged = mergeCharts(base, local, remote);
    expect(merged.conflicts).toBe(1);
    expect(notesOf(merged.value)[0].startTime).toBe(1200);
  });

  it("keeps notes both sides added, in time order", () => {
    const local = chart([diff("d1", [a, b, note("l", 2, 1500)])]);
    const remote = copy(chart([diff("d1", [a, b, note("r", 3, 2500)])]));
    const merged = mergeCharts(base, local, remote);
    expect(notesOf(merged.value).map((n) => n.id)).toEqual(["a", "l", "b", "r"]);
    expect(merged.conflicts).toBe(0);
  });

  it("deletes a note one side deleted and the other left alone", () => {
    const local = chart([diff("d1", [b])]);
    const merged = mergeCharts(base, local, copy(base));
    expect(notesOf(merged.value).map((n) => n.id)).toEqual(["b"]);
    const remoteDeleted = mergeCharts(base, base, copy(chart([diff("d1", [a])])));
    expect(notesOf(remoteDeleted.value).map((n) => n.id)).toEqual(["a"]);
  });

  it("keeps a note one side edited and the other deleted", () => {
    const local = chart([diff("d1", [b])]);
    const remote = copy(chart([diff("d1", [{ ...a, column: 3 }, b])]));
    const merged = mergeCharts(base, local, remote);
    expect(notesOf(merged.value).find((n) => n.id === "a")?.column).toBe(3);
    expect(merged.conflicts).toBe(1);
    const other = mergeCharts(base, chart([diff("d1", [{ ...a, column: 3 }, b])]), copy(chart([diff("d1", [b])])));
    expect(notesOf(other.value).find((n) => n.id === "a")?.column).toBe(3);
  });

  it("merges metadata, timing points and difficulty settings field by field", () => {
    const local = chart([diff("d1", [a, b], { overallDifficulty: 8 })], {
      meta: { ...base.meta, title: "New title" },
      timingPoints: [...base.timingPoints, { ...makeRedPoint(5000, 180), id: "tpl" }],
    });
    const remote = copy(chart([diff("d1", [a, b], { hpDrainRate: 9 })], {
      meta: { ...base.meta, artist: "New artist" },
      timingPoints: [{ ...base.timingPoints[0], volume: 60 }, { ...makeRedPoint(3000, 150), id: "tpr" }],
    }));
    const merged = mergeCharts(base, local, remote);
    expect(merged.conflicts).toBe(0);
    expect(merged.value.meta).toEqual({ ...base.meta, title: "New title", artist: "New artist" });
    expect(merged.value.timingPoints.map((p) => [p.id, p.time])).toEqual([["tp0", 0], ["tpr", 3000], ["tpl", 5000]]);
    expect(merged.value.timingPoints[0].volume).toBe(60);
    expect(merged.value.difficulties[0]).toMatchObject({ overallDifficulty: 8, hpDrainRate: 9 });
  });

  it("keeps difficulties both sides added and drops one deleted on one side only", () => {
    const withTwo = chart([diff("d1", [a]), diff("d2", [])]);
    const local = chart([diff("d1", [a]), diff("d2", []), diff("local", [])]);
    const remote = copy(chart([diff("d1", [a]), diff("remote", [])]));
    const merged = mergeCharts(withTwo, local, remote);
    expect(merged.value.difficulties.map((d) => d.id)).toEqual(["d1", "remote", "local"]);
  });

  it("takes the saved difficulty when a key-count change would strand a note", () => {
    const wide = chart([diff("d1", [a], { keyCount: 7 })]);
    const local = chart([diff("d1", [a, note("far", 6, 3000)], { keyCount: 7 })]);
    const remote = copy(chart([diff("d1", [a], { keyCount: 4 })]));
    const merged = mergeCharts(wide, local, remote);
    expect(merged.value.difficulties[0].keyCount).toBe(4);
    expect(notesOf(merged.value).map((n) => n.id)).toEqual(["a"]);
    expect(merged.conflicts).toBeGreaterThan(0);
  });

  it("refuses to combine fields into a hold that ends before it starts", () => {
    const hold = note("h", 0, 1000, { endTime: 1500 });
    const start = chart([diff("d1", [hold])]);
    const local = chart([diff("d1", [{ ...hold, endTime: 1200 }])]);
    const remote = copy(chart([diff("d1", [{ ...hold, startTime: 1300 }])]));
    const merged = mergeCharts(start, local, remote);
    expect(notesOf(merged.value)[0]).toEqual({ ...hold, startTime: 1300 });
    expect(merged.conflicts).toBe(1);
  });

  it("returns the saved copy untouched when this window changed nothing", () => {
    const remote = copy(chart([diff("d1", [a, b, note("c", 2, 3000)])]));
    const merged = mergeCharts(base, base, remote);
    expect(merged.value.difficulties).toEqual(remote.difficulties);
    expect(merged.conflicts).toBe(0);
  });

  it("without a base keeps everything from both sides and lets the saved copy win differences", () => {
    const local = chart([diff("d1", [{ ...a, startTime: 1100 }, note("l", 2, 500)])]);
    const remote = copy(chart([diff("d1", [a, b])]));
    const merged = mergeCharts(null, local, remote);
    expect(notesOf(merged.value).map((n) => [n.id, n.startTime])).toEqual([["l", 500], ["a", 1000], ["b", 2000]]);
    expect(merged.conflicts).toBe(1);
  });

  it("merges a list with duplicate ids as one value", () => {
    const twice = chart([diff("d1", [a, a])]);
    const local = chart([diff("d1", [a, a, b])]);
    const merged = mergeCharts(twice, local, copy(twice));
    expect(notesOf(merged.value)).toEqual([a, a, b]);
  });
});

describe("sameValue", () => {
  it("treats a missing key like an undefined one", () => {
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameValue([1, { x: [2] }], [1, { x: [2] }])).toBe(true);
    expect(sameValue([1], { 0: 1 })).toBe(false);
  });
});
