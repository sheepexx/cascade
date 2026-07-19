export type BookmarkLoopRange = {
  startMs: number;
  endMs: number;
};

export const bookmarkKey = (ms: number): string => String(Math.round(ms));

export function bookmarkLabel(
  labels: Record<string, string> | undefined,
  ms: number,
): string {
  return labels?.[bookmarkKey(ms)]?.trim() ?? "";
}

export function sortedBookmarks(bookmarks: number[] | undefined): number[] {
  return [...(bookmarks ?? [])]
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
}

export function bookmarkInDirection(
  bookmarks: number[] | undefined,
  currentMs: number,
  direction: "previous" | "next",
): number | null {
  const sorted = sortedBookmarks(bookmarks);
  if (!sorted.length) return null;
  // Skip the marker only when the playhead is effectively exactly on it.
  const margin = 1;
  if (direction === "previous") {
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i] < currentMs - margin) return sorted[i];
    }
    return sorted[sorted.length - 1];
  }
  for (const value of sorted) {
    if (value > currentMs + margin) return value;
  }
  return sorted[0];
}

/** Pick the two bookmarks surrounding the playhead, with edge fallbacks. */
export function loopAroundTime(
  bookmarks: number[] | undefined,
  currentMs: number,
): BookmarkLoopRange | null {
  const sorted = sortedBookmarks(bookmarks);
  if (sorted.length < 2) return null;
  let right = sorted.findIndex((value) => value > currentMs + 5);
  if (right <= 0) right = right === 0 ? 1 : sorted.length - 1;
  return { startMs: sorted[right - 1], endMs: sorted[right] };
}

export function remapBookmarkLabels(
  bookmarks: number[] | undefined,
  labels: Record<string, string> | undefined,
  mapTime: (ms: number) => number,
): Record<string, string> | undefined {
  if (!bookmarks?.length || !labels) return undefined;
  const next: Record<string, string> = {};
  for (const bookmark of bookmarks) {
    const label = bookmarkLabel(labels, bookmark);
    if (label) next[bookmarkKey(mapTime(bookmark))] = label;
  }
  return Object.keys(next).length ? next : undefined;
}
