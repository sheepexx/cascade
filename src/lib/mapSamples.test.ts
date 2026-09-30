import { describe, expect, it } from "vitest";
import {
  MAX_SAMPLE_BYTES,
  chooseSamplePaths,
  indexSamples,
  isHitsoundSampleName,
  mapSampleFor,
  namedSampleFor,
  sampleKey,
} from "./mapSamples";

const file = (name: string) => ({ name, blob: new Blob([name]) });

describe("sample names", () => {
  it("recognises hitsound files with or without a custom index", () => {
    expect(isHitsoundSampleName("soft-hitclap.wav")).toBe(true);
    expect(isHitsoundSampleName("Drum-HitWhistle12.OGG")).toBe(true);
    expect(isHitsoundSampleName("normal-slidertick.mp3")).toBe(true);
    expect(isHitsoundSampleName("audio.mp3")).toBe(false);
    expect(isHitsoundSampleName("soft-hitclap.png")).toBe(false);
  });

  it("looks names up case-insensitively with forward slashes", () => {
    expect(sampleKey(".\\SB\\Kick.WAV")).toBe("sb/kick.wav");
  });
});

describe("chooseSamplePaths", () => {
  const entries = [
    { path: "audio.mp3", bytes: 3_000_000 },
    { path: "soft-hitclap.wav", bytes: 20_000 },
    { path: "normal-hitfinish2.ogg", bytes: 30_000 },
    { path: "kick.wav", bytes: 10_000 },
    { path: "unused.wav", bytes: 10_000 },
    { path: "sb/soft-hitclap.wav", bytes: 10_000 },
    { path: "bg.jpg", bytes: 500_000 },
    { path: "huge-hit.wav", bytes: MAX_SAMPLE_BYTES + 1 },
  ];

  it("keeps hitsound files and ones notes name, never the song", () => {
    expect(chooseSamplePaths(entries, ["Kick.wav", "huge-hit.wav"], ["audio.mp3"])).toEqual([
      "soft-hitclap.wav",
      "normal-hitfinish2.ogg",
      "kick.wav",
    ]);
  });

  it("doesn't take the song even when a note names it", () => {
    expect(chooseSamplePaths(entries, ["audio.mp3"], ["audio.mp3"])).not.toContain("audio.mp3");
  });
});

describe("sample lookup", () => {
  const index = indexSamples({
    a: file("soft-hitclap.wav"),
    b: file("soft-hitclap2.ogg"),
    c: file("Kick.wav"),
  });

  it("uses map samples only on a custom index", () => {
    expect(mapSampleFor(index, "soft-hitclap", 0)).toBeNull();
    expect(mapSampleFor(index, "soft-hitclap", 1)?.name).toBe("soft-hitclap.wav");
    expect(mapSampleFor(index, "soft-hitclap", 2)?.name).toBe("soft-hitclap2.ogg");
    expect(mapSampleFor(index, "soft-hitclap", 3)).toBeNull();
    expect(mapSampleFor(index, "normal-hitclap", 1)).toBeNull();
  });

  it("finds a note's named file regardless of case", () => {
    expect(namedSampleFor(index, "kick.WAV")?.name).toBe("Kick.wav");
    expect(namedSampleFor(index, "snare.wav")).toBeNull();
    expect(namedSampleFor(index, undefined)).toBeNull();
  });
});
