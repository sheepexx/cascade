import { describe, expect, it } from "vitest";
import type { ManiaNote } from "../types";
import {
  bookmarkRange,
  growToChords,
  invertSelection,
  selectColumn,
  selectLongNotes,
  selectRange,
  selectRiceNotes,
  selectSameColumns,
} from "./noteSelection";

function note(startTime: number, column = 0, endTime?: number): ManiaNote {
  return { id: `n${startTime}_${column}`, column, startTime, endTime };
}

const notes: ManiaNote[] = [
  note(0, 0),
  note(0, 1),
  note(100, 2, 400),
  note(200, 0),
  note(500, 3),
];

const ids = (set: Set<string>) => [...set].sort();

describe("column selection", () => {
  it("takes every note in one column", () => {
    expect(ids(selectColumn(notes, 0))).toEqual(["n0_0", "n200_0"]);
  });

  it("widens to every column the selection already touches", () => {
    const seed = new Set(["n0_1"]);
    expect(ids(selectSameColumns(notes, seed))).toEqual(["n0_1"]);
    const two = new Set(["n0_0", "n0_1"]);
    expect(ids(selectSameColumns(notes, two))).toEqual(["n0_0", "n0_1", "n200_0"]);
  });

  it("leaves an empty selection untouched", () => {
    expect(selectSameColumns(notes, new Set()).size).toBe(0);
  });
});

describe("note type selection", () => {
  it("separates long notes from rice", () => {
    expect(ids(selectLongNotes(notes))).toEqual(["n100_2"]);
    expect(ids(selectRiceNotes(notes))).toEqual([
      "n0_0",
      "n0_1",
      "n200_0",
      "n500_3",
    ]);
  });

  it("treats a zero-length hold as rice", () => {
    const zero = [note(0, 0, 0)];
    expect(selectLongNotes(zero).size).toBe(0);
    expect(selectRiceNotes(zero).size).toBe(1);
  });
});

describe("range selection", () => {
  it("includes notes sitting exactly on the bounds", () => {
    expect(ids(selectRange(notes, 0, 200))).toEqual([
      "n0_0",
      "n0_1",
      "n100_2",
      "n200_0",
    ]);
  });

  it("accepts the bounds in either order", () => {
    expect(ids(selectRange(notes, 200, 0))).toEqual(ids(selectRange(notes, 0, 200)));
  });
});

describe("bookmarkRange", () => {
  it("finds the pair either side of the playhead", () => {
    expect(bookmarkRange([1000, 0, 500], 700)).toEqual({ start: 500, end: 1000 });
  });

  it("returns null past the last bookmark or with fewer than two", () => {
    expect(bookmarkRange([0, 500], 900)).toBeNull();
    expect(bookmarkRange([500], 100)).toBeNull();
  });
});

describe("invert and grow", () => {
  it("inverts the selection", () => {
    expect(ids(invertSelection(notes, new Set(["n0_0", "n0_1"])))).toEqual([
      "n100_2",
      "n200_0",
      "n500_3",
    ]);
  });

  it("completes a partly covered chord", () => {
    expect(ids(growToChords(notes, new Set(["n0_0"])))).toEqual(["n0_0", "n0_1"]);
  });

  it("leaves an empty selection empty", () => {
    expect(growToChords(notes, new Set()).size).toBe(0);
  });
});
