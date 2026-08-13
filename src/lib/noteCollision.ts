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

export function withoutNoteCollisions(
  notes: ManiaNote[],
  existing: ManiaNote[],
): ManiaNote[] {
  const accepted: ManiaNote[] = [];
  for (const note of notes) {
    if (hasNoteCollision(note, existing) || hasNoteCollision(note, accepted)) {
      continue;
    }
    accepted.push(note);
  }
  return accepted;
}

export function sameNoteGeometry(a: ManiaNote, b: ManiaNote): boolean {
  return (
    a.column === b.column &&
    a.startTime === b.startTime &&
    (a.endTime ?? undefined) === (b.endTime ?? undefined)
  );
}
