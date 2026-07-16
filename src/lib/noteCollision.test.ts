import { describe, it, expect } from "vitest";
import type { ManiaNote } from "../types";
import {
  notesCollide,
  hasNoteCollision,
  hasNoteCollisions,
  withoutNoteCollisions,
  sameNoteGeometry,
} from "./noteCollision";

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

describe("notesCollide", () => {
  it("does not collide a note with itself", () => {
    const n = note("a", 0, 100);
    expect(notesCollide(n, n)).toBe(false);
  });

  it("never collides notes in different columns", () => {
    expect(notesCollide(note("a", 0, 100), note("b", 1, 100))).toBe(false);
  });

  it("collides two rice notes at the same time/column", () => {
    expect(notesCollide(note("a", 0, 100), note("b", 0, 100))).toBe(true);
  });

  it("collides a rice note inside a long note's body", () => {
    const ln = note("a", 0, 0, 100);
    expect(notesCollide(ln, note("b", 0, 50))).toBe(true);
  });

  it("allows a rice note exactly on a long note's tail (half-open [start,end))", () => {
    const ln = note("a", 0, 0, 100);
    expect(notesCollide(ln, note("b", 0, 100))).toBe(false);
  });

  it("allows a long note head stacked exactly on a previous tail", () => {
    expect(notesCollide(note("a", 0, 0, 100), note("b", 0, 100, 200))).toBe(
      false,
    );
  });

  it("collides two overlapping long notes", () => {
    expect(notesCollide(note("a", 0, 0, 100), note("b", 0, 50, 150))).toBe(
      true,
    );
  });
});

describe("hasNoteCollision / hasNoteCollisions", () => {
  it("detects a note overlapping an existing set", () => {
    const existing = [note("a", 0, 0, 100), note("b", 1, 0)];
    expect(hasNoteCollision(note("c", 0, 50), existing)).toBe(true);
    expect(hasNoteCollision(note("c", 2, 50), existing)).toBe(false);
  });

  it("reports a clean set as collision-free", () => {
    const notes = [note("a", 0, 0), note("b", 1, 0), note("c", 0, 200)];
    expect(hasNoteCollisions(notes)).toBe(false);
  });

  it("reports a self-overlapping set", () => {
    const notes = [note("a", 0, 0, 200), note("b", 0, 100)];
    expect(hasNoteCollisions(notes)).toBe(true);
  });
});

describe("withoutNoteCollisions", () => {
  it("drops candidates that collide with existing or earlier-accepted notes", () => {
    const existing = [note("e", 0, 0)];
    const candidates = [
      note("keep1", 1, 0),
      note("drop1", 0, 0),
      note("keep2", 1, 200),
      note("drop2", 1, 200),
    ];
    const kept = withoutNoteCollisions(candidates, existing).map((n) => n.id);
    expect(kept).toEqual(["keep1", "keep2"]);
  });
});

describe("sameNoteGeometry", () => {
  it("ignores id and other fields, comparing column + timing only", () => {
    expect(
      sameNoteGeometry(note("a", 0, 100, 200), note("b", 0, 100, 200)),
    ).toBe(true);
    expect(sameNoteGeometry(note("a", 0, 100), note("b", 0, 100, 200))).toBe(
      false,
    );
    expect(sameNoteGeometry(note("a", 0, 100), note("b", 1, 100))).toBe(false);
  });
});
