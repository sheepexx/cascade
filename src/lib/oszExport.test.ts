import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import type { Difficulty, LoadedFile, ManiaNote, SongMeta } from "../types";
import { makeDifficulty, makeRedPoint, makeGreenPoint } from "../types";
import { buildOsz } from "./oszExport";
import { parseOsuFile } from "./osuImport";

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
      .catch((error: unknown) => {
        this.onerror?.({ target: { error } });
      });
  }
}

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = ArrayBufferFileReader as unknown as typeof FileReader;
}

function loaded(name: string, body = "binary"): LoadedFile {
  return { name, url: `blob:${name}`, blob: new Blob([body]) };
}

const meta: SongMeta = {
  title: "Test Song",
  artist: "Test Artist",
  creator: "Mapper",
  tags: "foo",
};

const notes: ManiaNote[] = [
  { id: "a", column: 0, startTime: 0 },
  { id: "b", column: 3, startTime: 500 },
  { id: "c", column: 1, startTime: 1000, endTime: 1500 },
];

const timingPoints = [
  makeRedPoint(0, 180, { meter: 4, volume: 80 }),
  makeGreenPoint(1000, 1.5, { kiai: true }),
];

function diff(name: string, overrides: Partial<Difficulty> = {}): Difficulty {
  return {
    ...makeDifficulty(name, 4),
    notes,
    audioFilename: "audio.mp3",
    timingPoints: [],
    ...overrides,
  };
}

async function entries(blob: Blob): Promise<Map<string, JSZip.JSZipObject>> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return new Map(Object.entries(zip.files));
}

describe("buildOsz", () => {
  let files: Map<string, JSZip.JSZipObject>;

  beforeAll(async () => {
    const blob = await buildOsz({
      meta,
      difficulties: [
        diff("Easy", { backgroundFilename: "bg.jpg" }),
        diff("Insane", { backgroundFilename: "bg.jpg" }),
      ],
      timingPoints,
      audioFiles: { "audio.mp3": loaded("audio.mp3") },
      bgFiles: { "bg.jpg": loaded("bg.jpg") },
    });
    files = await entries(blob);
  });

  it("writes one .osu per difficulty plus the shared assets", () => {
    expect([...files.keys()].sort()).toEqual([
      "Test Artist - Test Song (Mapper) [Easy].osu",
      "Test Artist - Test Song (Mapper) [Insane].osu",
      "audio.mp3",
      "bg.jpg",
    ]);
  });

  it("bundles a shared background only once", async () => {
    const bgs = [...files.keys()].filter((n) => n.endsWith(".jpg"));
    expect(bgs).toHaveLength(1);
  });

  it("points every .osu at files that exist in the archive", async () => {
    for (const [name, entry] of files) {
      if (!name.endsWith(".osu")) continue;
      const parsed = parseOsuFile(await entry.async("string"));
      expect(files.has(parsed.audioFilename!)).toBe(true);
      expect(files.has(parsed.backgroundFilename!)).toBe(true);
    }
  });

  it("round-trips notes and timing through the archive", async () => {
    const entry = files.get("Test Artist - Test Song (Mapper) [Insane].osu")!;
    const parsed = parseOsuFile(await entry.async("string"));
    expect(parsed.difficulty.keyCount).toBe(4);
    expect(parsed.difficulty.notes.map((n) => [n.column, n.startTime, n.endTime])).toEqual(
      notes.map((n) => [n.column, n.startTime, n.endTime]),
    );
    expect(parsed.timingPoints.map((t) => t.time)).toEqual([0, 1000]);
    expect(parsed.timingPoints[0].bpm).toBeCloseTo(180, 5);
  });
});

describe("buildOsz asset references", () => {
  it("omits a video line when the video file was never supplied", async () => {
    const blob = await buildOsz({
      meta,
      difficulties: [diff("Easy", { videoFilename: "clip.mp4" })],
      timingPoints,
      audioFiles: { "audio.mp3": loaded("audio.mp3") },
    });
    const files = await entries(blob);
    const osu = await files
      .get("Test Artist - Test Song (Mapper) [Easy].osu")!
      .async("string");
    expect(osu).not.toContain("clip.mp4");
    expect([...files.keys()]).not.toContain("clip.mp4");
  });

  it("falls back to the only audio file when the difficulty names none", async () => {
    const blob = await buildOsz({
      meta,
      difficulties: [diff("Easy", { audioFilename: undefined })],
      timingPoints,
      audioFiles: { "song.mp3": loaded("song.mp3") },
    });
    const files = await entries(blob);
    const parsed = parseOsuFile(
      await files.get("Test Artist - Test Song (Mapper) [Easy].osu")!.async("string"),
    );
    expect(parsed.audioFilename).toBe("song.mp3");
    expect(files.has("song.mp3")).toBe(true);
  });

  it("keeps per-difficulty audio separate", async () => {
    const blob = await buildOsz({
      meta,
      difficulties: [
        diff("Easy", { audioFilename: "one.mp3" }),
        diff("Hard", { audioFilename: "two.mp3" }),
      ],
      timingPoints,
      audioFiles: { "one.mp3": loaded("one.mp3"), "two.mp3": loaded("two.mp3") },
    });
    const files = await entries(blob);
    const easy = parseOsuFile(
      await files.get("Test Artist - Test Song (Mapper) [Easy].osu")!.async("string"),
    );
    const hard = parseOsuFile(
      await files.get("Test Artist - Test Song (Mapper) [Hard].osu")!.async("string"),
    );
    expect(easy.audioFilename).toBe("one.mp3");
    expect(hard.audioFilename).toBe("two.mp3");
    expect(files.has("one.mp3")).toBe(true);
    expect(files.has("two.mp3")).toBe(true);
  });

  it("lets a difficulty's own timing override the shared points", async () => {
    const blob = await buildOsz({
      meta,
      difficulties: [
        diff("Easy", { timingPoints: [makeRedPoint(250, 200, { meter: 3 })] }),
      ],
      timingPoints,
      audioFiles: { "audio.mp3": loaded("audio.mp3") },
    });
    const files = await entries(blob);
    const parsed = parseOsuFile(
      await files.get("Test Artist - Test Song (Mapper) [Easy].osu")!.async("string"),
    );
    expect(parsed.timingPoints.map((t) => t.time)).toEqual([250]);
    expect(parsed.timingPoints[0].bpm).toBeCloseTo(200, 5);
  });
});
