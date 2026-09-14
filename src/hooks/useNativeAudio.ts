import { useCallback, useEffect, useRef, useState } from "react";
import { encodeNativePcm, nativeInvoke, nativeLifecycle, newNativeSession, setNativeEffectSession, type NativeAudioStatus, type NativeControl } from "../lib/nativeAudio";
import type { AudioRegion } from "./useAudio";
import type { AudioSeekSignal, AudioSeekTransition } from "../lib/audioSeek";
import { createSeekVisualClock } from "../lib/seekVisualClock";

// Matches the shared engine's clock readout, so playback time on screen moves
// at the same pace in both modes.
const STATUS_UI_INTERVAL_MS = 100;

export function useNativeAudio(options: { enabled: boolean; buffer: AudioBuffer | null; region?: AudioRegion | null; timeScale: number; rate: number; volume: number; initialPositionMs: number }) {
  const opts = useRef(options); opts.current = options;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<NativeAudioStatus | null>(null);
  // Position is read from `state` below, so the device poll only needs React
  // when something on screen changes. A fresh object every 30 ms re-rendered
  // the whole app, even while paused.
  const shown = useRef<{ status: NativeAudioStatus | null; at: number }>({ status: null, at: 0 });
  const showStatus = useCallback((next: NativeAudioStatus | null) => { shown.current = { status: next, at: performance.now() }; setStatus(next); }, []);
  const [seekSignal, setSeekSignal] = useState<AudioSeekSignal>({ revision: 0, transition: "instant", targetTime: 0 });
  const state = useRef({ session: 0, revision: 0, playing: false, position: 0, at: performance.now(), ready: false, pendingPlay: false });
  const visual = useRef(createSeekVisualClock());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const fail = useCallback((reason: unknown) => {
    state.current.playing = false; state.current.ready = false;
    setReady(false); setError(String(reason));
    const session = state.current.session;
    setNativeEffectSession(null, session);
    void nativeLifecycle(() => nativeInvoke("native_audio_close", { session })).catch(() => {});
  }, []);
  const getCurrentTime = useCallback(() => {
    const s = state.current, o = opts.current;
    const elapsed = s.playing ? Math.max(0, performance.now() - s.at) * o.rate * o.timeScale : 0;
    let position = s.position + elapsed;
    const end = Math.min((o.buffer?.duration ?? 0) * 1000, (o.region?.endMs ?? Infinity) * o.timeScale);
    const start = (o.region?.startMs ?? 0) * o.timeScale;
    if (o.region?.loop && end > start && position >= end) position = start + (position - start) % (end - start);
    return Math.min(end, Math.max(0, position)) / o.timeScale;
  }, []);
  const command = useCallback((control: Omit<NativeControl, "revision">) => {
    const s = state.current;
    if (!s.ready) return;
    const session = s.session, revision = ++s.revision;
    queue.current = queue.current.then(() => nativeInvoke("native_audio_control", { session, control: { ...control, revision } })).catch(reason => { if (session === state.current.session) fail(reason); });
  }, [fail]);
  useEffect(() => {
    setError(""); setReady(false); showStatus(null); state.current.ready = false;
    state.current.playing = false; state.current.pendingPlay = false; visual.current.cancel();
    if (!options.enabled || !options.buffer) return;
    const session = newNativeSession(); state.current.session = session;
    const sessionState = state.current;
    state.current.revision = 0; state.current.position = opts.current.initialPositionMs;
    let cancelled = false, timer = 0;
    const poll = async () => {
      const requestedAt = performance.now();
      try {
        const next = await nativeInvoke<NativeAudioStatus>("native_audio_status", { session });
        if (cancelled) return;
        if (next.error) { fail(next.error); return; }
        if (next.revision >= state.current.revision) {
          state.current.position = next.positionMs; state.current.at = (requestedAt + performance.now()) / 2;
          state.current.playing = next.playing;
          const last = shown.current, was = last.status;
          const changed = !was || was.playing !== next.playing || was.latencyMs !== next.latencyMs || was.device !== next.device;
          if (changed || (next.playing && performance.now() - last.at >= STATUS_UI_INTERVAL_MS)) showStatus(next);
        }
      } catch (reason) { if (!cancelled) fail(reason); return; }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 30);
    };
    void nativeLifecycle(async () => {
      if (cancelled) return;
      const pcm = encodeNativePcm(options.buffer!, session);
      const next = await nativeInvoke<NativeAudioStatus>("native_audio_load", pcm);
      if (cancelled) { await nativeInvoke("native_audio_close", { session }); return; }
      state.current.ready = true; setReady(true); showStatus(next); setNativeEffectSession(session);
      const o = opts.current;
      command({ action: state.current.pendingPlay ? "play" : "seek", positionMs: state.current.position,
        rate: o.rate * o.timeScale, volume: o.volume, startMs: (o.region?.startMs ?? 0) * o.timeScale,
        endMs: (o.region?.endMs ?? o.buffer!.duration * 1000 / o.timeScale) * o.timeScale,
        fadeInMs: (o.region?.fadeInMs ?? 0) * o.timeScale, fadeOutMs: (o.region?.fadeOutMs ?? 0) * o.timeScale, looping: o.region?.loop ?? false });
      void poll();
    }).catch(reason => { if (!cancelled) fail(reason); });
    return () => {
      cancelled = true; clearTimeout(timer); sessionState.playing = false; sessionState.ready = false;
      setNativeEffectSession(null, session);
      void nativeLifecycle(() => nativeInvoke("native_audio_close", { session })).catch(() => {});
    };
  }, [options.enabled, options.buffer, command, fail, showStatus]);
  const { rate, volume, timeScale, region } = options;
  const startMs = region?.startMs ?? 0, endMs = region?.endMs ?? (options.buffer?.duration ?? 0) * 1000 / timeScale;
  const fadeInMs = region?.fadeInMs ?? 0, fadeOutMs = region?.fadeOutMs ?? 0, looping = region?.loop ?? false;
  useEffect(() => { command({ action: "configure", volume }); }, [volume, command]);
  useEffect(() => {
    state.current.position = getCurrentTime() * timeScale; state.current.at = performance.now();
    command({ action: "configure", rate: rate * timeScale, startMs: startMs * timeScale, endMs: endMs * timeScale, fadeInMs: fadeInMs * timeScale, fadeOutMs: fadeOutMs * timeScale, looping });
  }, [rate, timeScale, startMs, endMs, fadeInMs, fadeOutMs, looping, command, getCurrentTime]);
  const pause = useCallback(() => {
    state.current.position = getCurrentTime() * opts.current.timeScale; state.current.at = performance.now();
    state.current.playing = false; state.current.pendingPlay = false; visual.current.cancel();
    command({ action: "pause" }); if (shown.current.status) showStatus({ ...shown.current.status, playing: false });
  }, [command, getCurrentTime, showStatus]);
  const play = useCallback(() => {
    if (!state.current.ready) { state.current.pendingPlay = true; return; }
    state.current.at = performance.now();
    command({ action: "play" });
  }, [command]);
  const seek = useCallback((ms: number, transition: AudioSeekTransition = "instant") => {
    const from = getCurrentTime();
    const duration = (opts.current.buffer?.duration ?? 0) * 1000 / opts.current.timeScale;
    const targetTime = Math.max(0, Math.min(duration, Number.isFinite(ms) ? ms : 0));
    state.current.position = targetTime * opts.current.timeScale; state.current.at = performance.now();
    command({ action: "seek", positionMs: state.current.position });
    visual.current.begin(from, targetTime, transition, performance.now());
    setSeekSignal(s => ({ revision: s.revision + 1, transition, targetTime }));
  }, [command, getCurrentTime]);
  return { ready, error, status, selected: options.enabled && !!options.buffer && !error,
    controller: { isPlaying: status?.playing ?? false, currentTime: getCurrentTime(), duration: (options.buffer?.duration ?? 0) * 1000 / options.timeScale,
      getCurrentTime, getVisualCurrentTime: useCallback((now = performance.now()) => visual.current.read(getCurrentTime(), now), [getCurrentTime]),
      isVisualSeekActive: useCallback((now = performance.now()) => visual.current.active(now), []),
      cancelVisualSeek: useCallback(() => visual.current.cancel(), []), seekSignal, play, pause, seek,
      toggle: useCallback(() => state.current.playing ? pause() : play(), [pause, play]),
    } };
}
