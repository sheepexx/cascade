import { describe, expect, it } from "vitest";
import { jumpSnapshotHistory, describeSnapshotChange } from "./editorHistory";
import { makeDifficulty, makeRedPoint, DEFAULT_SONG_META } from "../types";

describe("history navigation", () => {
  it("jumps backwards then forwards without reversing redo order", () => {
    const first = jumpSnapshotHistory(["a", "b"], "c", ["e", "d"], 1)!;
    expect(first).toEqual({ past: ["a"], present: "b", future: ["e", "d", "c"] });
    expect(jumpSnapshotHistory(first.past, first.present, first.future, 4)).toEqual({ past: ["a", "b", "c", "d"], present: "e", future: [] });
  });
  it.each([-1, 3, 0.5, NaN])("rejects invalid position %s", index => expect(jumpSnapshotHistory([1], 2, [], index)).toBeNull());
  it("describes a batch change without naming it a note edit", () => {
    const d = makeDifficulty();
    const before = { meta: DEFAULT_SONG_META, timingPoints: [], difficulties: [d] };
    expect(describeSnapshotChange(before, { ...before, difficulties: [{ ...d, timingPoints: [makeRedPoint(200)] }] })).toContain("Edit timing");
  });
});
