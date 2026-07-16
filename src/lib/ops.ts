import type { Difficulty, ManiaNote, SongMeta, TimingPoint } from "../types";

export type DocState = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
};

export type NoteOp =
  | { t: "note.add"; diffId: string; notes: ManiaNote[] }
  | { t: "note.remove"; diffId: string; notes: ManiaNote[] }
  | { t: "note.update"; diffId: string; before: ManiaNote[]; after: ManiaNote[] };

export type DiffField = "trimStartMs" | "trimEndMs" | "fadeInMs" | "fadeOutMs";
const DIFF_FIELDS: readonly DiffField[] = [
  "trimStartMs",
  "trimEndMs",
  "fadeInMs",
  "fadeOutMs",
];

export type DiffFieldOp = {
  t: "diff.fields";
  diffId: string;
  fields: Partial<Record<DiffField, number | null>>;
};

export type CollabOp = NoteOp | DiffFieldOp;

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

export function applyOp(
  difficulties: Difficulty[],
  op: CollabOp,
): Difficulty[] {
  return op.t === "diff.fields"
    ? applyDiffFieldOp(difficulties, op)
    : applyNoteOp(difficulties, op);
}

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
