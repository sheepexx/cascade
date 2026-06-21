/**
 * Destructive trim helpers used at **export time**.
 *
 * In the editor the trim/fade brackets are a non-destructive *playback region*
 * (see `useAudio`/`BottomTimeline`). When a map is exported to `.osz`, however,
 * the brackets are baked in: the audio is physically cut to the region (with
 * the fade in/out applied), every time value is shifted so the start bracket
 * becomes time 0, and notes outside the region are dropped.
 *
 * Nothing here mutates the in-editor project — every function returns new data.
 */

import type { Difficulty, ManiaNote, TimingPoint } from "../types";

/** A baked trim region, all values in milliseconds. */
export type BakedRegion = {
  startMs: number;
  endMs: number;
  fadeInMs: number;
  fadeOutMs: number;
};

/**
 * Resolve a difficulty's effective trim region against the real audio
 * duration. Returns `null` when there's nothing worth cutting (the region
 * spans the whole song), so the caller can fall back to the verbatim audio.
 */
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

/** Decode an audio blob to an `AudioBuffer`, reusing a shared context. */
export async function decodeAudioBlob(
  blob: Blob,
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
  try {
    const bytes = await blob.arrayBuffer();
    // decodeAudioData may detach the buffer; hand it a private copy.
    return await ctx.decodeAudioData(bytes.slice(0));
  } catch {
    return null;
  }
}

/**
 * Cut an `AudioBuffer` to `[startMs, endMs)` and apply linear fade in/out,
 * returning the trimmed channel data (per-channel `Float32Array`s).
 */
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

/** Encode per-channel float samples to a 16-bit PCM WAV blob. */
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
  writeU32(16); // PCM fmt chunk size
  writeU16(1); // audio format: PCM
  writeU16(numCh);
  writeU32(sampleRate);
  writeU32(sampleRate * blockAlign); // byte rate
  writeU16(blockAlign);
  writeU16(16); // bits per sample
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

/** Slice + fade + encode in one step: produce the trimmed audio as a WAV blob. */
export function renderTrimmedWav(buffer: AudioBuffer, region: BakedRegion): Blob {
  return encodeWav(sliceAndFade(buffer, region), buffer.sampleRate);
}

/** Shift every timing point's time so `shiftMs` becomes the new time 0. */
export function shiftTimingPoints(
  points: TimingPoint[],
  shiftMs: number,
): TimingPoint[] {
  if (shiftMs === 0) return points;
  return points.map((p) => ({ ...p, time: p.time - shiftMs }));
}

/**
 * Bake a trim region into a difficulty's map data:
 *   - drop notes whose start is outside `[startMs, endMs]`
 *   - clamp long-note ends to the region end
 *   - shift every remaining time so `startMs` becomes 0
 *   - shift/clamp preview time and bookmarks
 *   - clear the trim/fade fields (they're now baked into the audio)
 *
 * Returns a new difficulty; the input is untouched.
 */
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
    trimStartMs: undefined,
    trimEndMs: undefined,
    fadeInMs: undefined,
    fadeOutMs: undefined,
  };
}

/**
 * Build a WAV filename for the cut audio derived from the original name,
 * guaranteed not to collide with anything already in `taken`.
 */
export function cutAudioName(originalName: string, taken: Set<string>): string {
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  let name = `${base}_cut.wav`;
  let i = 2;
  while (taken.has(name)) {
    name = `${base}_cut${i}.wav`;
    i++;
  }
  return name;
}
