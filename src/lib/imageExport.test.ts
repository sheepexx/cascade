import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";

vi.mock("./imageConvert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./imageConvert")>();
  return {
    ...actual,
    pngToJpeg: vi.fn(
      async () => new Uint8Array([1, 2, 3, 4]) as unknown as Blob,
    ),
  };
});

import { buildOsz } from "./oszExport";
import {
  buildPack,
  parseOsuForPack,
  resolveAssetCollisions,
} from "./packCreator";
import { DEFAULT_PACK_METADATA, DEFAULT_PACK_SETTINGS } from "../types/packCreator";
import type { PackAsset, PackItem } from "../types/packCreator";
import { makeDifficulty, type Difficulty } from "../types";

function bytes(s: string): Blob {
  return new Uint8Array([...s].map((c) => c.charCodeAt(0))) as unknown as Blob;
}

const OSU_WITH_PNG_BG = `osu file format v14

[General]
AudioFilename: audio.mp3
Mode: 3

[Metadata]
Title:Song
Artist:Artist
Creator:Mapper
Version:Hard

[Events]
0,0,"bg.png",0,0

[TimingPoints]
0,500,4,1,0,100,1,0

[HitObjects]
64,192,0,1,0,0:0:0:0:
`;

async function loadZip(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const names = Object.keys(zip.files);
  const osuNames = names.filter((n) => n.endsWith(".osu"));
  const osu = await zip.files[osuNames[0]].async("string");
  const osus = await Promise.all(osuNames.map((n) => zip.files[n].async("string")));
  return { names, osu, osus };
}

function osuText(version: string, bg: string): string {
  return `osu file format v14

[General]
AudioFilename: audio.mp3
Mode: 3

[Metadata]
Title:Song
Artist:Artist
Creator:Mapper
Version:${version}

[Events]
0,0,"${bg}",0,0

[HitObjects]
64,192,0,1,0,0:0:0:0:
`;
}

function makePackItem(
  over: { id: string; version: string; archive: string; bg: string; assets: PackAsset[] },
): PackItem {
  return {
    id: over.id,
    originalTitle: "Song",
    originalArtist: "Artist",
    originalCreator: "Mapper",
    originalVersion: over.version,
    songDisplayName: "Song",
    mapperName: over.version,
    includeRateInDifficultyName: false,
    includeOriginalDifficultyName: false,
    includeMapperInBrackets: true,
    overallDifficulty: 8,
    hpDrainRate: 7.5,
    originalAudioFilename: "audio.mp3",
    originalOsuFilename: `${over.version}.osu`,
    sourceArchiveId: over.archive,
    finalDifficultyName: `Song [${over.version}]`,
    parsedOsu: parseOsuForPack(osuText(over.version, over.bg)),
    assets: over.assets,
  };
}

describe("PNG background conversion on export", () => {
  it("osz export: drops the PNG, adds the JPEG, rewrites the .osu", async () => {
    const diff: Difficulty = {
      ...makeDifficulty("Hard", 4),
      backgroundFilename: "bg.png",
    };
    const blob = await buildOsz({
      meta: { title: "Song", artist: "Artist", creator: "Mapper", tags: "" },
      difficulties: [diff],
      timingPoints: [],
      audioFiles: { "audio.mp3": { name: "audio.mp3", url: "", blob: bytes("a") } },
      bgFiles: { "bg.png": { name: "bg.png", url: "", blob: bytes("pngdata") } },
      jpegQuality: 0.9,
    });

    const { names, osu } = await loadZip(blob);
    expect(names).toContain("bg.jpg");
    expect(names).not.toContain("bg.png");
    expect(osu).toContain('"bg.jpg"');
    expect(osu).not.toContain("bg.png");
  });

  it("osz export: without a quality, keeps the PNG untouched", async () => {
    const diff: Difficulty = {
      ...makeDifficulty("Hard", 4),
      backgroundFilename: "bg.png",
    };
    const blob = await buildOsz({
      meta: { title: "Song", artist: "Artist", creator: "Mapper", tags: "" },
      difficulties: [diff],
      timingPoints: [],
      audioFiles: { "audio.mp3": { name: "audio.mp3", url: "", blob: bytes("a") } },
      bgFiles: { "bg.png": { name: "bg.png", url: "", blob: bytes("pngdata") } },
    });

    const { names, osu } = await loadZip(blob);
    expect(names).toContain("bg.png");
    expect(names).not.toContain("bg.jpg");
    expect(osu).toContain('"bg.png"');
  });

  it("pack export: drops the PNG, adds the JPEG, rewrites the .osu", async () => {
    const parsed = parseOsuForPack(OSU_WITH_PNG_BG);
    const assets: PackAsset[] = [
      { id: "a1", name: "audio.mp3", blob: bytes("a"), size: 1, hash: "h1", referenced: true },
      { id: "a2", name: "bg.png", blob: bytes("pngdata-longer"), size: 14, hash: "h2", referenced: true },
    ];
    const item: PackItem = {
      id: "item1",
      originalTitle: "Song",
      originalArtist: "Artist",
      originalCreator: "Mapper",
      originalVersion: "Hard",
      songDisplayName: "Song",
      mapperName: "Mapper",
      includeRateInDifficultyName: false,
      includeOriginalDifficultyName: false,
      includeMapperInBrackets: true,
      overallDifficulty: 8,
      hpDrainRate: 7.5,
      originalAudioFilename: "audio.mp3",
      originalOsuFilename: "song.osu",
      sourceArchiveId: "src1",
      finalDifficultyName: "Song [Mapper]",
      parsedOsu: parsed,
      assets,
    };

    const { blob } = await buildPack({
      metadata: { ...DEFAULT_PACK_METADATA, title: "Pack", creator: "Packer" },
      items: [item],
      settings: DEFAULT_PACK_SETTINGS,
      jpegQuality: 0.9,
    });

    const { names, osu } = await loadZip(blob);
    expect(names).toContain("bg.jpg");
    expect(names).not.toContain("bg.png");
    expect(osu).toContain('"bg.jpg"');
    expect(osu).not.toContain("bg.png");
  });

  it("pack: two difficulties in one archive share a background - converted once", async () => {
    const assets: PackAsset[] = [
      { id: "au", name: "audio.mp3", blob: bytes("a"), size: 1, hash: "h1", referenced: true },
      { id: "bgp", name: "bg.png", blob: bytes("pngdata"), size: 7, hash: "h2", referenced: true },
    ];
    const items = [
      makePackItem({ id: "i1", version: "Easy", archive: "src1", bg: "bg.png", assets }),
      makePackItem({ id: "i2", version: "Hard", archive: "src1", bg: "bg.png", assets }),
    ];

    const { blob } = await buildPack({
      metadata: { ...DEFAULT_PACK_METADATA, title: "Pack", creator: "Packer" },
      items,
      settings: DEFAULT_PACK_SETTINGS,
      jpegQuality: 0.9,
    });

    const { names, osus } = await loadZip(blob);
    const images = names.filter((n) => /\.(png|jpg)$/i.test(n));
    expect(images).toEqual(["bg.jpg"]);
    for (const osu of osus) {
      expect(osu).toContain('"bg.jpg"');
      expect(osu).not.toContain("bg.png");
    }
  });

  it("pack: multiple maps - every PNG background is converted, none left behind", async () => {
    const items = [
      makePackItem({
        id: "i1", version: "Map1", archive: "srcA", bg: "bg.png",
        assets: [
          { id: "a1", name: "audio.mp3", blob: bytes("a"), size: 1, hash: "ha", referenced: true },
          { id: "b1", name: "bg.png", blob: bytes("A-large-png"), size: 11, hash: "h1", referenced: true },
        ],
      }),
      makePackItem({
        id: "i2", version: "Map2", archive: "srcB", bg: "cover.png",
        assets: [
          { id: "a2", name: "audio.mp3", blob: bytes("b"), size: 1, hash: "hb", referenced: true },
          { id: "b2", name: "cover.png", blob: bytes("tiny"), size: 4, hash: "h2", referenced: true },
        ],
      }),
    ];

    const { blob } = await buildPack({
      metadata: { ...DEFAULT_PACK_METADATA, title: "Pack", creator: "Packer" },
      items,
      settings: DEFAULT_PACK_SETTINGS,
      jpegQuality: 0.9,
    });

    const { names } = await loadZip(blob);
    expect(names.filter((n) => n.toLowerCase().endsWith(".png"))).toEqual([]);
    expect(names).toContain("bg.jpg");
    expect(names).toContain("cover.jpg");
  });
});

describe("parse", () => {
  it("detects the png background from [Events]", () => {
    expect(parseOsuForPack(OSU_WITH_PNG_BG).backgroundFilename).toBe("bg.png");
  });

  it("resolveAssetCollisions keeps the bg.png asset in the file list", () => {
    const { files } = resolveAssetCollisions([
      {
        assets: [
          { id: "a2", name: "bg.png", blob: bytes("x"), size: 1, hash: "h2", referenced: true },
        ],
        sourceArchiveId: "src1",
      } as unknown as PackItem,
    ]);
    expect(files.map((f) => f.name)).toContain("bg.png");
  });
});
