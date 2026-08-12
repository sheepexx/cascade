import { describe, it, expect } from "vitest";
import type { Difficulty, ManiaNote } from "../types";
import { makeDifficulty } from "../types";
import {
  applyDiffFieldOp,
  applyNoteOp,
  applyOp,
  invertNoteOp,
  type NoteOp,
} from "./ops";

const note = (id: string, column: number, startTime: number, endTime?: number): ManiaNote =>
  endTime === undefined
    ? { id, column, startTime }
    : { id, column, startTime, endTime };

const a = note("a", 0, 0);
const b = note("b", 1, 500);
const c = note("c", 2, 1000, 1500);

function docs(notes: ManiaNote[]): Difficulty[] {
  return [
    { ...makeDifficulty("Easy", 4), id: "d1", notes },
    { ...makeDifficulty("Hard", 4), id: "d2", notes: [] },
  ];
}

const ids = (diffs: Difficulty[], diffId = "d1") =>
  diffs.find((d) => d.id === diffId)!.notes.map((n) => n.id);

describe("applyNoteOp", () => {
  it("adds notes to the addressed difficulty only", () => {
    const next = applyNoteOp(docs([a]), { t: "note.add", diffId: "d1", notes: [b] });
    expect(ids(next)).toEqual(["a", "b"]);
    expect(ids(next, "d2")).toEqual([]);
  });

  it("ignores an add for a difficulty that is not present", () => {
    const before = docs([a]);
    const next = applyNoteOp(before, { t: "note.add", diffId: "gone", notes: [b] });
    expect(ids(next)).toEqual(["a"]);
  });

  it("is idempotent when the same add arrives twice", () => {
    const op: NoteOp = { t: "note.add", diffId: "d1", notes: [b] };
    const once = applyNoteOp(docs([a]), op);
    const twice = applyNoteOp(once, op);
    expect(ids(twice)).toEqual(["a", "b"]);
  });

  it("is idempotent when the same remove arrives twice", () => {
    const op: NoteOp = { t: "note.remove", diffId: "d1", notes: [b] };
    const once = applyNoteOp(docs([a, b]), op);
    const twice = applyNoteOp(once, op);
    expect(ids(twice)).toEqual(["a"]);
  });

  it("drops a remove for notes that are already gone", () => {
    const next = applyNoteOp(docs([a]), {
      t: "note.remove",
      diffId: "d1",
      notes: [b, c],
    });
    expect(ids(next)).toEqual(["a"]);
  });

  it("updates only the notes named in the op", () => {
    const moved = { ...b, startTime: 750 };
    const next = applyNoteOp(docs([a, b, c]), {
      t: "note.update",
      diffId: "d1",
      before: [b],
      after: [moved],
    });
    const notes = next.find((d) => d.id === "d1")!.notes;
    expect(notes.map((n) => n.startTime)).toEqual([0, 750, 1000]);
    expect(notes[0]).toBe(a);
    expect(notes[2]).toBe(c);
  });

  it("leaves the document alone when an update names unknown notes", () => {
    const next = applyNoteOp(docs([a]), {
      t: "note.update",
      diffId: "d1",
      before: [b],
      after: [{ ...b, startTime: 900 }],
    });
    expect(next.find((d) => d.id === "d1")!.notes).toEqual([a]);
  });

  it("converges regardless of the order two disjoint adds arrive in", () => {
    const addB: NoteOp = { t: "note.add", diffId: "d1", notes: [b] };
    const addC: NoteOp = { t: "note.add", diffId: "d1", notes: [c] };
    const bThenC = applyNoteOp(applyNoteOp(docs([a]), addB), addC);
    const cThenB = applyNoteOp(applyNoteOp(docs([a]), addC), addB);
    expect(ids(bThenC).sort()).toEqual(ids(cThenB).sort());
  });
});

describe("invertNoteOp", () => {
  const cases: NoteOp[] = [
    { t: "note.add", diffId: "d1", notes: [b, c] },
    { t: "note.remove", diffId: "d1", notes: [a] },
    {
      t: "note.update",
      diffId: "d1",
      before: [a],
      after: [{ ...a, column: 3 }],
    },
  ];

  it.each(cases.map((op) => [op.t, op] as const))(
    "undoes %s back to the original notes",
    (_label, op) => {
      const start = docs([a]);
      const applied = applyNoteOp(start, op);
      const undone = applyNoteOp(applied, invertNoteOp(op));
      const before = start.find((d) => d.id === "d1")!.notes;
      const after = undone.find((d) => d.id === "d1")!.notes;
      expect([...after].sort((x, y) => x.id.localeCompare(y.id))).toEqual(
        [...before].sort((x, y) => x.id.localeCompare(y.id)),
      );
    },
  );

  it("restores a removed note without preserving its slot in the array", () => {
    const start = docs([a, c]);
    const op: NoteOp = { t: "note.remove", diffId: "d1", notes: [a] };
    const undone = applyNoteOp(applyNoteOp(start, op), invertNoteOp(op));
    expect(ids(undone)).toEqual(["c", "a"]);
  });

  it("is its own inverse when applied twice", () => {
    for (const op of cases) {
      expect(invertNoteOp(invertNoteOp(op))).toEqual(op);
    }
  });
});

describe("applyDiffFieldOp", () => {
  it("sets the named fields on the addressed difficulty", () => {
    const next = applyDiffFieldOp(docs([a]), {
      t: "diff.fields",
      diffId: "d1",
      fields: { trimStartMs: 250, fadeInMs: 40 },
    });
    const d1 = next.find((d) => d.id === "d1")!;
    expect(d1.trimStartMs).toBe(250);
    expect(d1.fadeInMs).toBe(40);
  });

  it("clears a field when the op carries null", () => {
    const seeded = applyDiffFieldOp(docs([a]), {
      t: "diff.fields",
      diffId: "d1",
      fields: { trimEndMs: 9000 },
    });
    const cleared = applyDiffFieldOp(seeded, {
      t: "diff.fields",
      diffId: "d1",
      fields: { trimEndMs: null },
    });
    const d1 = cleared.find((d) => d.id === "d1")!;
    expect("trimEndMs" in d1).toBe(false);
  });

  it("leaves fields the op does not mention untouched", () => {
    const seeded = applyDiffFieldOp(docs([a]), {
      t: "diff.fields",
      diffId: "d1",
      fields: { trimStartMs: 100, trimEndMs: 200 },
    });
    const next = applyDiffFieldOp(seeded, {
      t: "diff.fields",
      diffId: "d1",
      fields: { trimStartMs: 300 },
    });
    const d1 = next.find((d) => d.id === "d1")!;
    expect(d1.trimStartMs).toBe(300);
    expect(d1.trimEndMs).toBe(200);
  });

  it("ignores keys that are not sync-able difficulty fields", () => {
    const next = applyDiffFieldOp(docs([a]), {
      t: "diff.fields",
      diffId: "d1",
      fields: { keyCount: 7 } as never,
    });
    expect(next.find((d) => d.id === "d1")!.keyCount).toBe(4);
  });
});

describe("applyOp", () => {
  it("routes note ops and field ops to the right handler", () => {
    const withNote = applyOp(docs([a]), {
      t: "note.add",
      diffId: "d1",
      notes: [b],
    });
    expect(ids(withNote)).toEqual(["a", "b"]);

    const withField = applyOp(docs([a]), {
      t: "diff.fields",
      diffId: "d1",
      fields: { fadeOutMs: 12 },
    });
    expect(withField.find((d) => d.id === "d1")!.fadeOutMs).toBe(12);
  });
});
