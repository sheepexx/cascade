import type { ManiaNote, SnapDivisor, TimingPoint } from "../types";
import { withoutNoteCollisions } from "./noteCollision";
import { patternToNotes, type PatternNote } from "./patterns";
import { snapTime } from "./timing";

export const NOTE_CLIP_DRAG_TYPE = "application/x-cascade-note-clip";

export function positionPatternForDrop(
  pattern: PatternNote[],
  column: number,
  keyCount: number,
): PatternNote[] | null {
  if (!pattern.length || !Number.isInteger(column) || column < 0 || column >= keyCount) {
    return null;
  }
  let left = Infinity;
  let right = -Infinity;
  for (const note of pattern) {
    if (!Number.isInteger(note.column) || note.column < 0) return null;
    left = Math.min(left, note.column);
    right = Math.max(right, note.column);
  }
  const span = right - left + 1;
  if (span > keyCount) return null;
  const delta = Math.min(column, keyCount - span) - left;
  return pattern.map((note) => ({ ...note, column: note.column + delta }));
}

export function isClipboardTextTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (element?.isContentEditable) return true;
  if (element?.tagName === "TEXTAREA" || element?.tagName === "SELECT") return true;
  if (element?.tagName !== "INPUT") return false;
  return ![
    "range", "checkbox", "radio", "button", "submit",
    "reset", "color", "file", "image",
  ].includes((element as HTMLInputElement).type);
}

export function prepareNotePaste(
  pattern: PatternNote[],
  currentTime: number,
  keyCount: number,
  timingPoints: TimingPoint[],
  snapDivisor: SnapDivisor,
  existing: ManiaNote[],
  bounds: { lo: number; hi: number },
) {
  const base = snapTime(currentTime, timingPoints, snapDivisor);
  const candidates = patternToNotes(pattern, base, keyCount, timingPoints);
  const inBounds = candidates.filter(
    (n) =>
      n.startTime >= bounds.lo - 0.5 &&
      (n.endTime ?? n.startTime) <= bounds.hi + 0.5,
  );
  const notes = withoutNoteCollisions(inBounds, existing);
  const skipped = [
    candidates.length < pattern.length
      ? `${pattern.length - candidates.length} outside the current key count`
      : "",
    inBounds.length < candidates.length
      ? `${candidates.length - inBounds.length} outside the song or trim`
      : "",
    notes.length < inBounds.length
      ? `${inBounds.length - notes.length} overlapping existing or pasted notes`
      : "",
  ].filter(Boolean);
  const message = notes.length
    ? `Pasted ${notes.length} note${notes.length === 1 ? "" : "s"}.`
    : "Nothing pasted.";
  return {
    candidates,
    notes,
    message: skipped.length ? `${message} Skipped ${skipped.join("; ")}.` : message,
  };
}
