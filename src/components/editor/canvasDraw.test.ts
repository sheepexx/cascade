import { describe, expect, it } from "vitest";
import { HITSOUND_CLAP, HITSOUND_FINISH, HITSOUND_WHISTLE } from "../../types";
import {
  LANE_FLASH_MS,
  columnUnits,
  hitsoundLabel,
  hitsoundOf,
  laneFlashStrength,
  normalizeRect,
  rectIntersects,
  skinUnit,
  usableStagePiece,
} from "./canvasDraw";

describe("normalizeRect", () => {
  it("gives the same box whichever corner the drag started from", () => {
    const box = { x: 10, y: 20, w: 30, h: 40 };
    expect(normalizeRect(10, 20, 40, 60)).toEqual(box);
    expect(normalizeRect(40, 60, 10, 20)).toEqual(box);
    expect(normalizeRect(40, 20, 10, 60)).toEqual(box);
  });
});

describe("rectIntersects", () => {
  const box = { x: 0, y: 0, w: 10, h: 10 };
  it("counts overlap and touching edges", () => {
    expect(rectIntersects(box, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectIntersects(box, { x: 10, y: 0, w: 5, h: 5 })).toBe(true);
  });
  it("rejects boxes apart on either axis", () => {
    expect(rectIntersects(box, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
    expect(rectIntersects(box, { x: 0, y: -6, w: 5, h: 5 })).toBe(false);
  });
});

describe("hitsound helpers", () => {
  it("labels additions in whistle, finish, clap order", () => {
    expect(hitsoundLabel(undefined)).toBe("");
    expect(hitsoundLabel(0)).toBe("");
    expect(hitsoundLabel(HITSOUND_CLAP | HITSOUND_WHISTLE)).toBe("WC");
    expect(hitsoundLabel(HITSOUND_WHISTLE | HITSOUND_FINISH | HITSOUND_CLAP)).toBe("WFC");
  });

  it("copies only the hitsound fields of a note", () => {
    const note = {
      id: "a",
      time: 100,
      column: 2,
      hitSound: HITSOUND_FINISH,
      sampleSet: 1,
      sampleVolume: 70,
    };
    expect(hitsoundOf(note)).toEqual({
      hitSound: HITSOUND_FINISH,
      sampleSet: 1,
      additionSet: undefined,
      sampleIndex: undefined,
      sampleVolume: 70,
      sampleFile: undefined,
    });
  });
});

describe("column units", () => {
  it("falls back to osu!'s default column width when a skin says zero", () => {
    expect(columnUnits(undefined)).toBe(48);
    expect(columnUnits({ columnWidth: 0 } as Parameters<typeof columnUnits>[0])).toBe(48);
    expect(columnUnits({ columnWidth: 60 } as Parameters<typeof columnUnits>[0])).toBe(60);
  });

  it("measures skin units against the lane width", () => {
    expect(skinUnit(96, undefined)).toBe(2);
  });
});

describe("usableStagePiece", () => {
  const piece = (width: number, height: number) => ({
    img: { width, height } as HTMLImageElement,
    scale: 1,
  });
  it("skips the 1x1 placeholders skins use to turn a piece off", () => {
    expect(usableStagePiece(piece(1, 1))).toBeNull();
    expect(usableStagePiece(piece(200, 2))).toBeNull();
    expect(usableStagePiece(null)).toBeNull();
    const real = piece(64, 480);
    expect(usableStagePiece(real)).toBe(real);
  });
});

describe("laneFlashStrength", () => {
  it("is dark outside the flash", () => {
    expect(laneFlashStrength(-1, false)).toBe(0);
    expect(laneFlashStrength(LANE_FLASH_MS, false)).toBe(0);
  });

  it("starts fully lit, dips, and comes back softer", () => {
    expect(laneFlashStrength(0, false)).toBeCloseTo(1);
    const dip = laneFlashStrength(LANE_FLASH_MS / 3, false);
    const second = laneFlashStrength((LANE_FLASH_MS * 2) / 3, false);
    expect(dip).toBeCloseTo(0);
    expect(second).toBeGreaterThan(0.5);
    expect(second).toBeLessThan(1);
  });

  it("only fades with reduced motion", () => {
    expect(laneFlashStrength(0, true)).toBe(1);
    expect(laneFlashStrength(LANE_FLASH_MS / 2, true)).toBeCloseTo(0.5);
  });
});
