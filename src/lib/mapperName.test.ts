import { describe, expect, it } from "vitest";
import {
  chooseMapperName,
  cleanMapperName,
  hasMapperName,
} from "./mapperName";
import { DEFAULT_SONG_META } from "../types";

describe("cleanMapperName", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanMapperName("  sheepex_  ")).toBe("sheepex_");
    expect(cleanMapperName("two  names")).toBe("two names");
    expect(cleanMapperName(null)).toBe("");
  });
});

describe("hasMapperName", () => {
  it("treats a real name as set", () => {
    expect(hasMapperName("sheepex_")).toBe(true);
    expect(hasMapperName(" Halogen- ")).toBe(true);
  });

  it("treats blanks and the untouched placeholder as missing", () => {
    expect(hasMapperName("")).toBe(false);
    expect(hasMapperName("   ")).toBe(false);
    expect(hasMapperName(undefined)).toBe(false);
    expect(hasMapperName(DEFAULT_SONG_META.creator)).toBe(false);
  });
});

describe("chooseMapperName", () => {
  it("keeps a name the map already carries", () => {
    expect(chooseMapperName("sheepex_", "someone-else")).toEqual({
      kind: "keep",
    });
  });

  it("falls back to the signed-in account", () => {
    expect(chooseMapperName("", " sheepex_ ")).toEqual({
      kind: "account",
      name: "sheepex_",
    });
    expect(chooseMapperName(DEFAULT_SONG_META.creator, "sheepex_")).toEqual({
      kind: "account",
      name: "sheepex_",
    });
  });

  it("asks when nobody is signed in", () => {
    expect(chooseMapperName("", null)).toEqual({ kind: "ask" });
    expect(chooseMapperName(DEFAULT_SONG_META.creator, "  ")).toEqual({
      kind: "ask",
    });
  });
});
