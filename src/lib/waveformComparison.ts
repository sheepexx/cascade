import type { TimingPoint } from "../types";
import { beatLength, redPoints } from "./timing";

/**
 * The beats osu!lazer's waveform comparison lines up: one row per beat around
 * the playhead, each centred on where its red line says the beat falls. With
 * the timing right, the song's hits stack in a column on the centre line.
 */
export type ComparisonRow = {
  /** Beat index from the red line, 0 on the line itself. */
  beat: number;
  /** Map time the row is centred on, ms. */
  time: number;
  downbeat: boolean;
  /** "bar.beat", counted from 1. */
  label: string;
};

export type ComparisonLayout = {
  red: TimingPoint;
  beatMs: number;
  rows: ComparisonRow[];
};

export function comparisonRows(
  points: TimingPoint[],
  nowMs: number,
  before: number,
  after: number,
): ComparisonLayout | null {
  const reds = redPoints(points).filter((p) => Number.isFinite(p.bpm) && p.bpm > 0);
  if (!reds.length) return null;
  let index = 0;
  for (let i = 0; i < reds.length; i++) if (reds[i].time <= nowMs) index = i;
  const red = reds[index];
  const nextRed = reds[index + 1]?.time ?? Infinity;
  const beatMs = beatLength(red.bpm);
  const meter = Math.max(1, Math.round(red.meter || 4));
  const current = Math.max(0, Math.floor((nowMs - red.time) / beatMs));
  const rows: ComparisonRow[] = [];
  for (let beat = Math.max(0, current - before); beat <= current + after; beat++) {
    const time = red.time + beat * beatMs;
    if (time >= nextRed) break;
    rows.push({
      beat,
      time,
      downbeat: beat % meter === 0,
      label: `${Math.floor(beat / meter) + 1}.${(beat % meter) + 1}`,
    });
  }
  return { red, beatMs, rows };
}

/**
 * Loudest excursion per pixel across a window of the song, channels mixed:
 * `width` pairs of [min, max], each in -1..1. Time outside the song is silent.
 */
export function windowPeaks(
  channels: Float32Array[],
  sampleRate: number,
  startSec: number,
  endSec: number,
  width: number,
): Float32Array {
  const out = new Float32Array(Math.max(0, width) * 2);
  if (!channels.length || width <= 0 || !(endSec > startSec)) return out;
  const length = channels[0].length;
  const perPixel = ((endSec - startSec) * sampleRate) / width;
  for (let x = 0; x < width; x++) {
    const from = Math.floor(startSec * sampleRate + x * perPixel);
    const to = Math.max(from + 1, Math.floor(startSec * sampleRate + (x + 1) * perPixel));
    let min = 0;
    let max = 0;
    for (let i = Math.max(0, from); i < Math.min(length, to); i++) {
      let sum = 0;
      for (const channel of channels) sum += channel[i];
      const value = sum / channels.length;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    out[x * 2] = min;
    out[x * 2 + 1] = max;
  }
  return out;
}
