import JSZip from "jszip";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { makeDifficulty, makeGreenPoint, makeRedPoint } from "../types";
import { importOsz } from "./osuImport";
import { effectiveSvAt } from "./timing";
import { buildQp, buildQuaFile, parseQuaFile, qpFilename } from "./qua";

// JSZip reads blobs through FileReader, which Node doesn't have.
class ArrayBufferFileReader {
  result: ArrayBuffer | null = null;
  onload: ((e: { target: ArrayBufferFileReader }) => void) | null = null;
  onerror: ((e: { target: { error: unknown } }) => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    void blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this.onload?.({ target: this });
      })
      .catch((error: unknown) => this.onerror?.({ target: { error } }));
  }
}

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = ArrayBufferFileReader as unknown as typeof FileReader;
}

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

  it("reads Quaver's own signatures, scratch lane, mines and scroll groups", () => {
    const parsed = parseQuaFile(`
Mode: Keys7
HasScratchKey: true
TimingPoints:
- StartTime: 0
  Bpm: 120
  Signature: 0
- StartTime: 2000
  Bpm: 150
  Signature: Triple
HitObjects:
- StartTime: 500
  Lane: 8
- StartTime: 750
  Lane: 2
  Type: Mine
- StartTime: 1000
  Lane: 3
  TimingGroup: intro
`);
    expect(parsed.difficulty.keyCount).toBe(8);
    expect(parsed.difficulty.notes.map((note) => [note.column, note.startTime])).toEqual([
      [7, 500],
      [2, 1000],
    ]);
    expect(
      parsed.timingPoints.filter((point) => point.uninherited).map((point) => point.meter),
    ).toEqual([4, 3]);
    expect(parsed.leftOut).toEqual(["mines", "scrollGroups"]);
  });

  it("writes the keys Quaver reads and a timing point it requires", () => {
    const difficulty = makeDifficulty("Waltz", 4);
    difficulty.notes = [
      { id: "a", column: 0, startTime: 500 },
      // Rounds to a zero-length hold, which Quaver would refuse.
      { id: "b", column: 1, startTime: 600, endTime: 600.3 },
    ];
    const waltz = parse(
      buildQuaFile({
        meta: { title: "Song", artist: "Artist", creator: "Mapper" },
        difficulty,
        timingPoints: [makeRedPoint(0, 120, { meter: 3 }), makeRedPoint(1000, 120)],
        audioFilename: "audio.mp3",
        bpmAffectsScroll: false,
      }),
    ) as Record<string, unknown>;
    expect(waltz.TimingPoints).toEqual([
      { StartTime: 0, Bpm: 120, Signature: "Triple", Hidden: false },
      { StartTime: 1000, Bpm: 120, Hidden: false },
    ]);
    expect(waltz.HitObjects).toEqual([
      { StartTime: 500, Lane: 1 },
      { StartTime: 600, Lane: 2 },
    ]);
    expect(waltz.Mode).toBe("Keys4");

    const greenOnly = parse(
      buildQuaFile({
        meta: { title: "Song", artist: "Artist", creator: "Mapper" },
        difficulty,
        timingPoints: [makeGreenPoint(250, 1.5)],
        audioFilename: "audio.mp3",
        bpmAffectsScroll: false,
      }),
    ) as { TimingPoints: unknown[]; SliderVelocities: unknown[] };
    expect(greenOnly.TimingPoints).toHaveLength(1);
    expect(greenOnly.SliderVelocities).toEqual([{ StartTime: 250, Multiplier: 1.5 }]);
  });

  it("packs every 4K and 7K difficulty into a .qp that opens again with its files", async () => {
    const easy = makeDifficulty("Easy", 4);
    easy.audioFilename = "audio.mp3";
    easy.backgroundFilename = "bg.jpg";
    easy.notes = [{ id: "a", column: 1, startTime: 500 }];
    const hard = makeDifficulty("Hard", 7);
    hard.audioFilename = "audio 1.2x.mp3";
    hard.notes = [{ id: "b", column: 5, startTime: 750, endTime: 1000 }];
    const fiveKey = makeDifficulty("5K", 5);
    fiveKey.audioFilename = "audio.mp3";
    fiveKey.notes = [{ id: "c", column: 0, startTime: 100 }];
    const file = (name: string, type: string) => ({
      name,
      blob: new Blob([name], { type }),
      url: "",
    });
    const meta = { title: "Song", artist: "Artist", creator: "Mapper" };
    const blob = await buildQp({
      meta,
      difficulties: [easy, hard, fiveKey],
      timingPoints: [makeRedPoint(0, 120)],
      audioFiles: {
        "audio.mp3": file("audio.mp3", "audio/mpeg"),
        "audio 1.2x.mp3": file("audio 1.2x.mp3", "audio/mpeg"),
      },
      bgFiles: { "bg.jpg": file("bg.jpg", "image/jpeg") },
      bpmAffectsScroll: false,
    });
    expect(qpFilename(meta)).toBe("Artist - Song.qp");
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      "Artist - Song [Easy].qua",
      "Artist - Song [Hard].qua",
      "audio 1.2x.mp3",
      "audio.mp3",
      "bg.jpg",
    ]);
    const hardQua = parse(await zip.file("Artist - Song [Hard].qua")!.async("string")) as Record<string, unknown>;
    expect(hardQua.AudioFile).toBe("audio 1.2x.mp3");
    expect(hardQua.Mode).toBe("Keys7");

    const imported = await importOsz(new File([blob], "Artist - Song.qp"));
    expect(imported.difficulties.map((d) => [d.name, d.keyCount, d.audioFilename])).toEqual([
      ["Easy", 4, "audio.mp3"],
      ["Hard", 7, "audio 1.2x.mp3"],
    ]);
    expect(Object.keys(imported.audioFiles).sort()).toEqual(["audio 1.2x.mp3", "audio.mp3"]);
    expect(Object.keys(imported.backgroundFiles)).toEqual(["bg.jpg"]);
    expect(imported.difficulties[1].notes[0]).toMatchObject({ column: 5, startTime: 750, endTime: 1000 });
    expect(imported.bpmAffectsScroll).toBe(false);
  });

  it("refuses a .qp when no difficulty is 4K or 7K", async () => {
    const fiveKey = makeDifficulty("5K", 5);
    fiveKey.notes = [{ id: "c", column: 0, startTime: 100 }];
    await expect(
      buildQp({
        meta: { title: "Song", artist: "Artist", creator: "Mapper" },
        difficulties: [fiveKey],
        timingPoints: [makeRedPoint(0, 120)],
        audioFiles: { "audio.mp3": { name: "audio.mp3", blob: new Blob([]), url: "" } },
        bpmAffectsScroll: false,
      }),
    ).rejects.toThrow();
  });
});
