import { describe, expect, it } from "vitest";
import { normalizeHudLayout, withPlacement } from "./hudLayout";

describe("normalizeHudLayout", () => {
  it("keeps known elements, in range, and drops defaults and junk", () => {
    expect(
      normalizeHudLayout({
        combo: { x: 12.4, y: -30, scale: 1.234 },
        judgement: { x: 0, y: 0, scale: 1 },
        accuracy: { x: "left", y: 5, scale: 9 },
        bogus: { x: 1, y: 1, scale: 1 },
      }),
    ).toEqual({
      combo: { x: 12, y: -30, scale: 1.23 },
      accuracy: { x: 0, y: 5, scale: 2 },
    });
    expect(normalizeHudLayout(null)).toEqual({});
    expect(normalizeHudLayout([1, 2])).toEqual({});
  });
});

describe("withPlacement", () => {
  it("stores a moved element and forgets one put back", () => {
    const moved = withPlacement({}, "keys", { x: 4, y: 0, scale: 1 });
    expect(moved).toEqual({ keys: { x: 4, y: 0, scale: 1 } });
    expect(withPlacement(moved, "keys", { x: 0, y: 0, scale: 1 })).toEqual({});
  });
});
