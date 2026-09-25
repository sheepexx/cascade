import { describe, expect, it } from "vitest";
import { HUD_PANEL_WIDTH, hudPreviewGeometry, normalizeHudLayout, withPlacement } from "./hudLayout";

describe("hudPreviewGeometry", () => {
  it.each([[1920, 1080], [1440, 900], [1280, 720], [960, 720]])(
    "previews the full %i × %i gameplay viewport without reflowing its anchors",
    (width, height) => {
      const preview = hudPreviewGeometry(width, height);
      expect(preview.width).toBe(width);
      expect(preview.height).toBe(height);
      expect(preview.left).toBe(HUD_PANEL_WIDTH);
      expect(preview.left + preview.width * preview.scale).toBeCloseTo(width);
      expect(preview.top * 2 + preview.height * preview.scale).toBeCloseTo(height);

      // Left-, center- and right-anchored elements must keep their distances
      // from the playfield under one uniform scale, including saved offsets.
      const fieldCenter = width / 2;
      for (const x of [12 + 700, fieldCenter + 100, width - 16 - 180]) {
        const onScreen = preview.left + x * preview.scale;
        const fieldOnScreen = preview.left + fieldCenter * preview.scale;
        expect((onScreen - fieldOnScreen) / preview.scale).toBeCloseTo(x - fieldCenter);
      }
    },
  );

  it("keeps the preview transform invertible in a collapsed viewport", () => {
    const preview = hudPreviewGeometry(0, 0);
    expect(preview.scale).toBeGreaterThan(0);
    expect(Number.isFinite(preview.scale)).toBe(true);
    expect(preview.width).toBeGreaterThan(0);
    expect(preview.height).toBeGreaterThan(0);
  });
});

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
