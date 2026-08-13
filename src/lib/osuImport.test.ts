import { describe, it, expect } from "vitest";
import type { SongMeta } from "../types";
import { makeDifficulty, makeRedPoint } from "../types";
import { buildOsuFile } from "./osuExport";
import {
  adoptOsuDifficulty,
  isManiaOsu,
  isSameSong,
  parseOsuFile,
} from "./osuImport";

const meta: SongMeta = {
  title: "Blue Zenith",
  artist: "xi",
  creator: "Mapper",
};

function osuText(options: {
  meta?: SongMeta;
  name?: string;
  audioFilename?: string;
  backgroundFilename?: string;
  videoFilename?: string;
  videoOffsetMs?: number;
  beatmapId?: number;
} = {}) {
  return buildOsuFile({
    meta: options.meta ?? meta,
    difficulty: {
      ...makeDifficulty(options.name ?? "Insane", 4),
      beatmapId: options.beatmapId,
      notes: [
        { id: "a", column: 0, startTime: 0 },
        { id: "b", column: 2, startTime: 500, endTime: 900 },
      ],
    },
    timingPoints: [makeRedPoint(0, 180)],
    audioFilename: options.audioFilename ?? "audio.mp3",
    backgroundFilename: options.backgroundFilename,
    videoFilename: options.videoFilename,
    videoOffsetMs: options.videoOffsetMs,
  });
}

describe("isManiaOsu", () => {
  it("accepts Mode 3 and rejects the other rulesets", () => {
    expect(isManiaOsu(osuText())).toBe(true);
    expect(isManiaOsu("[General]\nMode: 0\n")).toBe(false);
    expect(isManiaOsu("[General]\nAudioFilename: a.mp3\n")).toBe(false);
  });
});

describe("isSameSong", () => {
  it("ignores case and spacing", () => {
    expect(
      isSameSong(meta, { ...meta, title: "  blue   zenith ", artist: "XI" }),
    ).toBe(true);
  });

  it("matches an original-script title against the romanised one", () => {
    expect(
      isSameSong(
        { ...meta, title: "Kanata", titleUnicode: "彼方" },
        { ...meta, title: "彼方" },
      ),
    ).toBe(true);
  });

  it("rejects a different song", () => {
    expect(isSameSong(meta, { ...meta, title: "FREEDOM DiVE" })).toBe(false);
    expect(isSameSong(meta, { ...meta, artist: "Camellia" })).toBe(false);
  });

  it("treats a shared beatmapset id as the same song", () => {
    expect(
      isSameSong(
        { ...meta, beatmapSetId: 292301 },
        { ...meta, title: "Blue Zenith (TV Size)", beatmapSetId: 292301 },
      ),
    ).toBe(true);
  });

  it("does not match on a missing beatmapset id alone", () => {
    expect(
      isSameSong({ ...meta, title: "A" }, { ...meta, title: "B" }),
    ).toBe(false);
  });
});

describe("adoptOsuDifficulty", () => {
  const empty = {
    audioFilenames: [],
    backgroundFilenames: [],
    videoFilenames: [],
  };

  it("falls back to the project audio when the referenced file is missing", () => {
    const diff = adoptOsuDifficulty(parseOsuFile(osuText()), {
      ...empty,
      audioFilenames: ["song.ogg"],
      fallbackAudioFilename: "song.ogg",
    });
    expect(diff.audioFilename).toBe("song.ogg");
  });

  it("keeps the referenced audio using the spelling the project loaded", () => {
    const diff = adoptOsuDifficulty(
      parseOsuFile(osuText({ audioFilename: "Audio.MP3" })),
      {
        ...empty,
        audioFilenames: ["audio.mp3"],
        fallbackAudioFilename: "other.mp3",
      },
    );
    expect(diff.audioFilename).toBe("audio.mp3");
  });

  it("inherits the project background and drops a missing video", () => {
    const diff = adoptOsuDifficulty(
      parseOsuFile(
        osuText({
          backgroundFilename: "missing.jpg",
          videoFilename: "intro.mp4",
          videoOffsetMs: 250,
        }),
      ),
      {
        ...empty,
        backgroundFilenames: ["bg.png"],
        fallbackBackgroundFilename: "bg.png",
      },
    );
    expect(diff.backgroundFilename).toBe("bg.png");
    expect(diff.videoFilename).toBeUndefined();
    expect(diff.videoOffsetMs).toBeUndefined();
  });

  it("keeps a video the project already has", () => {
    const diff = adoptOsuDifficulty(
      parseOsuFile(osuText({ videoFilename: "intro.mp4", videoOffsetMs: 250 })),
      { ...empty, videoFilenames: ["intro.mp4"] },
    );
    expect(diff.videoFilename).toBe("intro.mp4");
    expect(diff.videoOffsetMs).toBe(250);
  });

  it("renames around an existing difficulty", () => {
    const diff = adoptOsuDifficulty(parseOsuFile(osuText({ name: "Insane" })), {
      ...empty,
      existingNames: ["Easy", "Insane"],
    });
    expect(diff.name).toBe("Insane (2)");
  });

  it("drops a beatmap id the project already uses", () => {
    const parsed = parseOsuFile(osuText({ beatmapId: 4242 }));
    expect(
      adoptOsuDifficulty(parsed, { ...empty, takenBeatmapIds: [4242] })
        .beatmapId,
    ).toBeUndefined();
    expect(adoptOsuDifficulty(parsed, empty).beatmapId).toBe(4242);
  });

  it("carries the notes and timing over with fresh ids", () => {
    const parsed = parseOsuFile(osuText());
    const diff = adoptOsuDifficulty(parsed, empty);
    expect(diff.id).not.toBe(parsed.difficulty.id);
    expect(diff.notes).toHaveLength(2);
    expect(diff.notes[1].endTime).toBe(900);
    expect(diff.timingPoints[0].bpm).toBe(180);
    expect(
      diff.notes.every(
        (note, i) => note.id !== parsed.difficulty.notes[i].id,
      ),
    ).toBe(true);
  });
});
