import { describe, expect, it } from "vitest";
import { matchesSearch, searchWords } from "./settingsSearch";

describe("settings search", () => {
  it("splits a query into lower-cased words and ignores blank input", () => {
    expect(searchWords("  Background   DIM ")).toEqual(["background", "dim"]);
    expect(searchWords("   ")).toEqual([]);
  });

  it("matches when every word appears in the name or description, in any order", () => {
    const words = searchWords("dim background");
    expect(matchesSearch(words, "Background dim")).toBe(true);
    expect(matchesSearch(searchWords("notefield"), "Background dim", "Higher dim keeps the notefield easier to read.")).toBe(true);
    expect(matchesSearch(searchWords("dim volume"), "Background dim")).toBe(false);
  });

  it("matches everything for an empty query", () => {
    expect(matchesSearch([], "Anything")).toBe(true);
  });
});
