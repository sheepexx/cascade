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
    expect(warning?.scope).toBe("Insane x1.2");
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
