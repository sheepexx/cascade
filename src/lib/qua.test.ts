import { describe, expect, it } from "vitest";
import { makeDifficulty, makeGreenPoint, makeRedPoint } from "../types";
import { effectiveSvAt } from "./timing";
import { buildQuaFile, parseQuaFile } from "./qua";

describe("Quaver conversion", () => {
  it("imports metadata, notes, timing, SV and bookmarks", () => {
    const parsed = parseQuaFile(`
AudioFile: song.mp3
SongPreviewTime: 1234
BackgroundFile: bg.jpg
Mode: Keys4
Title: Test
Artist: Artist
Source: Album
Tags: jack speed
Creator: Mapper
DifficultyName: Hard
BPMDoesNotAffectScrollVelocity: true
InitialScrollVelocity: 1
Bookmarks:
  - StartTime: 750
    Note: drop
TimingPoints:
  - StartTime: 0.25
    Bpm: 120
    TimeSignature: 4/4
  - StartTime: 1000.5
    Bpm: 240
    TimeSignature: 3/4
SliderVelocities:
  - StartTime: 500
    Multiplier: 2
HitObjects:
  - StartTime: 500
    Lane: 1
  - StartTime: 1000
    Lane: 4
    EndTime: 1500
`);
    expect(parsed.meta).toMatchObject({
      title: "Test",
      artist: "Artist",
      creator: "Mapper",
      source: "Album",
    });
    expect(parsed.difficulty.keyCount).toBe(4);
    expect(parsed.difficulty.notes.map((note) => [note.column, note.startTime, note.endTime])).toEqual([
      [0, 500, undefined],
      [3, 1000, 1500],
    ]);
    expect(parsed.timingPoints.filter((point) => point.uninherited).map((point) => point.time)).toEqual([
      0.25,
      1000.5,
    ]);
    expect(effectiveSvAt(1500, parsed.timingPoints)).toBe(2);
    expect(parsed.difficulty.bookmarkLabels?.["750"]).toBe("drop");
    expect(parsed.bpmAffectsScroll).toBe(false);
  });

  it("round-trips Cascade geometry and resets SV at red points", () => {
    const difficulty = makeDifficulty("Expert", 7);
    difficulty.audioFilename = "song.ogg";
    difficulty.previewTime = 2000;
    difficulty.notes = [
      { id: "a", column: 0, startTime: 250 },
      { id: "b", column: 6, startTime: 1000, endTime: 1400 },
    ];
    const points = [
      makeRedPoint(0.125, 120),
      makeGreenPoint(500, 2),
      makeRedPoint(1000.5, 180),
    ];
    const source = buildQuaFile({
      meta: { title: "Song", artist: "Artist", creator: "Mapper", source: "Game" },
      difficulty,
      timingPoints: points,
      audioFilename: "song.ogg",
      bpmAffectsScroll: true,
    });
    const parsed = parseQuaFile(source);
    expect(parsed.meta.source).toBe("Game");
    expect(parsed.difficulty.keyCount).toBe(7);
    expect(parsed.difficulty.notes.map((note) => [note.column, note.startTime, note.endTime])).toEqual([
      [0, 250, undefined],
      [6, 1000, 1400],
    ]);
    expect(parsed.timingPoints.filter((point) => point.uninherited).map((point) => point.time)).toEqual([
      0.125,
      1000.5,
    ]);
    expect(effectiveSvAt(750, parsed.timingPoints)).toBe(2);
    expect(effectiveSvAt(1250, parsed.timingPoints)).toBe(1);
    expect(parsed.bpmAffectsScroll).toBe(true);
  });

  it("keeps the initial Quaver scroll velocity before the first timing point", () => {
    const parsed = parseQuaFile(`
Mode: Keys4
InitialScrollVelocity: 1.5
TimingPoints:
  - StartTime: 1000
    Bpm: 120
HitObjects:
  - StartTime: 250
    Lane: 1
`);
    expect(effectiveSvAt(250, parsed.timingPoints)).toBe(1.5);
    expect(effectiveSvAt(1250, parsed.timingPoints)).toBe(1.5);
    expect(parsed.bpmAffectsScroll).toBe(true);
  });
});
