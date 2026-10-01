import type { ManiaNote } from "../types";

function noteEnd(note: ManiaNote): number {
  return note.endTime !== undefined && note.endTime > note.startTime
    ? note.endTime
    : note.startTime;
}

export function notesCollide(a: ManiaNote, b: ManiaNote): boolean {
  if (a.id === b.id || a.column !== b.column) return false;
  const aEnd = noteEnd(a);
  const bEnd = noteEnd(b);

  if (a.startTime === b.startTime) return true;

  return a.startTime < bEnd && b.startTime < aEnd;
}

export function hasNoteCollision(
  note: ManiaNote,
  existing: ManiaNote[],
): boolean {
  return existing.some((other) => notesCollide(note, other));
}

export function hasNoteCollisions(notes: ManiaNote[]): boolean {
  const columns = new Map<number, ManiaNote[]>();
  for (const note of notes) {
    const column = columns.get(note.column);
    if (column) column.push(note);
    else columns.set(note.column, [note]);
  }
  for (const column of columns.values()) {
    column.sort(
      (a, b) =>
        a.startTime - b.startTime ||
        noteEnd(b) - noteEnd(a) ||
        a.id.localeCompare(b.id),
    );
    let lastStart = -Infinity;
    let occupiedUntil = -Infinity;
    for (const note of column) {
      if (note.startTime === lastStart || note.startTime < occupiedUntil) {
        return true;
      }
      lastStart = note.startTime;
      occupiedUntil = Math.max(occupiedUntil, noteEnd(note));
    }
  }
  return false;
}

/**
 * The existing notes that overlap the span `notes` covers. Only these can
 * collide, so a paste into a 100k-note difficulty checks a handful of
 * neighbours instead of every note for every pasted one.
 */
function notesNear(notes: ManiaNote[], existing: ManiaNote[]): ManiaNote[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const note of notes) {
    if (note.startTime < lo) lo = note.startTime;
    const end = noteEnd(note);
    if (end > hi) hi = end;
  }
  return existing.filter((other) => other.startTime <= hi && noteEnd(other) >= lo);
}

export function withoutNoteCollisions(
  notes: ManiaNote[],
  allExisting: ManiaNote[],
): ManiaNote[] {
  const existing = notes.length ? notesNear(notes, allExisting) : allExisting;
  const accepted: ManiaNote[] = [];
  if (notes.length <= 32) {
    for (const note of notes) {
      if (!hasNoteCollision(note, existing) && !hasNoteCollision(note, accepted)) {
        accepted.push(note);
      }
    }
    return accepted;
  }
  const columns = new Map<number, ManiaNote[]>();
  for (const note of notes) {
    const column = columns.get(note.column);
    if (column) column.push(note);
    else columns.set(note.column, [note]);
  }
  for (const note of existing) columns.get(note.column)?.push(note);
  const indexes = new Map(
    [...columns].map(([column, candidates]) => [
      column, new NoteCollisionIndex(candidates),
    ]),
  );
  for (const note of existing) indexes.get(note.column)?.add(note);
  for (const note of notes) {
    const index = indexes.get(note.column)!;
    if (index.collides(note)) continue;
    accepted.push(note);
    index.add(note);
  }
  return accepted;
}

class NoteCollisionIndex {
  private starts: number[];
  private positions: Map<number, number>;
  private buckets = new Map<number, ManiaNote[]>();
  private maxEnd: Float64Array;
  private size: number;

  constructor(notes: ManiaNote[]) {
    this.starts = [...new Set(notes.map((n) => n.startTime))].sort((a, b) => a - b);
    this.positions = new Map(this.starts.map((time, i) => [time, i]));
    this.size = 1;
    while (this.size < this.starts.length) this.size *= 2;
    this.maxEnd = new Float64Array(this.size * 2).fill(-Infinity);
  }

  add(note: ManiaNote) {
    const position = this.positions.get(note.startTime)!;
    const bucket = this.buckets.get(position);
    if (bucket) bucket.push(note);
    else this.buckets.set(position, [note]);
    let node = this.size + position;
    const end = noteEnd(note);
    while (node > 0 && end > this.maxEnd[node]) {
      this.maxEnd[node] = end;
      node >>= 1;
    }
  }

  collides(note: ManiaNote, node = 1, lo = 0, hi = this.size - 1): boolean {
    if (
      lo >= this.starts.length ||
      this.starts[lo] > noteEnd(note) ||
      this.maxEnd[node] < note.startTime
    ) return false;
    if (lo === hi) {
      return this.buckets.get(lo)?.some((other) => notesCollide(note, other))
        ?? false;
    }
    const mid = (lo + hi) >> 1;
    return this.collides(note, node * 2, lo, mid)
      || this.collides(note, node * 2 + 1, mid + 1, hi);
  }
}

export function sameNoteGeometry(a: ManiaNote, b: ManiaNote): boolean {
  return (
    a.column === b.column &&
    a.startTime === b.startTime &&
    (a.endTime ?? undefined) === (b.endTime ?? undefined)
  );
}

export type NotePlacement =
  | { kind: "add" }
  | { kind: "replace"; replaced: ManiaNote }
  | { kind: "blocked" };

/**
 * How placing `note` lands among `existing`. Like osu!lazer, a note placed at
 * the very moment another starts in its column replaces that one; anything it
 * would still overlap after that keeps the placement from happening.
 */
export function placementFor(note: ManiaNote, existing: ManiaNote[]): NotePlacement {
  const collisions = existing.filter(
    (other) => other.column === note.column && notesCollide(note, other),
  );
  if (collisions.length === 0) return { kind: "add" };
  if (collisions.length === 1 && Math.abs(collisions[0].startTime - note.startTime) < 1)
    return { kind: "replace", replaced: collisions[0] };
  return { kind: "blocked" };
}
