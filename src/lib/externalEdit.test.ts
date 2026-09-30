import { describe, expect, it } from "vitest";
import { makeDifficulty, makeGreenPoint, makeRedPoint, type Difficulty, type SongMeta } from "../types";
import { buildOsuFile } from "./osuExport";
import { applyExternalOsu } from "./externalEdit";

const meta: SongMeta = { title: "Song", artist: "Artist", creator: "Mapper", tags: "rock english", source: "" };
const names = { audio: ["audio.mp3"], backgrounds: ["bg.jpg", "alt.jpg"], videos: [] };

function difficulty(): Difficulty {
  return {
    ...makeDifficulty("Hard", 4),
    audioFilename: "audio.mp3",
    backgroundFilename: "bg.jpg",
    previewTime: 12000,
    hpDrainRate: 8,
    overallDifficulty: 8.5,
    beatmapId: 4242,
    bookmarks: [1000, 5000],
    bookmarkLabels: { "1000": "Intro", "5000": "Drop" },
    trimEndMs: 90000,
    timingPoints: [makeRedPoint(0, 180), makeGreenPoint(2000, 1.5)],
    notes: [
      { id: "a", column: 0, startTime: 500 },
      { id: "b", column: 3, startTime: 1000, endTime: 1500, hitSound: 2 },
    ],
  };
}

function exported(d: Difficulty, shared = d.timingPoints): string {
  return buildOsuFile({
    meta,
    difficulty: d,
    timingPoints: d.timingPoints.length ? d.timingPoints : shared,
    audioFilename: "audio.mp3",
    backgroundFilename: d.backgroundFilename,
    cascadeTag: false,
  });
}

describe("applyExternalOsu", () => {
  it("brings an untouched file back without losing anything", () => {
    const d = difficulty();
    const { difficulty: back, meta: backMeta } = applyExternalOsu(d, meta, [], exported(d), names);
    expect(back.id).toBe(d.id);
    expect(back.name).toBe("Hard");
    expect(back.hpDrainRate).toBe(8);
    expect(back.overallDifficulty).toBe(8.5);
    expect(back.previewTime).toBe(12000);
    expect(back.beatmapId).toBe(4242);
    expect(back.bookmarks).toEqual([1000, 5000]);
    expect(back.bookmarkLabels).toEqual({ "1000": "Intro", "5000": "Drop" });
    expect(back.trimEndMs).toBe(90000);
    expect(back.backgroundFilename).toBe("bg.jpg");
    expect(back.notes.map(({ column, startTime, endTime, hitSound }) => ({ column, startTime, endTime, hitSound }))).toEqual([
      { column: 0, startTime: 500, endTime: undefined, hitSound: undefined },
      { column: 3, startTime: 1000, endTime: 1500, hitSound: 2 },
    ]);
    expect(back.timingPoints.map((p) => [p.time, p.uninherited, p.uninherited ? p.bpm : p.sv])).toEqual([
      [0, true, 180],
      [2000, false, 1.5],
    ]);
    expect(backMeta).toMatchObject({ title: "Song", artist: "Artist", creator: "Mapper", tags: "rock english" });
  });

  it("takes the edits made in the file", () => {
    const d = difficulty();
    const text = exported(d)
      .replace("OverallDifficulty:8.5", "OverallDifficulty:9")
      .replace("Version:Hard", "Version:Harder")
      .replace("Title:Song", "Title:Song (TV Size)")
      .replace(/\[HitObjects\][\s\S]*$/, "[HitObjects]\n64,192,700,1,0,0:0:0:0:\n");
    const { difficulty: back, meta: backMeta } = applyExternalOsu(d, meta, [], text, names);
    expect(back.overallDifficulty).toBe(9);
    expect(back.name).toBe("Harder");
    expect(back.notes).toHaveLength(1);
    expect(back.notes[0]).toMatchObject({ column: 0, startTime: 700 });
    expect(backMeta.title).toBe("Song (TV Size)");
  });

  it("keeps labels only for bookmarks that are still there", () => {
    const d = difficulty();
    const text = exported(d).replace("Bookmarks: 1000,5000", "Bookmarks: 5000,8000");
    const { difficulty: back } = applyExternalOsu(d, meta, [], text, names);
    expect(back.bookmarks).toEqual([5000, 8000]);
    expect(back.bookmarkLabels).toEqual({ "5000": "Drop" });
  });

  it("switches files only to ones the project has", () => {
    const d = difficulty();
    const swapped = exported(d).replace('"bg.jpg"', '"alt.jpg"');
    expect(applyExternalOsu(d, meta, [], swapped, names).difficulty.backgroundFilename).toBe("alt.jpg");
    const missing = exported(d).replace('"bg.jpg"', '"nowhere.png"');
    expect(applyExternalOsu(d, meta, [], missing, names).difficulty.backgroundFilename).toBe("bg.jpg");
    const audio = exported(d).replace("AudioFilename: audio.mp3", "AudioFilename: other.mp3");
    expect(applyExternalOsu(d, meta, [], audio, names).difficulty.audioFilename).toBe("audio.mp3");
  });

  it("keeps following shared timing when the file's timing is unchanged", () => {
    const shared = [makeRedPoint(0, 180), makeGreenPoint(2000, 1.5)];
    const d = { ...difficulty(), timingPoints: [] };
    expect(applyExternalOsu(d, meta, shared, exported(d, shared), names).difficulty.timingPoints).toEqual([]);
    const retimed = exported(d, shared).replace(/^0,333\.3+\d*,/m, "10,333.3333333333333,");
    expect(applyExternalOsu(d, meta, shared, retimed, names).difficulty.timingPoints[0].time).toBe(10);
  });

  it("refuses a file that isn't an osu!mania difficulty", () => {
    const d = difficulty();
    expect(() => applyExternalOsu(d, meta, [], exported(d).replace("Mode: 3", "Mode: 0"), names)).toThrow(/osu!mania/);
    expect(() => applyExternalOsu(d, meta, [], "not a beatmap", names)).toThrow(/osu!mania/);
  });
});
