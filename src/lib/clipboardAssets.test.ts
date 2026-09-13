import { describe, expect, it } from "vitest";
import { placeClipAssets, type ClipAsset } from "./clipboardAssets";

const blob = (text: string) => new Blob([text]);
const empty = { audio: {}, background: {}, video: {} };

describe("placeClipAssets", () => {
  it("adds files the map doesn't have under their own names", async () => {
    const files: ClipAsset[] = [
      { kind: "audio", name: "song.mp3", blob: blob("song") },
      { kind: "background", name: "bg.jpg", blob: blob("bg") },
    ];
    const { names, added } = await placeClipAssets(files, empty);
    expect(names).toEqual({ audio: "song.mp3", background: "bg.jpg" });
    expect(added.map((f) => f.name)).toEqual(["song.mp3", "bg.jpg"]);
  });

  it("reuses a file the map already has with the same name and bytes", async () => {
    const { names, added } = await placeClipAssets(
      [{ kind: "audio", name: "song.mp3", blob: blob("same") }],
      { ...empty, audio: { "song.mp3": { blob: blob("same") } } },
    );
    expect(names.audio).toBe("song.mp3");
    expect(added).toEqual([]);
  });

  it("renames a file whose name is taken by different bytes", async () => {
    const copied = blob("other");
    const { names, added } = await placeClipAssets(
      [{ kind: "audio", name: "audio.mp3", blob: copied }],
      { ...empty, audio: { "audio.mp3": { blob: blob("mine") } } },
    );
    expect(names.audio).toBe("audio_2.mp3");
    expect(added).toEqual([{ kind: "audio", name: "audio_2.mp3", blob: copied }]);
  });

  it("only compares names within the same kind of file", async () => {
    const { names } = await placeClipAssets(
      [{ kind: "video", name: "clip", blob: blob("video") }],
      { ...empty, audio: { clip: { blob: blob("audio") } } },
    );
    expect(names.video).toBe("clip");
  });
});
