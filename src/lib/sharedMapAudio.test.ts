import { describe, expect, it } from "vitest";
import { resolveSharedAudioUrl } from "./sharedMapAudio";

describe("resolveSharedAudioUrl", () => {
  it("uses the song referenced by the selected difficulty", () => {
    expect(
      resolveSharedAudioUrl(
        { "first.mp3": "/first", "second.ogg": "/second" },
        "/first",
        "second.ogg",
      ),
    ).toBe("/second");
  });

  it("keeps old single-audio shares working", () => {
    expect(resolveSharedAudioUrl({}, "/legacy", "missing.mp3")).toBe(
      "/legacy",
    );
  });

  it("does not substitute another song when mapped audio is missing", () => {
    expect(
      resolveSharedAudioUrl(
        { "first.mp3": "/first" },
        "/first",
        "missing.mp3",
      ),
    ).toBeNull();
  });

  it("uses the only uploaded song when a difficulty has no filename", () => {
    expect(resolveSharedAudioUrl({ "song.mp3": "/song" }, null)).toBe(
      "/song",
    );
  });
});
