import { describe, it, expect } from "vitest";
import type { ManiaNote } from "../types";
import { mirrorColumns } from "./noteTools";

function note(
  id: string,
  column: number,
  startTime: number,
  endTime?: number,
): ManiaNote {
  return endTime === undefined
    ? { id, column, startTime }
    : { id, column, startTime, endTime };
}

describe("mirrorColumns", () => {
  it("swaps the leftmost and rightmost lanes (4K)", () => {
    const out = mirrorColumns([note("a", 0, 100)], 4);
    expect(out[0].column).toBe(3);
    expect(mirrorColumns([note("b", 3, 100)], 4)[0].column).toBe(0);
  });

  it("maps every column to keyCount - 1 - column", () => {
    const out = mirrorColumns(
      [note("a", 0, 0), note("b", 1, 0), note("c", 2, 0), note("d", 3, 0)],
      4,
    );
    expect(out.map((n) => n.column)).toEqual([3, 2, 1, 0]);
  });

  it("is its own inverse (mirroring twice restores the columns)", () => {
    const notes = [note("a", 1, 0), note("b", 5, 250), note("c", 6, 500)];
    const twice = mirrorColumns(mirrorColumns(notes, 7), 7);
    expect(twice.map((n) => n.column)).toEqual([1, 5, 6]);
  });

  it("keeps the centre lane fixed on an odd key count", () => {
    expect(mirrorColumns([note("a", 3, 0)], 7)[0].column).toBe(3);
  });

  it("preserves id, times, hold length and hitsounds", () => {
    const ln: ManiaNote = {
      id: "ln",
      column: 1,
      startTime: 100,
      endTime: 400,
      hitSound: 8,
    };
    const [out] = mirrorColumns([ln], 4);
    expect(out).toEqual({ ...ln, column: 2 });
  });

  it("does not mutate the input notes", () => {
    const notes = [note("a", 0, 100)];
    mirrorColumns(notes, 4);
    expect(notes[0].column).toBe(0);
  });
});
