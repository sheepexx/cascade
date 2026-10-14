/**
 * Matching for the settings search: a query is split into words and a
 * setting matches when every word appears somewhere in its name or
 * description, in any order and case.
 */

/** Lower-cased words of a query; empty when there is nothing to search. */
export function searchWords(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesSearch(words: string[], ...texts: (string | undefined)[]): boolean {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}
