import { describe, expect, it } from "vitest";
import {
  applyLibraryFilter,
  availableCategories,
  categoryCount,
  keyCounts,
  libraryKeyCounts,
  setLength,
  sourcesFor,
  starRange,
} from "./mapLibrary";
import type { OsuBeatmapset } from "./osuProfile";

function set(id: number, overrides: Partial<OsuBeatmapset> = {}): OsuBeatmapset {
  return {
    id,
    title: `Song ${id}`,
    artist: "Artist",
    title_unicode: null,
    artist_unicode: null,
    creator: "mapper",
    user_id: 1,
    status: "ranked",
    play_count: 0,
    favourite_count: 0,
    bpm: 180,
    last_updated: "2025-01-01T00:00:00Z",
    ranked_date: null,
    submitted_date: null,
    covers: { card: null, card2x: null, cover: null, list: null },
    beatmaps: [],
    ...overrides,
  };
}

const diff = (cs: number, stars: number, mode = "mania", length = 120) => ({
  id: Math.round(cs * 1000 + stars * 10),
  mode,
  version: `${cs}K`,
  difficulty_rating: stars,
  cs,
  total_length: length,
  bpm: 180,
  playcount: 0,
  user_id: 1,
});

describe("categories", () => {
  it("loads osu!'s ranked section for ranked and qualified, and splits them by status", () => {
    expect(sourcesFor("qualified")).toEqual(["ranked"]);
    expect(sourcesFor("all")).toEqual(["ranked", "loved", "pending", "graveyard"]);
    const sets = [set(1, { status: "ranked" }), set(2, { status: "qualified" }), set(3, { status: "approved" })];
    const filter = { query: "", keys: null, sort: "newest" as const };
    expect(applyLibraryFilter(sets, "qualified", filter).map((s) => s.id)).toEqual([2]);
    expect(applyLibraryFilter(sets, "ranked", filter).map((s) => s.id).sort()).toEqual([1, 3]);
  });

  it("offers only categories with maps in them", () => {
    expect(
      availableCategories({ ranked: 0, loved: 2, pending: 0, graveyard: 1, guest: 3, nominated: 0 }, 0),
    ).toEqual(["all", "loved", "graveyard", "guest"]);
    expect(availableCategories(null, 2)).toEqual(["cascade"]);
    expect(availableCategories({ ranked: 0, loved: 0, pending: 0, graveyard: 0, guest: 0, nominated: 0 }, 0)).toEqual([]);
  });

  it("counts beatmapsets per category from osu!'s numbers", () => {
    const counts = { ranked: 3, loved: 1, pending: 2, graveyard: 4, guest: 5, nominated: 0 };
    expect(categoryCount(counts, "all")).toBe(10);
    expect(categoryCount(counts, "guest")).toBe(5);
    expect(categoryCount(counts, "qualified")).toBeNull();
  });
});

describe("set details", () => {
  it("reads key counts from osu!mania difficulties only", () => {
    const s = set(1, { beatmaps: [diff(7, 3), diff(4, 2), diff(4, 5), diff(5, 4, "osu")] });
    expect(keyCounts(s)).toEqual([4, 7]);
    expect(starRange(s)).toEqual({ min: 2, max: 5 });
    expect(libraryKeyCounts([s, set(2, { beatmaps: [diff(10, 1)] })])).toEqual([4, 7, 10]);
  });

  it("measures length by the longest difficulty", () => {
    expect(setLength(set(1, { beatmaps: [diff(4, 1, "mania", 90), diff(4, 2, "mania", 150)] }))).toBe(150);
    expect(setLength(set(2))).toBe(0);
  });
});

describe("applyLibraryFilter", () => {
  const sets = [
    set(1, { title: "Blue Zenith", artist: "xi", ranked_date: "2012-01-01T00:00:00Z", play_count: 900, beatmaps: [diff(4, 5)] }),
    set(2, { title: "Freedom Dive", artist: "xi", ranked_date: "2014-01-01T00:00:00Z", play_count: 100, beatmaps: [diff(7, 7)] }),
    set(3, { title: "Galaxy Collapse", artist: "Kurokotei", ranked_date: "2016-01-01T00:00:00Z", play_count: 500, beatmaps: [diff(4, 6)] }),
  ];
  const base = { query: "", keys: null, sort: "newest" as const };

  it("searches title and artist, word by word, without case", () => {
    expect(applyLibraryFilter(sets, "all", { ...base, query: "XI dive" }).map((s) => s.id)).toEqual([2]);
    expect(applyLibraryFilter(sets, "all", { ...base, query: "kuro" }).map((s) => s.id)).toEqual([3]);
  });

  it("filters by key count", () => {
    expect(applyLibraryFilter(sets, "all", { ...base, keys: 4 }).map((s) => s.id)).toEqual([3, 1]);
  });

  it("sorts by date, difficulty and popularity", () => {
    expect(applyLibraryFilter(sets, "all", base).map((s) => s.id)).toEqual([3, 2, 1]);
    expect(applyLibraryFilter(sets, "all", { ...base, sort: "oldest" }).map((s) => s.id)).toEqual([1, 2, 3]);
    expect(applyLibraryFilter(sets, "all", { ...base, sort: "difficulty" }).map((s) => s.id)).toEqual([2, 3, 1]);
    expect(applyLibraryFilter(sets, "all", { ...base, sort: "popularity" }).map((s) => s.id)).toEqual([1, 3, 2]);
  });

  it("shows a set that appears in two loaded pages once", () => {
    expect(applyLibraryFilter([...sets, sets[0]], "all", base)).toHaveLength(3);
  });
});
