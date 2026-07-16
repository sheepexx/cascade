import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { scanPackFromZip, packSongToOszFile } from "./smPackImport";
import { importOszForPack } from "./packCreator";

const SSC = `#TITLE:Zip Song;
#ARTIST:Z;
#MUSIC:song.ogg;
#OFFSET:0;
#BPMS:0=120;
#BACKGROUND:bg.png;

#NOTEDATA:;
#STEPSTYPE:dance-single;
#DIFFICULTY:Hard;
#METER:10;
#NOTES:
0000
1000
0000
0000
;
`;

async function makeZip(
  files: Record<string, string | Uint8Array>,
): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  const buf = await zip.generateAsync({ type: "uint8array" });
  return buf as unknown as File;
}

describe("scanPackFromZip", () => {
  it("reads a StepMania/Etterna pack .zip into songs", async () => {
    const file = await makeZip({
      "MyPack/Zip Song/chart.ssc": SSC,
      "MyPack/Zip Song/song.ogg": new Uint8Array([1, 2, 3]),
      "MyPack/Zip Song/bg.png": new Uint8Array([4, 5, 6]),
    });
    const songs = await scanPackFromZip(file);
    expect(songs).toHaveLength(1);
    expect(songs[0].info.title).toBe("Zip Song");
    expect(songs[0].parsed.difficulties).toHaveLength(1);
    expect(songs[0].parsed.difficulties[0].keyCount).toBe(4);
    expect(Object.keys(songs[0].audioBlobs)).toContain("song.ogg");
    expect(Object.keys(songs[0].bgBlobs)).toContain("bg.png");
  });

  it("returns [] for an archive with no charts (an osu! .osz/.zip)", async () => {
    const file = await makeZip({
      "set/beatmap.osu": "osu file format v14",
      "set/audio.mp3": new Uint8Array([1, 2, 3]),
    });
    expect(await scanPackFromZip(file)).toEqual([]);
  });

  it("repackages a scanned SM song into an .osz importable by the pack creator", async () => {
    const song = {
      info: {
        title: "Zip Song",
        artist: "Z",
        creator: "C",
        dirName: "Zip Song",
        sourceSmName: "chart.ssc",
        audioFilename: "song.ogg",
        backgroundFilename: "bg.png",
        difficulties: [{ name: "Hard", keys: 4 }],
      },
      parsed: {
        meta: { title: "Zip Song", artist: "Z", creator: "C", tags: "" },
        difficulties: [
          {
            id: "d1",
            sourceFormat: "sm" as const,
            name: "Hard",
            keyCount: 4,
            hpDrainRate: 7,
            overallDifficulty: 7,
            previewTime: -1,
            audioFilename: "song.ogg",
            timingPoints: [],
            notes: [
              { id: "n1", column: 0, startTime: 500 },
              { id: "n2", column: 2, startTime: 1000 },
            ],
          },
        ],
        timingPoints: [],
        audioFilename: "song.ogg",
        backgroundFilename: "bg.png",
      },
      audioBlobs: { "song.ogg": new Uint8Array([1, 2, 3]) as unknown as Blob },
      bgBlobs: { "bg.png": new Uint8Array([4, 5, 6]) as unknown as Blob },
    };

    const osz = await packSongToOszFile(song);
    expect(osz.name).toBe("Zip Song.osz");

    const buf = await osz.arrayBuffer();
    const res = await importOszForPack(buf as unknown as File);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].parsedOsu.keyCount).toBe(4);
    expect(res.items[0].originalTitle).toBe("Zip Song");
  });
});
