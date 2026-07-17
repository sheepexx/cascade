import { describe, it, expect } from "vitest";
import { buildSmFile } from "./smExport";
import { parseSmFile } from "./smImport";
import { CASCADE_WATERMARK } from "./osuExport";
import { makeDifficulty, makeRedPoint } from "../types";
import type { SongMeta } from "../types";

describe("buildSmFile", () => {
  const meta: SongMeta = {
    title: "Test Song",
    artist: "Test Artist",
    creator: "Mapper",
    tags: "",
  };

  const text = buildSmFile({
    meta,
    difficulties: [
      {
        ...makeDifficulty("Hard", 4),
        notes: [
          { id: "a", column: 0, startTime: 0 },
          { id: "b", column: 2, startTime: 500, endTime: 1000 },
        ],
      },
    ],
    timingPoints: [makeRedPoint(0, 120)],
    audioFilename: "audio.mp3",
  });

  it("starts with the Cascade watermark comment", () => {
    expect(text.split("\n")[0]).toBe(CASCADE_WATERMARK);
    expect(CASCADE_WATERMARK.startsWith("//")).toBe(true);
  });

  it("still parses cleanly with the watermark present", () => {
    const parsed = parseSmFile(text);
    expect(parsed.meta.title).toBe("Test Song");
    expect(parsed.meta.artist).toBe("Test Artist");
    expect(parsed.difficulties).toHaveLength(1);
    expect(parsed.difficulties[0].notes).toHaveLength(2);
  });
});
