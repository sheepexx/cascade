import { describe, expect, it } from "vitest";
import { longNoteBodyRange } from "./sharedMapPreview";

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
