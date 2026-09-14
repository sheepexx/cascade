import { describe, expect, it } from "vitest";
import {
  normalizePlaytestSkin,
  parsePlaytestSkinValue,
  playtestSkinValue,
} from "./playtestSkin";
import type { PlaytestSkinChoice } from "../types";

describe("playtest skin choice", () => {
  it("round-trips every kind of choice through a select value", () => {
    const choices: (PlaytestSkinChoice | null)[] = [
      null,
      { source: "none" },
      { source: "preset", fileName: "Kaan - Green.osk" },
      { source: "saved", fileName: "my: skin.osk" },
    ];
    for (const choice of choices) {
      expect(parsePlaytestSkinValue(playtestSkinValue(choice))).toEqual(choice);
    }
  });

  it("keeps the editor's skin for values it does not recognise", () => {
    expect(parsePlaytestSkinValue("cloud:skin.osk")).toBeNull();
    expect(parsePlaytestSkinValue("saved:")).toBeNull();
    expect(parsePlaytestSkinValue("garbage")).toBeNull();
  });

  it("drops malformed stored settings", () => {
    expect(normalizePlaytestSkin(undefined)).toBeNull();
    expect(normalizePlaytestSkin("saved:skin.osk")).toBeNull();
    expect(normalizePlaytestSkin({ source: "saved" })).toBeNull();
    expect(normalizePlaytestSkin({ source: "none", fileName: 3 })).toEqual({ source: "none" });
    expect(normalizePlaytestSkin({ source: "preset", fileName: "a.osk", extra: 1 })).toEqual({
      source: "preset",
      fileName: "a.osk",
    });
  });
});
