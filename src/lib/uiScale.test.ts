import { describe, expect, it } from "vitest";
import {
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  uiScaleFromWheel,
} from "./uiScale";

describe("uiScaleFromWheel", () => {
  it("steps up when scrolling up and down when scrolling down", () => {
    expect(uiScaleFromWheel(1, -1)).toBe(1.05);
    expect(uiScaleFromWheel(1, 1)).toBe(0.95);
  });

  it("stays within the interface scale range", () => {
    expect(uiScaleFromWheel(MAX_UI_SCALE, -1)).toBe(MAX_UI_SCALE);
    expect(uiScaleFromWheel(MIN_UI_SCALE, 1)).toBe(MIN_UI_SCALE);
  });
});
