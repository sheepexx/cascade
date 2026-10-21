import { describe, expect, it } from "vitest";
import { cubicSample } from "./liveTimeStretch";
import { positionAt, type RateTransition } from "./rateTransition";
import { SongRenderer } from "./songRenderer";

const RATE = 16000;
const BLOCK = 128;
const RAMP_SECONDS = 0.34;

function noise(seconds: number, seed = 3): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  let s = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = (s / 4294967296) * 2 - 1;
  }
  return out;
}

function sine(seconds: number, hz: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / RATE);
  return out;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** A transport rate over time, the way useAudio ramps it between settings. */
function schedule(points: [seconds: number, rate: number][]): (t: number) => number {
  return (t) => {
    let rate = points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [at, to] = points[i];
      if (t < at) break;
      const from = rate;
      const k = Math.min(1, (t - at) / RAMP_SECONDS);
      rate = from + (to - from) * easeOutCubic(k);
    }
    return rate;
  };
}

function play(
  renderer: SongRenderer,
  seconds: number,
  rateAt: (t: number) => number,
): { out: Float32Array; rates: number[]; refs: number[] } {
  const total = Math.round(seconds * RATE);
  const out = new Float32Array(total);
  const block = [new Float32Array(BLOCK)];
  const rates: number[] = [];
  const refs: number[] = [];
  for (let at = 0; at < total; at += BLOCK) {
    const len = Math.min(BLOCK, total - at);
    const rate = rateAt(at / RATE);
    rates.push(rate);
    refs.push(renderer.position);
    renderer.render(block, 0, len, rate);
    out.set(block[0].subarray(0, len), at);
  }
  return { out, rates, refs };
}

function blockLevels(signal: Float32Array): number[] {
  const levels: number[] = [];
  for (let at = 0; at + BLOCK <= signal.length; at += BLOCK) {
    let sum = 0;
    for (let i = at; i < at + BLOCK; i++) sum += signal[i] * signal[i];
    levels.push(Math.sqrt(sum / BLOCK));
  }
  return levels;
}

function frequency(signal: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < signal.length; i++) {
    if (signal[i - 1] < 0 && signal[i] >= 0) crossings++;
  }
  return (crossings * RATE) / signal.length;
}

describe("SongRenderer", () => {
  it("copies the song exactly at 1x", () => {
    const song = noise(3);
    const renderer = new SongRenderer({ channels: [song], sampleRate: RATE }, RATE, 0.5, 1);
    const { out } = play(renderer, 2, () => 1);
    for (let i = 0; i < out.length; i += 7) expect(out[i]).toBe(song[0.5 * RATE + i]);
    expect(renderer.stretched).toBe(false);
  });

  it("drops the pitch with the speed when the pitch is not kept", () => {
    const renderer = new SongRenderer(
      { channels: [sine(4, 440)], sampleRate: RATE },
      RATE,
      0,
      0,
    );
    const { out } = play(renderer, 2, () => 0.5);
    expect(frequency(out)).toBeCloseTo(220, -1);
  });

  it("keeps the pitch below the threshold, and always when told to", () => {
    for (const [stretchBelow, rate] of [
      [1, 0.5],
      [Number.POSITIVE_INFINITY, 1.5],
    ]) {
      const renderer = new SongRenderer(
        { channels: [sine(8, 440)], sampleRate: RATE },
        RATE,
        0,
        stretchBelow,
      );
      const { out } = play(renderer, 2, () => rate);
      expect(renderer.stretched).toBe(true);
      expect(frequency(out.subarray(RATE / 10))).toBeCloseTo(440, -1);
    }
  });

  it("switches at the 100% crossing without a dip or a pitch slide", () => {
    const renderer = new SongRenderer(
      { channels: [sine(20, 440)], sampleRate: RATE },
      RATE,
      1,
      1,
    );
    const rateAt = schedule([
      [0, 1],
      [0.5, 0.5],
      [2, 1],
      [3.5, 0.75],
      [5, 1.5],
    ]);
    const { out, rates } = play(renderer, 6.5, rateAt);
    const levels = blockLevels(out);
    const steady = levels[10];
    // Every block holds its level, switches included: no crossfade dip.
    for (let b = 0; b < levels.length; b++) {
      expect(levels[b] / steady).toBeGreaterThan(0.95);
      expect(levels[b] / steady).toBeLessThan(1.05);
    }
    // 440Hz all the way through every slow part and every crossing back up;
    // a 0.2s window counts crossings in 5Hz steps, and a slide would be far
    // further off than this.
    const until = Math.round(5 * RATE);
    for (let at = RATE / 10; at + RATE / 5 <= until; at += RATE / 20) {
      expect(Math.abs(frequency(out.subarray(at, at + RATE / 5)) - 440)).toBeLessThanOrEqual(10);
    }
    // Above 100% the pitch follows the speed again, as without the setting.
    expect(frequency(out.subarray(Math.round(6 * RATE)))).toBeCloseTo(660, -1);
    expect(rates[rates.length - 1]).toBeCloseTo(1.5, 3);
    expect(renderer.stretched).toBe(false);
  });

  it("settles back onto the playback position exactly after a stretch", () => {
    const song = noise(30);
    const renderer = new SongRenderer({ channels: [song], sampleRate: RATE }, RATE, 2, 1);
    // Toggle slow and back many times, then play on at 1x.
    const points: [number, number][] = [[0, 1]];
    for (let k = 0; k < 20; k++) {
      points.push([0.2 + k * 0.5, 0.5], [0.45 + k * 0.5, 1]);
    }
    const { out, refs } = play(renderer, 16, schedule(points));
    expect(renderer.stretched).toBe(false);
    // Long after the last toggle the song plays sample for sample at the
    // model's position: no drift has built up.
    const lastBlock = refs.length - 1;
    const start = Math.round(refs[lastBlock] * RATE);
    const at = lastBlock * BLOCK;
    for (let i = 0; i < BLOCK; i += 5) expect(out[at + i]).toBeCloseTo(song[start + i], 4);
  });

  it("plays exactly where a playback model says, ramps included", () => {
    const song = sine(20, 440);
    const renderer = new SongRenderer({ channels: [song], sampleRate: RATE }, RATE, 1, 1);
    // The transitions useAudio would hand the voice: steady, then a ramp to
    // 0.5 and one back to 1, each starting where the last left off. Context
    // times are never round, and neither is the arithmetic on them.
    const T0 = 7.3123456789;
    const models: RateTransition[] = [{ startCtxTime: T0, startPosition: 1, from: 1, to: 1, duration: 0 }];
    for (const [at, to] of [[0.5, 0.5], [2, 1]] as const) {
      const prev = models[models.length - 1];
      const time = T0 + at;
      models.push({ startCtxTime: time, startPosition: positionAt(prev, time), from: prev.to, to, duration: RAMP_SECONDS });
    }
    const modelAt = (t: number) => [...models].reverse().find((m) => m.startCtxTime <= t)!;
    const out = new Float32Array(Math.round(3.5 * RATE));
    const block = [new Float32Array(BLOCK)];
    for (let at = 0; at + BLOCK <= out.length; at += BLOCK) {
      const t0 = T0 + at / RATE;
      const t1 = T0 + (at + BLOCK) / RATE;
      const model = modelAt(t0);
      const start = positionAt(model, t0);
      const end = positionAt(model, t1);
      renderer.render(block, 0, BLOCK, (end - start) / (BLOCK / RATE), start);
      out.set(block[0], at);
      expect(renderer.position).toBeCloseTo(end, 9);
    }
    const levels = blockLevels(out);
    for (const level of levels) expect(level / levels[10]).toBeGreaterThan(0.95);
    // Back at 1x by the model's own arithmetic, which is never exactly 1.
    expect(renderer.stretched).toBe(false);
  });

  it("absorbs a model change that arrives late, then settles onto it", () => {
    const song = sine(20, 440);
    // Never stretching, so the late change is resampled playback's to absorb.
    const renderer = new SongRenderer({ channels: [song], sampleRate: RATE }, RATE, 2, 0);
    const before: RateTransition = { startCtxTime: 0, startPosition: 2, from: 1, to: 1, duration: 0 };
    const after: RateTransition = { startCtxTime: 1, startPosition: 3, from: 0.8, to: 0.8, duration: 0 };
    // The voice only hears of the change four blocks after it took effect.
    const heardAt = 1 + (4 * BLOCK) / RATE;
    const out = new Float32Array(Math.round(8 * RATE));
    const block = [new Float32Array(BLOCK)];
    for (let at = 0; at + BLOCK <= out.length; at += BLOCK) {
      const t0 = at / RATE;
      const model = t0 >= heardAt ? after : before;
      const start = positionAt(model, t0);
      const end = positionAt(model, (at + BLOCK) / RATE);
      renderer.render(block, 0, BLOCK, (end - start) / (BLOCK / RATE), start);
      out.set(block[0], at);
    }
    // No click where the late change landed: the wave never jumps further
    // than a 440Hz sine can move in one sample.
    const steepest = (2 * Math.PI * 440) / RATE;
    for (let i = 1; i < out.length; i++) {
      expect(Math.abs(out[i] - out[i - 1])).toBeLessThan(steepest * 1.05);
    }
    // Seconds later it plays exactly what the model says.
    for (let i = out.length - 2000; i < out.length; i += 37) {
      const p = positionAt(after, i / RATE) * RATE;
      expect(out[i]).toBeCloseTo(cubicSample(song, p, song.length), 3);
    }
  });

  it("treats a rate a hair off 1x, as the model's arithmetic gives, as 1x", () => {
    const renderer = new SongRenderer({ channels: [sine(6, 440)], sampleRate: RATE }, RATE, 0, 1);
    play(renderer, 1, () => 0.5);
    expect(renderer.stretched).toBe(true);
    play(renderer, 0.5, () => 1 - 1e-12);
    expect(renderer.stretched).toBe(false);
  });
});
