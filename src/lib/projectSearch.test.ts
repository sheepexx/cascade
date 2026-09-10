import { describe, expect, it } from "vitest";
import {
  browse,
  compareEntries,
  matchesQuery,
  parseQuery,
  topStars,
  type BrowseEntry,
} from "./projectSearch";

function entry(over: Partial<BrowseEntry> = {}): BrowseEntry {
  return {
    title: "Freedom Dive",
    artist: "xi",
    creator: "Nakagawa",
    tags: "hardcore speedcore",
    updatedAt: 1000,
    difficulties: [
      { name: "Another", keyCount: 4, stars: 5.2 },
      { name: "Insane", keyCount: 7, stars: 6.4 },
    ],
    ...over,
  };
}

describe("parseQuery", () => {
  it("reads key counts in every accepted spelling", () => {
    expect(parseQuery("4k").keyCounts).toEqual([4]);
    expect(parseQuery("7K").keyCounts).toEqual([7]);
    expect(parseQuery("key=4").keyCounts).toEqual([4]);
    expect(parseQuery("keys=10").keyCounts).toEqual([10]);
    expect(parseQuery("k=6").keyCounts).toEqual([6]);
  });

  it("keeps everything else as words", () => {
    const parsed = parseQuery("  Freedom   4k Dive ");
    expect(parsed.words).toEqual(["freedom", "dive"]);
    expect(parsed.keyCounts).toEqual([4]);
  });

  it("does not mistake a title for a key count", () => {
    expect(parseQuery("kick").keyCounts).toEqual([]);
    expect(parseQuery("4kids").keyCounts).toEqual([]);
  });
});

describe("matchesQuery", () => {
  it("keeps everything for an empty query", () => {
    expect(matchesQuery(entry(), "   ")).toBe(true);
  });

  it("matches title, artist, mapper and tags", () => {
    expect(matchesQuery(entry(), "freedom")).toBe(true);
    expect(matchesQuery(entry(), "xi")).toBe(true);
    expect(matchesQuery(entry(), "nakagawa")).toBe(true);
    expect(matchesQuery(entry(), "speedcore")).toBe(true);
    expect(matchesQuery(entry(), "dubstep")).toBe(false);
  });

  it("matches difficulty names", () => {
    expect(matchesQuery(entry(), "insane")).toBe(true);
    expect(matchesQuery(entry(), "beginner")).toBe(false);
  });

  it("filters on key count", () => {
    expect(matchesQuery(entry(), "7k")).toBe(true);
    expect(matchesQuery(entry(), "key=4")).toBe(true);
    expect(matchesQuery(entry(), "5k")).toBe(false);
  });

  it("requires every token to match", () => {
    expect(matchesQuery(entry(), "freedom 7k")).toBe(true);
    expect(matchesQuery(entry(), "freedom 5k")).toBe(false);
    expect(matchesQuery(entry(), "freedom dubstep")).toBe(false);
  });

  it("survives entries with no difficulty data", () => {
    const bare = entry({ difficulties: null, tags: null });
    expect(matchesQuery(bare, "freedom")).toBe(true);
    expect(matchesQuery(bare, "4k")).toBe(false);
  });
});

describe("compareEntries", () => {
  const older = entry({ title: "Bbb", updatedAt: 10 });
  const newer = entry({ title: "Aaa", updatedAt: 20 });

  it("puts the most recent first by date", () => {
    expect(compareEntries(older, newer, "date")).toBeGreaterThan(0);
  });

  it("sorts by title, case-insensitively", () => {
    expect(compareEntries(newer, older, "name")).toBeLessThan(0);
    expect(
      compareEntries(entry({ title: "apple" }), entry({ title: "Banana" }), "name"),
    ).toBeLessThan(0);
  });

  it("puts the hardest map first by difficulty", () => {
    const easy = entry({ difficulties: [{ name: "Easy", keyCount: 4, stars: 1 }] });
    const hard = entry({ difficulties: [{ name: "Hard", keyCount: 4, stars: 7 }] });
    expect(compareEntries(easy, hard, "difficulty")).toBeGreaterThan(0);
  });

  it("falls back to key count, then date, when stars are unknown", () => {
    const four = entry({ difficulties: [{ name: "N", keyCount: 4 }], updatedAt: 5 });
    const seven = entry({ difficulties: [{ name: "N", keyCount: 7 }], updatedAt: 1 });
    expect(compareEntries(four, seven, "difficulty")).toBeGreaterThan(0);
    const same = entry({ difficulties: [{ name: "N", keyCount: 7 }], updatedAt: 9 });
    expect(compareEntries(seven, same, "difficulty")).toBeGreaterThan(0);
  });
});

describe("topStars", () => {
  it("reports the hardest difficulty", () => {
    expect(topStars(entry())).toBeCloseTo(6.4);
    expect(topStars(entry({ difficulties: [] }))).toBe(0);
  });
});

describe("browse", () => {
  it("filters and sorts without touching the input", () => {
    const rows = [
      entry({ title: "Zzz", updatedAt: 1 }),
      entry({ title: "Aaa", updatedAt: 2 }),
      entry({ title: "Mmm", updatedAt: 3, difficulties: [] }),
    ];
    const copy = [...rows];
    const out = browse(rows, "4k", "name");
    expect(out.map((r) => r.title)).toEqual(["Aaa", "Zzz"]);
    expect(rows).toEqual(copy);
  });
});
