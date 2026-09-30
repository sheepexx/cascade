import { describe, expect, it } from "vitest";
import {
  closestDivisor,
  nextSnapPreset,
  normalizeCustomDivisors,
  parseCustomDivisors,
  presetDivisors,
  stepDivisor,
} from "./snapPresets";

describe("parseCustomDivisors", () => {
  it("reads plain numbers and 1/n, sorted without repeats", () => {
    expect(parseCustomDivisors("5, 1/10 1 5;20")).toEqual([1, 5, 10, 20]);
  });

  it("drops anything the editor can't snap to", () => {
    expect(parseCustomDivisors("0 -2 1.5 49 abc 3")).toEqual([3]);
    expect(normalizeCustomDivisors("5")).toEqual([]);
    expect(normalizeCustomDivisors([7, 7, 2])).toEqual([2, 7]);
  });
});

describe("stepDivisor", () => {
  const common = presetDivisors("common", []);

  it("moves one step finer or coarser and holds at the ends", () => {
    expect(stepDivisor(common, 4, 1)).toBe(8);
    expect(stepDivisor(common, 4, -1)).toBe(2);
    expect(stepDivisor(common, 16, 1)).toBe(16);
    expect(stepDivisor(common, 1, -1)).toBe(1);
  });

  it("joins the preset from a divisor outside it", () => {
    expect(stepDivisor(common, 6, 1)).toBe(8);
    expect(stepDivisor(common, 6, -1)).toBe(4);
  });

  it("leaves Free snap for the preset's ends", () => {
    expect(stepDivisor(common, 0, 1)).toBe(1);
    expect(stepDivisor(common, 0, -1)).toBe(16);
  });
});

describe("presets", () => {
  it("cycles through the lists, skipping an empty custom one", () => {
    expect(nextSnapPreset("common", [])).toBe("triplets");
    expect(nextSnapPreset("triplets", [])).toBe("common");
    expect(nextSnapPreset("triplets", [5, 10])).toBe("custom");
    expect(nextSnapPreset("custom", [5, 10])).toBe("common");
  });

  it("switches to the nearest divisor in the new list", () => {
    expect(closestDivisor(presetDivisors("triplets", []), 4)).toBe(3);
    expect(closestDivisor(presetDivisors("triplets", []), 8)).toBe(6);
    expect(closestDivisor(presetDivisors("common", []), 12)).toBe(16);
    expect(closestDivisor([5, 10], 0)).toBe(5);
  });
});
