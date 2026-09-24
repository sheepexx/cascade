import { describe, expect, it } from "vitest";
import {
  defaultLaneColour,
  LANE_BLUE as B,
  LANE_GOLD as G,
  LANE_WHITE as W,
} from "./laneColours";

const lanes = (keyCount: number) =>
  Array.from({ length: keyCount }, (_, column) =>
    defaultLaneColour(column, keyCount),
  );

describe("default lane colours", () => {
  it("puts gold in the middle of odd key counts, blue at the edges", () => {
    expect(lanes(5)).toEqual([B, W, G, W, B]);
    expect(lanes(7)).toEqual([B, W, B, G, B, W, B]);
    expect(lanes(9)).toEqual([B, W, B, W, G, W, B, W, B]);
  });

  it("keeps even key counts alternating white and blue", () => {
    expect(lanes(4)).toEqual([W, B, W, B]);
    expect(lanes(6)).toEqual([W, B, W, B, W, B]);
  });
});

describe("colourblind lane colours", () => {
  it("keeps the layout and replaces blue and gold with orange and sky blue", () => {
    const cb = (keyCount: number) =>
      Array.from({ length: keyCount }, (_, column) =>
        defaultLaneColour(column, keyCount, "colourblind"),
      );
    expect(cb(4)).toEqual(["#f2f2f2", "#e69f00", "#f2f2f2", "#e69f00"]);
    expect(cb(7)[3]).toBe("#56b4e9");
    expect(new Set(cb(7)).size).toBe(3);
  });
});
