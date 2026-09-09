import { describe, expect, it } from "vitest";
import { checkRankingCriteria, maniaTier, LEGAL_KEY_COUNTS } from "./rankingCriteria";
import { makeDifficulty, makeGreenPoint, makeRedPoint, type Difficulty, type ManiaNote } from "../types";

const note = (startTime: number, column = 0, endTime?: number): ManiaNote => ({ id: `${startTime}_${column}`, startTime, column, endTime });

const diff = (over: Partial<Difficulty> = {}): Difficulty => ({
  ...makeDifficulty(over.name ?? "Test", over.keyCount ?? 4),
  timingPoints: [makeRedPoint(0, 120)],
  ...over,
});

const stream = (count: number, step: number, columns: number, from = 0) =>
  Array.from({ length: count }, (_, i) => note(from + i * step, i % columns));

const rules = (d: Difficulty[]) => checkRankingCriteria(d).filter(f => !f.guideline).map(f => f.rule);
const guides = (d: Difficulty[]) => checkRankingCriteria(d).filter(f => f.guideline).map(f => f.rule);

describe("mania difficulty tiers", () => {
  it("uses mania naming thresholds rather than the star colour spectrum", () => {
    expect(maniaTier(1.9, 4)).toBe("Normal");
    expect(maniaTier(3.0, 4)).toBe("Hard");
    expect(maniaTier(4.5, 4)).toBe("Insane");
  });
  it("scales thresholds per key mode because star rating deflates on wide keyboards", () => {
    expect(maniaTier(2.3, 4)).toBe("Normal");
    expect(maniaTier(2.3, 10)).toBe("Hard");
    expect(maniaTier(2.3, 99)).toBe("Normal");
  });
});

describe("ranking criteria rules", () => {
  it("rejects unrankable key modes and accepts the legal ones", () => {
    expect(LEGAL_KEY_COUNTS).not.toContain(11);
    expect(rules([diff({ keyCount: 11, notes: stream(400, 250, 11) })])).toContain("rc-key-count");
    expect(rules([diff({ keyCount: 10, notes: stream(400, 250, 10) })])).not.toContain("rc-key-count");
  });
  it("reports columns with no notes", () => {
    expect(rules([diff({ keyCount: 4, notes: stream(400, 250, 3) })])).toContain("rc-empty-column");
    expect(rules([diff({ keyCount: 4, notes: stream(400, 250, 4) })])).not.toContain("rc-empty-column");
  });
  it("allows more than six simultaneous presses only above Insane", () => {
    const chord = (time: number) => Array.from({ length: 7 }, (_, c) => note(time, c));
    const easy = diff({ keyCount: 7, notes: [...stream(200, 500, 7), ...chord(1_000_000)] });
    expect(rules([easy])).toContain("rc-simultaneous-presses");
    const dense = diff({ keyCount: 7, notes: [...stream(4000, 25, 7), ...chord(1_000_000)] });
    expect(rules([dense])).not.toContain("rc-simultaneous-presses");
  });
  it("requires key mode markers only when a set mixes key modes", () => {
    const single = [diff({ name: "Insane", keyCount: 4, notes: stream(400, 250, 4) })];
    expect(rules(single)).not.toContain("rc-key-mode-name");
    expect(rules([diff({ name: "[4K] Insane", keyCount: 4, notes: stream(400, 250, 4) })])).toContain("rc-key-mode-name");
    const mixed = [
      diff({ name: "Insane", keyCount: 4, notes: stream(400, 250, 4) }),
      diff({ name: "Insane", keyCount: 7, notes: stream(400, 250, 7) }),
    ];
    expect(rules(mixed).filter(r => r === "rc-key-mode-name")).toHaveLength(2);
  });
  it("flags scroll speed changes on low difficulties but exempts normalisation", () => {
    const notes = stream(400, 250, 4);
    const gimmick = diff({ notes, timingPoints: [makeRedPoint(0, 120), makeGreenPoint(20000, 2)] });
    expect(rules([gimmick])).toContain("rc-scroll-speed");
    const normalised = diff({
      notes,
      timingPoints: [makeRedPoint(0, 120), makeRedPoint(50000, 240), makeGreenPoint(50000, 0.5)],
    });
    expect(rules([normalised])).not.toContain("rc-scroll-speed");
    const unnormalised = diff({ notes, timingPoints: [makeRedPoint(0, 120), makeRedPoint(50000, 240)] });
    expect(rules([unnormalised])).toContain("rc-scroll-speed");
  });
  it("ignores timing sections that hold no notes", () => {
    const notes = stream(400, 250, 4);
    const trailing = diff({ notes, timingPoints: [makeRedPoint(0, 120), makeRedPoint(200000, 40)] });
    expect(rules([trailing])).not.toContain("rc-scroll-speed");
  });
  it("requires a spread when the drain time is short", () => {
    const short = diff({ name: "Expert", keyCount: 4, notes: stream(300, 60, 4) });
    expect(rules([short])).toContain("rc-spread");
    const long = diff({ name: "Expert", keyCount: 4, notes: stream(4000, 60, 4) });
    expect(rules([long])).not.toContain("rc-spread");
  });
  it("accepts a short set that reaches down to Normal", () => {
    const set = [
      diff({ name: "Expert", keyCount: 4, notes: stream(300, 60, 4) }),
      diff({ name: "Normal", keyCount: 4, notes: stream(300, 500, 4) }),
    ];
    expect(rules(set)).not.toContain("rc-spread");
  });
});

describe("ranking criteria guidelines", () => {
  it("scopes long note hold length to the difficulty tier", () => {
    const sparse = diff({ notes: [...stream(300, 500, 4), note(200000, 0, 200060)] });
    expect(guides([sparse])).toContain("rc-ln-hold");
    const dense = diff({ notes: [...stream(4000, 40, 4), note(1000000, 0, 1000060)] });
    expect(guides([dense])).not.toContain("rc-ln-hold");
  });
  it("always flags long notes under 1/12 of a beat", () => {
    const d = diff({ notes: [...stream(4000, 40, 4), note(1000000, 0, 1000010)] });
    expect(guides([d])).toContain("rc-ln-minimum");
  });
  it("flags HP and OD above the tier ceiling", () => {
    const d = diff({ notes: stream(300, 500, 4), hpDrainRate: 9, overallDifficulty: 9 });
    expect(guides([d])).toContain("rc-hp-od");
    const fine = diff({ notes: stream(300, 500, 4), hpDrainRate: 6, overallDifficulty: 6 });
    expect(guides([fine])).not.toContain("rc-hp-od");
  });
  it("leaves an ordinary dense chart free of low difficulty guidelines", () => {
    const d = diff({ keyCount: 4, notes: stream(3000, 60, 4) });
    const fired = guides([d]);
    expect(fired).not.toContain("rc-run-length");
    expect(fired).not.toContain("rc-fast-snap");
    expect(fired).not.toContain("rc-chord-size");
  });
});
