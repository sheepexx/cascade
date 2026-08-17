import { describe, expect, it } from "vitest";
import type { ManiaNote } from "../types";
import {
  buildPlaytestNoteIndex,
  firstNoteAtOrAfter,
  nearestPlayableNote,
} from "./playtestIndex";

function note(id: string, column: number, startTime: number): ManiaNote {
  return { id, column, startTime };
}

describe("buildPlaytestNoteIndex", () => {
  it("sorts once and groups notes by id and column", () => {
    const source = [note("late", 1, 300), note("early", 0, 100)];
    const index = buildPlaytestNoteIndex(source, 2);
    expect(index.source).toBe(source);
    expect(index.sorted.map((item) => item.id)).toEqual(["early", "late"]);
    expect(index.byId.get("late")).toBe(source[0]);
    expect(index.byColumn[0].map((item) => item.id)).toEqual(["early"]);
    expect(index.byColumn[1].map((item) => item.id)).toEqual(["late"]);
  });
});

describe("firstNoteAtOrAfter", () => {
  const notes = [note("a", 0, 100), note("b", 0, 200), note("c", 0, 200)];

  it("returns the first matching timestamp", () => {
    expect(firstNoteAtOrAfter(notes, 200)).toBe(1);
  });

  it("handles times outside the chart", () => {
    expect(firstNoteAtOrAfter(notes, 0)).toBe(0);
    expect(firstNoteAtOrAfter(notes, 500)).toBe(notes.length);
  });
});

describe("nearestPlayableNote", () => {
  const notes = [
    note("a", 0, 100),
    note("b", 0, 190),
    note("c", 0, 215),
    note("d", 0, 400),
  ];

  it("selects the closest available note on either side", () => {
    expect(nearestPlayableNote(notes, 200, 50, () => false)?.id).toBe("b");
  });

  it("skips already judged notes without scanning the whole chart", () => {
    expect(
      nearestPlayableNote(notes, 200, 50, (candidate) => candidate.id === "b")
        ?.id,
    ).toBe("c");
  });

  it("returns null when every nearby note is outside the hit window", () => {
    expect(nearestPlayableNote(notes, 300, 50, () => false)).toBeNull();
  });
});
