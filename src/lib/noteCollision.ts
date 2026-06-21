import type { ManiaNote } from "../types";

function noteEnd(note: ManiaNote): number {
  return note.endTime !== undefined && note.endTime > note.startTime
    ? note.endTime
    : note.startTime;
}

/** Whether two notes occupy the same column/time space. */
export function notesCollide(a: ManiaNote, b: ManiaNote): boolean {
  if (a.id === b.id || a.column !== b.column) return false;
  const aEnd = noteEnd(a);
  const bEnd = noteEnd(b);

  // Rice/rice duplicates, LN heads at the same time, and rice on an LN head.
  if (a.startTime === b.startTime) return true;

  // Long notes occupy [start, end). A rice note exactly on an LN tail is OK.
  return a.startTime < bEnd && b.startTime < aEnd;
}

export function hasNoteCollision(
  note: ManiaNote,
  existing: ManiaNote[],
): boolean {
  return existing.some((other) => notesCollide(note, other));
}

export function hasNoteCollisions(notes: ManiaNote[]): boolean {
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      if (notesCollide(notes[i], notes[j])) return true;
    }
  }
  return false;
}

/** Keep notes that do not collide with existing notes or earlier accepted notes. */
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
