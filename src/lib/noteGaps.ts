import type { ManiaNote } from "../types";

/**
 * Milliseconds from the end of the previous note in the same lane to the
 * start of `note`, or null when nothing comes before it in that lane.
 */
export function gapBefore(note: ManiaNote, notes: ManiaNote[]): number | null {
  let previous: ManiaNote | null = null;
  for (const n of notes) {
    if (n.column !== note.column || n.id === note.id || n.startTime >= note.startTime) continue;
    if (!previous || n.startTime > previous.startTime) previous = n;
  }
  return previous ? note.startTime - (previous.endTime ?? previous.startTime) : null;
}
