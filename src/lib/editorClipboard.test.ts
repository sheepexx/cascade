import { describe, expect, it } from "vitest";
import { makeRedPoint, type ManiaNote } from "../types";
import { isClipboardTextTarget, prepareNotePaste } from "./editorClipboard";
import { notesToPattern } from "./patterns";

const points = [makeRedPoint(0, 120)];
const source: ManiaNote[] = [
  { id: "a", column: 0, startTime: 1000, hitSound: 4, sampleFile: "clap.wav" },
  { id: "b", column: 1, startTime: 1125, endTime: 1500 },
];
const pattern = notesToPattern(source, points);
const bounds = { lo: 0, hi: 10000 };

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
    expect(result.notes.map((n) => [n.startTime, n.endTime])).toEqual([
      [5000, undefined], [5063, 5250],
    ]);
  });
});
