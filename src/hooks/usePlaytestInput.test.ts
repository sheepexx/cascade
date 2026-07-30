import { describe, expect, it } from "vitest";
import { isPlaytestTypingTarget } from "./usePlaytestInput";

function target(tagName: string, isContentEditable = false): EventTarget {
  return { tagName, isContentEditable } as unknown as EventTarget;
}

describe("isPlaytestTypingTarget", () => {
  it("protects text controls from gameplay keys", () => {
    expect(isPlaytestTypingTarget(target("INPUT"))).toBe(true);
    expect(isPlaytestTypingTarget(target("TEXTAREA"))).toBe(true);
    expect(isPlaytestTypingTarget(target("SELECT"))).toBe(true);
    expect(isPlaytestTypingTarget(target("DIV", true))).toBe(true);
  });

  it("leaves the editor surface available to gameplay keys", () => {
    expect(isPlaytestTypingTarget(target("CANVAS"))).toBe(false);
    expect(isPlaytestTypingTarget(null)).toBe(false);
  });
});
