import { describe, it, expect } from "vitest";
import type { ManiaNote } from "../types";
import { computeStarRating, starColor, starTier } from "./starRating";

function column(col: number, times: number[]): ManiaNote[] {
  return times.map((t, i) => ({ id: `n${col}_${i}`, column: col, startTime: t }));
}

describe("computeStarRating", () => {
  it("is zero for fewer than two notes or no keys", () => {
    expect(computeStarRating([], 4)).toBe(0);
    expect(computeStarRating(column(0, [0]), 4)).toBe(0);
    expect(computeStarRating(column(0, [0, 100]), 0)).toBe(0);
  });

  it("produces a positive, finite rating for a real pattern", () => {
    const notes = column(0, [0, 250, 500, 750, 1000]);
    const sr = computeStarRating(notes, 4);
    expect(sr).toBeGreaterThan(0);
    expect(Number.isFinite(sr)).toBe(true);
  });

  it("is deterministic for identical input", () => {
    const notes = column(0, [0, 125, 250, 375]);
    expect(computeStarRating(notes, 4)).toBe(computeStarRating(notes, 4));
  });

  it("rates a denser jack stream harder than a sparse one over the same span", () => {
    const dense = column(0, [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    const sparse = column(0, [0, 250, 500, 750, 1000]);
    expect(computeStarRating(dense, 4)).toBeGreaterThan(
      computeStarRating(sparse, 4),
    );
  });
});

describe("starColor", () => {
  it("greys out empty/unmapped ratings", () => {
    expect(starColor(0)).toBe("#aaaaaa");
  });

  it("clamps to the spectrum endpoints", () => {
    expect(starColor(0.1)).toBe("rgb(66, 144, 251)");
    expect(starColor(100)).toBe("rgb(179, 76, 240)");
  });

  it("returns an rgb() string for a mid rating", () => {
    expect(starColor(3.0)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });
});

describe("starTier", () => {
  it("maps ratings to osu! difficulty tiers", () => {
    expect(starTier(1.0)).toBe("Easy");
    expect(starTier(2.0)).toBe("Normal");
    expect(starTier(3.0)).toBe("Hard");
    expect(starTier(4.5)).toBe("Insane");
    expect(starTier(5.5)).toBe("Expert");
    expect(starTier(7.0)).toBe("Expert+");
  });
});
