import { describe, it, expect } from "vitest";
import { makeDifficulty, type Difficulty, type LoadedFile } from "../types";
import { createRateDifficulty } from "./rateChange";
import { validateProject, type ValidateArgs } from "./validation";

const meta = { title: "Song", artist: "Artist", creator: "Mapper" };

function audioFiles(): Record<string, LoadedFile> {
  return {
    "audio.mp3": { name: "audio.mp3", url: "blob:audio", blob: new Blob() },
  };
}

function base(name = "Insane"): Difficulty {
  const d = makeDifficulty(name, 4);
  d.audioFilename = "audio.mp3";
  d.notes = [{ id: "n1", column: 0, startTime: 1000 }];
  return d;
}

const validate = (difficulties: Difficulty[], target?: string) =>
  validateProject({
    meta,
    difficulties,
    audioFiles: audioFiles(),
    bgFiles: {},
    target,
  } satisfies ValidateArgs);

describe("validateProject — rate difficulties on .sm export", () => {
  it("warns that rate difficulties will be skipped", () => {
    const source = base();
    const rated = createRateDifficulty(source, { rate: 1.2 });

    const result = validate([source, rated], ".sm");

    const warning = result.warnings.find((w) => w.message.includes("skipped"));
    expect(warning).toBeDefined();
    expect(warning?.message).toContain("1 rate difficulty");
    expect(warning?.scope).toBe("Insane x1.2 (144 BPM)");
    expect(result.errors).toHaveLength(0);
  });

  it("counts multiple skipped difficulties", () => {
    const source = base();
    const result = validate(
      [
        source,
        createRateDifficulty(source, { rate: 1.2 }),
        createRateDifficulty(source, { rate: 1.5 }),
      ],
      ".sm",
    );

    expect(
      result.warnings.find((w) => w.message.includes("skipped"))?.message,
    ).toContain("2 rate difficulties");
  });

  it("errors when every difficulty is a rate difficulty", () => {
    const rated = createRateDifficulty(base(), { rate: 1.2 });

    const result = validate([rated], ".sm");

    expect(
      result.errors.some((e) => e.message.includes("nothing left to export")),
    ).toBe(true);
  });

  it("stays quiet for osu targets, which keep per-difficulty audio", () => {
    const source = base();
    const diffs = [source, createRateDifficulty(source, { rate: 1.2 })];

    for (const target of [".osu", ".osz", undefined]) {
      const result = validate(diffs, target);
      expect(result.warnings.some((w) => w.message.includes("skipped"))).toBe(false);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("stays quiet when no difficulty carries a rate", () => {
    const result = validate([base("Normal"), base("Hard")], ".sm");
    expect(result.warnings.some((w) => w.message.includes("skipped"))).toBe(false);
  });
});

describe("validateProject — key counts on .sm export", () => {
  const withKeys = (name: string, keys: number) => ({ ...base(name), keyCount: keys });

  it("warns about difficulties StepMania has no chart type for", () => {
    const result = validate([withKeys("Seven", 7), withKeys("Nine", 9)], ".sm");
    const warning = result.warnings.find((w) => w.message.includes("left out"));
    expect(warning?.scope).toBe("Nine (9K)");
    expect(result.errors).toHaveLength(0);
  });

  it("errors when no difficulty fits", () => {
    const result = validate([withKeys("Nine", 9), withKeys("Three", 3)], ".sm");
    expect(result.errors.some((e) => e.message.includes("4K, 5K, 6K, 7K, 8K and 10K"))).toBe(true);
  });

  it("checks nothing for other formats", () => {
    const result = validate([withKeys("Nine", 9)], ".osz");
    expect(result.warnings.some((w) => w.message.includes("left out"))).toBe(false);
  });
});

describe("validateProject — values the format cannot hold", () => {
  it("blocks export of a note whose start time is NaN", () => {
    const d = base();
    d.notes = [{ id: "n1", column: 0, startTime: Number.NaN }];
    const result = validate([d], ".osz");
    expect(result.errors.map((e) => e.message)).toContain("1 note with an invalid start or end time.");
  });

  it("blocks export of a fractional column and of a non-finite hold end", () => {
    const d = base();
    d.notes = [
      { id: "n1", column: 1.5, startTime: 0 },
      { id: "n2", column: 0, startTime: 0, endTime: Infinity },
    ];
    const messages = validate([d]).errors.map((e) => e.message);
    expect(messages).toContain("1 note in an invalid column.");
    expect(messages).toContain("1 note with an invalid start or end time.");
  });

  it("blocks export of a NaN BPM or a NaN difficulty setting", () => {
    const d = base();
    d.timingPoints = [{ ...d.timingPoints[0], bpm: Number.NaN }];
    d.overallDifficulty = Number.NaN;
    const messages = validate([d]).errors.map((e) => e.message);
    expect(messages).toContain("1 timing point with an invalid time, BPM or value.");
    expect(messages).toContain(
      "HP, OD, preview time or another difficulty setting is not a valid number.",
    );
  });

  it("keeps overlaps and duplicates as warnings, not errors", () => {
    const d = base();
    d.notes = [
      { id: "n1", column: 0, startTime: 1000, endTime: 2000 },
      { id: "n2", column: 0, startTime: 1500 },
      { id: "n3", column: 0, startTime: 1500 },
    ];
    const result = validate([d]);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
