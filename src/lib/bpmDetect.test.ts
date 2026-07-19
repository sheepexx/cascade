import { describe, it, expect } from "vitest";
import { detectBpmFromChannel } from "./bpmDetect";

const SR = 44100;

/** Synth a click track: short decaying bursts on every beat. */
function clickTrack(
  bpm: number,
  offsetMs: number,
  seconds: number,
  accentEvery = 0,
): Float32Array {
  const data = new Float32Array(Math.floor(SR * seconds));
  const beatSamples = (60 / bpm) * SR;
  let beat = 0;
  for (
    let start = (offsetMs / 1000) * SR;
    start < data.length - 600;
    start += beatSamples, beat++
  ) {
    const s = Math.round(start);
    const amp = accentEvery > 0 && beat % accentEvery === 0 ? 1 : 0.6;
    for (let i = 0; i < 500; i++) {
      data[s + i] += amp * Math.sin(i * 0.9) * Math.exp(-i / 90);
    }
  }
  return data;
}

/**
 * A track that times to the wrong subdivision without bass weighting: quiet
 * low-frequency thumps sit on every beat while louder broadband clicks sit a
 * quarter beat late, like off-beat hats over a kick.
 */
function syncopatedTrack(bpm: number, offsetMs: number, seconds: number): Float32Array {
  const data = new Float32Array(Math.floor(SR * seconds));
  const beatSamples = (60 / bpm) * SR;
  for (
    let start = (offsetMs / 1000) * SR;
    start < data.length - 3000;
    start += beatSamples
  ) {
    const s = Math.round(start);
    for (let i = 0; i < 2600; i++) {
      data[s + i] +=
        0.25 * Math.sin((2 * Math.PI * 55 * i) / SR) * Math.exp(-i / 1200);
    }
  }
  for (
    let start = (offsetMs / 1000) * SR + beatSamples / 4;
    start < data.length - 600;
    start += beatSamples
  ) {
    const s = Math.round(start);
    for (let i = 0; i < 500; i++) {
      data[s + i] += Math.sin(i * 0.9) * Math.exp(-i / 90);
    }
  }
  return data;
}

describe("detectBpmFromChannel", () => {
  it("finds an integer BPM from a plain click track", () => {
    const result = detectBpmFromChannel(clickTrack(170, 500, 25), SR);
    expect(result).not.toBeNull();
    expect(result!.bpm).toBe(170);
  });

  it("puts the offset on the click, modulo nothing", () => {
    const result = detectBpmFromChannel(clickTrack(170, 500, 25), SR)!;
    expect(Math.abs(result.offsetMs - 500)).toBeLessThanOrEqual(30);
  });

  it("handles a slower tempo with accents", () => {
    const result = detectBpmFromChannel(clickTrack(128, 250, 25, 4), SR)!;
    expect(result.bpm).toBe(128);
    // Offset may lock to any beat near the start, but must sit on the grid.
    const beat = 60000 / 128;
    const missBy = Math.abs(
      ((result.offsetMs - 250) % beat + beat + beat / 2) % beat - beat / 2,
    );
    expect(missBy).toBeLessThanOrEqual(30);
  });

  it("locks the offset to the bass downbeat, not louder off-beat hits", () => {
    const result = detectBpmFromChannel(syncopatedTrack(140, 300, 25), SR)!;
    expect(result.bpm).toBe(140);
    // Offset may land on any beat, but must sit on the thump grid — a
    // quarter-beat (107 ms) error toward the clicks fails this.
    const beat = 60000 / 140;
    const missBy = Math.abs(
      ((((result.offsetMs - 300) % beat) + beat + beat / 2) % beat) - beat / 2,
    );
    expect(missBy).toBeLessThanOrEqual(30);
  });

  it("reports reasonable confidence for a clean beat", () => {
    const result = detectBpmFromChannel(clickTrack(150, 0, 25), SR)!;
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("returns null for silence", () => {
    expect(detectBpmFromChannel(new Float32Array(SR * 10), SR)).toBeNull();
  });

  it("returns null for audio that is too short", () => {
    expect(detectBpmFromChannel(new Float32Array(SR), SR)).toBeNull();
  });
});
