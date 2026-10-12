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

/** Applies a collaborator's op. Note ops apply only where still current: see rebaseNoteOp. */
export function applyOp(
  difficulties: Difficulty[],
  op: CollabOp,
): Difficulty[] {
  return op.t === "diff.fields"
    ? applyDiffFieldOp(difficulties, op)
    : applyNoteOpIfCurrent(difficulties, op);
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

/** Every field a note op can change; the id is what ties a note across edits. */
const NOTE_FIELDS = [
  "column",
  "startTime",
  "endTime",
  "hitSound",
  "sampleSet",
  "additionSet",
  "sampleIndex",
  "sampleVolume",
  "sampleFile",
] as const satisfies readonly (keyof ManiaNote)[];

export function sameNote(a: ManiaNote, b: ManiaNote): boolean {
  return a.id === b.id && NOTE_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * `current` moved field by field from `from` towards `to`: each field that
 * still holds `from`'s value takes `to`'s, and a field someone has changed
 * since keeps its newer value. Null when nothing would change, or when the
 * fields that could move would leave a hold ending before it starts.
 */
function moveFields(current: ManiaNote, from: ManiaNote, to: ManiaNote): ManiaNote | null {
  let next: ManiaNote | null = null;
  for (const field of NOTE_FIELDS) {
    if (current[field] !== from[field] || from[field] === to[field]) continue;
    next ??= { ...current };
    if (to[field] === undefined) delete next[field];
    else (next as Record<string, unknown>)[field] = to[field];
  }
  if (next && next.endTime !== undefined && !(next.endTime > next.startTime)) return null;
  return next;
}

export type RebasedNoteOp = {
  /** What actually applies to the current document, or null for nothing. */
  op: NoteOp | null;
  /** Notes left alone because someone else changed or removed them since. */
  kept: number;
};

/**
 * Re-applies an op to a document that may have moved on since it was made.
 *
 * An op is read as "each note goes from this to that": an add takes a note
 * from absent to present, a remove the other way, an update from `before` to
 * `after`. Applied to today's document, a note only takes the step if it is
 * still where the op started:
 *
 * - an add places a note that isn't there; one that is, is left as it is;
 * - a remove deletes a note only while it is unchanged, so a note a
 *   collaborator edited since is kept rather than deleted under them;
 * - an update moves only the fields that still hold `before`'s value, so a
 *   later change by someone else to the same field survives, and a change
 *   to a different field of the same note combines with it. A note that is
 *   gone stays gone.
 *
 * Undo in a live session is the inverse op rebased this way, so undoing
 * never erases a collaborator's later work; redo is the op itself rebased.
 * Incoming ops go through it too, so a stale or repeated op can't revert a
 * newer change.
 */
export function rebaseNoteOp(difficulties: Difficulty[], op: NoteOp): RebasedNoteOp {
  const target = difficulties.find((d) => d.id === op.diffId);
  if (!target) return { op: null, kept: 0 };
  const touched = new Set(
    op.t === "note.update" ? op.before.map((n) => n.id) : op.notes.map((n) => n.id),
  );
  const current = new Map<string, ManiaNote>();
  for (const note of target.notes) if (touched.has(note.id)) current.set(note.id, note);
  let kept = 0;

  switch (op.t) {
    case "note.add": {
      const notes = op.notes.filter((note) => {
        const now = current.get(note.id);
        if (now && !sameNote(now, note)) kept += 1;
        return !now;
      });
      return { op: notes.length ? { ...op, notes } : null, kept };
    }
    case "note.remove": {
      const notes: ManiaNote[] = [];
      for (const note of op.notes) {
        const now = current.get(note.id);
        if (!now) continue;
        if (sameNote(now, note)) notes.push(now);
        else kept += 1;
      }
      return { op: notes.length ? { ...op, notes } : null, kept };
    }
    case "note.update": {
      const before: ManiaNote[] = [];
      const after: ManiaNote[] = [];
      const targets = new Map(op.after.map((n) => [n.id, n]));
      for (const from of op.before) {
        const to = targets.get(from.id);
        const now = current.get(from.id);
        if (!to) continue;
        if (!now) {
          kept += 1;
          continue;
        }
        const next = moveFields(now, from, to);
        if (next) {
          before.push(now);
          after.push(next);
        } else if (!sameNote(now, to)) {
          kept += 1;
        }
      }
      return { op: before.length ? { ...op, before, after } : null, kept };
    }
  }
}

/** applyNoteOp for an op that may be stale: see rebaseNoteOp. */
export function applyNoteOpIfCurrent(difficulties: Difficulty[], op: NoteOp): Difficulty[] {
  const rebased = rebaseNoteOp(difficulties, op).op;
  return rebased ? applyNoteOp(difficulties, rebased) : difficulties;
}
