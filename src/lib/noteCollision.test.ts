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

  it("matches pairwise collision semantics across mixed rice and long notes", () => {
    let seed = 17;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    for (let run = 0; run < 100; run++) {
      const notes = Array.from({ length: 80 }, (_, index) => {
        const start = Math.floor(random() * 2000);
        const duration = random() < 0.35 ? Math.floor(random() * 300) + 1 : 0;
        return note(
          `${run}-${index}`,
          Math.floor(random() * 7),
          start,
          duration ? start + duration : undefined,
        );
      });
      const pairwise = notes.some((a, i) =>
        notes.slice(i + 1).some((b) => notesCollide(a, b)),
      );
      expect(hasNoteCollisions(notes)).toBe(pairwise);
    }
  });
});

describe("withoutNoteCollisions", () => {
  it("keeps long-note tail adjacency in the indexed path", () => {
    const existing = [note("hold", 0, 0, 100)];
    const otherNotes = Array.from({ length: 33 }, (_, i) => note(`other${i}`, 1, i * 100));
    const candidates = [
      note("inside", 0, 99),
      note("tail", 0, 100, 200),
      note("stacked", 0, 100),
      note("next", 0, 200),
      ...otherNotes,
    ];
    expect(withoutNoteCollisions(candidates, existing).map((n) => n.id)).toEqual([
      "tail", "next", ...otherNotes.map((n) => n.id),
    ]);
  });

  it("matches ordered pairwise filtering for unsorted notes, duplicate IDs and existing overlaps", () => {
    let seed = 23;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    for (let run = 0; run < 100; run++) {
      const makeNotes = () => Array.from({ length: 80 }, () => {
        const start = Math.floor(random() * 50) * 10;
        return note(`id${Math.floor(random() * 100)}`, Math.floor(random() * 4), start,
          random() < 0.4 ? start + Math.floor(random() * 15) * 10 : undefined);
      });
      const existing = makeNotes();
      const candidates = makeNotes();
      const expected: ManiaNote[] = [];
      for (const n of candidates) {
        if (!hasNoteCollision(n, existing) && !hasNoteCollision(n, expected)) expected.push(n);
      }
      expect(withoutNoteCollisions(candidates, existing)).toEqual(expected);
    }
  });

  it("accepts a large paste without changing input order or arrays", () => {
    const existing = Array.from({ length: 20000 }, (_, i) => note(`e${i}`, i % 4, i * 10));
    const candidates = Array.from({ length: 5000 }, (_, i) => note(`n${i}`, i % 4, 200000 + i * 10)).reverse();
    expect(withoutNoteCollisions(candidates, existing)).toEqual(candidates);
    expect(existing[0].id).toBe("e0");
    expect(candidates[0].id).toBe("n4999");
  });

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
