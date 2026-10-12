import { describe, expect, it } from "vitest";
import { DEFAULT_SONG_META, makeDifficulty } from "../types";
import { InvalidChartDataError } from "./chartValidation";
import { buildOsuFile } from "./osuExport";

function difficulty(notes: ReturnType<typeof makeDifficulty>["notes"]) {
  return { ...makeDifficulty("Hard", 4), notes };
}

describe("buildOsuFile", () => {
  it("writes a normal difficulty", () => {
    const d = difficulty([{ id: "a", column: 0, startTime: 1000 }]);
    const text = buildOsuFile({
      meta: DEFAULT_SONG_META,
      difficulty: d,
      timingPoints: d.timingPoints,
      audioFilename: "audio.mp3",
    });
    expect(text).toContain("64,192,1000,1,0,0:0:0:0:");
  });

  it("refuses to write a NaN time instead of a line containing NaN", () => {
    const d = difficulty([{ id: "a", column: 0, startTime: Number.NaN }]);
    const build = () =>
      buildOsuFile({
        meta: DEFAULT_SONG_META,
        difficulty: d,
        timingPoints: d.timingPoints,
        audioFilename: "audio.mp3",
      });
    expect(build).toThrow(InvalidChartDataError);
    expect(build).toThrow(/"Hard" has 1 value the \.osu format can't hold/);
  });

  it("refuses a column outside the key count", () => {
    const d = difficulty([{ id: "a", column: 17, startTime: 0 }]);
    expect(() =>
      buildOsuFile({
        meta: DEFAULT_SONG_META,
        difficulty: d,
        timingPoints: d.timingPoints,
        audioFilename: "audio.mp3",
      }),
    ).toThrow(InvalidChartDataError);
  });
});
