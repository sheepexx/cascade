import { describe, expect, it } from "vitest";
import {
  EDITOR_SEEK_GLIDE_MS,
  applyEditorSeek,
  nextEditorRenderTime,
} from "./editorTimeMotion";

describe("editor seek motion", () => {
  it("lands instant seeks immediately", () => {
    expect(applyEditorSeek(1_000, 180_000, "instant", true)).toEqual({
      renderedTime: 180_000,
      smoothFrom: null,
      smoothTarget: null,
    });
  });

  it("animates smooth timeline seeks even across large distances", () => {
    expect(applyEditorSeek(1_000, 180_000, "smooth", true)).toEqual({
      renderedTime: 1_000,
      smoothFrom: 1_000,
      smoothTarget: 180_000,
    });
  });

  it("retargets repeated smooth wheel seeks without a visible snap", () => {
    const first = applyEditorSeek(1_000, 1_125, "smooth", true);
    expect(first).toEqual({
      renderedTime: 1_000,
      smoothFrom: 1_000,
      smoothTarget: 1_125,
    });

    const second = applyEditorSeek(1_050, 1_250, "smooth", true);
    expect(second).toEqual({
      renderedTime: 1_050,
      smoothFrom: 1_050,
      smoothTarget: 1_250,
    });
    expect(
      nextEditorRenderTime(
        second.smoothFrom!,
        second.smoothTarget!,
        EDITOR_SEEK_GLIDE_MS,
        true,
      ),
    ).toBe(1_250);
  });

  it.each([
    ["a snap line", 1_000, 1_125],
    ["a large forward jump", 1_000, 180_000],
    ["a large backward jump", 180_000, 1_000],
  ])("uses the same fixed deadline for %s", (_label, from, target) => {
    const almostDone = nextEditorRenderTime(
      from,
      target,
      EDITOR_SEEK_GLIDE_MS - 1,
      true,
    );
    expect(almostDone).toBeGreaterThan(Math.min(from, target));
    expect(almostDone).toBeLessThan(Math.max(from, target));
    expect(
      nextEditorRenderTime(
        from,
        target,
        EDITOR_SEEK_GLIDE_MS,
        true,
      ),
    ).toBe(target);
  });

  it("lands exactly on the first frame after a long stall", () => {
    expect(
      nextEditorRenderTime(
        1_000,
        180_000,
        EDITOR_SEEK_GLIDE_MS + 250,
        true,
      ),
    ).toBe(180_000);
  });

  it("renders intermediate frames for a visible glide", () => {
    const next = nextEditorRenderTime(
      1_000,
      180_000,
      EDITOR_SEEK_GLIDE_MS / 2,
      true,
    );
    expect(next).toBeGreaterThan(1_000);
    expect(next).toBeLessThan(180_000);
  });

  it("snaps when smooth scrolling is disabled", () => {
    expect(applyEditorSeek(1_000, 180_000, "smooth", false)).toEqual({
      renderedTime: 180_000,
      smoothFrom: null,
      smoothTarget: null,
    });
    expect(nextEditorRenderTime(1_000, 180_000, 16, false)).toBe(180_000);
  });
});
