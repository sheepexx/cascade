import { MAX_KEYS } from "../types";
import type { Difficulty, ManiaNote, SongMeta, TimingPoint } from "../types";
import { CHART_LIMITS, isFiniteNumber, isValidNote } from "./chartValidation";

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

export const MAX_COLLAB_NOTES_PER_OP = 10_000;
const MAX_COLLAB_ID_LENGTH = CHART_LIMITS.maxIdLength;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

/**
 * A note shaped like one, before anyone knows which difficulty it is for:
 * the column is only checked against the widest layout here, and against the
 * real key count in opProblem once the target difficulty is known.
 */
function isManiaNote(value: unknown): value is ManiaNote {
  return isValidNote(value, MAX_KEYS);
}

function isNoteArray(value: unknown): value is ManiaNote[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_COLLAB_NOTES_PER_OP &&
    value.every(isManiaNote)
  );
}

/** Validate untrusted Realtime payloads before they reach editor state. */
export function isCollabOp(value: unknown): value is CollabOp {
  if (!isRecord(value) || !isBoundedString(value.diffId, MAX_COLLAB_ID_LENGTH)) {
    return false;
  }
  if (value.t === "note.add" || value.t === "note.remove") {
    return isNoteArray(value.notes);
  }
  if (value.t === "note.update") {
    return isNoteArray(value.before) && isNoteArray(value.after);
  }
  if (value.t !== "diff.fields" || !isRecord(value.fields)) return false;
  const entries = Object.entries(value.fields);
  return (
    entries.length > 0 &&
    entries.every(
      ([field, fieldValue]) =>
        DIFF_FIELDS.includes(field as DiffField) &&
        (fieldValue === null || isFiniteNumber(fieldValue)),
    )
  );
}

export type OpProblem = "unknownDifficulty" | "column";

/**
 * Why a well-formed op can't apply to this map, or null. isCollabOp only
 * knows the widest layout, so a note in column 17 passes it even when the
 * difficulty has 4 keys; this checks the notes an op would leave in place
 * against the difficulty it targets. An op for a difficulty this window
 * doesn't have yet (a collaborator just added it) is not an error: the
 * difficulty and its notes arrive with the next saved snapshot.
 */
export function opProblem(op: CollabOp, difficulties: Difficulty[]): OpProblem | null {
  const target = difficulties.find((d) => d.id === op.diffId);
  if (!target) return "unknownDifficulty";
  const placed = op.t === "note.add" ? op.notes : op.t === "note.update" ? op.after : [];
  for (const note of placed) {
    if (!isValidNote(note, target.keyCount)) return "column";
  }
  return null;
}

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

/**
 * The notes of `add` that `existing` does not hold yet. A placement adds one
 * note, and hashing every id of a 100k-note difficulty for it cost more than
 * the rest of the edit, so small adds scan instead.
 */
function notesNotIn(add: ManiaNote[], existing: ManiaNote[]): ManiaNote[] {
  if (add.length <= 8) {
    return add.filter((note) => !existing.some((other) => other.id === note.id));
  }
  const have = new Set(existing.map((n) => n.id));
  return add.filter((n) => !have.has(n.id));
}

/**
 * Inserts notes in time order, each after the notes already at its time, so a
 * time-sorted difficulty stays sorted and notes at the same time keep the
 * order an append gave them (which osu!'s star rating depends on).
 */
export function insertByTime(notes: ManiaNote[], add: ManiaNote[]): ManiaNote[] {
  if (add.length > 64) {
    return [...notes, ...add];
  }
  const next = notes.slice();
  for (const note of add) {
    let lo = 0;
    let hi = next.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (next[mid].startTime <= note.startTime) lo = mid + 1;
      else hi = mid;
    }
    next.splice(lo, 0, note);
  }
  return next;
}

export function applyNoteOp(
  difficulties: Difficulty[],
  op: NoteOp,
): Difficulty[] {
  return difficulties.map((d) => {
    if (d.id !== op.diffId) return d;
    switch (op.t) {
      case "note.add": {
        const add = notesNotIn(op.notes, d.notes);
        return add.length ? { ...d, notes: insertByTime(d.notes, add) } : d;
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
