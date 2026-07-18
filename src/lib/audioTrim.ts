import { getMp3Encoder } from "./lameEncoder";
import type { Difficulty, ManiaNote, TimingPoint } from "../types";

export type BakedRegion = {
  startMs: number;
  endMs: number;
  fadeInMs: number;
  fadeOutMs: number;
};

export function effectiveRegion(
  difficulty: Difficulty,
  durationMs: number,
): BakedRegion | null {
  const start = Math.max(0, difficulty.trimStartMs ?? 0);
  const end = Math.min(
    durationMs,
    difficulty.trimEndMs ?? durationMs,
  );
  const trimmed = start > 0.5 || end < durationMs - 0.5;
  if (!trimmed || end - start < 1) return null;
  return {
    startMs: start,
    endMs: end,
    fadeInMs: Math.max(0, difficulty.fadeInMs ?? 0),
    fadeOutMs: Math.max(0, difficulty.fadeOutMs ?? 0),
  };
}

export async function decodeAudioBlob(
  blob: Blob,
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
  try {
    const bytes = await blob.arrayBuffer();
    return await ctx.decodeAudioData(bytes.slice(0));
  } catch {
    return null;
  }
}

function sliceAndFade(buffer: AudioBuffer, region: BakedRegion): Float32Array[] {
  const sr = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor((region.startMs / 1000) * sr));
  const endSample = Math.min(buffer.length, Math.floor((region.endMs / 1000) * sr));
  const length = Math.max(0, endSample - startSample);

  const fadeIn = Math.min(length, Math.floor((region.fadeInMs / 1000) * sr));
  const fadeOut = Math.min(length, Math.floor((region.fadeOutMs / 1000) * sr));

  const channels: Float32Array[] = [];
  const chCount = Math.max(1, buffer.numberOfChannels);
  for (let ch = 0; ch < chCount; ch++) {
    const src = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      let s = src[startSample + i];
      if (fadeIn > 0 && i < fadeIn) s *= i / fadeIn;
      if (fadeOut > 0 && i >= length - fadeOut) s *= (length - 1 - i) / fadeOut;
      out[i] = s;
    }
    channels.push(out);
  }
  return channels;
}

function floatToInt16(channels: Float32Array[]): Int16Array[] {
  return channels.map((ch) => {
    const out = new Int16Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      let s = ch[i];
      s = s < -1 ? -1 : s > 1 ? 1 : s;
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  });
}

function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const numCh = Math.max(1, channels.length);
  const numFrames = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = numFrames * blockAlign;

  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  let p = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i));
  };
  const writeU32 = (v: number) => {
    view.setUint32(p, v, true);
    p += 4;
  };
  const writeU16 = (v: number) => {
    view.setUint16(p, v, true);
    p += 2;
  };

  writeStr("RIFF");
  writeU32(36 + dataSize);
  writeStr("WAVE");
  writeStr("fmt ");
  writeU32(16);
  writeU16(1);
  writeU16(numCh);
  writeU32(sampleRate);
  writeU32(sampleRate * blockAlign);
  writeU16(blockAlign);
  writeU16(16);
  writeStr("data");
  writeU32(dataSize);

  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      let s = channels[ch][i];
      s = s < -1 ? -1 : s > 1 ? 1 : s;
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      p += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

function tryEncodeMp3(channels: Float32Array[], sampleRate: number): Blob | null {
  const numCh = Math.max(1, channels.length);
  const numFrames = channels[0]?.length ?? 0;
  if (numFrames === 0) return null;

  const intChannels = floatToInt16(channels);
  const Mp3Encoder = getMp3Encoder();
  const encoder = new Mp3Encoder(numCh, sampleRate, 128);
  const maxSamples = 1152;
  const mp3Data: Int8Array[] = [];

  for (let i = 0; i < numFrames; i += maxSamples) {
    const end = Math.min(i + maxSamples, numFrames);
    const chunk = intChannels[0].subarray(i, end);
    let mp3buf: Int8Array;
    if (numCh === 1) {
      mp3buf = encoder.encodeBuffer(chunk);
    } else {
      const right = intChannels[1].subarray(i, end);
      mp3buf = encoder.encodeBuffer(chunk, right);
    }
    if (mp3buf.length > 0) mp3Data.push(mp3buf);
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) mp3Data.push(flushed);

  return new Blob(mp3Data as BlobPart[], { type: "audio/mpeg" });
}

function resampleChannels(
  data: Float32Array[],
  fromRate: number,
  toRate: number,
): Float32Array[] {
  if (fromRate === toRate) return data;
  const ratio = fromRate / toRate;
  const numFrames = data[0]?.length ?? 0;
  const newLength = Math.max(1, Math.round(numFrames / ratio));
  return data.map((ch) => {
    const out = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIdx = i * ratio;
      const lo = Math.min(Math.floor(srcIdx), numFrames - 1);
      const hi = Math.min(lo + 1, numFrames - 1);
      const frac = srcIdx - lo;
      out[i] = ch[lo] * (1 - frac) + ch[hi] * frac;
    }
    return out;
  });
}

function encodeBest(channels: Float32Array[], sampleRate: number): EncodedAudio {
  const tryAt = (rate: number): Blob | null => {
    try {
      if (rate === sampleRate) return tryEncodeMp3(channels, rate);
      return tryEncodeMp3(resampleChannels(channels, sampleRate, rate), rate);
    } catch (err) {
      console.error(`MP3 encode failed @ ${rate} Hz:`, err);
      return null;
    }
  };

  const mp3 = tryAt(sampleRate) ?? (sampleRate !== 44100 ? tryAt(44100) : null);
  if (mp3) return { blob: mp3, ext: "mp3" };

  return { blob: encodeWav(channels, sampleRate), ext: "wav" };
}

export type EncodedAudio = {
  blob: Blob;
  ext: "mp3" | "wav";
};

export function renderTrimmedAudio(buffer: AudioBuffer, region: BakedRegion): EncodedAudio {
  return encodeBest(sliceAndFade(buffer, region), buffer.sampleRate);
}

function bufferChannels(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }
  return channels;
}

export function convertAudio(buffer: AudioBuffer): EncodedAudio {
  return encodeBest(bufferChannels(buffer), buffer.sampleRate);
}

/**
 * Resamples so the audio plays `rate` times faster while keeping the original
 * sample rate — the same speed-and-pitch shift the editor applies live, baked
 * in so exported maps stay in sync outside Cascade.
 */
function resampleForRate(
  channels: Float32Array[],
  sampleRate: number,
  rate: number,
): Float32Array[] {
  if (Math.abs(rate - 1) < 1e-6) return channels;
  return resampleChannels(channels, sampleRate, sampleRate / rate);
}

/**
 * WSOLA time stretch: changes duration by `rate` while keeping pitch, by
 * overlap-adding windowed grains and nudging each grain to wherever it best
 * correlates with the previous one (which is what stops the phasiness plain
 * OLA produces).
 */
function timeStretch(
  channels: Float32Array[],
  sampleRate: number,
  rate: number,
): Float32Array[] {
  if (Math.abs(rate - 1) < 1e-6) return channels;

  const frame = Math.max(256, Math.round(sampleRate * 0.046)); // ~46ms grains
  const synthesisHop = Math.floor(frame / 4);
  const analysisHop = synthesisHop * rate;
  const search = Math.min(Math.floor(synthesisHop / 2), Math.floor(sampleRate * 0.005));

  const inLength = channels[0]?.length ?? 0;
  if (inLength < frame * 2) return resampleForRate(channels, sampleRate, rate);
  const outLength = Math.max(1, Math.round(inLength / rate));

  const window = new Float32Array(frame);
  for (let i = 0; i < frame; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1));
  }

  // Correlation is measured on channel 0 and the same offset applied to all,
  // so the stereo image stays intact.
  const guide = channels[0];
  const outputs = channels.map(() => new Float32Array(outLength));
  const overlap = new Float32Array(outLength);
  const tail = new Float32Array(synthesisHop);

  let analysis = 0;
  for (let out = 0; out + frame <= outLength; out += synthesisHop) {
    let offset = 0;
    if (out > 0 && search > 0) {
      let best = -Infinity;
      for (let delta = -search; delta <= search; delta++) {
        const start = Math.round(analysis) + delta;
        if (start < 0 || start + synthesisHop > inLength) continue;
        let corr = 0;
        for (let i = 0; i < synthesisHop; i += 2) corr += guide[start + i] * tail[i];
        if (corr > best) {
          best = corr;
          offset = delta;
        }
      }
    }

    const start = Math.max(0, Math.min(inLength - frame, Math.round(analysis) + offset));
    for (let ch = 0; ch < channels.length; ch++) {
      const src = channels[ch];
      const dst = outputs[ch];
      for (let i = 0; i < frame; i++) dst[out + i] += src[start + i] * window[i];
    }
    for (let i = 0; i < frame; i++) overlap[out + i] += window[i];
    for (let i = 0; i < synthesisHop; i++) {
      tail[i] = guide[Math.min(inLength - 1, start + synthesisHop + i)];
    }

    analysis += analysisHop;
  }

  // Hann windows at a quarter-frame hop sum to ~2 in steady state. Flooring the
  // divisor at 1 leaves the head and tail as a natural one-frame fade instead
  // of dividing by ~0 and firing off a spike.
  for (const dst of outputs) {
    for (let i = 0; i < outLength; i++) dst[i] /= Math.max(overlap[i], 1);
  }

  // Grains that don't line up perfectly cancel a little, so the stretch lands
  // roughly 2dB below the source. Deliberately not gain-matched: WSOLA also
  // produces occasional over-unity peaks, and scaling to fit those under 0dB
  // costs far more level than the cancellation does. Encoding clamps them.
  return outputs;
}

/** Trim (optional) then rate-shift, in that order — regions are in audio time. */
export function renderRatedAudio(
  buffer: AudioBuffer,
  rate: number,
  region: BakedRegion | null,
  preservePitch = false,
): EncodedAudio {
  const channels = region ? sliceAndFade(buffer, region) : bufferChannels(buffer);
  const shifted = preservePitch
    ? timeStretch(channels, buffer.sampleRate, rate)
    : resampleForRate(channels, buffer.sampleRate, rate);
  return encodeBest(shifted, buffer.sampleRate);
}

/** Converts a map-time region into the audio-time one used for slicing. */
export function regionToAudioTime(region: BakedRegion, rate: number): BakedRegion {
  if (rate === 1) return region;
  return {
    startMs: region.startMs * rate,
    endMs: region.endMs * rate,
    fadeInMs: region.fadeInMs * rate,
    fadeOutMs: region.fadeOutMs * rate,
  };
}

export function shiftTimingPoints(
  points: TimingPoint[],
  shiftMs: number,
): TimingPoint[] {
  if (shiftMs === 0) return points;
  return points.map((p) => ({ ...p, time: p.time - shiftMs }));
}

export function cutDifficulty(
  difficulty: Difficulty,
  startMs: number,
  endMs: number,
): Difficulty {
  const notes: ManiaNote[] = [];
  for (const n of difficulty.notes) {
    if (n.startTime < startMs - 0.5 || n.startTime > endMs + 0.5) continue;
    const startTime = n.startTime - startMs;
    let endTime: number | undefined = n.endTime;
    if (endTime !== undefined) {
      const clamped = Math.min(endTime, endMs) - startMs;
      endTime = clamped > startTime ? clamped : undefined;
    }
    notes.push({ ...n, startTime, endTime });
  }

  const previewTime =
    difficulty.previewTime >= startMs && difficulty.previewTime <= endMs
      ? difficulty.previewTime - startMs
      : -1;

  const bookmarks = difficulty.bookmarks
    ?.filter((b) => b >= startMs && b <= endMs)
    .map((b) => b - startMs);

  return {
    ...difficulty,
    notes,
    previewTime,
    bookmarks: bookmarks && bookmarks.length ? bookmarks : undefined,
    videoOffsetMs:
      difficulty.videoFilename !== undefined
        ? (difficulty.videoOffsetMs ?? 0) - startMs
        : difficulty.videoOffsetMs,
    trimStartMs: undefined,
    trimEndMs: undefined,
    fadeInMs: undefined,
    fadeOutMs: undefined,
  };
}

export function cutAudioName(originalName: string, taken: Set<string>, ext: string): string {
  return bakedAudioName(originalName, taken, ext, "cut");
}

export function bakedAudioName(
  originalName: string,
  taken: Set<string>,
  ext: string,
  suffix: string,
): string {
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  let name = `${base}_${suffix}.${ext}`;
  let i = 2;
  while (taken.has(name)) {
    name = `${base}_${suffix}${i}.${ext}`;
    i++;
  }
  return name;
}

export function isWav(name: string): boolean {
  return /\.wav$/i.test(name);
}

export function toMp3Name(name: string): string {
  return name.replace(/\.wav$/i, ".mp3");
}
