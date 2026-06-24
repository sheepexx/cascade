import { describe, it, expect } from "vitest";
import type { Difficulty, ManiaNote, SongMeta } from "../types";
import { makeDifficulty, makeRedPoint, makeGreenPoint } from "../types";
import { buildOsuFile, columnToX, xToColumn } from "./osuExport";
import { parseOsuFile } from "./osuImport";

describe("columnToX / xToColumn", () => {
  it("round-trips every column for common key counts", () => {
    for (const keys of [4, 5, 7, 10]) {
      for (let col = 0; col < keys; col++) {
        expect(xToColumn(columnToX(col, keys), keys)).toBe(col);
      }
    }
  });
});

describe("buildOsuFile -> parseOsuFile round-trip", () => {
  const meta: SongMeta = {
    title: "Test Song",
    artist: "Test Artist",
    creator: "Mapper",
    tags: "foo bar",
  };

  const notes: ManiaNote[] = [
    { id: "a", column: 0, startTime: 0 },
    { id: "b", column: 3, startTime: 500 },
    { id: "c", column: 1, startTime: 1000, endTime: 1500 }, // long note
  ];

  const difficulty: Difficulty = {
    ...makeDifficulty("Insane", 4),
    overallDifficulty: 8,
    hpDrainRate: 6,
    previewTime: 2000,
    notes,
  };

  const timingPoints = [
    makeRedPoint(0, 180, { meter: 4, volume: 80 }),
    makeGreenPoint(1000, 1.5, { kiai: true }),
  ];

  const text = buildOsuFile({
    meta,
    difficulty,
    timingPoints,
    audioFilename: "audio.mp3",
    backgroundFilename: "bg.jpg",
  });
  const parsed = parseOsuFile(text);

  it("preserves song metadata", () => {
    expect(parsed.meta).toEqual(meta);
  });

  it("preserves difficulty settings", () => {
    expect(parsed.difficulty.name).toBe("Insane");
    expect(parsed.difficulty.keyCount).toBe(4);
    expect(parsed.difficulty.overallDifficulty).toBe(8);
    expect(parsed.difficulty.hpDrainRate).toBe(6);
    expect(parsed.difficulty.previewTime).toBe(2000);
  });

  it("preserves audio and background filenames", () => {
    expect(parsed.audioFilename).toBe("audio.mp3");
    expect(parsed.backgroundFilename).toBe("bg.jpg");
  });

  it("round-trips notes (column + timing), including the long note", () => {
    const geometry = parsed.difficulty.notes
      .map((n) => ({ column: n.column, startTime: n.startTime, endTime: n.endTime }))
      .sort((a, b) => a.startTime - b.startTime);
    expect(geometry).toEqual([
      { column: 0, startTime: 0, endTime: undefined },
      { column: 3, startTime: 500, endTime: undefined },
      { column: 1, startTime: 1000, endTime: 1500 },
    ]);
  });

  it("round-trips the red point BPM and green point SV", () => {
    const red = parsed.timingPoints.find((p) => p.uninherited);
    const green = parsed.timingPoints.find((p) => !p.uninherited);
    expect(red?.bpm).toBeCloseTo(180, 6);
    expect(red?.volume).toBe(80);
    expect(green?.sv).toBeCloseTo(1.5, 6);
    expect(green?.kiai).toBe(true);
  });
});
