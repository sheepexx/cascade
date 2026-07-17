import { describe, it, expect } from "vitest";
import type { ManiaNote } from "../types";
import { mirrorColumns, copyHitsounds, countHitsounds } from "./noteTools";

function note(
  id: string,
  column: number,
  startTime: number,
  endTime?: number,
): ManiaNote {
  return endTime === undefined
    ? { id, column, startTime }
    : { id, column, startTime, endTime };
}

describe("mirrorColumns", () => {
  it("swaps the leftmost and rightmost lanes (4K)", () => {
    const out = mirrorColumns([note("a", 0, 100)], 4);
    expect(out[0].column).toBe(3);
    expect(mirrorColumns([note("b", 3, 100)], 4)[0].column).toBe(0);
  });

  it("maps every column to keyCount - 1 - column", () => {
    const out = mirrorColumns(
      [note("a", 0, 0), note("b", 1, 0), note("c", 2, 0), note("d", 3, 0)],
      4,
    );
    expect(out.map((n) => n.column)).toEqual([3, 2, 1, 0]);
  });

  it("is its own inverse (mirroring twice restores the columns)", () => {
    const notes = [note("a", 1, 0), note("b", 5, 250), note("c", 6, 500)];
    const twice = mirrorColumns(mirrorColumns(notes, 7), 7);
    expect(twice.map((n) => n.column)).toEqual([1, 5, 6]);
  });

  it("keeps the centre lane fixed on an odd key count", () => {
    expect(mirrorColumns([note("a", 3, 0)], 7)[0].column).toBe(3);
  });

  it("preserves id, times, hold length and hitsounds", () => {
    const ln: ManiaNote = {
      id: "ln",
      column: 1,
      startTime: 100,
      endTime: 400,
      hitSound: 8,
    };
    const [out] = mirrorColumns([ln], 4);
    expect(out).toEqual({ ...ln, column: 2 });
  });

  it("does not mutate the input notes", () => {
    const notes = [note("a", 0, 100)];
    mirrorColumns(notes, 4);
    expect(notes[0].column).toBe(0);
  });
});

describe("copyHitsounds", () => {
  it("copies hitsounds onto notes at matching times, preferring same column", () => {
    const target = [note("t0", 0, 100), note("t1", 1, 200)];
    const source = [
      { id: "s0", column: 0, startTime: 100, hitSound: 8 },
      { id: "s1", column: 1, startTime: 200, hitSound: 2, sampleFile: "x.wav" },
    ];
    const { after, changed } = copyHitsounds(target, source);
    expect(changed).toBe(2);
    const byId = Object.fromEntries(after.map((n) => [n.id, n]));
    expect(byId.t0.hitSound).toBe(8);
    expect(byId.t1.hitSound).toBe(2);
    expect(byId.t1.sampleFile).toBe("x.wav");
  });

  it("matches within the tolerance and skips notes with no source", () => {
    const target = [note("t0", 0, 101), note("t1", 0, 999)];
    const source = [{ id: "s0", column: 0, startTime: 100, hitSound: 4 }];
    const { after, changed } = copyHitsounds(target, source, 2);
    expect(changed).toBe(1);
    expect(after[0].id).toBe("t0");
    expect(after[0].hitSound).toBe(4);
  });

  it("skips notes whose hitsound would not change", () => {
    const target = [{ id: "t0", column: 0, startTime: 100, hitSound: 8 }];
    const source = [{ id: "s0", column: 0, startTime: 100, hitSound: 8 }];
    expect(copyHitsounds(target, source).changed).toBe(0);
  });

  it("does not mutate inputs", () => {
    const target = [note("t0", 0, 100)];
    copyHitsounds(target, [{ id: "s0", column: 0, startTime: 100, hitSound: 8 }]);
    expect(target[0].hitSound).toBeUndefined();
  });
});

describe("countHitsounds", () => {
  it("counts notes carrying an addition or a sample file", () => {
    const notes: ManiaNote[] = [
      { id: "a", column: 0, startTime: 0, hitSound: 8 },
      { id: "b", column: 1, startTime: 100 },
      { id: "c", column: 2, startTime: 200, sampleFile: "clap.wav" },
    ];
    expect(countHitsounds(notes)).toBe(2);
  });
});
