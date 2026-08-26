import { describe, expect, it } from "vitest";
import { MAX_SCROLL_SPEED, MIN_SCROLL_SPEED } from "../types";
import {
  MAX_PLAYFIELD_SCALE,
  MIN_PLAYFIELD_SCALE,
  playfieldScaleFromWheel,
  timelineZoomFromWheel,
} from "./altWheel";

describe("timelineZoomFromWheel", () => {
  it("zooms in when scrolling up and out when scrolling down", () => {
    expect(timelineZoomFromWheel(25, -1)).toBe(26);
    expect(timelineZoomFromWheel(25, 1)).toBe(24);
  });

  it("stays within the timeline zoom range", () => {
    expect(timelineZoomFromWheel(MAX_SCROLL_SPEED, -1)).toBe(MAX_SCROLL_SPEED);
    expect(timelineZoomFromWheel(MIN_SCROLL_SPEED, 1)).toBe(MIN_SCROLL_SPEED);
  });
});

describe("playfieldScaleFromWheel", () => {
  it("changes playfield size in five-percent steps", () => {
    expect(playfieldScaleFromWheel(1.5, -1)).toBe(1.55);
    expect(playfieldScaleFromWheel(1.5, 1)).toBe(1.45);
  });

  it("stays within the playfield size range", () => {
    expect(playfieldScaleFromWheel(MAX_PLAYFIELD_SCALE, -1)).toBe(
      MAX_PLAYFIELD_SCALE,
    );
    expect(playfieldScaleFromWheel(MIN_PLAYFIELD_SCALE, 1)).toBe(
      MIN_PLAYFIELD_SCALE,
    );
  });
});
