import type { ManiaNote } from "../types";

/**
 * Selection helpers. Each returns the ids to select, so callers can hand the
 * result straight to the editor's setSelection without knowing how a selection
 * is stored.
 */

function idsOf(notes: ManiaNote[]): Set<string> {
  return new Set(notes.map((n) => n.id));
}

function noteEnd(n: ManiaNote): number {
  return n.endTime !== undefined && n.endTime > n.startTime
    ? n.endTime
    : n.startTime;
}

/** Every note in one column. */
export function selectColumn(
  notes: ManiaNote[],
  column: number,
): Set<string> {
  return idsOf(notes.filter((n) => n.column === column));
}

/** Every note in the columns the current selection already touches. */
export function selectSameColumns(
  notes: ManiaNote[],
  ids: ReadonlySet<string>,
): Set<string> {
  const columns = new Set<number>();
  for (const n of notes) if (ids.has(n.id)) columns.add(n.column);
  if (!columns.size) return new Set(ids);
  return idsOf(notes.filter((n) => columns.has(n.column)));
}

/** Every long note. */
export function selectLongNotes(notes: ManiaNote[]): Set<string> {
  return idsOf(notes.filter((n) => noteEnd(n) > n.startTime));
}

/** Every rice note. */
export function selectRiceNotes(notes: ManiaNote[]): Set<string> {
  return idsOf(notes.filter((n) => noteEnd(n) === n.startTime));
}

/**
 * Every note starting inside [start, end]. Bounds are inclusive so a range
 * taken from two bookmarks catches notes sitting exactly on them.
 */
export function selectRange(
  notes: ManiaNote[],
  start: number,
  end: number,
): Set<string> {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return idsOf(notes.filter((n) => n.startTime >= lo && n.startTime <= hi));
}

/**
 * The range between the bookmarks either side of `time`. Returns null when
 * there aren't two bookmarks to sit between, so the caller can leave the
 * selection alone rather than clearing it.
 */
export function bookmarkRange(
  bookmarks: readonly number[],
  time: number,
): { start: number; end: number } | null {
  const sorted = [...bookmarks].sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  let start: number | null = null;
  let end: number | null = null;
  for (const b of sorted) {
    if (b <= time) start = b;
    else {
      end = b;
      break;
    }
  }
  if (start === null || end === null) return null;
  return { start, end };
}

/** Everything that isn't currently selected. */
export function invertSelection(
  notes: ManiaNote[],
  ids: ReadonlySet<string>,
): Set<string> {
  return idsOf(notes.filter((n) => !ids.has(n.id)));
}

/**
 * Widen the selection so any chord it partly covers is covered completely.
 * Notes count as one chord when they start on the same millisecond, matching
 * how the editor's other chord-aware tools group them.
 */
export function growToChords(
  notes: ManiaNote[],
  ids: ReadonlySet<string>,
): Set<string> {
  const times = new Set<number>();
  for (const n of notes) if (ids.has(n.id)) times.add(Math.round(n.startTime));
  if (!times.size) return new Set(ids);
  return idsOf(notes.filter((n) => times.has(Math.round(n.startTime))));
}
