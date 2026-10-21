import { describe, expect, it } from "vitest";
import { LiveTimeStretch, type StretchSong } from "./liveTimeStretch";

// A low rate keeps these quick; the algorithm only ever sees sample counts.
const RATE = 8000;
const BLOCK = 128;

function noise(seconds: number, seed = 1): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  let s = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  return out;
}

function sine(seconds: number, hz: number, rate = RATE): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

function render(
  stretch: LiveTimeStretch,
  seconds: number,
  rate: number | ((block: number) => number),
  channels = 1,
  outputRate = RATE,
): Float32Array[] {
  const total = Math.round(seconds * outputRate);
  const out = Array.from({ length: channels }, () => new Float32Array(total));
  const block = Array.from({ length: channels }, () => new Float32Array(BLOCK));
  for (let at = 0, n = 0; at < total; at += BLOCK, n++) {
    const len = Math.min(BLOCK, total - at);
    stretch.render(block, 0, len, typeof rate === "number" ? rate : rate(n));
    for (let ch = 0; ch < channels; ch++) out[ch].set(block[ch].subarray(0, len), at);
  }
  return out;
}

function frequency(signal: Float32Array, rate: number): number {
  let crossings = 0;
  for (let i = 1; i < signal.length; i++) {
    if (signal[i - 1] < 0 && signal[i] >= 0) crossings++;
  }
  return (crossings * rate) / signal.length;
}

/** Song seconds the output around `at` was taken from, relative to `expected`. */
function offsetFrom(
  output: Float32Array,
  song: Float32Array,
  at: number,
  expected: number,
): number {
  const width = Math.round(0.02 * RATE);
  const reach = Math.round(0.02 * RATE);
  const o = Math.round(at * RATE) - width / 2;
  const e = Math.round(expected * RATE) - width / 2;
  let best = 0;
  let bestScore = -Infinity;
  for (let d = -reach; d <= reach; d++) {
    let dot = 0;
    let energy = 0;
    for (let i = 0; i < width; i++) {
      const x = song[e + d + i] ?? 0;
      dot += output[o + i] * x;
      energy += x * x;
    }
    const score = energy > 0 ? dot / Math.sqrt(energy) : -Infinity;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best / RATE;
}

describe("LiveTimeStretch", () => {
  it("plays the song back untouched at 1x", () => {
    const data = noise(4);
    const stretch = new LiveTimeStretch({ channels: [data], sampleRate: RATE }, RATE, 0.5);
    const [out] = render(stretch, 2, 1);
    const start = 0.5 * RATE;
    let worst = 0;
    for (let i = 0; i < out.length; i++) {
      worst = Math.max(worst, Math.abs(out[i] - data[start + i]));
    }
    expect(worst).toBeLessThan(1e-5);
  });

  it("keeps the pitch while slowing down", () => {
    for (const rate of [0.5, 0.75]) {
      const stretch = new LiveTimeStretch(
        { channels: [sine(6, 440)], sampleRate: RATE },
        RATE,
        0.2,
      );
      const [out] = render(stretch, 4, rate);
      // Skip the first frame, which still holds a partial overlap.
      expect(frequency(out.subarray(RATE / 10), RATE)).toBeCloseTo(440, -1);
    }
  });

  it("keeps the pitch when the song's sample rate differs from the output", () => {
    const stretch = new LiveTimeStretch(
      { channels: [sine(6, 440, RATE)], sampleRate: RATE },
      RATE * 2,
      0.2,
    );
    const [out] = render(stretch, 3, 0.75, 1, RATE * 2);
    expect(frequency(out.subarray(RATE / 5), RATE * 2)).toBeCloseTo(440, -1);
    expect(stretch.position).toBeCloseTo(0.2 + 3 * 0.75, 6);
  });

  it("stays on the playback position instead of drifting away from it", () => {
    const data = noise(40);
    for (const rate of [0.5, 0.75]) {
      const start = 2;
      const stretch = new LiveTimeStretch({ channels: [data], sampleRate: RATE }, RATE, start);
      const [out] = render(stretch, 40, rate);
      const offsets: number[] = [];
      for (let at = 1; at < 39; at += 0.5) {
        const expected = start + at * rate;
        if (expected > 39) break;
        offsets.push(offsetFrom(out, data, at, expected));
      }
      const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
      // Within a sequence's reach of the playhead at every probe (half a 30ms
      // sequence of drift at this rate, plus half the 14ms seek window), never
      // trending either way, all the way to the end.
      const reach = 0.015 * (1 - rate) + 0.007 + 0.001;
      expect(Math.max(...offsets.map(Math.abs))).toBeLessThanOrEqual(reach);
      expect(Math.abs(mean)).toBeLessThan(0.002);
      expect(Math.abs(offsets[offsets.length - 1])).toBeLessThanOrEqual(reach);
    }
  });

  it("follows rate changes between blocks", () => {
    const stretch = new LiveTimeStretch({ channels: [noise(10)], sampleRate: RATE }, RATE, 1);
    const blocksPerSecond = RATE / BLOCK;
    render(stretch, 2, (block) => (block < blocksPerSecond ? 0.5 : 0.8));
    const firstSecond = (Math.ceil(blocksPerSecond) * BLOCK) / RATE;
    expect(stretch.position).toBeCloseTo(
      1 + firstSecond * 0.5 + (2 - firstSecond) * 0.8,
      6,
    );
  });

  it("applies the same sequences to every channel and fills extra outputs", () => {
    const left = noise(3, 1);
    const right = noise(3, 2);
    const song: StretchSong = { channels: [left, right], sampleRate: RATE };
    const stretch = new LiveTimeStretch(song, RATE, 0.25);
    const [l, r, extra] = render(stretch, 1, 1, 3);
    for (let i = 0; i < l.length; i += 97) {
      expect(l[i]).toBeCloseTo(left[0.25 * RATE + i], 4);
      expect(r[i]).toBeCloseTo(right[0.25 * RATE + i], 4);
      expect(extra[i]).toBe(r[i]);
    }
  });

  it("ends at the end of the song and goes quiet after it", () => {
    const stretch = new LiveTimeStretch({ channels: [noise(1)], sampleRate: RATE }, RATE, 0.5);
    const [out] = render(stretch, 2, 0.75);
    expect(stretch.ended).toBe(true);
    const tail = out.subarray(Math.round(1.5 * RATE));
    expect(Math.max(...tail.map(Math.abs))).toBe(0);
  });
});
