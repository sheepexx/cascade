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

function noisyClickTrack(
  bpm: number,
  offsetMs: number,
  seconds: number,
): Float32Array {
  const data = clickTrack(bpm, offsetMs, seconds);
  let state = 0x12345678;
  for (let i = 0; i < data.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data[i] += ((state / 0xffffffff) * 2 - 1) * 0.035;
  }
  return data;
}

function droppedBeatTrack(
  bpm: number,
  offsetMs: number,
  seconds: number,
): Float32Array {
  const data = new Float32Array(Math.floor(SR * seconds));
  const beatSamples = (60 / bpm) * SR;
  let beat = 0;
  for (
    let start = (offsetMs / 1000) * SR;
    start < data.length - 600;
    start += beatSamples, beat++
  ) {
    if (beat % 7 === 3 || beat % 11 === 5) continue;
    const s = Math.round(start);
    const amp = beat % 4 === 0 ? 1 : beat % 2 === 0 ? 0.45 : 0.65;
    for (let i = 0; i < 500; i++) {
      data[s + i] += amp * Math.sin(i * 0.9) * Math.exp(-i / 90);
    }
  }
  return data;
}

function kitTrack(
  bpm: number,
  offsetMs: number,
  seconds: number,
  backbeatGain: number,
  hatGain: number,
): Float32Array {
  let state = 0x9e3779b9;
  const rand = () =>
    ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0xffffffff) * 2 - 1;
  const n = Math.floor(SR * seconds);
  const data = new Float32Array(n);
  const beat = (60 / bpm) * SR;
  const add = (at: number, len: number, f: (i: number) => number) => {
    const s = Math.round(at);
    for (let i = 0; i < len && s + i < n; i++) if (s + i >= 0) data[s + i] += f(i);
  };
  let b = 0;
  for (let t = (offsetMs / 1000) * SR; t < n; t += beat, b++) {
    if (b % 2 === 0) {
      add(t, 4000, (i) => 0.9 * Math.sin((2 * Math.PI * 52 * i) / SR) * Math.exp(-i / 1400));
    } else {
      add(t, 3000, (i) => backbeatGain * rand() * Math.exp(-i / 700));
    }
    if (hatGain > 0) {
      for (const k of [0, 0.5]) {
        add(t + k * beat, 900, (i) => hatGain * rand() * Math.exp(-i / 160));
      }
    }
  }
  return data;
}

function barTrack(
  bpm: number,
  downbeatMs: number,
  seconds: number,
  pickupBeats: number,
): Float32Array {
  let state = 0x1234567;
  const rand = () =>
    ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0xffffffff) * 2 - 1;
  const n = Math.floor(SR * seconds);
  const data = new Float32Array(n);
  const beat = (60 / bpm) * SR;
  const add = (at: number, len: number, f: (i: number) => number) => {
    const s = Math.round(at);
    for (let i = 0; i < len && s + i < n; i++) if (s + i >= 0) data[s + i] += f(i);
  };
  for (let p = 1; p <= pickupBeats; p++) {
    add((downbeatMs / 1000) * SR - p * beat, 900, (i) => 0.2 * rand() * Math.exp(-i / 160));
  }
  let b = 0;
  for (let t = (downbeatMs / 1000) * SR; t < n; t += beat, b++) {
    const inBar = b % 4;
    if (inBar === 0) {
      add(t, 5000, (i) => Math.sin((2 * Math.PI * 48 * i) / SR) * Math.exp(-i / 1700));
    } else if (inBar === 2) {
      add(t, 3500, (i) => 0.42 * Math.sin((2 * Math.PI * 52 * i) / SR) * Math.exp(-i / 1000));
    } else {
      add(t, 2500, (i) => 0.3 * rand() * Math.exp(-i / 600));
    }
    add(t + beat / 2, 800, (i) => 0.1 * rand() * Math.exp(-i / 150));
  }
  return data;
}

function barError(offsetMs: number, downbeatMs: number, bpm: number): number {
  const barMs = (60000 / bpm) * 4;
  return Math.abs(
    ((((offsetMs - downbeatMs) % barMs) + barMs + barMs / 2) % barMs) - barMs / 2,
  );
}

describe("detectBpmFromChannel", () => {
  it("puts the offset on the bar downbeat, not just any beat", () => {
    const result = detectBpmFromChannel(barTrack(150, 2000, 45, 0), SR)!;
    expect(result.bpm).toBe(150);
    expect(barError(result.offsetMs, 2000, 150)).toBeLessThanOrEqual(30);
  });

  it("skips a pickup and still lands on the downbeat", () => {
    const result = detectBpmFromChannel(barTrack(174, 900, 45, 2), SR)!;
    expect(result.bpm).toBe(174);
    expect(barError(result.offsetMs, 900, 174)).toBeLessThanOrEqual(30);
  });

  it("reads the full tempo when the backbeat is quieter than the kick", () => {
    const result = detectBpmFromChannel(kitTrack(174, 312, 40, 0.5, 0.16), SR)!;
    expect(result.bpm).toBe(174);
  });

  it("does not double a slow tempo whose midpoints only carry hats", () => {
    const result = detectBpmFromChannel(kitTrack(100, 400, 40, 0.55, 0.3), SR)!;
    expect(result.bpm).toBe(100);
  });

  it("does not double when the midpoints are empty", () => {
    const result = detectBpmFromChannel(kitTrack(92, 250, 40, 0.55, 0), SR)!;
    expect(result.bpm).toBe(92);
  });

  it("finds an integer BPM from a plain click track", () => {
    const result = detectBpmFromChannel(clickTrack(170, 500, 25), SR);
    expect(result).not.toBeNull();
    expect(result!.bpm).toBe(170);
  });

  it.each([72.5, 128.2, 174.5, 199.75, 222.3])(
    "keeps a decimal tempo of %s BPM instead of snapping to an integer",
    (expectedBpm) => {
      const result = detectBpmFromChannel(clickTrack(expectedBpm, 420, 35), SR);
      expect(result).not.toBeNull();
      expect(Math.abs(result!.bpm - expectedBpm)).toBeLessThanOrEqual(0.1);
      const beat = 60000 / expectedBpm;
      const missBy = Math.abs(
        ((((result!.offsetMs - 420) % beat) + beat + beat / 2) % beat) - beat / 2,
      );
      expect(missBy).toBeLessThanOrEqual(30);
    },
  );

  it("keeps a fractional tempo under steady background noise", () => {
    const result = detectBpmFromChannel(noisyClickTrack(156.4, 280, 30), SR);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.bpm - 156.4)).toBeLessThanOrEqual(0.1);
  });

  it("keeps the tempo when some beats are missing or differently accented", () => {
    const result = detectBpmFromChannel(droppedBeatTrack(142.7, 360, 35), SR);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.bpm - 142.7)).toBeLessThanOrEqual(0.1);
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
