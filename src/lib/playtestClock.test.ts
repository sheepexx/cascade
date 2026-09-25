import { describe, expect, it } from "vitest";
import {
  MAX_INPUT_LAG_MS,
  PLAYTEST_LEAD_IN_MS,
  gameplayTime,
  inputTime,
  migrateLegacyOffsets,
  runStartTime,
} from "./playtestClock";

const timing = { rate: 1, audioOffsetMs: 0, inputOffsetMs: 0 };

describe("gameplayTime", () => {
  it("moves the clock by the audio offset, scaled to song time by the rate", () => {
    expect(gameplayTime(1000, { ...timing, audioOffsetMs: -20 })).toBe(980);
    expect(gameplayTime(1000, { ...timing, rate: 1.5, audioOffsetMs: -20 })).toBe(970);
  });
});

describe("inputTime", () => {
  it("times a press at its event stamp, not when the handler ran", () => {
    // The handler ran 12 ms after the key went down.
    expect(inputTime(5000, 10_012, 10_000, timing)).toBe(4988);
    expect(inputTime(5000, 10_012, 10_000, { ...timing, rate: 2 })).toBe(4976);
  });

  it("ignores stamps from the future and caps stale ones", () => {
    expect(inputTime(5000, 10_000, 10_005, timing)).toBe(5000);
    expect(inputTime(5000, 20_000, 10_000, timing)).toBe(5000 - MAX_INPUT_LAG_MS);
    expect(inputTime(5000, 10_000, undefined, timing)).toBe(5000);
  });

  it("applies the audio offset like the playfield, plus the input offset", () => {
    const t = { rate: 1, audioOffsetMs: -20, inputOffsetMs: 5 };
    expect(inputTime(1000, 0, 0, t)).toBe(985);
  });
});

describe("runStartTime", () => {
  it("starts at the playhead when the first note is far enough away", () => {
    expect(runStartTime(10_000, 13_000, 1)).toBe(10_000);
  });

  it("backs up to give the lead-in before a note right at the playhead", () => {
    expect(runStartTime(10_000, 10_100, 1)).toBe(10_100 - PLAYTEST_LEAD_IN_MS);
    expect(runStartTime(10_000, 10_100, 1.5)).toBe(10_100 - PLAYTEST_LEAD_IN_MS * 1.5);
  });

  it("counts in before zero for a note at the start of the song", () => {
    expect(runStartTime(0, 300, 1)).toBe(300 - PLAYTEST_LEAD_IN_MS);
  });
});

describe("migrateLegacyOffsets", () => {
  it("turns an audio-mode offset into the audio offset", () => {
    expect(migrateLegacyOffsets({ offsetMode: "audio", offsetMs: -25 })).toEqual({
      audioOffsetMs: -25,
      inputOffsetMs: 0,
    });
  });

  it("keeps a visual-mode offset's effect on notes only", () => {
    expect(migrateLegacyOffsets({ offsetMode: "visual", offsetMs: 30 })).toEqual({
      audioOffsetMs: 30,
      inputOffsetMs: -30,
    });
  });

  it("leaves new settings alone", () => {
    expect(migrateLegacyOffsets({ audioOffsetMs: 10, offsetMs: 40 })).toBeNull();
    expect(migrateLegacyOffsets({})).toBeNull();
    expect(migrateLegacyOffsets(undefined)).toBeNull();
  });
});
