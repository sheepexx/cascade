import { describe, expect, it } from "vitest";
import { makeDifficulty, makeRedPoint, type ManiaNote } from "../types";
import {
  adoptCopiedDifficulty,
  isClipboardTextTarget,
  positionPatternForDrop,
  prepareNotePaste,
} from "./editorClipboard";
import { notesToPattern } from "./patterns";

const points = [makeRedPoint(0, 120)];
const source: ManiaNote[] = [
  { id: "a", column: 0, startTime: 1000, hitSound: 4, sampleFile: "clap.wav" },
  { id: "b", column: 1, startTime: 1125, endTime: 1500 },
];
const pattern = notesToPattern(source, points);
const bounds = { lo: 0, hi: 10000 };

describe("clipboard drop positioning", () => {
  it("anchors the leftmost used lane to the drop lane without changing timing or hitsounds", () => {
    const shifted = positionPatternForDrop(pattern, 2, 4)!;
    expect(shifted.map((n) => n.column)).toEqual([2, 3]);
    expect(shifted[0]).toEqual({ ...pattern[0], column: 2 });
    expect(shifted[1]).toEqual({ ...pattern[1], column: 3 });
    expect(pattern.map((n) => n.column)).toEqual([0, 1]);
  });

  it("clamps against the right edge to keep the whole pattern", () => {
    expect(positionPatternForDrop(pattern, 3, 4)?.map((n) => n.column)).toEqual([2, 3]);
  });

  it("preserves gaps between used lanes", () => {
    const sparse = [{ column: 3, startTime: 0 }, { column: 5, startTime: 250 }];
    expect(positionPatternForDrop(sparse, 1, 4)?.map((n) => n.column)).toEqual([1, 3]);
  });

  it("fits a narrow pattern copied from a higher key count", () => {
    expect(positionPatternForDrop([{ column: 6, startTime: 0 }], 1, 4)).toEqual([
      { column: 1, startTime: 0 },
    ]);
  });

  it("rejects a pattern wider than the target without dropping any lanes", () => {
    expect(positionPatternForDrop([{ column: 0, startTime: 0 }, { column: 4, startTime: 0 }], 0, 4)).toBeNull();
  });

  it.each([-1, 4, 0.5, NaN])("rejects an invalid destination lane %s", (column) => {
    expect(positionPatternForDrop(pattern, column, 4)).toBeNull();
  });

  it("rejects empty patterns and malformed source lanes", () => {
    expect(positionPatternForDrop([], 0, 4)).toBeNull();
    expect(positionPatternForDrop([{ column: NaN, startTime: 0 }], 0, 4)).toBeNull();
    expect(positionPatternForDrop([{ column: -1, startTime: 0 }], 0, 4)).toBeNull();
  });

  it("prepares the shifted pattern using the normal paste rules", () => {
    const shifted = positionPatternForDrop(pattern, 2, 4)!;
    const existing = [{ id: "occupied", column: 2, startTime: 5000 }];
    const result = prepareNotePaste(shifted, 5030, 4, points, 4, existing, bounds);
    expect(result.candidates.map((n) => n.column)).toEqual([2, 3]);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({ column: 3, startTime: 5125, endTime: 5500 });
    expect(result.message).toContain("1 overlapping");
  });
});

describe("note clipboard keyboard targets", () => {
  it.each(["range", "checkbox", "radio", "button", "color"])(
    "allows note shortcuts while a %s control has focus",
    (type) => {
      expect(isClipboardTextTarget({ tagName: "INPUT", type } as unknown as EventTarget)).toBe(false);
    },
  );

  it.each(["text", "number", "search", "email", "password", "url"])(
    "preserves native text shortcuts in %s inputs",
    (type) => {
      expect(isClipboardTextTarget({ tagName: "INPUT", type } as unknown as EventTarget)).toBe(true);
    },
  );

  it("protects textareas, selects and nested editable content", () => {
    for (const target of [{ tagName: "TEXTAREA" }, { tagName: "SELECT" }, { tagName: "SPAN", isContentEditable: true }]) {
      expect(isClipboardTextTarget(target as unknown as EventTarget)).toBe(true);
    }
    expect(isClipboardTextTarget(null)).toBe(false);
    expect(isClipboardTextTarget({ tagName: "CANVAS" } as unknown as EventTarget)).toBe(false);
  });
});

describe("prepareNotePaste", () => {
  it("pastes at the requested snap with long notes and hitsounds intact", () => {
    const result = prepareNotePaste(pattern, 5030, 4, points, 4, source, bounds);
    expect(result.notes.map((n) => [n.column, n.startTime, n.endTime])).toEqual([
      [0, 5000, undefined], [1, 5125, 5500],
    ]);
    expect(result.notes[0]).toMatchObject({ hitSound: 4, sampleFile: "clap.wav" });
    expect(result.notes[0].id).not.toBe(source[0].id);
    expect(result.message).toBe("Pasted 2 notes.");
    expect(source[0].startTime).toBe(1000);
  });

  it("reports a fully occupied destination without changing the clipboard", () => {
    const result = prepareNotePaste(pattern, 1000, 4, points, 4, source, bounds);
    expect(result.notes).toEqual([]);
    expect(result.message).toContain("Nothing pasted.");
    expect(result.message).toContain("2 overlapping");
    expect(prepareNotePaste(pattern, 5000, 4, points, 4, source, bounds).notes).toHaveLength(2);
  });

  it("reports partial pastes and keeps the notes that fit", () => {
    const result = prepareNotePaste(pattern, 1000, 4, points, 4, source.slice(0, 1), bounds);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].column).toBe(1);
    expect(result.message).toContain("Pasted 1 note.");
    expect(result.message).toContain("1 overlapping");
  });

  it("explains columns, trim boundaries and overlaps in a mixed paste", () => {
    const result = prepareNotePaste([
      { column: 6, startTime: 0 },
      { column: 0, startTime: 0 },
      { column: 1, startTime: 125, endTime: 500 },
      { column: 2, startTime: 250 },
    ], 1000, 4, points, 4, source.slice(0, 1), { lo: 1000, hi: 1400 });
    expect(result.notes.map((n) => n.column)).toEqual([2]);
    expect(result.message).toContain("1 outside the current key count");
    expect(result.message).toContain("1 outside the song or trim");
    expect(result.message).toContain("1 overlapping");
  });

  it("accepts the exact trim boundaries but rejects notes before the trim", () => {
    const result = prepareNotePaste(pattern, 1000, 4, points, 4, [], { lo: 1000, hi: 1500 });
    expect(result.notes).toHaveLength(2);
    expect(prepareNotePaste(pattern, 0, 4, points, 4, [], { lo: 1000, hi: 1500 }).notes).toHaveLength(0);
  });

  it("keeps musical spacing across a BPM change", () => {
    const result = prepareNotePaste(pattern, 5000, 4, [makeRedPoint(0, 120), makeRedPoint(5000, 240)], 4, [], bounds);
    // A 1/4 at 240 BPM is 62.5ms; osu! stable floors that tick to 5062.
    expect(result.notes.map((n) => [n.startTime, n.endTime])).toEqual([
      [5000, undefined], [5062, 5250],
    ]);
  });
});

describe("adoptCopiedDifficulty", () => {
  const copied = {
    ...makeDifficulty("Insane", 7),
    beatmapId: 123,
    audioFilename: "song.mp3",
    backgroundFilename: "bg.jpg",
    videoFilename: "video.mp4",
    videoOffsetMs: 250,
    notes: source,
  };
  const target = {
    existingNames: ["Insane"],
    audioFilenames: ["other.mp3"],
    backgroundFilenames: ["cover.png", "alt.png"],
    videoFilenames: [],
    base: { audioFilename: "other.mp3", backgroundFilename: "alt.png" },
  };

  it("gives the copy fresh ids, a free name and no beatmap id", () => {
    const diff = adoptCopiedDifficulty(copied, target);
    expect(diff.id).not.toBe(copied.id);
    expect(diff.name).toBe("Insane (2)");
    expect(diff.beatmapId).toBeUndefined();
    expect(diff.keyCount).toBe(7);
    expect(diff.notes.map((n) => n.id)).not.toContain("a");
    expect(diff.notes.map((n) => [n.column, n.startTime, n.endTime, n.hitSound])).toEqual([
      [0, 1000, undefined, 4], [1, 1125, 1500, undefined],
    ]);
    expect(diff.timingPoints).toHaveLength(copied.timingPoints.length);
    expect(diff.timingPoints[0].id).not.toBe(copied.timingPoints[0].id);
  });

  it("swaps assets this map lacks for the active difficulty's", () => {
    const diff = adoptCopiedDifficulty(copied, target);
    expect(diff.audioFilename).toBe("other.mp3");
    expect(diff.backgroundFilename).toBe("alt.png");
    expect(diff.videoFilename).toBeUndefined();
    expect(diff.videoOffsetMs).toBeUndefined();
  });

  it("keeps assets this map shares with the source", () => {
    const diff = adoptCopiedDifficulty(copied, {
      existingNames: [],
      audioFilenames: ["other.mp3", "song.mp3"],
      backgroundFilenames: ["bg.jpg"],
      videoFilenames: ["video.mp4"],
    });
    expect(diff).toMatchObject({
      name: "Insane",
      audioFilename: "song.mp3",
      backgroundFilename: "bg.jpg",
      videoFilename: "video.mp4",
      videoOffsetMs: 250,
    });
  });
});
