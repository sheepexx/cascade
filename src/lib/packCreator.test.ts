import { describe, it, expect } from "vitest";
import {
  detectRateFromVersion,
  generatePackDifficultyName,
  generatePlaceholderDifficulty,
  packOszFilename,
  resolveAssetCollisions,
  rewriteOsuForPack,
  validatePack,
} from "./packCreator";
import {
  DEFAULT_PACK_SETTINGS,
  type PackAsset,
  type PackItem,
  type PackMetadata,
} from "../types/packCreator";
import { parseOsuFile } from "./osuImport";
import { buildOsuFile } from "./osuExport";
import { makeDifficulty } from "../types";

function makeAsset(overrides: Partial<PackAsset>): PackAsset {
  return {
    id: Math.random().toString(36).slice(2),
    name: "audio.mp3",
    blob: new Blob(["x"]),
    size: 1,
    hash: "h1",
    referenced: true,
    ...overrides,
  };
}

function makeItem(overrides: Partial<PackItem>): PackItem {
  return {
    id: Math.random().toString(36).slice(2),
    originalTitle: "Song",
    originalArtist: "Artist",
    originalCreator: "Mapper",
    originalVersion: "Hard",
    songDisplayName: "Song",
    mapperName: "Mapper",
    includeRateInDifficultyName: true,
    includeOriginalDifficultyName: false,
    includeMapperInBrackets: true,
    overallDifficulty: 8,
    hpDrainRate: 7.5,
    originalAudioFilename: "audio.mp3",
    originalOsuFilename: "song.osu",
    sourceArchiveId: "src1",
    finalDifficultyName: "",
    parsedOsu: {
      rawText: "",
      mode: 3,
      keyCount: 4,
      audioFilename: "audio.mp3",
      backgroundFilename: "bg.jpg",
      videoFilename: null,
      referencedAssets: ["audio.mp3", "bg.jpg"],
      maxObjectTimeMs: 30000,
    },
    assets: [],
    ...overrides,
  };
}

const metadata: PackMetadata = {
  title: "Jumpstream Collection",
  artistMode: "various",
  creator: "sheepex_",
  tags: ["jumpstream", "pack"],
};

describe("detectRateFromVersion", () => {
  it("detects x-prefixed and x-suffixed rates", () => {
    expect(detectRateFromVersion("Extra x1.2")).toBe("x1.2");
    expect(detectRateFromVersion("1.2x Insane")).toBe("x1.2");
    expect(detectRateFromVersion("x0.9")).toBe("x0.9");
    expect(detectRateFromVersion("(0.9x)")).toBe("x0.9");
    expect(detectRateFromVersion("Burst Training x1.05")).toBe("x1.05");
  });
  it("detects mod aliases", () => {
    expect(detectRateFromVersion("Insane DT")).toBe("DT");
    expect(detectRateFromVersion("ht practice")).toBe("HT");
    expect(detectRateFromVersion("[NC]")).toBe("NC");
  });
  it("rejects keymodes and implausible rates", () => {
    expect(detectRateFromVersion("4K Hard")).toBeUndefined();
    expect(detectRateFromVersion("x4")).toBeUndefined();
    expect(detectRateFromVersion("100x speed")).toBeUndefined();
    expect(detectRateFromVersion("Another")).toBeUndefined();
  });
});

describe("generatePackDifficultyName", () => {
  it("builds <Song> <Rate> [<Mapper>] by default", () => {
    const item = makeItem({ songDisplayName: "Mebuku Toki TV Size", rate: "x1.2", mapperName: "MapperName" });
    expect(generatePackDifficultyName(item)).toBe("Mebuku Toki TV Size x1.2 [MapperName]");
  });
  it("omits the rate when there is none", () => {
    const item = makeItem({ songDisplayName: "Blue Zenith", rate: undefined, mapperName: "MapperName" });
    expect(generatePackDifficultyName(item)).toBe("Blue Zenith [MapperName]");
  });
  it("includes the original difficulty when enabled", () => {
    const item = makeItem({
      songDisplayName: "Blue Zenith",
      rate: undefined,
      mapperName: "MapperName",
      originalVersion: "Another",
      includeOriginalDifficultyName: true,
    });
    expect(generatePackDifficultyName(item)).toBe("Blue Zenith - Another [MapperName]");
  });
  it("respects disabled toggles", () => {
    const item = makeItem({
      songDisplayName: "Song",
      rate: "x1.2",
      includeRateInDifficultyName: false,
      includeMapperInBrackets: false,
    });
    expect(generatePackDifficultyName(item)).toBe("Song");
  });
});

describe("rewriteOsuForPack", () => {
  const sourceText = buildOsuFile({
    meta: { title: "Orig Song", artist: "Orig Artist", creator: "OrigMapper", tags: "orig tags" },
    difficulty: {
      ...makeDifficulty("Hard x1.2", 4),
      notes: [{ id: "a", column: 0, startTime: 100 }],
    },
    timingPoints: makeDifficulty("x", 4).timingPoints,
    audioFilename: "audio.mp3",
    backgroundFilename: "bg.jpg",
  });

  const item = makeItem({
    songDisplayName: "Orig Song",
    originalTitle: "Orig Song",
    originalArtist: "Orig Artist",
    originalCreator: "OrigMapper",
    rate: "x1.2",
    mapperName: "OrigMapper",
    originalTags: "orig tags",
    parsedOsu: {
      rawText: sourceText,
      mode: 3,
      keyCount: 4,
      audioFilename: "audio.mp3",
      backgroundFilename: "bg.jpg",
      videoFilename: null,
      referencedAssets: ["audio.mp3", "bg.jpg"],
      maxObjectTimeMs: 100,
    },
  });

  it("rewrites metadata to the pack's fields", () => {
    const out = rewriteOsuForPack({
      item,
      metadata,
      settings: DEFAULT_PACK_SETTINGS,
      renames: new Map(),
    });
    const parsed = parseOsuFile(out);
    expect(parsed.meta.title).toBe("Jumpstream Collection");
    expect(parsed.meta.artist).toBe("Various Artists");
    expect(parsed.meta.creator).toBe("sheepex_");
    expect(parsed.difficulty.name).toBe("Orig Song x1.2 [OrigMapper]");
    expect(parsed.meta.tags).toContain("jumpstream");
    expect(parsed.meta.tags).toContain("Orig Artist");
    expect(out).toMatch(/^BeatmapSetID:-1$/m);
    expect(parsed.difficulty.notes).toHaveLength(1);
    expect(parsed.difficulty.notes[0].startTime).toBe(100);
  });

  it("keeps the original artist in original-per-map mode", () => {
    const out = rewriteOsuForPack({
      item,
      metadata: { ...metadata, artistMode: "original-per-map" },
      settings: DEFAULT_PACK_SETTINGS,
      renames: new Map(),
    });
    expect(parseOsuFile(out).meta.artist).toBe("Orig Artist");
  });

  it("uses the original mapper as Creator in original mode", () => {
    const out = rewriteOsuForPack({
      item,
      metadata,
      settings: { ...DEFAULT_PACK_SETTINGS, creatorFieldMode: "original" },
      renames: new Map(),
    });
    expect(parseOsuFile(out).meta.creator).toBe("OrigMapper");
  });

  it("writes the item's OD and HP into the difficulty", () => {
    const out = rewriteOsuForPack({
      item: { ...item, overallDifficulty: 8, hpDrainRate: 7.5 },
      metadata,
      settings: DEFAULT_PACK_SETTINGS,
      renames: new Map(),
    });
    const parsed = parseOsuFile(out);
    expect(parsed.difficulty.overallDifficulty).toBe(8);
    expect(parsed.difficulty.hpDrainRate).toBe(7.5);
    expect(out).toMatch(/^OverallDifficulty:8$/m);
    expect(out).toMatch(/^HPDrainRate:7\.5$/m);
  });

  it("updates audio and background references when renamed", () => {
    const out = rewriteOsuForPack({
      item,
      metadata,
      settings: DEFAULT_PACK_SETTINGS,
      renames: new Map([
        ["audio.mp3", "audio_2.mp3"],
        ["bg.jpg", "bg_2.jpg"],
      ]),
    });
    const parsed = parseOsuFile(out);
    expect(parsed.audioFilename).toBe("audio_2.mp3");
    expect(parsed.backgroundFilename).toBe("bg_2.jpg");
  });
});

describe("resolveAssetCollisions", () => {
  it("shares identical files and renames referenced conflicts", () => {
    const sharedA = makeAsset({ name: "audio.mp3", hash: "same" });
    const sharedB = makeAsset({ name: "audio.mp3", hash: "same" });
    const conflict = makeAsset({ name: "audio.mp3", hash: "different" });
    const items = [
      makeItem({ sourceArchiveId: "a", assets: [sharedA] }),
      makeItem({ sourceArchiveId: "b", assets: [sharedB] }),
      makeItem({ sourceArchiveId: "c", assets: [conflict] }),
    ];
    const res = resolveAssetCollisions(items);
    expect(res.files.map((f) => f.name)).toEqual(["audio.mp3", "audio_2.mp3"]);
    expect(res.renamesByArchive.get("c")?.get("audio.mp3")).toBe("audio_2.mp3");
    expect(res.droppedNames).toEqual([]);
  });

  it("drops convention-named files that collide with different contents", () => {
    const a = makeAsset({ name: "soft-hitnormal.wav", hash: "one", referenced: false });
    const b = makeAsset({ name: "soft-hitnormal.wav", hash: "two", referenced: false });
    const items = [
      makeItem({ sourceArchiveId: "a", assets: [a] }),
      makeItem({ sourceArchiveId: "b", assets: [b] }),
    ];
    const res = resolveAssetCollisions(items);
    expect(res.files.map((f) => f.name)).toEqual(["soft-hitnormal.wav"]);
    expect(res.droppedNames).toEqual(["soft-hitnormal.wav"]);
  });
});

describe("generatePlaceholderDifficulty", () => {
  it("builds a valid <Delete mania diff with a start and end note", () => {
    const item = makeItem({});
    const text = generatePlaceholderDifficulty({
      metadata,
      settings: { ...DEFAULT_PACK_SETTINGS, placeholderKeyCount: 7 },
      audioItem: item,
      audioFilename: "audio_2.mp3",
      lastNoteMs: 120000,
    });
    expect(text).toMatch(/^Mode: 3$/m);
    const parsed = parseOsuFile(text);
    expect(parsed.difficulty.name).toBe("<Delete");
    expect(parsed.difficulty.keyCount).toBe(7);
    expect(parsed.audioFilename).toBe("audio_2.mp3");
    expect(parsed.meta.artist).toBe("Various Artists");
    expect(parsed.difficulty.notes).toHaveLength(2);
    expect(parsed.difficulty.notes[0].startTime).toBe(0);
    expect(parsed.difficulty.notes[1].startTime).toBe(120000);
    expect(parsed.backgroundFilename).toBeNull();
  });
});

describe("validatePack", () => {
  it("flags empty pack, missing fields and duplicate names", () => {
    const empty = validatePack({ metadata: { ...metadata, title: "", creator: "" }, items: [], settings: DEFAULT_PACK_SETTINGS });
    expect(empty.errors).toContain("No maps imported.");
    expect(empty.errors).toContain("Missing pack title.");
    expect(empty.errors).toContain("Missing pack creator.");

    const audio = makeAsset({ name: "audio.mp3" });
    const a = makeItem({ assets: [audio] });
    const b = makeItem({ assets: [audio] });
    const dup = validatePack({
      metadata,
      items: [a, b],
      settings: { ...DEFAULT_PACK_SETTINGS, placeholderEnabled: false },
    });
    expect(dup.errors.some((e) => e.startsWith("Duplicate final difficulty name"))).toBe(true);
  });

  it("warns on non-various artist mode and original-creator mode", () => {
    const audio = makeAsset({ name: "audio.mp3" });
    const items = [
      makeItem({ assets: [audio], originalArtist: "A1" }),
      makeItem({ assets: [audio], originalArtist: "A2", songDisplayName: "Other", originalTitle: "Other" }),
    ];
    const res = validatePack({
      metadata: { ...metadata, artistMode: "original-per-map" },
      items,
      settings: { ...DEFAULT_PACK_SETTINGS, creatorFieldMode: "original", placeholderEnabled: false },
    });
    expect(res.warnings.some((w) => w.includes("less consistent"))).toBe(true);
    expect(res.warnings.some((w) => w.includes("Various Artists is recommended"))).toBe(true);
    expect(res.warnings.some((w) => w.includes("Creator field"))).toBe(true);
    expect(res.warnings.some((w) => w.includes("multiple songs"))).toBe(true);
  });
});

describe("packOszFilename", () => {
  it("formats and sanitizes the archive name", () => {
    expect(packOszFilename(metadata)).toBe("Jumpstream Collection (sheepex_) Pack.osz");
    expect(
      packOszFilename({ ...metadata, title: 'Bad:"Title?"' }),
    ).toBe("BadTitle (sheepex_) Pack.osz");
  });
});
