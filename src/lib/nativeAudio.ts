import { isDesktopApp } from "./pwa";

export type NativeAudioStatus = { session: number; revision: number; positionMs: number; playing: boolean; latencyMs: number; device: string; error: string | null };
export type NativeControl = { action: "play" | "pause" | "seek" | "configure"; revision: number; positionMs?: number; rate?: number; volume?: number; startMs?: number; endMs?: number; fadeInMs?: number; fadeOutMs?: number; looping?: boolean };
export const supportsExclusiveAudio = () => isDesktopApp() && /Win/i.test(navigator.platform);
export const readExclusivePreference = () => { try { return supportsExclusiveAudio() && localStorage.getItem("cascade.audio.exclusive") === "true"; } catch { return false; } };
let sessionCounter = Math.floor(Date.now() / 1000) >>> 0;
export const newNativeSession = () => ++sessionCounter;
let activeSession: number | null = null;
export function setNativeEffectSession(session: number | null, previous?: number) {
  if (previous === undefined || activeSession === previous) activeSession = session;
}
export async function nativeInvoke<T>(command: string, args: Record<string, unknown> | Uint8Array): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}
// Serialize device acquisition/release, including transitions into calibration.
let lifecycle: Promise<unknown> = Promise.resolve();
export function nativeLifecycle<T>(action: () => Promise<T>): Promise<T> {
  const next = lifecycle.then(action, action); lifecycle = next.catch(() => {}); return next;
}

export function encodeNativePcm(buffer: AudioBuffer, session: number, volume = 1): Uint8Array {
  if (buffer.length * 8 + 16 > 256 * 1024 * 1024) throw new Error("Audio is too large for exclusive playback (256 MiB decoded limit). Use shared audio for this track.");
  const bytes = new Uint8Array(16 + buffer.length * 8);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, session, true); header.setUint32(4, buffer.sampleRate, true);
  header.setUint32(8, buffer.length, true); header.setFloat32(12, volume, true);
  const samples = new Float32Array(bytes.buffer, 16);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1));
  for (let i = 0; i < buffer.length; i++) { samples[i * 2] = left[i]; samples[i * 2 + 1] = right[i]; }
  return bytes;
}
const effectCache = new WeakMap<AudioBuffer, Uint8Array>();
/** Returns true when the native mixer owns output, including during failures so
 * a single sound cannot unexpectedly also play through the shared endpoint. */
export function playNativeEffect(buffer: AudioBuffer, volume: number): boolean {
  if (activeSession === null) return false;
  if (!(volume > 0)) return true;
  let encoded = effectCache.get(buffer);
  if (!encoded) { encoded = encodeNativePcm(buffer, activeSession); effectCache.set(buffer, encoded); }
  const bytes = encoded.slice(), header = new DataView(bytes.buffer);
  header.setUint32(0, activeSession, true); header.setFloat32(12, volume, true);
  void nativeInvoke("native_audio_effect", bytes).catch(() => {});
  return true;
}

let clickBuffers: AudioBuffer[] | null = null;
export function playNativeClick(accent: boolean): boolean {
  if (activeSession === null) return false;
  if (!clickBuffers) clickBuffers = [1100, 1760].map(frequency => {
    const buffer = new AudioBuffer({ length: 2880, sampleRate: 48000, numberOfChannels: 1 });
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(2 * Math.PI * frequency * i / 48000) * Math.exp(-i / 400);
    return buffer;
  });
  return playNativeEffect(clickBuffers[accent ? 1 : 0], accent ? 0.35 : 0.22);
}
