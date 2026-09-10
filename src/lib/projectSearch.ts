export type BrowseDifficulty = {
  name: string;
  keyCount: number;
  stars?: number;
};

export type BrowseEntry = {
  title: string;
  artist: string;
  creator: string;
  tags?: string | null;
  updatedAt: number;
  difficulties?: BrowseDifficulty[] | null;
};

export type BrowseSort = "date" | "name" | "difficulty";

export const BROWSE_SORTS: BrowseSort[] = ["date", "name", "difficulty"];

const KEY_COUNT = /^(?:(\d{1,2})k|keys?=(\d{1,2})|k=(\d{1,2}))$/;

function fold(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

export function parseQuery(query: string): {
  keyCounts: number[];
  words: string[];
} {
  const keyCounts: number[] = [];
  const words: string[] = [];
  for (const token of query.trim().split(/\s+/)) {
    if (!token) continue;
    const hit = KEY_COUNT.exec(fold(token));
    const keys = hit && Number(hit[1] ?? hit[2] ?? hit[3]);
    if (keys) keyCounts.push(keys);
    else words.push(fold(token));
  }
  return { keyCounts, words };
}

export function entryHaystack(entry: BrowseEntry): string {
  const parts = [entry.title, entry.artist, entry.creator, entry.tags ?? ""];
  for (const diff of entry.difficulties ?? []) {
    parts.push(diff.name, `${diff.keyCount}k`);
  }
  return fold(parts.filter(Boolean).join(" "));
}

export function matchesQuery(entry: BrowseEntry, query: string): boolean {
  const { keyCounts, words } = parseQuery(query);
  if (!keyCounts.length && !words.length) return true;
  if (keyCounts.length) {
    const available = new Set(
      (entry.difficulties ?? []).map((diff) => diff.keyCount),
    );
    if (!keyCounts.every((keys) => available.has(keys))) return false;
  }
  if (!words.length) return true;
  const haystack = entryHaystack(entry);
  return words.every((word) => haystack.includes(word));
}

export function topStars(entry: BrowseEntry): number {
  let top = 0;
  for (const diff of entry.difficulties ?? []) {
    if (typeof diff.stars === "number" && diff.stars > top) top = diff.stars;
  }
  return top;
}

export function compareEntries(
  a: BrowseEntry,
  b: BrowseEntry,
  sort: BrowseSort,
): number {
  if (sort === "name") {
    const byName = (a.title || "").localeCompare(b.title || "", "en-US", {
      sensitivity: "base",
      numeric: true,
    });
    if (byName) return byName;
  }
  if (sort === "difficulty") {
    const byStars = topStars(b) - topStars(a);
    if (byStars) return byStars;
    const aKeys = Math.max(0, ...(a.difficulties ?? []).map((d) => d.keyCount));
    const bKeys = Math.max(0, ...(b.difficulties ?? []).map((d) => d.keyCount));
    if (aKeys !== bKeys) return bKeys - aKeys;
  }
  return b.updatedAt - a.updatedAt;
}

export function browse<T extends BrowseEntry>(
  entries: T[],
  query: string,
  sort: BrowseSort,
): T[] {
  return entries
    .filter((entry) => matchesQuery(entry, query))
    .sort((a, b) => compareEntries(a, b, sort));
}
