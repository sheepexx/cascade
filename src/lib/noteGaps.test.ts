import { describe, expect, it } from "vitest";
import type { ManiaNote } from "../types";
import { gapBefore } from "./noteGaps";

const note = (id: string, column: number, startTime: number, endTime?: number): ManiaNote =>
  endTime === undefined ? { id, column, startTime } : { id, column, startTime, endTime };

describe("gapBefore", () => {
  it("measures from the previous note in the same lane", () => {
    const notes = [note("a", 0, 100), note("b", 1, 400), note("c", 0, 250), note("d", 0, 500)];
    expect(gapBefore(notes[3], notes)).toBe(250);
  });

  it("measures from the end of a hold", () => {
    const notes = [note("a", 0, 100, 450), note("b", 0, 500)];
    expect(gapBefore(notes[1], notes)).toBe(50);
  });

  it("has no gap for the first note in its lane", () => {
    const notes = [note("a", 1, 100), note("b", 0, 500)];
    expect(gapBefore(notes[1], notes)).toBeNull();
  });
});
