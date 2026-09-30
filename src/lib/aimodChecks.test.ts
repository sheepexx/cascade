import { describe, expect, it } from "vitest";
import { makeDifficulty, makeRedPoint, type ManiaNote, type SongMeta } from "../types";
import { hasGenreTag, hasLanguageTag, misformattedTitleMarkers, runAiMod } from "./aimod";
import type { AiModFileFacts } from "./aimodFiles";

function note(startTime: number, column = 0): ManiaNote {
  return { id: `n_${startTime}_${column}`, column, startTime };
}

const song = new Blob(["song"]);
const background = new Blob(["bg"]);
const audioFiles = { "a.mp3": { name: "a.mp3", url: "", blob: song } };
const bgFiles = { "bg.jpg": { name: "bg.jpg", url: "", blob: background } };
const meta: SongMeta = { title: "Song", artist: "Artist", creator: "Mapper", tags: "rock english" };

function diff(name: string, lastNoteMs = 100_000) {
  const d = makeDifficulty(name, 4);
  d.audioFilename = "a.mp3";
  d.backgroundFilename = "bg.jpg";
  d.previewTime = 5000;
  d.timingPoints = [makeRedPoint(0, 120)];
  d.notes = [note(1000), note(lastNoteMs, 1)];
  return d;
}

function facts(over: {
  bitrate?: number | null;
  format?: AiModFileFacts["audio"][string]["format"];
  width?: number;
  height?: number;
  bgBytes?: number;
}): AiModFileFacts {
  return {
    audio: {
      "a.mp3": { blob: song, bytes: 4, format: over.format ?? "mp3", bitrateKbps: over.bitrate === undefined ? 192 : over.bitrate },
    },
    backgrounds: {
      "bg.jpg": { blob: background, bytes: over.bgBytes ?? 1000, width: over.width ?? 1920, height: over.height ?? 1080 },
    },
  };
}

const messages = (args: Partial<Parameters<typeof runAiMod>[0]>) =>
  runAiMod({ meta, difficulties: [diff("Hard")], audioFiles, bgFiles, audioDurationMs: 110_000, ...args }).issues.map(
    (i) => i.message,
  );

describe("title markers", () => {
  it("accepts the exact marker", () => {
    expect(misformattedTitleMarkers("Song (TV Size)")).toEqual([]);
    expect(misformattedTitleMarkers("Song (Sped Up & Cut Ver.)")).toEqual([]);
  });

  it("flags a marker written another way", () => {
    expect(misformattedTitleMarkers("Song (tv ver)")).toEqual(["(TV Size)"]);
    expect(misformattedTitleMarkers("Song [Cut Size]")).toEqual(["(Cut Ver.)"]);
    expect(misformattedTitleMarkers("Song (Speed Up Ver)")).toEqual(["(Sped Up Ver.)"]);
  });

  it("does not ask for the plain Cut marker on a combined one", () => {
    expect(misformattedTitleMarkers("Song (sped up & cut ver)")).toEqual(["(Sped Up & Cut Ver.)"]);
  });

  it("checks the unicode title only when it differs", () => {
    const found = messages({ meta: { ...meta, title: "Song (TV Size)", titleUnicode: "曲 (tv size)" } });
    expect(found.filter((m) => /marker/.test(m))).toEqual([
      "Unicode title writes the (TV Size) marker in the wrong format.",
    ]);
  });
});

describe("genre and language tags", () => {
  it("matches whole words, multi-word genres included", () => {
    expect(hasGenreTag("video game ost")).toBe(true);
    expect(hasGenreTag("rockstar")).toBe(false);
    expect(hasLanguageTag("Japanese vocals")).toBe(true);
    expect(hasLanguageTag("jpop")).toBe(false);
  });

  it("leaves an empty tags field to the existing warning", () => {
    const found = messages({ meta: { ...meta, tags: "" } });
    expect(found.some((m) => /genre|language/i.test(m))).toBe(false);
  });

  it("asks for each missing kind", () => {
    const found = messages({ meta: { ...meta, tags: "touhou" } });
    expect(found.filter((m) => /No genre tag|No language tag/.test(m))).toHaveLength(2);
  });
});

describe("file checks", () => {
  it("skip until the files have been read", () => {
    expect(messages({}).some((m) => /kbps|Background "/.test(m))).toBe(false);
  });

  it("pass a file inside the limits", () => {
    expect(messages({ files: facts({}) }).some((m) => /kbps|Background "|MP3 or OGG|empty file/.test(m))).toBe(false);
  });

  it("flag bitrate above the limit, with OGG allowed a little more", () => {
    expect(messages({ files: facts({ bitrate: 320 }) })).toContain('"a.mp3" is 320 kbps, over the 192 kbps limit.');
    expect(messages({ files: facts({ bitrate: 200, format: "ogg" }) }).some((m) => /kbps/.test(m))).toBe(false);
    expect(messages({ files: facts({ bitrate: 96 }) }).some((m) => /under 128 kbps/.test(m))).toBe(true);
  });

  it("flag a song that isn't MP3 or OGG", () => {
    expect(messages({ files: facts({ format: "wav", bitrate: null }) })).toContain(
      '"a.mp3" isn\'t MP3 or OGG. Use one of those for the song.',
    );
  });

  it("flag background size and weight", () => {
    expect(messages({ files: facts({ width: 3840, height: 2160 }) }).some((m) => /larger than 2560 × 1440/.test(m))).toBe(true);
    expect(messages({ files: facts({ width: 800, height: 450 }) }).some((m) => /only 800 × 450/.test(m))).toBe(true);
    expect(messages({ files: facts({ width: 100, height: 100 }) }).some((m) => /smaller than 160 × 120/.test(m))).toBe(true);
    expect(messages({ files: facts({ bgBytes: 3 * 1024 * 1024 }) }).some((m) => /3 MB, over 2.5 MB/.test(m))).toBe(true);
  });

  it("ignore facts read from a file that has since been replaced", () => {
    const stale = facts({ bitrate: 320 });
    stale.audio["a.mp3"].blob = new Blob(["old"]);
    expect(messages({ files: stale }).some((m) => /kbps/.test(m))).toBe(false);
  });
});

describe("settings shared across difficulties", () => {
  it("flag a different preview point or audio file", () => {
    const other = diff("Insane");
    other.previewTime = 9000;
    other.audioFilename = "b.mp3";
    const found = messages({ difficulties: [diff("Hard"), other] });
    expect(found.some((m) => /\[Insane\] has its preview point at 00:09:000/.test(m))).toBe(true);
    expect(found.some((m) => /\[Insane\] uses a different audio file/.test(m))).toBe(true);
  });

  it("leave out difficulties that export their own audio", () => {
    const rate = diff("Hard 1.2x");
    rate.audioRate = 1.2;
    rate.previewTime = 4167;
    const trimmed = diff("Short");
    trimmed.trimEndMs = 90_000;
    trimmed.previewTime = 2000;
    const found = messages({ difficulties: [diff("Hard"), rate, trimmed] });
    expect(found.some((m) => /preview point at|different audio file/.test(m))).toBe(false);
  });
});

describe("unused audio at the end", () => {
  it("warns when under 80% of the song is mapped", () => {
    const found = messages({ difficulties: [diff("Hard", 60_000)], audioDurationMs: 100_000 });
    expect(found.some((m) => /40% of the song is left unmapped/.test(m))).toBe(true);
  });

  it("stays quiet when the map runs close to the end", () => {
    const found = messages({ difficulties: [diff("Hard", 85_000)], audioDurationMs: 100_000 });
    expect(found.some((m) => /unmapped/.test(m))).toBe(false);
  });
});
