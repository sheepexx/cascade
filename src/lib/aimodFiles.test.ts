import { describe, expect, it } from "vitest";
import { averageBitrateKbps, detectAudioFormat, id3v2TagBytes } from "./aimodFiles";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])),
  );

describe("detectAudioFormat", () => {
  it("reads the container from the first bytes", () => {
    expect(detectAudioFormat(bytes("ID3", 4, 0))).toBe("mp3");
    expect(detectAudioFormat(bytes(0xff, 0xfb, 0x90, 0x64))).toBe("mp3");
    expect(detectAudioFormat(bytes("OggS", 0))).toBe("ogg");
    expect(detectAudioFormat(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBe("wav");
    expect(detectAudioFormat(bytes("fLaC"))).toBe("flac");
    expect(detectAudioFormat(bytes(0, 0, 0, 32, "ftypM4A "))).toBe("m4a");
  });

  it("does not take a reserved MPEG layer for MP3", () => {
    expect(detectAudioFormat(bytes(0xff, 0xf9))).toBe("unknown");
    expect(detectAudioFormat(bytes("junk"))).toBe("unknown");
  });
});

describe("id3v2TagBytes", () => {
  it("decodes the syncsafe tag size, header included", () => {
    // 0x02 0x01 syncsafe = 2 * 128 + 1 = 257 bytes of tag body.
    expect(id3v2TagBytes(bytes("ID3", 4, 0, 0, 0, 0, 2, 1))).toBe(267);
  });

  it("adds the footer when the flag says there is one", () => {
    expect(id3v2TagBytes(bytes("ID3", 4, 0, 0x10, 0, 0, 0, 10))).toBe(30);
  });

  it("ignores anything that isn't a valid tag", () => {
    expect(id3v2TagBytes(bytes("OggS", 0, 0, 0, 0, 0, 0))).toBe(0);
    expect(id3v2TagBytes(bytes("ID3", 4, 0, 0, 0x80, 0, 0, 0))).toBe(0);
  });
});

describe("averageBitrateKbps", () => {
  it("divides the audio bits by the length", () => {
    // 192 kbps for 10 s is 240 000 bytes.
    expect(averageBitrateKbps(240_000, 10)).toBe(192);
  });

  it("has no answer without a length or any audio", () => {
    expect(averageBitrateKbps(240_000, 0)).toBeNull();
    expect(averageBitrateKbps(0, 10)).toBeNull();
  });
});
