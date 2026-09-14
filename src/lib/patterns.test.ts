import { describe, expect, it } from "vitest";
import { makeRedPoint, type ManiaNote, type TimingPoint } from "../types";
import { notesToPattern, patternSnap, patternToNotes } from "./patterns";

const note = (column: number, startTime: number, endTime?: number): ManiaNote => ({
  id: `n${column}-${startTime}`,
  column,
  startTime,
  endTime,
});

const at = (bpm: number, time = 0): TimingPoint[] => [makeRedPoint(time, bpm)];

function snapped(bpm: number, divisor: number, count: number): ManiaNote[] {
  const step = 60000 / bpm / divisor;
  return Array.from({ length: count }, (_, i) =>
    note(i % 4, Math.round(i * step)),
  );
}

describe("pattern snap preservation", () => {
  it("copies selections larger than the JavaScript argument limit", () => {
    const notes = Array.from({ length: 150000 }, (_, i) => note(i % 4, 1000 + i));
    const pattern = notesToPattern(notes, at(120));
    expect(pattern).toHaveLength(150000);
    expect(pattern[0].startTime).toBe(0);
    expect(pattern[149999].startTime).toBe(149999);
  });

  it("re-spaces a 1/4 pattern for the target BPM instead of copying milliseconds", () => {
    const pattern = notesToPattern(snapped(180, 4, 4), at(180));
    const pasted = patternToNotes(pattern, 1000, 4, at(150));

    expect(pasted.map((n) => n.startTime)).toEqual([1000, 1100, 1200, 1300]);
  });

  it("keeps the millisecond spacing when the BPM matches", () => {
    const pattern = notesToPattern(snapped(180, 4, 4), at(180));
    const pasted = patternToNotes(pattern, 0, 4, at(180));

    // 1/4 of a 180 BPM beat is 83.33ms; the third tick sits on 166, where
    // osu! stable floors 166.67.
    expect(pasted.map((n) => n.startTime)).toEqual([0, 83, 166, 250]);
  });

  it("scales long notes with the target BPM", () => {
    const pattern = notesToPattern([note(0, 0, 500)], at(120));
    const pasted = patternToNotes(pattern, 0, 4, at(240));

    expect(pasted[0].endTime).toBe(250);
  });

  it("places notes against the BPM in force where they land", () => {
    const target = [makeRedPoint(0, 120), makeRedPoint(1000, 240)];
    const pattern = notesToPattern(snapped(120, 1, 3), at(120));
    const pasted = patternToNotes(pattern, 500, 4, target);

    expect(pasted.map((n) => n.startTime)).toEqual([500, 1000, 1250]);
  });

  it("falls back to millisecond offsets for patterns saved before beats", () => {
    const legacy = [
      { column: 0, startTime: 0 },
      { column: 1, startTime: 125 },
    ];
    const pasted = patternToNotes(legacy, 400, 4, at(180));

    expect(pasted.map((n) => n.startTime)).toEqual([400, 525]);
  });

  it("drops columns the target key count does not have", () => {
    const pattern = notesToPattern([note(0, 0), note(5, 100)], at(180));

    expect(patternToNotes(pattern, 0, 4, at(180))).toHaveLength(1);
  });
});

describe("patternSnap", () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [6, 6],
    [8, 8],
    [12, 12],
    [16, 16],
  ])("reports 1/%i for a 1/%i pattern", (divisor) => {
    const pattern = notesToPattern(snapped(174, divisor, 5), at(174));
    expect(patternSnap(pattern)).toBe(divisor);
  });

  it("reports the finest snap in a mixed pattern", () => {
    const beat = 60000 / 180;
    const notes = [
      note(0, 0),
      note(1, Math.round(beat / 2)),
      note(2, Math.round(beat * 0.75)),
    ];
    expect(patternSnap(notesToPattern(notes, at(180)))).toBe(4);
  });

  it("counts a long note tail towards the snap", () => {
    const beat = 60000 / 180;
    const notes = [note(0, 0, Math.round(beat / 8))];
    expect(patternSnap(notesToPattern(notes, at(180)))).toBe(8);
  });

  it("has no snap for a pattern that sits on one timestamp", () => {
    expect(patternSnap(notesToPattern([note(0, 0), note(1, 0)], at(180)))).toBe(
      null,
    );
  });

  it("has no snap when a note sits on no supported divisor", () => {
    expect(
      patternSnap(notesToPattern([note(0, 0), note(1, 153)], at(180))),
    ).toBe(null);
  });

  it("has no snap for patterns saved before beats", () => {
    expect(patternSnap([{ column: 0, startTime: 0 }])).toBe(null);
  });
});
