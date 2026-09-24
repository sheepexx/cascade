import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { makeDifficulty, makeGreenPoint, makeRedPoint } from "../types";
import { buildMalodyChart, buildMcz, parseMalodyChart } from "./malody";
import { importOsz } from "./osuImport";
import { effectiveSvAt } from "./timing";

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

const chart = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    meta: {
      $ver: 0,
      creator: "Slavyan",
      background: "bg.jpg",
      version: "4K Special Lv.21",
      preview: 66195,
      id: 52021,
      mode: 0,
      song: { title: "Yuki no Youni", artist: "AKINO", artistorg: "アキノ", id: 1 },
      mode_ext: { column: 4, bar_begin: 0 },
    },
    time: [
      { beat: [0, 0, 1], bpm: 120 },
      { beat: [8, 0, 1], bpm: 240 },
    ],
    effect: [
      { beat: [2, 0, 1], scroll: 2 },
      { beat: [4, 0, 1], sign: 3 },
    ],
    note: [
      { beat: [1, 0, 1], column: 0 },
      { beat: [2, 1, 2], endbeat: [3, 0, 1], column: 3 },
      { beat: [9, 1, 4], column: 1 },
      { beat: [0, 0, 1], sound: "song.ogg", vol: 100, offset: 300, type: 1 },
    ],
    ...overrides,
  });

describe("Malody conversion", () => {
  it("places beats after the song offset, as Malody and Quaver read it", () => {
    const parsed = parseMalodyChart(chart());
    expect(parsed.meta).toMatchObject({
      title: "Yuki no Youni",
      artist: "AKINO",
      artistUnicode: "アキノ",
      creator: "Slavyan",
    });
    expect(parsed.audioFilename).toBe("song.ogg");
    expect(parsed.backgroundFilename).toBe("bg.jpg");
    expect(parsed.difficulty).toMatchObject({
      name: "4K Special Lv.21",
      keyCount: 4,
      previewTime: 66195,
      sourceFormat: "mc",
    });
    // Beat 0 sits at -300 ms; 120 BPM is 500 ms a beat until beat 8, then 250.
    expect(
      parsed.difficulty.notes.map((note) => [note.column, note.startTime, note.endTime]),
    ).toEqual([
      [0, 200, undefined],
      [3, 950, 1200],
      [1, 4013, undefined],
    ]);
  });

  it("turns BPM entries, signatures and scroll effects into timing points", () => {
    const parsed = parseMalodyChart(chart());
    const reds = parsed.timingPoints.filter((point) => point.uninherited);
    expect(reds.map((point) => [point.time, point.bpm, point.meter])).toEqual([
      [-300, 120, 4],
      [1700, 120, 3],
      [3700, 240, 3],
    ]);
    expect(effectiveSvAt(600, parsed.timingPoints)).toBe(1);
    expect(effectiveSvAt(800, parsed.timingPoints)).toBe(2);
    // The speed carries across the red points Cascade adds for the signature.
    expect(effectiveSvAt(2000, parsed.timingPoints)).toBe(2);
    expect(effectiveSvAt(4000, parsed.timingPoints)).toBe(2);
  });

  it("refuses charts from other Malody modes", () => {
    const catchChart = chart({
      meta: { mode: 3, mode_ext: {}, song: { title: "x", artist: "y" } },
    });
    expect(() => parseMalodyChart(catchChart)).toThrow(/Key mode/);
    expect(() => parseMalodyChart("not json")).toThrow(/Malody chart/);
  });

  it("round-trips notes, BPM changes, meters and scroll speed", () => {
    const difficulty = makeDifficulty("Hard", 7);
    difficulty.previewTime = 5000;
    difficulty.notes = [
      { id: "a", column: 0, startTime: 1000 },
      { id: "b", column: 6, startTime: 1125, endTime: 1500 },
      { id: "c", column: 3, startTime: 2333 },
      { id: "d", column: 2, startTime: 5083 },
    ];
    const points = [
      makeRedPoint(1000, 120),
      makeGreenPoint(1500, 1.5),
      makeRedPoint(3000, 180, { meter: 3 }),
      makeGreenPoint(4000, 0.5),
    ];
    const source = buildMalodyChart({
      meta: {
        title: "Song",
        artist: "Artist",
        creator: "Mapper",
        titleUnicode: "歌",
      },
      difficulty,
      timingPoints: points,
      audioFilename: "audio.mp3",
      backgroundFilename: "bg.png",
    });
    const json = JSON.parse(source);
    expect(json.meta.mode_ext.column).toBe(7);
    expect(json.meta.song.titleorg).toBe("歌");
    expect(json.note.find((note: { type?: number }) => note.type === 1)).toMatchObject({
      sound: "audio.mp3",
      offset: 1000,
    });
    // The grid starts a bar before the first red point, at -1000 ms, and notes
    // keep simple fractions rather than millisecond noise.
    expect(json.note[1]).toMatchObject({ beat: [4, 1, 4], endbeat: [5, 0, 1] });

    const parsed = parseMalodyChart(source);
    expect(parsed.meta.titleUnicode).toBe("歌");
    expect(
      parsed.difficulty.notes.map((note) => [note.column, note.startTime, note.endTime]),
    ).toEqual([
      [0, 1000, undefined],
      [6, 1125, 1500],
      [3, 2333, undefined],
      [2, 5083, undefined],
    ]);
    const reds = parsed.timingPoints.filter((point) => point.uninherited);
    // The first tempo now starts at beat 0, one bar earlier, so the bar lines
    // stay where they were.
    expect(reds.map((point) => [Math.round(point.time), point.bpm, point.meter])).toEqual([
      [-1000, 120, 4],
      [3000, 180, 3],
    ]);
    expect(effectiveSvAt(1200, parsed.timingPoints)).toBe(1);
    expect(effectiveSvAt(2000, parsed.timingPoints)).toBe(1.5);
    expect(effectiveSvAt(3500, parsed.timingPoints)).toBe(1);
    expect(effectiveSvAt(4500, parsed.timingPoints)).toBe(0.5);
    expect(parsed.difficulty.previewTime).toBe(5000);
  });

  it("starts the beat grid whole bars early when notes come before the first red point", () => {
    const difficulty = makeDifficulty("Easy", 4);
    difficulty.notes = [
      { id: "a", column: 0, startTime: 100 },
      { id: "b", column: 1, startTime: 2500 },
    ];
    const source = buildMalodyChart({
      meta: { title: "Song", artist: "Artist", creator: "Mapper" },
      difficulty,
      timingPoints: [makeRedPoint(2500, 120)],
      audioFilename: "audio.mp3",
    });
    const json = JSON.parse(source);
    for (const note of json.note) expect(note.beat[0]).toBeGreaterThanOrEqual(0);
    const parsed = parseMalodyChart(source);
    expect(parsed.difficulty.notes.map((note) => note.startTime)).toEqual([100, 2500]);
  });

  it("packs every difficulty into a .mcz that opens again with its audio", async () => {
    const easy = makeDifficulty("Easy", 4);
    easy.audioFilename = "audio.mp3";
    easy.backgroundFilename = "bg.jpg";
    easy.notes = [{ id: "a", column: 1, startTime: 500 }];
    const hard = makeDifficulty("Hard", 7);
    hard.audioFilename = "audio.mp3";
    hard.notes = [{ id: "b", column: 5, startTime: 750, endTime: 1000 }];
    const tooWide = makeDifficulty("12K", 12);
    tooWide.audioFilename = "audio.mp3";
    const file = (name: string, type: string) => {
      const blob = new Blob([name], { type });
      return { name, blob, url: "" };
    };
    const blob = await buildMcz({
      meta: { title: "Song", artist: "Artist", creator: "Mapper" },
      difficulties: [easy, hard, tooWide],
      timingPoints: [makeRedPoint(0, 120)],
      audioFiles: { "audio.mp3": file("audio.mp3", "audio/mpeg") },
      bgFiles: { "bg.jpg": file("bg.jpg", "image/jpeg") },
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort()).toEqual([
      "0/Easy.mc",
      "0/Hard.mc",
      "0/audio.mp3",
      "0/bg.jpg",
    ]);

    const imported = await importOsz(blob);
    expect(imported.difficulties.map((d) => [d.name, d.keyCount])).toEqual([
      ["Easy", 4],
      ["Hard", 7],
    ]);
    expect(Object.keys(imported.audioFiles)).toEqual(["audio.mp3"]);
    expect(Object.keys(imported.backgroundFiles)).toEqual(["bg.jpg"]);
    expect(imported.difficulties[1].notes[0]).toMatchObject({
      column: 5,
      startTime: 750,
      endTime: 1000,
    });
  });
});
