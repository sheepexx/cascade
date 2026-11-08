import { describe, expect, it } from "vitest";
import type { ManiaNote } from "../types";
import { laneSwapFor } from "./laneSwap";
import { hasNoteCollisions } from "./noteCollision";

const shift = (note: ManiaNote, colDelta: number): ManiaNote => ({
  ...note,
  column: note.column + colDelta,
});

const longNote: ManiaNote = { id: "ln", column: 0, startTime: 1000, endTime: 2000 };
const single: ManiaNote = {
  id: "single",
  column: 1,
  startTime: 1750,
  hitSound: 2,
  sampleSet: 2,
};

describe("laneSwapFor", () => {
  it("swaps a long note with the note in the lane it was dragged to", () => {
    const notes = [longNote, single];
    const moved = [shift(longNote, 1)];
    const swap = laneSwapFor(notes, moved, 1);
    expect(swap).toEqual({
      kind: "swap",
      displaced: [{ ...single, column: 0 }],
    });
    if (swap?.kind !== "swap") return;
    expect(hasNoteCollisions([...moved, ...swap.displaced])).toBe(false);
  });

  it("works the other way round, dragging the single note onto the long note", () => {
    const swap = laneSwapFor([longNote, single], [shift(single, -1)], -1);
    expect(swap).toEqual({
      kind: "swap",
      displaced: [{ ...longNote, column: 1 }],
    });
  });

  it("returns every note in the way when a long note covers several", () => {
    const inTheWay: ManiaNote[] = [1100, 1500, 1900].map((startTime) => ({
      id: `n${startTime}`,
      column: 1,
      startTime,
    }));
    const swap = laneSwapFor([longNote, ...inTheWay], [shift(longNote, 1)], 1);
    expect(swap?.kind).toBe("swap");
    if (swap?.kind !== "swap") return;
    expect(swap.displaced.map((n) => [n.id, n.column, n.startTime])).toEqual([
      ["n1100", 0, 1100],
      ["n1500", 0, 1500],
      ["n1900", 0, 1900],
    ]);
  });

  it("is blocked, naming the note in the way, when it would land on another note", () => {
    const longInTheWay: ManiaNote = { id: "long2", column: 1, startTime: 1500, endTime: 3000 };
    const later: ManiaNote = { id: "later", column: 0, startTime: 2500 };
    const swap = laneSwapFor(
      [longNote, longInTheWay, later],
      [shift(longNote, 1)],
      1,
    );
    expect(swap).toEqual({ kind: "blocked", stuck: [longInTheWay] });
  });

  it("is blocked when the lane the note would return to is taken by another dragged note", () => {
    const a: ManiaNote = { id: "a", column: 0, startTime: 1000 };
    const b: ManiaNote = { id: "b", column: 1, startTime: 1000 };
    const x: ManiaNote = { id: "x", column: 2, startTime: 1000 };
    const swap = laneSwapFor([a, b, x], [shift(a, 1), shift(b, 1)], 1);
    expect(swap).toEqual({ kind: "blocked", stuck: [x] });
  });

  it("leaves drags that also move notes in time, or hit nothing, alone", () => {
    const notes = [longNote, single];
    const retimed = { ...shift(longNote, 1), startTime: 1100 };
    expect(laneSwapFor(notes, [retimed], 1)).toBeNull();
    expect(laneSwapFor(notes, [shift(longNote, 2)], 2)).toBeNull();
    expect(laneSwapFor(notes, [longNote], 0)).toBeNull();
  });

  it("doesn't count a note that starts exactly where a long note ends", () => {
    const atEnd: ManiaNote = { id: "end", column: 1, startTime: 2000 };
    expect(laneSwapFor([longNote, atEnd], [shift(longNote, 1)], 1)).toBeNull();
  });

  it("counts single notes on the same moment as in the way", () => {
    const a: ManiaNote = { id: "a", column: 0, startTime: 500 };
    const b: ManiaNote = { id: "b", column: 1, startTime: 500 };
    expect(laneSwapFor([a, b], [shift(a, 1)], 1)).toEqual({
      kind: "swap",
      displaced: [{ ...b, column: 0 }],
    });
  });
});
