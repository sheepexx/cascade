import type { LoadedFile } from "../types";

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

export type AiModFileFacts = {
  audio: Record<string, AudioFileFacts>;
  backgrounds: Record<string, ImageFileFacts>;
};

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

// Reading a file is keyed on the blob itself, so reopening AiMod on an
// unchanged mapset costs nothing and a replaced file is read afresh.
const audioCache = new WeakMap<Blob, Promise<AudioFileFacts>>();
const imageCache = new WeakMap<Blob, Promise<ImageFileFacts>>();

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
  return {
    audio: Object.fromEntries(audioEntries),
    backgrounds: Object.fromEntries(imageEntries),
  };
}
