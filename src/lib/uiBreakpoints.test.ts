import { describe, expect, it } from "vitest";
import {
  activeUiBreakpoints,
  clearUiBreakpointAttributes,
  effectiveViewportWidth,
  syncUiBreakpointAttributes,
} from "./uiBreakpoints";

describe("effectiveViewportWidth", () => {
  it("shrinks the usable width as the interface scales up", () => {
    expect(effectiveViewportWidth(1440, 1)).toBe(1440);
    expect(effectiveViewportWidth(1440, 1.5)).toBe(960);
  });

  it("treats a broken scale as unscaled", () => {
    expect(effectiveViewportWidth(1440, 0)).toBe(1440);
    expect(effectiveViewportWidth(1440, Number.NaN)).toBe(1440);
  });
});

describe("activeUiBreakpoints", () => {
  it("keeps the roomy layout on a wide unscaled window", () => {
    expect(activeUiBreakpoints(1440, 1)).toEqual({
      uimd: true,
      uilg: true,
      uixl: true,
    });
  });

  it("collapses the same window once the interface is scaled up", () => {
    // 1440 / 1.5 = 960, so only the 900px tier still fits.
    expect(activeUiBreakpoints(1440, 1.5)).toEqual({
      uimd: true,
      uilg: false,
      uixl: false,
    });
  });

  it("collapses everything on a narrow scaled window", () => {
    expect(activeUiBreakpoints(1000, 1.5)).toEqual({
      uimd: false,
      uilg: false,
      uixl: false,
    });
  });
});

describe("syncUiBreakpointAttributes", () => {
  it("adds and removes attributes as the scale changes", () => {
    const attrs = new Set<string>();
    const root = {
      setAttribute: (name: string) => void attrs.add(name),
      removeAttribute: (name: string) => void attrs.delete(name),
    };
    const has = (name: string) => attrs.has(name);

    syncUiBreakpointAttributes(root, 1440, 1);
    expect(has("data-uixl")).toBe(true);
    expect(has("data-uimd")).toBe(true);

    syncUiBreakpointAttributes(root, 1440, 1.5);
    expect(has("data-uixl")).toBe(false);
    expect(has("data-uilg")).toBe(false);
    expect(has("data-uimd")).toBe(true);

    clearUiBreakpointAttributes(root);
    expect(has("data-uimd")).toBe(false);
  });
});
