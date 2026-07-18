import { describe, it, expect } from "vitest";
import type { ManiaNote } from "../types";
import {
  mirrorColumns,
  copyHitsounds,
  countHitsounds,
  reverseTime,
  scaleTime,
  shuffleColumns,
} from "./noteTools";

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

describe("reverseTime", () => {
  it("makes the last note first inside the same span", () => {
    const out = reverseTime([note("a", 0, 100), note("b", 1, 500)]);
    const byId = Object.fromEntries(out.map((n) => [n.id, n]));
    expect(byId.a.startTime).toBe(500);
    expect(byId.b.startTime).toBe(100);
  });

  it("keeps long note lengths and reflects around the tail", () => {
    // LN 100-400 plus a rice at 600: span is 100..600.
    const out = reverseTime([note("ln", 0, 100, 400), note("r", 1, 600)]);
    const byId = Object.fromEntries(out.map((n) => [n.id, n]));
    expect(byId.r.startTime).toBe(100);
    // The LN's old end (400) reflects to 100 + (600 - 400) = 300.
    expect(byId.ln.startTime).toBe(300);
    expect(byId.ln.endTime).toBe(600);
  });

  it("is its own inverse", () => {
    const notes = [note("a", 0, 100), note("b", 2, 350, 700), note("c", 1, 900)];
    const twice = reverseTime(reverseTime(notes));
    expect(twice.map((n) => [n.startTime, n.endTime])).toEqual(
      notes.map((n) => [n.startTime, n.endTime]),
    );
  });

  it("leaves a single note alone", () => {
    const notes = [note("a", 2, 123)];
    expect(reverseTime(notes)).toBe(notes);
  });
});

describe("scaleTime", () => {
  it("doubles gaps from the first note", () => {
    const out = scaleTime([note("a", 0, 100), note("b", 1, 200)], 2);
    expect(out.map((n) => n.startTime)).toEqual([100, 300]);
  });

  it("halves gaps and scales hold ends", () => {
    const out = scaleTime([note("a", 0, 100, 300), note("b", 1, 500)], 0.5);
    const byId = Object.fromEntries(out.map((n) => [n.id, n]));
    expect(byId.a.startTime).toBe(100);
    expect(byId.a.endTime).toBe(200);
    expect(byId.b.startTime).toBe(300);
  });

  it("ignores nonsense factors", () => {
    const notes = [note("a", 0, 100), note("b", 1, 200)];
    expect(scaleTime(notes, 0)).toBe(notes);
    expect(scaleTime(notes, 1)).toBe(notes);
  });
});

describe("shuffleColumns", () => {
  it("keeps times and chord sizes, changes only columns", () => {
    const notes = [
      note("a", 0, 0),
      note("b", 1, 0),
      note("c", 2, 500),
      note("d", 3, 1000),
    ];
    const out = shuffleColumns(notes, 4, () => 0.99);
    expect(out).toHaveLength(4);
    const chord = out.filter((n) => n.startTime === 0);
    expect(chord).toHaveLength(2);
    expect(new Set(chord.map((n) => n.column)).size).toBe(2);
    for (const n of out) {
      expect(n.column).toBeGreaterThanOrEqual(0);
      expect(n.column).toBeLessThan(4);
    }
  });

  it("never drops a note into a column a long note still occupies", () => {
    // LN in some column 0..3 spanning 0-1000; rice notes at 250/500/750.
    for (let seed = 0; seed < 20; seed++) {
      let s = seed + 1;
      const rng = () => {
        // Tiny LCG so each run is deterministic but different.
        s = (s * 48271) % 2147483647;
        return s / 2147483647;
      };
      const out = shuffleColumns(
        [note("ln", 0, 0, 1000), note("a", 1, 250), note("b", 2, 500)],
        4,
        rng,
      );
      const ln = out.find((n) => n.id === "ln")!;
      for (const n of out) {
        if (n.id === "ln") continue;
        expect(n.column).not.toBe(ln.column);
      }
    }
  });

  it("keeps a chord as-is when there is no room to re-deal", () => {
    // 4 simultaneous notes in 4K: only one possible set of columns.
    const notes = [
      note("a", 0, 0),
      note("b", 1, 0),
      note("c", 2, 0),
      note("d", 3, 0),
    ];
    const out = shuffleColumns(notes, 4, () => 0.5);
    expect(new Set(out.map((n) => n.column))).toEqual(new Set([0, 1, 2, 3]));
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
