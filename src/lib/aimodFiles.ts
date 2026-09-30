import type { LoadedFile } from "../types";
import type { SampleFile } from "./mapSamples";

/**
 * Facts about the mapset's audio and background files that AiMod checks need
 * but can only get by reading the files: container format, bitrate, image
 * size. Gathered asynchronously and handed to runAiMod, which stays synchronous.
 */
export type AudioFormat = "mp3" | "ogg" | "wav" | "flac" | "m4a" | "unknown";

export type AudioFileFacts = {
  /** The blob these facts were read from, so a replaced file is never judged by stale facts. */
  blob: Blob;
  bytes: number;
  format: AudioFormat;
  /** Average bitrate in kbps, tags excluded; null when the length couldn't be read. */
  bitrateKbps: number | null;
};

export type ImageFileFacts = {
  blob: Blob;
  bytes: number;
  /** Null when the image couldn't be decoded. */
  width: number | null;
  height: number | null;
};

export type SampleFileFacts = {
  blob: Blob;
  bytes: number;
  /** Decoded length; null when the file couldn't be decoded. */
  durationMs: number | null;
  /** How late the sound lands, for hitsound files; null when not measured. */
  delay: SampleDelay | null;
};

export type AiModFileFacts = {
  audio: Record<string, AudioFileFacts>;
  backgrounds: Record<string, ImageFileFacts>;
  samples: Record<string, SampleFileFacts>;
};

/**
 * osu!lazer's waveform points: one per millisecond, the loudest excursion in
 * it averaged across the channels.
 */
export function millisecondPoints(channels: Float32Array[], sampleRate: number): Float32Array {
  if (!channels.length || !(sampleRate > 0)) return new Float32Array(0);
  const perPoint = sampleRate / 1000;
  const count = Math.ceil(channels[0].length / perPoint);
  const points = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    const from = Math.floor(p * perPoint);
    const to = Math.min(channels[0].length, Math.floor((p + 1) * perPoint));
    let sum = 0;
    for (const channel of channels) {
      let peak = 0;
      for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(channel[i]));
      sum += peak;
    }
    points[p] = sum / channels.length;
  }
  return points;
}

export type SampleDelay = {
  /** Milliseconds of complete silence before the sound starts. */
  silentMs: number;
  /** Milliseconds, silence included, before it reaches its peak. */
  delayMs: number;
};

const SILENCE = 0.001;
const FALLOFF = 0.95;

/**
 * osu!lazer's delayed-hitsound measure, step for step: amplitude builds up
 * millisecond by millisecond, decaying as it goes, until it reaches the
 * sample's peak. Null for a silent sample.
 *
 * Kept exactly as lazer has it, quirks included, so Cascade flags the same
 * files it does: silent milliseconds count toward both totals, which also
 * ends the scan early on a long silence.
 */
export function sampleDelay(points: Float32Array): SampleDelay | null {
  let total = 0;
  let max = 0;
  for (const point of points) {
    total += point;
    if (point > max) max = point;
  }
  if (!points.length || total <= SILENCE) return null;
  let silent = 0;
  let delay = 0;
  let amplitude = 0;
  while (delay + silent < points.length) {
    amplitude += points[delay];
    if (amplitude >= max) break;
    amplitude *= FALLOFF;
    if (amplitude < SILENCE) {
      amplitude = 0;
      silent++;
    }
    delay++;
  }
  return { silentMs: silent, delayMs: delay };
}

/** "normal-hitclap2.wav" and the like: the files osu! plays as hitsounds. */
export function isHitsoundFile(name: string): boolean {
  return /^(normal|soft|drum)-hit(normal|whistle|finish|clap)\d*\.(wav|ogg|mp3)$/i.test(name);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = offset; i < offset + length && i < bytes.length; i++)
    out += String.fromCharCode(bytes[i]);
  return out;
}

/** Identify an audio container from its first bytes, ignoring the file name. */
export function detectAudioFormat(head: Uint8Array): AudioFormat {
  if (ascii(head, 0, 3) === "ID3") return "mp3";
  if (ascii(head, 0, 4) === "OggS") return "ogg";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WAVE") return "wav";
  if (ascii(head, 0, 4) === "fLaC") return "flac";
  if (ascii(head, 4, 4) === "ftyp") return "m4a";
  // A bare MPEG audio frame: 11 sync bits, then a layer that isn't "reserved".
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && (head[1] & 0x06) !== 0)
    return "mp3";
  return "unknown";
}

/**
 * Bytes of an MP3's leading ID3v2 tag, header and footer included. Cover art
 * lives there, and counting it would inflate the bitrate of an otherwise
 * ordinary file.
 */
export function id3v2TagBytes(head: Uint8Array): number {
  if (head.length < 10 || ascii(head, 0, 3) !== "ID3") return 0;
  // The size is "syncsafe": four bytes of seven bits each.
  for (let i = 6; i < 10; i++) if (head[i] & 0x80) return 0;
  const size = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
  const hasFooter = (head[5] & 0x10) !== 0;
  return 10 + size + (hasFooter ? 10 : 0);
}

/** Average bitrate in kbps over the audio data alone. */
export function averageBitrateKbps(audioBytes: number, durationSec: number): number | null {
  if (!(durationSec > 0) || !(audioBytes > 0)) return null;
  return Math.round((audioBytes * 8) / durationSec / 1000);
}

async function readSlice(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

const METADATA_TIMEOUT_MS = 8000;

/** Length of an audio file from its metadata, without decoding the whole song. */
function audioDurationSec(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = new Audio();
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), METADATA_TIMEOUT_MS);
    el.preload = "metadata";
    el.addEventListener("loadedmetadata", () =>
      finish(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null),
    );
    el.addEventListener("error", () => finish(null));
    el.src = url;
  });
}

async function readAudioFacts(blob: Blob): Promise<AudioFileFacts> {
  const bytes = blob.size;
  if (bytes === 0) return { blob, bytes, format: "unknown", bitrateKbps: null };
  const head = await readSlice(blob, 0, 16);
  const format = detectAudioFormat(head);
  let audioBytes = bytes;
  if (format === "mp3") {
    audioBytes -= Math.min(id3v2TagBytes(head), bytes);
    // An ID3v1 tag is the last 128 bytes, starting "TAG".
    if (bytes >= 128 && ascii(await readSlice(blob, bytes - 128, bytes - 125), 0, 3) === "TAG")
      audioBytes -= 128;
  }
  // Bitrate only means something for the lossy formats the criteria allow.
  const lossy = format === "mp3" || format === "ogg";
  const bitrateKbps = lossy ? averageBitrateKbps(audioBytes, (await audioDurationSec(blob)) ?? 0) : null;
  return { blob, bytes, format, bitrateKbps };
}

async function readImageFacts(blob: Blob): Promise<ImageFileFacts> {
  if (blob.size === 0) return { blob, bytes: 0, width: null, height: null };
  try {
    const bitmap = await createImageBitmap(blob);
    const facts = { blob, bytes: blob.size, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return facts;
  } catch {
    return { blob, bytes: blob.size, width: null, height: null };
  }
}

async function readSampleFacts(blob: Blob, name: string): Promise<SampleFileFacts> {
  if (blob.size === 0) return { blob, bytes: 0, durationMs: null, delay: null };
  try {
    const context = new OfflineAudioContext(1, 1, 44100);
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    return {
      blob,
      bytes: blob.size,
      durationMs: decoded.duration * 1000,
      delay: isHitsoundFile(name) ? sampleDelay(millisecondPoints(channels, decoded.sampleRate)) : null,
    };
  } catch {
    return { blob, bytes: blob.size, durationMs: null, delay: null };
  }
}

// Reading a file is keyed on the blob itself, so reopening AiMod on an
// unchanged mapset costs nothing and a replaced file is read afresh.
const audioCache = new WeakMap<Blob, Promise<AudioFileFacts>>();
const imageCache = new WeakMap<Blob, Promise<ImageFileFacts>>();
const sampleCache = new WeakMap<Blob, Promise<SampleFileFacts>>();

function cached<T>(cache: WeakMap<Blob, Promise<T>>, blob: Blob, read: (b: Blob) => Promise<T>): Promise<T> {
  let pending = cache.get(blob);
  if (!pending) {
    pending = read(blob);
    cache.set(blob, pending);
  }
  return pending;
}

export async function collectAiModFileFacts(
  audioFiles: Record<string, LoadedFile>,
  bgFiles: Record<string, LoadedFile>,
  sampleFiles: Record<string, SampleFile> = {},
): Promise<AiModFileFacts> {
  const audioEntries = await Promise.all(
    Object.entries(audioFiles).map(
      async ([name, file]) => [name, await cached(audioCache, file.blob, readAudioFacts)] as const,
    ),
  );
  const imageEntries = await Promise.all(
    Object.entries(bgFiles).map(
      async ([name, file]) => [name, await cached(imageCache, file.blob, readImageFacts)] as const,
    ),
  );
  const sampleEntries = await Promise.all(
    Object.entries(sampleFiles).map(
      async ([name, file]) =>
        [name, await cached(sampleCache, file.blob, (blob) => readSampleFacts(blob, file.name))] as const,
    ),
  );
  return {
    audio: Object.fromEntries(audioEntries),
    backgrounds: Object.fromEntries(imageEntries),
    samples: Object.fromEntries(sampleEntries),
  };
}
