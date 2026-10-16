import type { ManiaNote } from "../types";

/**
 * Remembers a value worked out from a difficulty's notes for as long as that
 * notes array lives. The editor never mutates a notes array, it replaces it,
 * so an edit to one difficulty leaves every other difficulty's cached value in
 * place: a star rating is computed once per change, not once per render of
 * each panel that shows it.
 */
export function memoByNotes<Args extends unknown[], R>(
  compute: (notes: ManiaNote[], ...args: Args) => R,
  keyOf: (...args: Args) => string = (...args) => args.join("|"),
): (notes: ManiaNote[], ...args: Args) => R {
  const cache = new WeakMap<ManiaNote[], Map<string, R>>();
  return (notes, ...args) => {
    let byArgs = cache.get(notes);
    if (!byArgs) {
      byArgs = new Map();
      cache.set(notes, byArgs);
    }
    const key = keyOf(...args);
    if (byArgs.has(key)) return byArgs.get(key) as R;
    const value = compute(notes, ...args);
    byArgs.set(key, value);
    return value;
  };
}

/** A difficulty's notes in time order, with the longest hold among them. */
export type NotesByTime = { list: ManiaNote[]; maxDur: number };

/**
 * The playfield and the map overview both walk notes in time order. Sorting
 * once per notes array means an edit costs one sort however many views draw it.
 * The list is shared, so callers must not change it.
 */
export const notesByTime = memoByNotes((notes): NotesByTime => {
  const list = [...notes].sort((a, b) => a.startTime - b.startTime);
  let maxDur = 0;
  for (const n of list) {
    if (n.endTime !== undefined) {
      const d = n.endTime - n.startTime;
      if (d > maxDur) maxDur = d;
    }
  }
  return { list, maxDur };
});

/** Index of the first note starting at or after `time` in a time-sorted list. */
export function firstNoteFrom(list: readonly ManiaNote[], time: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].startTime < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
