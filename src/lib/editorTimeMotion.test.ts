import { describe, expect, it } from "vitest";
import { applyEditorSeek, nextEditorRenderTime } from "./editorTimeMotion";

describe("editor seek motion", () => {
  it("lands absolute timeline seeks immediately", () => {
    expect(applyEditorSeek(1_000, null, 180_000, "instant", true)).toEqual({
      renderedTime: 180_000,
      smoothTarget: null,
    });
  });

  it("keeps at most one snap of lag during repeated smooth wheel seeks", () => {
    const first = applyEditorSeek(1_000, null, 1_125, "smooth", true);
    expect(first).toEqual({ renderedTime: 1_000, smoothTarget: 1_125 });

    const second = applyEditorSeek(
      1_050,
      first.smoothTarget,
      1_250,
      "smooth",
      true,
    );
    expect(second).toEqual({ renderedTime: 1_125, smoothTarget: 1_250 });
  });

  it("settles against wall time after a slow frame", () => {
    const next = nextEditorRenderTime(1_000, 1_125, 1, true);
    expect(next).toBeCloseTo(1_125, 5);
  });

  it("still glides a normal adjacent snap on a fast frame", () => {
    const next = nextEditorRenderTime(1_000, 1_125, 1 / 60, true);
    expect(next).toBeGreaterThan(1_000);
    expect(next).toBeLessThan(1_125);
  });

  it("finishes a normal adjacent snap within 150 ms", () => {
    expect(nextEditorRenderTime(1_000, 1_125, 0.15, true)).toBe(1_125);
  });
});
