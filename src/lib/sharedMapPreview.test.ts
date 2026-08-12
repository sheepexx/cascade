import { describe, expect, it } from "vitest";
import {
  longNoteBodyRange,
  previewMapTimeMs,
  previewStartMs,
} from "./sharedMapPreview";

describe("previewStartMs", () => {
  it("adds visual lead-in before an explicit preview point", () => {
    expect(previewStartMs([], 10000)).toBe(9200);
  });

  it("adds visual lead-in before the first note", () => {
    expect(
      previewStartMs(
        [
          { id: "later", column: 0, startTime: 5000 },
          { id: "first", column: 1, startTime: 3000 },
        ],
        -1,
      ),
    ).toBe(2200);
  });

  it("clamps lead-in at the beginning of the song", () => {
    expect(
      previewStartMs([{ id: "first", column: 0, startTime: 400 }], -1),
    ).toBe(0);
  });
});

describe("previewMapTimeMs", () => {
  it("projects full audio from one media clock sample", () => {
    expect(previewMapTimeMs(18.4, 250, 2, false, 9200)).toBe(9450);
  });

  it("projects a trimmed clip relative to its stored map start", () => {
    expect(previewMapTimeMs(0, 250, 1, true, 9200)).toBe(9450);
  });
});

describe("longNoteBodyRange", () => {
  it("connects an approaching hold tail to its head", () => {
    expect(longNoteBodyRange(180, 100, 240)).toEqual({
      top: 100,
      height: 80,
    });
  });

  it("clips an active hold body at the receptors", () => {
    expect(longNoteBodyRange(320, 100, 240)).toEqual({
      top: 100,
      height: 140,
    });
  });
});
