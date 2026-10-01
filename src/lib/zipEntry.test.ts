import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { zipEntryOptions } from "./zipEntry";

describe("zipEntryOptions", () => {
  it("stores media that is already compressed and deflates the rest", () => {
    for (const name of ["song.mp3", "Song.OGG", "bg.jpeg", "bg.png", "intro.mp4", "skin.osk"]) {
      expect(zipEntryOptions(name).compression).toBe("STORE");
    }
    for (const name of ["map.osu", "normal-hitclap.wav", "chart.sm", "notes.mc"]) {
      expect(zipEntryOptions(name).compression).toBe("DEFLATE");
    }
  });

  it("yields an archive that reads back byte for byte", async () => {
    const zip = new JSZip();
    const audio = new Uint8Array(2048).map((_, i) => (i * 37) % 251);
    zip.file("song.mp3", audio, zipEntryOptions("song.mp3"));
    zip.file("map.osu", "x".repeat(4000), zipEntryOptions("map.osu"));
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const back = await JSZip.loadAsync(bytes);
    expect(await back.file("song.mp3")!.async("uint8array")).toEqual(audio);
    expect(await back.file("map.osu")!.async("string")).toBe("x".repeat(4000));
    expect(bytes.length).toBeLessThan(2048 + 4000);
  });
});
