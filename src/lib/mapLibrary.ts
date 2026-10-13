import type { BeatmapsetType, OsuBeatmapset, OsuProfile } from "./osuProfile";

/**
 * The Maps section of a profile: which osu! sections a category is made of,
 * and searching, filtering and sorting what has been loaded. Counts on osu!
 * are beatmapsets; difficulties are counted per set and never mixed in.
 */

export type LibraryCategory =
  | "all"
  | "ranked"
  | "qualified"
  | "loved"
  | "pending"
  | "graveyard"
  | "guest"
  | "cascade";

export type LibrarySort = "newest" | "oldest" | "difficulty" | "popularity";

/** The osu! sections a category loads. osu!'s "ranked" section includes qualified sets. */
export function sourcesFor(category: LibraryCategory): BeatmapsetType[] {
  switch (category) {
    case "all":
      return ["ranked", "loved", "pending", "graveyard"];
    case "ranked":
    case "qualified":
      return ["ranked"];
    case "loved":
    case "pending":
    case "graveyard":
    case "guest":
      return [category];
    case "cascade":
      return [];
  }
}

/** Whether a set belongs in the category (after loading its sections). */
export function inCategory(set: OsuBeatmapset, category: LibraryCategory): boolean {
  switch (category) {
    case "ranked":
      return set.status === "ranked" || set.status === "approved";
    case "qualified":
      return set.status === "qualified";
    case "pending":
      return set.status === "pending" || set.status === "wip";
    default:
      return true;
  }
}

/**
 * Categories worth showing for a profile: only those osu! reports sets in,
 * plus Cascade projects when the owner shares any. Qualified sets are part
 * of osu!'s ranked count, so that tab appears with ranked and the list
 * itself shows whether any are there.
 */
export function availableCategories(
  counts: OsuProfile["counts"] | null,
  cascadeProjects: number,
): LibraryCategory[] {
  const out: LibraryCategory[] = [];
  const owned = counts ? counts.ranked + counts.loved + counts.pending + counts.graveyard : 0;
  if (owned > 0) out.push("all");
  if (counts?.ranked) out.push("ranked", "qualified");
  if (counts?.loved) out.push("loved");
  if (counts?.pending) out.push("pending");
  if (counts?.graveyard) out.push("graveyard");
  if (counts?.guest) out.push("guest");
  if (cascadeProjects > 0) out.push("cascade");
  return out;
}

/** How many sets osu! reports for a category, when it says. */
export function categoryCount(
  counts: OsuProfile["counts"] | null,
  category: LibraryCategory,
): number | null {
  if (!counts) return null;
  switch (category) {
    case "all":
      return counts.ranked + counts.loved + counts.pending + counts.graveyard;
    case "ranked":
    case "loved":
    case "pending":
    case "graveyard":
    case "guest":
      return counts[category];
    default:
      return null;
  }
}

export function maniaDifficulties(set: OsuBeatmapset) {
  return set.beatmaps.filter((b) => b.mode === "mania");
}

/** Key counts of the set's osu!mania difficulties, ascending. */
export function keyCounts(set: OsuBeatmapset): number[] {
  const keys = new Set<number>();
  for (const b of maniaDifficulties(set)) {
    if (b.cs !== null && Number.isFinite(b.cs) && b.cs > 0) keys.add(Math.round(b.cs));
  }
  return [...keys].sort((a, b) => a - b);
}

export function starRange(set: OsuBeatmapset): { min: number; max: number } | null {
  if (!set.beatmaps.length) return null;
  let min = Infinity;
  let max = 0;
  for (const b of set.beatmaps) {
    min = Math.min(min, b.difficulty_rating);
    max = Math.max(max, b.difficulty_rating);
  }
  return { min, max };
}

/** Length of the longest difficulty, in seconds. */
export function setLength(set: OsuBeatmapset): number {
  return set.beatmaps.reduce((longest, b) => Math.max(longest, b.total_length), 0);
}

/** The date a set is listed under: ranked, else last updated, else submitted. */
export function setDate(set: OsuBeatmapset): number {
  const raw = set.ranked_date ?? set.last_updated ?? set.submitted_date;
  const at = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(at) ? at : 0;
}

export type LibraryFilter = {
  query: string;
  keys: number | null;
  sort: LibrarySort;
};

function matches(set: OsuBeatmapset, query: string): boolean {
  if (!query) return true;
  const haystack = [set.title, set.artist, set.title_unicode, set.artist_unicode, set.creator]
    .filter(Boolean)
    .join("\n")
    .toLocaleLowerCase();
  return query
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function applyLibraryFilter(
  sets: readonly OsuBeatmapset[],
  category: LibraryCategory,
  filter: LibraryFilter,
): OsuBeatmapset[] {
  const seen = new Set<number>();
  const out = sets.filter((set) => {
    if (seen.has(set.id)) return false;
    seen.add(set.id);
    return (
      inCategory(set, category) &&
      matches(set, filter.query.trim()) &&
      (filter.keys === null || keyCounts(set).includes(filter.keys))
    );
  });
  const byDate = (a: OsuBeatmapset, b: OsuBeatmapset) => setDate(b) - setDate(a);
  switch (filter.sort) {
    case "newest":
      return out.sort((a, b) => byDate(a, b) || b.id - a.id);
    case "oldest":
      return out.sort((a, b) => byDate(b, a) || a.id - b.id);
    case "difficulty":
      return out.sort((a, b) => (starRange(b)?.max ?? 0) - (starRange(a)?.max ?? 0) || byDate(a, b));
    case "popularity":
      return out.sort(
        (a, b) => b.play_count - a.play_count || b.favourite_count - a.favourite_count || byDate(a, b),
      );
  }
}

/** Every key count across the loaded sets, for the key filter. */
export function libraryKeyCounts(sets: readonly OsuBeatmapset[]): number[] {
  const keys = new Set<number>();
  for (const set of sets) for (const k of keyCounts(set)) keys.add(k);
  return [...keys].sort((a, b) => a - b);
}
