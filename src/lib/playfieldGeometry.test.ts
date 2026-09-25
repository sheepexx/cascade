import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, DEFAULT_VIEW } from "../types";
import { resolvePlayfieldLayout } from "./playfieldGeometry";

const settings = DEFAULT_APP_SETTINGS;
const playtest = DEFAULT_APP_SETTINGS.playtest;

const resolve = (playtestActive: boolean, rate = 1) =>
  resolvePlayfieldLayout({
    settings,
    view: DEFAULT_VIEW,
    playtest,
    playtestActive,
    rate,
  });

describe("resolvePlayfieldLayout", () => {
  it("uses the editor's own geometry outside playtest", () => {
    const layout = resolve(false);
    expect(layout.scale).toBe(settings.playfieldScale);
    expect(layout.scrollSpeed).toBe(DEFAULT_VIEW.scrollSpeed);
    expect(layout.backgroundDim).toBe(settings.dimBackground);
  });

  it("takes the editor's own hit line outside playtest", () => {
    expect(resolve(false).hitPosition).toBe(settings.playfieldHitPosition);
  });

  it("takes playtest's own scale, dim and hit line during a run", () => {
    const layout = resolve(true);
    expect(layout.scale).toBe(playtest.zoom);
    expect(layout.backgroundDim).toBe(playtest.backgroundDim);
    expect(layout.hitPosition).toBe(playtest.hitPosition);
  });

  it("keeps the editor's note scaling in both modes", () => {
    // A playtest shows the map at the size it is being mapped at, so note and
    // long note scaling are never overridden.
    for (const active of [false, true]) {
      const layout = resolve(active);
      expect(layout.noteHeightScale).toBe(settings.noteHeightScale);
      expect(layout.longNoteBodyScale).toBe(settings.longNoteBodyScale);
    }
  });

  it("divides playtest scroll speed by the rate so notes keep their real speed", () => {
    expect(resolve(true, 2).scrollSpeed).toBeCloseTo(playtest.scrollSpeed / 2);
    expect(resolve(true, 0.5).scrollSpeed).toBeCloseTo(playtest.scrollSpeed / 0.5);
  });

  it("ignores the rate outside playtest", () => {
    expect(resolve(false, 2).scrollSpeed).toBe(DEFAULT_VIEW.scrollSpeed);
  });
});
