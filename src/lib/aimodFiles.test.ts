import { describe, expect, it } from "vitest";
import {
  averageBitrateKbps,
  detectAudioFormat,
  id3v2TagBytes,
  isHitsoundFile,
  millisecondPoints,
  sampleDelay,
} from "./aimodFiles";

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

describe("millisecondPoints", () => {
  it("takes each millisecond's loudest excursion, averaged across channels", () => {
    const left = new Float32Array(3000);
    const right = new Float32Array(3000);
    left[1500] = -0.8;
    right[1600] = 0.4;
    const points = millisecondPoints([left, right], 1_000_000);
    expect(points).toHaveLength(3);
    expect(Array.from(points).map((v) => Math.round(v * 100) / 100)).toEqual([0, 0.6, 0]);
  });
});

describe("sampleDelay", () => {
  const points = (values: number[]) => new Float32Array(values);

  it("is instant for a sample that hits straight away", () => {
    expect(sampleDelay(points([1, 0.5, 0.2]))).toEqual({ silentMs: 0, delayMs: 0 });
  });

  it("counts leading silence the way lazer does", () => {
    // Silence counts toward the scan's bound twice, so with 20 ms of it the
    // scan ends after 11 steps, before the hit; lazer reports the same.
    const silence = new Array(20).fill(0);
    expect(sampleDelay(points([...silence, 1, 0.3]))).toEqual({ silentMs: 11, delayMs: 11 });
    expect(sampleDelay(points([0, 0, 1]))).toEqual({ silentMs: 2, delayMs: 2 });
  });

  it("counts a slow swell into the hit", () => {
    expect(sampleDelay(points([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 1]))).toEqual({ silentMs: 0, delayMs: 6 });
  });

  it("skips a silent sample", () => {
    expect(sampleDelay(points([0, 0, 0]))).toBeNull();
    expect(sampleDelay(points([]))).toBeNull();
  });
});

describe("isHitsoundFile", () => {
  it("matches the hit sounds osu! plays, not slider sounds or other audio", () => {
    expect(isHitsoundFile("soft-hitclap.wav")).toBe(true);
    expect(isHitsoundFile("Drum-HitNormal3.ogg")).toBe(true);
    expect(isHitsoundFile("normal-sliderslide.wav")).toBe(false);
    expect(isHitsoundFile("kick.wav")).toBe(false);
  });
});
