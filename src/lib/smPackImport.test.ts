import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { scanPackFromZip } from "./smPackImport";

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

// JSZip can't re-read a jsdom File/Blob under the test runner, but it reads a
// Uint8Array in any environment; scanPackFromZip just forwards it to loadAsync,
// so pass the raw bytes (cast to File for the signature).
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
});
