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

describe("text that StepMania treats as syntax", () => {
  const notes = [
    { id: "a", column: 0, startTime: 0 },
    { id: "b", column: 3, startTime: 500 },
  ];
  const build = (meta: SongMeta, name: string) =>
    buildSmFile({
      meta,
      difficulties: [{ ...makeDifficulty(name, 4), notes }],
      timingPoints: [makeRedPoint(0, 120)],
      audioFilename: "audio.mp3",
    });

  it("keeps a difficulty name with // from turning header fields into notes", () => {
    const parsed = parseSmFile(build({ title: "T", artist: "A", creator: "M" }, "Deranged Desire // feat. Auros"));
    expect(parsed.difficulties[0].notes).toHaveLength(2);
    expect(parsed.difficulties[0].name).toBe("Deranged Desire / / feat. Auros");
  });

  it("escapes colons and semicolons in values and reads them back", () => {
    const text = build({ title: "Re:Zero; Starting", artist: "A\\B", creator: "M" }, "Hard: 4K");
    expect(text).toContain(String.raw`#TITLE:Re\:Zero\; Starting;`);
    const parsed = parseSmFile(text);
    expect(parsed.meta.title).toBe("Re:Zero; Starting");
    expect(parsed.meta.artist).toBe("A\\B");
    expect(parsed.difficulties[0].name).toBe("Hard: 4K");
    expect(parsed.difficulties[0].notes).toHaveLength(2);
  });
});

describe("parseSmFile", () => {
  it("reads note rows with comments after the header fields", () => {
    const text = [
      "#TITLE:T;",
      "#OFFSET:0;",
      "#BPMS:0=120;",
      "#NOTES:",
      "     dance-single:",
      "     Hard:",
      "     Challenge:",
      "     10:",
      "     0,0,0,0,0:",
      "// measure 1",
      "1000",
      "0000",
      "0001",
      "0000",
      ";",
    ].join("\n");
    const parsed = parseSmFile(text);
    expect(parsed.difficulties[0].name).toBe("Hard");
    expect(parsed.difficulties[0].notes.map((n) => n.column)).toEqual([0, 3]);
  });
});

describe("key counts StepMania has no chart type for", () => {
  it("are left out instead of being written as a 4-lane chart", () => {
    const text = buildSmFile({
      meta: { title: "T", artist: "A", creator: "M" },
      difficulties: [
        { ...makeDifficulty("Nine", 9), notes: [{ id: "a", column: 8, startTime: 0 }] },
        { ...makeDifficulty("Four", 4), notes: [{ id: "b", column: 3, startTime: 0 }] },
      ],
      timingPoints: [makeRedPoint(0, 120)],
      audioFilename: "audio.mp3",
    });
    const parsed = parseSmFile(text);
    expect(parsed.difficulties.map((d) => [d.name, d.keyCount])).toEqual([["Four", 4]]);
  });
});
