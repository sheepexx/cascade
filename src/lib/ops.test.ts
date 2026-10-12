import { describe, it, expect } from "vitest";
import type { Difficulty, ManiaNote } from "../types";
import { makeDifficulty } from "../types";
import {
  applyDiffFieldOp,
  applyNoteOp,
  applyOp,
  invertNoteOp,
  isCollabOp,
  MAX_COLLAB_NOTES_PER_OP,
  opProblem,
  rebaseNoteOp,
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

  it("puts a restored note back in time order", () => {
    const start = docs([a, c]);
    const op: NoteOp = { t: "note.remove", diffId: "d1", notes: [a] };
    const undone = applyNoteOp(applyNoteOp(start, op), invertNoteOp(op));
    expect(ids(undone)).toEqual(["a", "c"]);
  });

  it("adds a note after the notes already at its time", () => {
    const twin = note("twin", 3, 1000);
    const added = applyNoteOp(docs([a, b, c]), { t: "note.add", diffId: "d1", notes: [twin] });
    expect(ids(added)).toEqual(["a", "b", "c", "twin"]);
    const early = note("early", 3, 250);
    expect(ids(applyNoteOp(docs([a, b, c]), { t: "note.add", diffId: "d1", notes: [early] }))).toEqual([
      "a",
      "early",
      "b",
      "c",
    ]);
  });

  it("does not add a note it already holds", () => {
    const start = docs([a, b]);
    expect(applyNoteOp(start, { t: "note.add", diffId: "d1", notes: [a] })).toEqual(start);
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

describe("isCollabOp", () => {
  it("accepts valid note and difficulty-field operations", () => {
    expect(isCollabOp({ t: "note.add", diffId: "d1", notes: [a, c] })).toBe(true);
    expect(
      isCollabOp({
        t: "note.update",
        diffId: "d1",
        before: [a],
        after: [{ ...a, startTime: 250 }],
        _from: "peer-id",
      }),
    ).toBe(true);
    expect(
      isCollabOp({ t: "diff.fields", diffId: "d1", fields: { fadeOutMs: 12 } }),
    ).toBe(true);
  });

  it.each([
    null,
    { t: "note.add", diffId: "d1", notes: "not-an-array" },
    { t: "note.add", diffId: "d1", notes: [{ ...a, startTime: NaN }] },
    { t: "note.add", diffId: "d1", notes: [{ ...a, column: 999 }] },
    { t: "note.update", diffId: "d1", before: [a] },
    { t: "diff.fields", diffId: "d1", fields: {} },
    { t: "diff.fields", diffId: "d1", fields: { keyCount: 7 } },
    { t: "unknown", diffId: "d1" },
  ])("rejects malformed operation %#", (value) => {
    expect(isCollabOp(value)).toBe(false);
  });

  it("bounds the number of notes accepted in one message", () => {
    const atLimit = Array.from({ length: MAX_COLLAB_NOTES_PER_OP }, (_, index) => ({
      ...a,
      id: `note-${index}`,
    }));
    expect(isCollabOp({ t: "note.add", diffId: "d1", notes: atLimit })).toBe(true);
    expect(
      isCollabOp({ t: "note.add", diffId: "d1", notes: [...atLimit, a] }),
    ).toBe(false);
  });
});

describe("opProblem", () => {
  it("refuses a note in column 17 of a 4K difficulty", () => {
    const op: NoteOp = { t: "note.add", diffId: "d1", notes: [note("x", 17, 1000)] };
    // Well-formed for some layout, so it passes the shape check...
    expect(isCollabOp(op)).toBe(true);
    // ...but not for the difficulty it targets.
    expect(opProblem(op, docs([a]))).toBe("column");
  });

  it("refuses an update that would move a note past the key count", () => {
    const op: NoteOp = { t: "note.update", diffId: "d1", before: [b], after: [{ ...b, column: 4 }] };
    expect(opProblem(op, docs([a, b]))).toBe("column");
  });

  it("accepts notes that fit and a removal of any note", () => {
    expect(opProblem({ t: "note.add", diffId: "d1", notes: [note("x", 3, 0)] }, docs([]))).toBeNull();
    expect(opProblem({ t: "note.remove", diffId: "d1", notes: [note("x", 17, 0)] }, docs([]))).toBeNull();
  });

  it("names an op for a difficulty this window doesn't have", () => {
    expect(opProblem({ t: "note.add", diffId: "new", notes: [a] }, docs([]))).toBe("unknownDifficulty");
  });

  it("refuses a NaN time before any difficulty is consulted", () => {
    expect(isCollabOp({ t: "note.add", diffId: "d1", notes: [{ id: "x", column: 0, startTime: Number.NaN }] })).toBe(false);
  });
});

/**
 * Two windows sharing a difficulty: each applies its own ops directly and the
 * other's through applyOp, as a live session does. Undo is the inverse op
 * rebased onto the document as it is when the user presses it.
 */
function session(notes: ManiaNote[]) {
  let doc = docs(notes);
  const notesNow = () => doc.find((d) => d.id === "d1")!.notes;
  const find = (id: string) => notesNow().find((n) => n.id === id);
  return {
    find,
    notesNow,
    local(op: NoteOp) {
      doc = applyNoteOp(doc, op);
      return op;
    },
    remote(op: NoteOp) {
      doc = applyOp(doc, op);
    },
    undo(op: NoteOp) {
      const rebased = rebaseNoteOp(doc, invertNoteOp(op));
      if (rebased.op) doc = applyNoteOp(doc, rebased.op);
      return rebased;
    },
    redo(op: NoteOp) {
      const rebased = rebaseNoteOp(doc, op);
      if (rebased.op) doc = applyNoteOp(doc, rebased.op);
      return rebased;
    },
  };
}

const move = (from: ManiaNote, changes: Partial<ManiaNote>): NoteOp => ({
  t: "note.update",
  diffId: "d1",
  before: [from],
  after: [{ ...from, ...changes }],
});

describe("collaborative undo", () => {
  const n = note("n", 0, 1000);

  it("keeps a collaborator's later move when undoing an earlier one", () => {
    // Alice moves 1000 -> 1100, Bob moves 1100 -> 1200, Alice undoes.
    const alice = session([n]);
    const aliceMove = alice.local(move(n, { startTime: 1100 }));
    const bobMove = move({ ...n, startTime: 1100 }, { startTime: 1200 });
    alice.remote(bobMove);
    const result = alice.undo(aliceMove);
    expect(alice.find("n")?.startTime).toBe(1200);
    expect(result).toEqual({ op: null, kept: 1 });
  });

  it("undoes the user's own move normally when nobody touched the note", () => {
    const alice = session([n]);
    const aliceMove = alice.local(move(n, { startTime: 1100 }));
    expect(alice.undo(aliceMove).kept).toBe(0);
    expect(alice.find("n")).toEqual(n);
    alice.redo(aliceMove);
    expect(alice.find("n")?.startTime).toBe(1100);
  });

  it("undoes one field while keeping a collaborator's change to another", () => {
    const alice = session([n]);
    const aliceMove = alice.local(move(n, { startTime: 1100 }));
    alice.remote(move({ ...n, startTime: 1100 }, { column: 3 }));
    const result = alice.undo(aliceMove);
    expect(alice.find("n")).toEqual({ ...n, startTime: 1000, column: 3 });
    expect(result.kept).toBe(0);
  });

  it("redo restores only the fields undo gave back", () => {
    const alice = session([n]);
    const aliceMove = alice.local(move(n, { startTime: 1100, column: 1 }));
    alice.remote(move({ ...n, startTime: 1100, column: 1 }, { column: 2 }));
    alice.undo(aliceMove);
    expect(alice.find("n")).toEqual({ ...n, startTime: 1000, column: 2 });
    alice.redo(aliceMove);
    expect(alice.find("n")).toEqual({ ...n, startTime: 1100, column: 2 });
  });

  it("doesn't delete a note a collaborator edited when undoing its placement", () => {
    const alice = session([]);
    const placed = alice.local({ t: "note.add", diffId: "d1", notes: [n] });
    alice.remote(move(n, { startTime: 1500 }));
    expect(alice.undo(placed)).toEqual({ op: null, kept: 1 });
    expect(alice.find("n")?.startTime).toBe(1500);
  });

  it("deletes the user's own unchanged placement on undo and places it again on redo", () => {
    const alice = session([]);
    const placed = alice.local({ t: "note.add", diffId: "d1", notes: [n] });
    alice.undo(placed);
    expect(alice.find("n")).toBeUndefined();
    alice.redo(placed);
    expect(alice.find("n")).toEqual(n);
  });

  it("leaves a note deleted when a collaborator deleted it after the user moved it", () => {
    const alice = session([n]);
    const aliceMove = alice.local(move(n, { startTime: 1100 }));
    alice.remote({ t: "note.remove", diffId: "d1", notes: [{ ...n, startTime: 1100 }] });
    expect(alice.undo(aliceMove)).toEqual({ op: null, kept: 1 });
    expect(alice.find("n")).toBeUndefined();
  });

  it("restores a note the user deleted, unless someone already restored it", () => {
    const alice = session([n]);
    const removed = alice.local({ t: "note.remove", diffId: "d1", notes: [n] });
    alice.undo(removed);
    expect(alice.find("n")).toEqual(n);
    const redo = alice.redo(removed);
    expect(redo.op?.t).toBe("note.remove");
    expect(alice.find("n")).toBeUndefined();
  });

  it("doesn't redo a delete over a collaborator's edit", () => {
    const alice = session([n]);
    const removed = alice.local({ t: "note.remove", diffId: "d1", notes: [n] });
    alice.undo(removed);
    alice.remote(move(n, { column: 2 }));
    expect(alice.redo(removed)).toEqual({ op: null, kept: 1 });
    expect(alice.find("n")?.column).toBe(2);
  });

  it("refuses a field mix that would leave a hold ending before it starts", () => {
    const hold = note("h", 0, 1000, 1500);
    const alice = session([hold]);
    const lengthen = alice.local(move(hold, { endTime: 3000 }));
    // Bob moves the hold's start past Alice's original end.
    alice.remote(move({ ...hold, endTime: 3000 }, { startTime: 2000 }));
    expect(alice.undo(lengthen)).toEqual({ op: null, kept: 1 });
    expect(alice.find("h")).toEqual({ ...hold, startTime: 2000, endTime: 3000 });
  });

  it("treats only the notes that changed as kept in a multi-note undo", () => {
    const other = note("o", 1, 2000);
    const alice = session([n, other]);
    const both: NoteOp = {
      t: "note.update",
      diffId: "d1",
      before: [n, other],
      after: [{ ...n, startTime: 1100 }, { ...other, startTime: 2100 }],
    };
    alice.local(both);
    alice.remote(move({ ...other, startTime: 2100 }, { startTime: 2200 }));
    const result = alice.undo(both);
    expect(result.kept).toBe(1);
    expect(alice.find("n")?.startTime).toBe(1000);
    expect(alice.find("o")?.startTime).toBe(2200);
  });
});

describe("applyOp with a stale op", () => {
  it("ignores a delayed move whose starting point is gone", () => {
    const n = note("n", 0, 1000);
    const bob = session([{ ...n, startTime: 1200 }]);
    // Bob's first move (1000 -> 1100) arrives after the document already has 1200.
    bob.remote(move(n, { startTime: 1100 }));
    expect(bob.find("n")?.startTime).toBe(1200);
  });

  it("doesn't add a second copy, or overwrite a note, with a repeated add", () => {
    const n = note("n", 0, 1000);
    const doc = session([{ ...n, column: 2 }]);
    doc.remote({ t: "note.add", diffId: "d1", notes: [n] });
    expect(doc.notesNow()).toEqual([{ ...n, column: 2 }]);
  });
});
