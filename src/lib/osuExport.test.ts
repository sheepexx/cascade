import { describe, expect, it } from "vitest";
import { DEFAULT_SONG_META, makeDifficulty } from "../types";
import { InvalidChartDataError } from "./chartValidation";
import { backgroundFilename, buildOsuFile } from "./osuExport";

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

describe("backgroundFilename", () => {
  const meta = { title: "Song: Remix", artist: "Artist", creator: "Mapper" };

  it("names the picture after the map and keeps its type", () => {
    const blob = new Blob(["x"], { type: "image/png" });
    expect(backgroundFilename(meta, { name: "bg.PNG", blob })).toBe("Artist - Song Remix background.png");
  });

  it("trusts the picture over a misleading file name", () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    expect(backgroundFilename(meta, { name: "bg.png", blob })).toBe("Artist - Song Remix background.jpg");
  });

  it("falls back to the file name, then to .jpg", () => {
    expect(backgroundFilename(meta, { name: "bg.avif", blob: new Blob(["x"]) })).toMatch(/background.avif$/);
    expect(backgroundFilename(meta, { name: "bg", blob: new Blob(["x"]) })).toMatch(/background.jpg$/);
  });
});
