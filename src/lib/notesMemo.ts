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
