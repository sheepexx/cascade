import { describe, it, expect } from "vitest";
import type { Difficulty, ManiaNote, SongMeta } from "../types";
import { makeDifficulty, makeRedPoint, makeGreenPoint } from "../types";
import {
  CASCADE_WATERMARK,
  buildOsuFile,
  columnToX,
  tagsWithCascade,
  xToColumn,
} from "./osuExport";
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
    source: "Feedback collection",
  };

  const notes: ManiaNote[] = [
    { id: "a", column: 0, startTime: 0 },
    { id: "b", column: 3, startTime: 500 },
    { id: "c", column: 1, startTime: 1000, endTime: 1500 },
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
    videoFilename: "video.mp4",
    videoOffsetMs: 250,
  });
  const parsed = parseOsuFile(text);

  it("preserves song metadata and appends the Cascade tag", () => {
    expect(parsed.meta).toEqual({ ...meta, tags: "foo bar Cascade" });
  });

  it("writes the source field", () => {
    expect(text).toContain("Source:Feedback collection");
  });

  it("keeps the map attached to its uploaded set", () => {
    // Exporting 0/-1 detaches the map from its submission, so osu! treats an
    // update as a brand-new beatmapset.
    const submitted = buildOsuFile({
      meta: { ...meta, beatmapSetId: 2587938 },
      difficulty: { ...difficulty, beatmapId: 5773504 },
      timingPoints,
      audioFilename: "audio.mp3",
    });
    expect(submitted).toContain("BeatmapSetID:2587938");
    expect(submitted).toContain("BeatmapID:5773504");

    const back = parseOsuFile(submitted);
    expect(back.meta.beatmapSetId).toBe(2587938);
    expect(back.difficulty.beatmapId).toBe(5773504);
  });

  it("marks an unsubmitted map as new", () => {
    expect(text).toContain("BeatmapSetID:-1");
    expect(text).toContain("BeatmapID:0");
    expect(parsed.meta.beatmapSetId).toBeUndefined();
    expect(parsed.difficulty.beatmapId).toBeUndefined();
  });

  it("writes a -1 the mapper set in Map Settings to detach the map", () => {
    const detached = buildOsuFile({
      meta: { ...meta, beatmapSetId: -1 },
      difficulty: { ...difficulty, beatmapId: -1 },
      timingPoints,
      audioFilename: "audio.mp3",
    });
    expect(detached).toContain("BeatmapSetID:-1");
    expect(detached).toContain("BeatmapID:-1");

    // Re-importing drops both, so a later export still reads as unsubmitted.
    const back = parseOsuFile(detached);
    expect(back.meta.beatmapSetId).toBeUndefined();
    expect(back.difficulty.beatmapId).toBeUndefined();
  });

  it("preserves original-script title and artist", () => {
    const jp = buildOsuFile({
      meta: {
        ...meta,
        titleUnicode: "エナジー＊ドリン娘☆ふぇいんちゃん！",
        artistUnicode: "かめりあ feat. ななひら",
      },
      difficulty,
      timingPoints,
      audioFilename: "audio.mp3",
    });
    expect(jp).toContain("TitleUnicode:エナジー＊ドリン娘☆ふぇいんちゃん！");
    expect(jp).toContain("ArtistUnicode:かめりあ feat. ななひら");
    // Romanised fields stay romanised.
    expect(jp).toContain("Title:Test Song");

    const back = parseOsuFile(jp);
    expect(back.meta.titleUnicode).toBe("エナジー＊ドリン娘☆ふぇいんちゃん！");
    expect(back.meta.artistUnicode).toBe("かめりあ feat. ななひら");
    expect(back.meta.title).toBe("Test Song");
  });

  it("falls back to the romanised name when there is no unicode title", () => {
    expect(text).toContain("TitleUnicode:Test Song");
    expect(text).toContain("ArtistUnicode:Test Artist");
  });

  it("preserves the difficulty's default sample set", () => {
    const soft = buildOsuFile({
      meta,
      difficulty: { ...difficulty, sampleSet: "Soft" },
      timingPoints,
      audioFilename: "audio.mp3",
    });
    expect(soft).toContain("SampleSet: Soft");
    expect(parseOsuFile(soft).difficulty.sampleSet).toBe("Soft");
    expect(text).toContain("SampleSet: Normal");
  });

  it("starts with the format header followed by the Cascade watermark", () => {
    const [first, second] = text.split("\n");
    expect(first).toBe("osu file format v14");
    expect(second).toBe(CASCADE_WATERMARK);
    expect(second.startsWith("//")).toBe(true);
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

  it("preserves the background video and its start offset", () => {
    expect(parsed.videoFilename).toBe("video.mp4");
    expect(parsed.videoOffsetMs).toBe(250);
  });

  it("parses the legacy numeric video event type", () => {
    const legacy = text.replace('Video,250,"video.mp4"', '1,250,"video.mp4"');
    const p = parseOsuFile(legacy);
    expect(p.videoFilename).toBe("video.mp4");
    expect(p.videoOffsetMs).toBe(250);
    expect(p.backgroundFilename).toBe("bg.jpg");
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

  it("does not duplicate the Cascade tag on re-export", () => {
    expect(tagsWithCascade("foo bar Cascade")).toBe("foo bar Cascade");
    expect(tagsWithCascade("cascade foo")).toBe("cascade foo");
    expect(tagsWithCascade("")).toBe("Cascade");
    expect(tagsWithCascade(undefined)).toBe("Cascade");
  });

  it("round-trips the red point BPM and green point SV", () => {
    const red = parsed.timingPoints.find((p) => p.uninherited);
    const green = parsed.timingPoints.find((p) => !p.uninherited);
    expect(red?.bpm).toBeCloseTo(180, 6);
    expect(red?.volume).toBe(80);
    expect(green?.sv).toBeCloseTo(1.5, 6);
    expect(green?.kiai).toBe(true);
  });

  it("preserves fractional timing offsets so snapped objects stay snapped", () => {
    const fractional = [makeRedPoint(12.345, 177.7)];
    const exported = buildOsuFile({
      meta,
      difficulty,
      timingPoints: fractional,
      audioFilename: "audio.mp3",
    });
    expect(exported).toContain("12.345,");
    expect(parseOsuFile(exported).timingPoints[0].time).toBe(12.345);
  });
});
