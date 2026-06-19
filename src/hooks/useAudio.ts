import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Playback controller exposing a high-resolution clock (updated via
 * requestAnimationFrame) plus play/pause/seek. The current time is in
 * **milliseconds** to match the editor domain.
 *
 * Two playback engines are supported:
 *
 * 1. **Web Audio** (preferred): when a decoded `buffer` is supplied, the song
 *    plays through an `AudioBufferSourceNode`. This is sample-accurate, seeks
 *    instantly (no re-buffering) and - crucially - shares the near-zero output
 *    latency of the Web Audio hitsounds, so the song stays in sync with the
 *    falling notes instead of lagging seconds behind them.
 * 2. **HTMLAudioElement** (fallback): used until the buffer finishes decoding,
 *    or when decoding is unavailable.
 *
 * `knownDurationMs` is an authoritative duration (e.g. from the decoded
 * waveform's AudioBuffer). When provided it overrides the element's own
 * `duration`, which is unreliable for VBR / streamed MP3s.
 */
export function useAudio(
  src: string | null,
  knownDurationMs?: number | null,
  buffer?: AudioBuffer | null,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // ---- Web Audio engine state ----
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(buffer ?? null);
  // Authoritative paused position (seconds). While playing, the live position
  // is derived from the AudioContext clock relative to these anchors.
  const positionRef = useRef(0);
  const startCtxTimeRef = useRef(0); // ctx.currentTime when playback began
  const startOffsetRef = useRef(0); // position (s) when playback began
  // Set true immediately before a programmatic stop() so the source's `ended`
  // handler can tell a manual stop from the song reaching its natural end.
  const manualStopRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // ms
  const [duration, setDuration] = useState(0); // ms
  // `volume` is the *perceived* slider position (0-1). Actual gain is derived
  // via a square law so the slider feels linear to the ear.
  const [volume, setVolumeState] = useState(0.2);
  const volumeRef = useRef(0.2);
  // Playback speed (1 = full speed). Slowing it down also lowers the pitch, the
  // way the osu! editor's 25/50/75% playback does.
  const [playbackRate, setPlaybackRateState] = useState(1);
  const playbackRateRef = useRef(1);
  // Whether an authoritative decoded duration is in effect; while set, the
  // element's own (VBR-unreliable) duration is ignored.
  const hasKnownDurationRef = useRef(false);

  // Create the audio element once (the decode fallback).
  if (audioRef.current === null && typeof Audio !== "undefined") {
    const el = new Audio();
    el.volume = 0.2 * 0.2; // square law on the initial default
    audioRef.current = el;
  }

  /** Lazily create the playback AudioContext (matched to the buffer's rate). */
  const ensureCtx = useCallback((): AudioContext | null => {
    let ctx = ctxRef.current;
    if (!ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      // Match the buffer's sample rate so playback isn't pitch-shifted.
      const rate = bufferRef.current?.sampleRate;
      ctx = rate ? new Ctor({ sampleRate: rate }) : new Ctor();
      const gain = ctx.createGain();
      gain.gain.value = volumeRef.current * volumeRef.current;
      gain.connect(ctx.destination);
      ctxRef.current = ctx;
      gainRef.current = gain;
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }, []);

  /** Live playback position in seconds (works whether playing or paused). */
  const webPosition = useCallback((): number => {
    const ctx = ctxRef.current;
    if (sourceRef.current && ctx) {
      const elapsed =
        (ctx.currentTime - startCtxTimeRef.current) * playbackRateRef.current;
      return startOffsetRef.current + elapsed;
    }
    return positionRef.current;
  }, []);

  /** Stop the current Web Audio source, optionally saving the position. */
  const stopWeb = useCallback(
    (savePosition: boolean) => {
      const source = sourceRef.current;
      if (!source) return;
      if (savePosition) positionRef.current = webPosition();
      manualStopRef.current = true;
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
      sourceRef.current = null;
    },
    [webPosition],
  );

  /** Start a fresh Web Audio source from the saved position. */
  const startWeb = useCallback((): boolean => {
    const audioBuffer = bufferRef.current;
    const ctx = ensureCtx();
    const gain = gainRef.current;
    if (!audioBuffer || !ctx || !gain) return false;

    const durMs =
      Number.isFinite(duration) && duration > 0
        ? duration
        : audioBuffer.duration * 1000;
    // If we're at (or past) the end, restart from the top.
    if (positionRef.current * 1000 >= durMs - 1) positionRef.current = 0;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackRateRef.current;
    source.connect(gain);
    source.onended = () => {
      // Only fires here on a *natural* end (manual stops null the handler).
      sourceRef.current = null;
      positionRef.current = durMs / 1000;
      setCurrentTime(durMs);
      setIsPlaying(false);
    };
    startOffsetRef.current = positionRef.current;
    startCtxTimeRef.current = ctx.currentTime;
    manualStopRef.current = false;
    source.start(0, positionRef.current);
    sourceRef.current = source;
    return true;
  }, [duration, ensureCtx]);

  // Latest startWeb, so effects can hand off to Web Audio without taking
  // startWeb as a dependency (which would re-run them when `duration` changes).
  const startWebRef = useRef(startWeb);
  startWebRef.current = startWeb;

  // Wire up the element source (fallback path) and reset the clock on song
  // change so a previous (different-length) song can't leave stale state.
  useEffect(() => {
    const audio = audioRef.current;
    stopWeb(false);
    positionRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    setDuration(0);
    hasKnownDurationRef.current = false;
    if (!audio) return;
    if (!src) {
      audio.removeAttribute("src");
      audio.load();
      return;
    }
    audio.src = src;
    audio.load();
    // Re-apply the chosen speed/pitch: load() reset playbackRate to default.
    applyRate(audio, playbackRateRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Track the decoded buffer; its presence switches playback to Web Audio.
  // If the element fallback was already mid-playback when the buffer arrives,
  // hand off seamlessly: pause the element and resume from the same position on
  // the Web Audio engine. Without this, the engines disagree and a later pause
  // would stop the silent engine while the element kept playing (UI frozen).
  useEffect(() => {
    bufferRef.current = buffer ?? null;
    if (!buffer) return;
    hasKnownDurationRef.current = true;
    setDuration(buffer.duration * 1000);
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      positionRef.current = audio.currentTime;
      audio.pause();
      if (startWebRef.current()) setIsPlaying(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer]);

  // Prefer the authoritative decoded duration when supplied. Sample-accurate
  // and, unlike the element's `duration`, correct for VBR / streamed MP3s - so
  // the seek clamp and the timeline scale stay right after a song switch.
  useEffect(() => {
    if (typeof knownDurationMs === "number" && knownDurationMs > 0) {
      hasKnownDurationRef.current = true;
      setDuration(knownDurationMs);
    }
  }, [knownDurationMs]);

  // Track element metadata + end of playback (fallback engine only).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Fast path / fallback: most files (CBR / headered) expose a finite
    // duration as soon as metadata loads. Used until the authoritative decoded
    // duration arrives.
    const onLoaded = () => {
      if (hasKnownDurationRef.current) return;
      const d = audio.duration;
      if (Number.isFinite(d) && d > 0) setDuration(d * 1000);
    };
    const onEnded = () => setIsPlaying(false);
    const onPause = () => {
      if (!bufferRef.current) setIsPlaying(false);
    };
    const onPlay = () => {
      if (!bufferRef.current) setIsPlaying(true);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onLoaded);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
    };
  }, []);

  // Drive the clock with rAF while playing for smooth canvas updates.
  useEffect(() => {
    const audio = audioRef.current;

    const tick = () => {
      if (bufferRef.current) {
        setCurrentTime(webPosition() * 1000);
      } else if (audio) {
        setCurrentTime(audio.currentTime * 1000);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, webPosition]);

  const play = useCallback(() => {
    if (bufferRef.current) {
      // Guard against the element fallback also running (e.g. it was started
      // before the buffer finished decoding): only one engine may sound.
      const audio = audioRef.current;
      if (audio && !audio.paused) audio.pause();
      if (startWeb()) setIsPlaying(true);
      return;
    }
    audioRef.current?.play().catch(() => {});
  }, [startWeb]);

  const pause = useCallback(() => {
    // Stop *both* engines defensively. Whichever was sounding (Web Audio when a
    // buffer is decoded, the element during the decode window) is now stopped,
    // so pause can never leave one engine playing after an engine switch.
    const audio = audioRef.current;
    if (sourceRef.current) {
      stopWeb(true); // saves positionRef from the live Web Audio clock
    } else if (audio && !audio.paused) {
      positionRef.current = audio.currentTime;
      audio.pause();
    }
    setCurrentTime(positionRef.current * 1000);
    setIsPlaying(false);
  }, [stopWeb]);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  /** Seek to an absolute time in milliseconds. */
  const seek = useCallback(
    (ms: number) => {
      if (!Number.isFinite(ms)) return;
      const audio = audioRef.current;
      // Prefer the tracked duration, falling back to the element's own (finite)
      // duration so a non-finite `duration` can never leave the seek unbounded.
      const max =
        Number.isFinite(duration) && duration > 0
          ? duration
          : audio && Number.isFinite(audio.duration)
            ? audio.duration * 1000
            : ms;
      const clamped = Math.max(0, Math.min(ms, max));
      if (!Number.isFinite(clamped)) return;

      if (bufferRef.current) {
        const wasPlaying = sourceRef.current !== null;
        stopWeb(false);
        positionRef.current = clamped / 1000;
        setCurrentTime(clamped);
        if (wasPlaying) startWeb();
        return;
      }
      if (audio) {
        audio.currentTime = clamped / 1000;
        setCurrentTime(clamped);
      }
    },
    [duration, stopWeb, startWeb],
  );

  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.max(0.1, Math.min(4, rate));
    playbackRateRef.current = clamped;
    // Re-anchor a live Web Audio source so the clock stays continuous.
    const ctx = ctxRef.current;
    const source = sourceRef.current;
    if (source && ctx) {
      positionRef.current =
        startOffsetRef.current +
        (ctx.currentTime - startCtxTimeRef.current) * source.playbackRate.value;
      startOffsetRef.current = positionRef.current;
      startCtxTimeRef.current = ctx.currentTime;
      source.playbackRate.value = clamped;
    }
    applyRate(audioRef.current, clamped);
    setPlaybackRateState(clamped);
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    volumeRef.current = clamped;
    // Square law: perceived 50% slider -> 25% actual power, much more natural.
    const power = clamped * clamped;
    if (gainRef.current) gainRef.current.gain.value = power;
    if (audioRef.current) audioRef.current.volume = power;
    setVolumeState(clamped);
  }, []);

  // Tear down the AudioContext when the hook unmounts.
  useEffect(() => {
    return () => {
      stopWeb(false);
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      gainRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    playbackRate,
    play,
    pause,
    toggle,
    seek,
    setPlaybackRate,
    setVolume,
  };
}

export type AudioController = ReturnType<typeof useAudio>;

/**
 * Apply a playback rate to an audio element. Sets `defaultPlaybackRate` too so
 * the value survives a media reload (the resource-selection algorithm resets
 * `playbackRate` to `defaultPlaybackRate`), and disables pitch preservation so
 * the pitch drops with the tempo, matching the osu! editor.
 */
function applyRate(audio: HTMLAudioElement | null, rate: number) {
  if (!audio) return;
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
  audio.preservesPitch = false;
  // Vendor-prefixed fallbacks for older engines.
  // @ts-expect-error non-standard
  audio.mozPreservesPitch = false;
  // @ts-expect-error non-standard
  audio.webkitPreservesPitch = false;
}
