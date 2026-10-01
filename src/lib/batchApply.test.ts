import { describe, expect, it } from "vitest";
import { batchApplyDifficulties } from "./batchApply";
import { makeDifficulty, makeGreenPoint, makeRedPoint, type ManiaNote } from "../types";

const note = (startTime: number, column = 0, endTime?: number): ManiaNote => ({ id: `${startTime}_${column}`, startTime, column, endTime });

describe("batch apply", () => {
  it("converts timing and preview through source and target rates while preserving notes, SV and identity", () => {
    const source = { ...makeDifficulty("source"), audioRate: 1.5, previewTime: 2000, timingPoints: [makeRedPoint(300, 180), makeGreenPoint(500, 2)] };
    const target = { ...makeDifficulty("target"), audioRate: 1, beatmapId: 123, notes: [note(500)], timingPoints: [makeRedPoint(0), makeGreenPoint(400, 3)] };
    const untouched = makeDifficulty("untouched");
    const out = batchApplyDifficulties([source, target, untouched], { sourceId: source.id, targetIds: [target.id], options: { timing: "red", preview: true, difficultySettings: false } });
    expect(out[0]).toBe(source); expect(out[2]).toBe(untouched);
    expect(out[1].notes).toBe(target.notes); expect(out[1].beatmapId).toBe(123);
    expect(out[1].previewTime).toBe(3000);
    expect(out[1].timingPoints.find(p => p.uninherited)).toMatchObject({ time: 450, bpm: 120 });
    expect(out[1].timingPoints.find(p => !p.uninherited)).toBe(target.timingPoints[1]);
    expect(out[1].timingPoints.find(p => p.uninherited)?.id).not.toBe(source.timingPoints[0].id);
  });
  it("can replace all timing but keeps unset preview unset", () => {
    const source = { ...makeDifficulty(), timingPoints: [makeRedPoint(0), makeGreenPoint(500, 2)] };
    const target = { ...makeDifficulty(), audioRate: 2 };
    const out = batchApplyDifficulties([source, target], { sourceId: source.id, targetIds: [target.id], options: { timing: "all", preview: true, difficultySettings: true } });
    expect(out[1].timingPoints.find(p => !p.uninherited)).toMatchObject({ time: 250, sv: 2 }); expect(out[1].previewTime).toBe(-1);
  });
  it("copies bookmarks and their labels onto the target's clock", () => {
    const source = { ...makeDifficulty(), audioRate: 1.5, bookmarks: [3000, 1500], bookmarkLabels: { "1500": "Drop", "9999": "stale" } };
    const target = { ...makeDifficulty(), audioRate: 1, bookmarks: [100], bookmarkLabels: { "100": "old" } };
    const out = batchApplyDifficulties([source, target], { sourceId: source.id, targetIds: [target.id], options: { timing: "none", preview: false, difficultySettings: false, bookmarks: true } });
    expect(out[1].bookmarks).toEqual([2250, 4500]);
    expect(out[1].bookmarkLabels).toEqual({ "2250": "Drop" });
    expect(out[1].timingPoints).toBe(target.timingPoints);
  });
  it("clears the target's bookmarks when the source has none", () => {
    const source = makeDifficulty();
    const target = { ...makeDifficulty(), bookmarks: [100], bookmarkLabels: { "100": "old" } };
    const out = batchApplyDifficulties([source, target], { sourceId: source.id, targetIds: [target.id], options: { timing: "none", preview: false, difficultySettings: false, bookmarks: true } });
    expect(out[1].bookmarks).toBeUndefined();
    expect(out[1].bookmarkLabels).toBeUndefined();
  });
});
