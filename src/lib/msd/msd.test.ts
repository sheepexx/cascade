import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  loadMinacalc,
  notesToMsdRows,
  msdSupportsKeyCount,
  type Minacalc,
} from "./minacalc";
import { msdColor, msdTooltip, dominantSkillset } from "./display";

const wasmBytes = readFileSync(new URL("./minacalc.wasm", import.meta.url));

let calcPromise: Promise<Minacalc> | null = null;
const getCalc = () => (calcPromise ??= loadMinacalc(wasmBytes));

function streamNotes(seconds: number, nps: number) {
  const notes: { column: number; startTime: number }[] = [];
  const count = Math.floor(seconds * nps);
  for (let i = 0; i < count; i++) {
    notes.push({
      column: [0, 2, 1, 3][i % 4],
      startTime: (i * 1000) / nps,
    });
  }
  return notes;
}

describe("minacalc wasm", () => {
  it("is calc version 515", async () => {
    const calc = await getCalc();
    expect(calc.version).toBe(515);
  });

  it("rates a 4k stream chart with plausible values", async () => {
    const calc = await getCalc();
    const rows = notesToMsdRows(streamNotes(90, 6), 4);
    const rating = calc.compute(rows, 4);
    expect(rating.overall).toBeGreaterThan(3);
    expect(rating.overall).toBeLessThan(40);
  });

  it("is deterministic", async () => {
    const calc = await getCalc();
    const rows = notesToMsdRows(streamNotes(60, 5), 4);
    expect(calc.compute(rows, 4)).toEqual(calc.compute(rows, 4));
  });

  it("rates denser charts higher", async () => {
    const calc = await getCalc();
    const sparse = calc.compute(notesToMsdRows(streamNotes(90, 4), 4), 4);
    const dense = calc.compute(notesToMsdRows(streamNotes(90, 9), 4), 4);
    expect(dense.overall).toBeGreaterThan(sparse.overall);
  });

  it("returns zeros for empty charts", async () => {
    const calc = await getCalc();
    const rating = calc.compute([], 4);
    expect(rating.overall).toBe(0);
  });

  it("computes 7k charts", async () => {
    const calc = await getCalc();
    const notes: { column: number; startTime: number }[] = [];
    for (let i = 0; i < 400; i++) {
      notes.push({ column: i % 7, startTime: i * 150 });
    }
    const rating = calc.compute(notesToMsdRows(notes, 7), 7);
    expect(rating.overall).toBeGreaterThan(0);
  });
});

describe("notesToMsdRows", () => {
  it("merges same-time notes into one row bitmask", () => {
    const rows = notesToMsdRows(
      [
        { column: 0, startTime: 1000 },
        { column: 3, startTime: 1000.2 },
        { column: 1, startTime: 1500 },
      ],
      4,
    );
    expect(rows).toEqual([
      { mask: 0b1001, timeSec: 1 },
      { mask: 0b0010, timeSec: 1.5 },
    ]);
  });

  it("drops columns outside the keymode", () => {
    const rows = notesToMsdRows(
      [
        { column: 5, startTime: 0 },
        { column: 1, startTime: 0 },
      ],
      4,
    );
    expect(rows).toEqual([{ mask: 0b0010, timeSec: 0 }]);
  });

  it("supports only MinaCalc keymodes", () => {
    expect(msdSupportsKeyCount(4)).toBe(true);
    expect(msdSupportsKeyCount(6)).toBe(true);
    expect(msdSupportsKeyCount(7)).toBe(true);
    expect(msdSupportsKeyCount(5)).toBe(false);
    expect(msdSupportsKeyCount(10)).toBe(false);
  });
});

describe("msd display helpers", () => {
  const rating = {
    overall: 20,
    stream: 10,
    jumpstream: 18,
    handstream: 4,
    stamina: 12,
    jackspeed: 6,
    chordjack: 5,
    technical: 9,
  };

  it("names the dominant skillset per keymode", () => {
    expect(dominantSkillset(rating, 4)).toBe("Jumpstream");
    expect(dominantSkillset(rating, 7)).toBe("Chordstream");
  });

  it("builds a tooltip sorted by skillset value", () => {
    const tip = msdTooltip(rating, 4);
    expect(tip.startsWith("MSD 20.00")).toBe(true);
    const lines = tip.split("\n");
    expect(lines[1]).toBe("Jumpstream: 18.00");
    expect(lines).toHaveLength(8);
  });

  it("returns a valid hsl color across the range", () => {
    for (const v of [0, 10, 25, 40, 99]) {
      expect(msdColor(v)).toMatch(/^hsl\(-?[\d.]+ 85% 66%\)$/);
    }
  });
});
