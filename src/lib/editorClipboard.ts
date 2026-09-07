import type { ManiaNote, SnapDivisor, TimingPoint } from "../types";
import { withoutNoteCollisions } from "./noteCollision";
import { patternToNotes, type PatternNote } from "./patterns";
import { snapTime } from "./timing";

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
    notes,
    message: skipped.length ? `${message} Skipped ${skipped.join("; ")}.` : message,
  };
}
