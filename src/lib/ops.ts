import type { Difficulty, ManiaNote, SongMeta, TimingPoint } from "../types";

/**
 * Collaborative edit operations.
 *
 * Note edits (the frequent, concurrency-sensitive ones) are granular ops keyed
 * by note id, so two people editing the same difficulty converge under
 * last-write-wins per note. They are also invertible, which powers personal
 * synced undo. Structural changes (metadata, timing, difficulty add/remove/
 * rename) are infrequent and instead sync the whole document as a `DocState`
 * (see useCollab's doc-sync), so they don't need per-op inverses.
 */

/** The shared, undoable document (matches App's note/timing/meta state). */
export type DocState = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
};

export type NoteOp =
  | { t: "note.add"; diffId: string; notes: ManiaNote[] }
  | { t: "note.remove"; diffId: string; notes: ManiaNote[] }
  | { t: "note.update"; diffId: string; before: ManiaNote[]; after: ManiaNote[] };

/** The trim/fade fields that sync as a granular per-difficulty op. */
export type DiffField = "trimStartMs" | "trimEndMs" | "fadeInMs" | "fadeOutMs";
const DIFF_FIELDS: readonly DiffField[] = [
  "trimStartMs",
  "trimEndMs",
  "fadeInMs",
  "fadeOutMs",
];

/**
 * A granular update to a difficulty's playback-region fields (trim brackets +
 * fades). These are dragged continuously, so — like note edits — they sync as a
 * small op (just the changed fields) instead of a whole-document broadcast, so
 * a drag can't flood the channel or clobber a peer's concurrent note edits.
 * `null` clears the field (drops back to the song boundary / no fade); JSON
 * keeps `null` where it would drop `undefined`.
 */
export type DiffFieldOp = {
  t: "diff.fields";
  diffId: string;
  fields: Partial<Record<DiffField, number | null>>;
};

/** Any op broadcast over the live "op" channel. */
export type CollabOp = NoteOp | DiffFieldOp;

/** Apply a diff-field op, returning a new array. */
export function applyDiffFieldOp(
  difficulties: Difficulty[],
  op: DiffFieldOp,
): Difficulty[] {
  return difficulties.map((d) => {
    if (d.id !== op.diffId) return d;
    const next: Difficulty = { ...d };
    for (const k of DIFF_FIELDS) {
      if (!(k in op.fields)) continue;
      const v = op.fields[k];
      if (v == null) delete next[k];
      else next[k] = v;
    }
    return next;
  });
}

/** Apply any collab op (note or diff-field), returning a new array. */
export function applyOp(
  difficulties: Difficulty[],
  op: CollabOp,
): Difficulty[] {
  return op.t === "diff.fields"
    ? applyDiffFieldOp(difficulties, op)
    : applyNoteOp(difficulties, op);
}

/** Apply a note op to a difficulties array, returning a new array. */
export function applyNoteOp(
  difficulties: Difficulty[],
  op: NoteOp,
): Difficulty[] {
  return difficulties.map((d) => {
    if (d.id !== op.diffId) return d;
    switch (op.t) {
      case "note.add": {
        const have = new Set(d.notes.map((n) => n.id));
        const add = op.notes.filter((n) => !have.has(n.id));
        return add.length ? { ...d, notes: [...d.notes, ...add] } : d;
      }
      case "note.remove": {
        const ids = new Set(op.notes.map((n) => n.id));
        return { ...d, notes: d.notes.filter((n) => !ids.has(n.id)) };
      }
      case "note.update": {
        const byId = new Map(op.after.map((n) => [n.id, n]));
        return { ...d, notes: d.notes.map((n) => byId.get(n.id) ?? n) };
      }
    }
  });
}

/** The inverse of a note op (for undo / redo). */
export function invertNoteOp(op: NoteOp): NoteOp {
  switch (op.t) {
    case "note.add":
      return { t: "note.remove", diffId: op.diffId, notes: op.notes };
    case "note.remove":
      return { t: "note.add", diffId: op.diffId, notes: op.notes };
    case "note.update":
      return {
        t: "note.update",
        diffId: op.diffId,
        before: op.after,
        after: op.before,
      };
  }
}
