import { useCallback, useEffect, useRef, useState } from "react";
import {
  DUCK_FILTER_HZ,
  MIX_RAMP_SECONDS,
  NORMAL_FILTER_HZ,
  effectiveAudioPower,
} from "../lib/audioAtmosphere";

const RATE_RAMP_SECONDS = 0.34;
const CLOCK_UI_INTERVAL_MS = 50;

type RateTransition = {
  startCtxTime: number;
  startPosition: number;
  from: number;
  to: number;
  duration: number;
};

/**
 * Playback region + fade envelope. All fields optional; undefined means "use
 * the full song" (start 0, end = duration, no fade).
 */
export type AudioRegion = {
  startMs?: number;
  endMs?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
};

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const easeOutCubicIntegral = (t: number): number =>
  1.5 * t * t - t * t * t + 0.25 * t * t * t * t;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const playbackCurve = (from: number, to: number): Float32Array => {
  const points = 32;
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    curve[i] = from + (to - from) * easeOutCubic(t);
  }
  return curve;
};

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
  region?: AudioRegion | null,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // ---- Web Audio engine state ----
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const fadeGainRef = useRef<GainNode | null>(null);
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
  const currentTimeRef = useRef(0);
  const lastClockUiUpdateRef = useRef(0);
  const [duration, setDuration] = useState(0); // ms
  // `volume` is the *perceived* slider position (0-1). Actual gain is derived
  // via a square law so the slider feels linear to the ear.
  const [volume, setVolumeState] = useState(0.2);
  const volumeRef = useRef(0.2);
  // Playback speed (1 = full speed). Slowing it down also lowers the pitch, the
  // way the osu! editor's 25/50/75% playback does.
  const [playbackRate, setPlaybackRateState] = useState(1);
  const playbackRateRef = useRef(1);
  const rateTransitionRef = useRef<RateTransition | null>(null);
  const elementVolumeRafRef = useRef<number | null>(null);
  const elementRateRafRef = useRef<number | null>(null);
  const ambientDuckedRef = useRef(false);
  // Whether an authoritative decoded duration is in effect; while set, the
  // element's own (VBR-unreliable) duration is ignored.
  const hasKnownDurationRef = useRef(false);

  // Create the audio element once (the decode fallback).
  if (audioRef.current === null && typeof Audio !== "undefined") {
    const el = new Audio();
    el.volume = 0.2 * 0.2; // square law on the initial default
    audioRef.current = el;
  }

  // Mirror the playback region into a ref so the rAF loop / Web Audio callbacks
  // read the latest values without re-subscribing.
  const regionRef = useRef<AudioRegion | null>(region ?? null);
  regionRef.current = region ?? null;

  const effectivePower = useCallback(
    () => effectiveAudioPower(volumeRef.current, ambientDuckedRef.current),
    [],
  );

  const targetFilterFrequency = useCallback(
    () => (ambientDuckedRef.current ? DUCK_FILTER_HZ : NORMAL_FILTER_HZ),
    [],
  );

  const rampElementVolume = useCallback((target: number, seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (elementVolumeRafRef.current !== null) {
      cancelAnimationFrame(elementVolumeRafRef.current);
      elementVolumeRafRef.current = null;
    }
    const from = audio.volume;
    const duration = Math.max(1, seconds * 1000);
    const start = performance.now();
    const step = (now: number) => {
      const t = clamp01((now - start) / duration);
      audio.volume = from + (target - from) * easeOutCubic(t);
      if (t < 1) {
        elementVolumeRafRef.current = requestAnimationFrame(step);
      } else {
        audio.volume = target;
        elementVolumeRafRef.current = null;
      }
    };
    elementVolumeRafRef.current = requestAnimationFrame(step);
  }, []);

  const applyOutputMix = useCallback(
    (seconds = MIX_RAMP_SECONDS) => {
      const targetGain = effectivePower();
      const ctx = ctxRef.current;
      const gain = gainRef.current;
      const filter = filterRef.current;
      if (ctx && gain) {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(targetGain, now + seconds);
      }
      if (ctx && filter) {
        const now = ctx.currentTime;
        const targetHz = targetFilterFrequency();
        filter.frequency.cancelScheduledValues(now);
        filter.frequency.setValueAtTime(
          Math.max(40, filter.frequency.value),
          now,
        );
        filter.frequency.exponentialRampToValueAtTime(
          targetHz,
          now + seconds,
        );
      }
      rampElementVolume(targetGain, seconds);
    },
    [effectivePower, rampElementVolume, targetFilterFrequency],
  );

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
      const filter = ctx.createBiquadFilter();
      const fadeGain = ctx.createGain();
      filter.type = "lowpass";
      filter.frequency.value = targetFilterFrequency();
      filter.Q.value = 0.65;
      gain.gain.value = effectivePower();
      fadeGain.gain.value = 1;
      // Chain: source → fadeGain → filter → gain → destination. The fade gain is
      // kept separate from `gain` (volume + atmosphere ducking) so the trim
      // fade envelope never fights `applyOutputMix`'s ramps.
      fadeGain.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      ctxRef.current = ctx;
      gainRef.current = gain;
      filterRef.current = filter;
      fadeGainRef.current = fadeGain;
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }, [effectivePower, targetFilterFrequency]);

  const rateAtCtxTime = useCallback((ctxTime: number): number => {
    const tr = rateTransitionRef.current;
    if (!tr) return playbackRateRef.current;
    if (tr.duration <= 0) return tr.to;
    const t = clamp01((ctxTime - tr.startCtxTime) / tr.duration);
    return tr.from + (tr.to - tr.from) * easeOutCubic(t);
  }, []);

  const positionAtCtxTime = useCallback((ctxTime: number): number => {
    const tr = rateTransitionRef.current;
    if (!tr) {
      return (
        startOffsetRef.current +
        (ctxTime - startCtxTimeRef.current) * playbackRateRef.current
      );
    }
    if (tr.duration <= 0) {
      return tr.startPosition + (ctxTime - tr.startCtxTime) * tr.to;
    }
    const elapsed = Math.max(0, ctxTime - tr.startCtxTime);
    if (elapsed <= tr.duration) {
      const t = elapsed / tr.duration;
      return (
        tr.startPosition +
        tr.from * elapsed +
        (tr.to - tr.from) * tr.duration * easeOutCubicIntegral(t)
      );
    }
    const transitioned =
      tr.from * tr.duration +
      (tr.to - tr.from) * tr.duration * easeOutCubicIntegral(1);
    return tr.startPosition + transitioned + tr.to * (elapsed - tr.duration);
  }, []);

  /** Live playback position in seconds (works whether playing or paused). */
  const webPosition = useCallback((): number => {
    const ctx = ctxRef.current;
    if (sourceRef.current && ctx) {
      return positionAtCtxTime(ctx.currentTime);
    }
    return positionRef.current;
  }, [positionAtCtxTime]);

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

  /**
   * Schedule the trim fade-in / fade-out envelope on the dedicated fade gain,
   * starting from `startPositionSec` (the song position playback begins at).
   * No-ops gracefully when the region has no fades. Gain is 1 everywhere except
   * inside the fade ramps; before the start bracket it is silenced so a stray
   * play before the cut stays quiet.
   */
  const scheduleFadeEnvelope = useCallback(
    (ctx: AudioContext, startPositionSec: number, durMs: number) => {
      const fadeGain = fadeGainRef.current;
      if (!fadeGain) return;
      const region = regionRef.current;
      const g = fadeGain.gain;
      const t0 = ctx.currentTime;
      g.cancelScheduledValues(t0);

      // No region / no fades → hold unity gain and bail.
      const fadeInMs = Math.max(0, region?.fadeInMs ?? 0);
      const fadeOutMs = Math.max(0, region?.fadeOutMs ?? 0);
      if (!region || (fadeInMs <= 0 && fadeOutMs <= 0)) {
        g.setValueAtTime(1, t0);
        return;
      }

      const startS = Math.max(0, region.startMs ?? 0) / 1000;
      const endS = (region.endMs ?? durMs) / 1000;
      const fiS = fadeInMs / 1000;
      const foS = fadeOutMs / 1000;
      const p = startPositionSec;
      const rate = playbackRateRef.current || 1;

      // Envelope value (0..1) at a given song position q (seconds).
      const gainAt = (q: number): number => {
        let v = 1;
        if (fiS > 0 && q < startS + fiS) v = Math.min(v, (q - startS) / fiS);
        if (foS > 0 && q > endS - foS) v = Math.min(v, (endS - q) / foS);
        return Math.max(0, Math.min(1, v));
      };
      // Map a song position to wall-clock time on the audio context.
      const wall = (q: number): number => t0 + Math.max(0, (q - p) / rate);

      g.setValueAtTime(gainAt(p), t0);
      const breakpoints = [startS, startS + fiS, endS - foS, endS]
        .filter((q) => q > p)
        .sort((a, b) => a - b);
      for (const q of breakpoints) {
        g.linearRampToValueAtTime(gainAt(q), wall(q));
      }
    },
    [],
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
    // Playback region (defaults to the whole song when no brackets are set).
    const region = regionRef.current;
    const regionStartMs = Math.max(0, region?.startMs ?? 0);
    // If we're at (or past) the very end of the song, restart from the region
    // start (so pressing play at the end loops back to the start bracket).
    if (positionRef.current * 1000 >= durMs - 1) {
      positionRef.current = regionStartMs / 1000;
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackRateRef.current;
    source.connect(fadeGainRef.current ?? filterRef.current ?? gain);
    scheduleFadeEnvelope(ctx, positionRef.current, durMs);
    source.onended = () => {
      // Only fires here on a *natural* end (manual stops null the handler).
      sourceRef.current = null;
      positionRef.current = durMs / 1000;
      currentTimeRef.current = durMs;
      setCurrentTime(durMs);
      setIsPlaying(false);
    };
    startOffsetRef.current = positionRef.current;
    startCtxTimeRef.current = ctx.currentTime;
    rateTransitionRef.current = {
      startCtxTime: ctx.currentTime,
      startPosition: positionRef.current,
      from: playbackRateRef.current,
      to: playbackRateRef.current,
      duration: 0,
    };
    manualStopRef.current = false;
    source.start(0, positionRef.current);
    sourceRef.current = source;
    return true;
  }, [duration, ensureCtx, scheduleFadeEnvelope]);

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
    currentTimeRef.current = 0;
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
      let next = currentTimeRef.current;
      if (bufferRef.current) {
        next = webPosition() * 1000;
      } else if (audio) {
        next = audio.currentTime * 1000;
      }

      // Stop at the region end bracket once one is set. The fade-out envelope
      // has already eased the gain to zero by this point, so the cut is clean.
      const endMs = regionRef.current?.endMs;
      if (endMs != null && next >= endMs) {
        next = endMs;
        positionRef.current = next / 1000;
        currentTimeRef.current = next;
        setCurrentTime(next);
        if (bufferRef.current) {
          stopWeb(false);
        } else if (audio && !audio.paused) {
          audio.pause();
        }
        setIsPlaying(false);
        return; // don't schedule another frame
      }

      currentTimeRef.current = next;
      const now = performance.now();
      if (now - lastClockUiUpdateRef.current >= CLOCK_UI_INTERVAL_MS) {
        lastClockUiUpdateRef.current = now;
        setCurrentTime(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, webPosition, stopWeb]);

  const play = useCallback(() => {
    // Start-at-bracket: when an explicit play begins outside the trimmed
    // region, jump the playhead to the region start so playback honors the cut.
    // Scrubbing/seeking stays unclamped so editing anywhere remains free.
    const region = regionRef.current;
    if (region) {
      const startMs = Math.max(0, region.startMs ?? 0);
      const endMs = region.endMs;
      const posMs = positionRef.current * 1000;
      if (posMs < startMs - 1 || (endMs != null && posMs >= endMs - 1)) {
        positionRef.current = startMs / 1000;
        currentTimeRef.current = startMs;
        setCurrentTime(startMs);
        const a = audioRef.current;
        if (a) a.currentTime = startMs / 1000;
      }
    }
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
    currentTimeRef.current = positionRef.current * 1000;
    setIsPlaying(false);
  }, [stopWeb]);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const rampElementRate = useCallback((target: number, seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (elementRateRafRef.current !== null) {
      cancelAnimationFrame(elementRateRafRef.current);
      elementRateRafRef.current = null;
    }
    const from = audio.playbackRate || 1;
    const duration = Math.max(1, seconds * 1000);
    const start = performance.now();
    const step = (now: number) => {
      const t = clamp01((now - start) / duration);
      applyRate(audio, from + (target - from) * easeOutCubic(t));
      if (t < 1) {
        elementRateRafRef.current = requestAnimationFrame(step);
      } else {
        applyRate(audio, target);
        elementRateRafRef.current = null;
      }
    };
    elementRateRafRef.current = requestAnimationFrame(step);
  }, []);

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
        currentTimeRef.current = clamped;
        setCurrentTime(clamped);
        if (wasPlaying) startWeb();
        return;
      }
      if (audio) {
        audio.currentTime = clamped / 1000;
        currentTimeRef.current = clamped;
        setCurrentTime(clamped);
      }
    },
    [duration, stopWeb, startWeb],
  );

  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.max(0.1, Math.min(4, rate));
    // Re-anchor a live Web Audio source so the clock stays continuous.
    const ctx = ctxRef.current;
    const source = sourceRef.current;
    if (source && ctx) {
      const now = ctx.currentTime;
      const from = rateAtCtxTime(now);
      const startPosition = positionAtCtxTime(now);
      positionRef.current = startPosition;
      startOffsetRef.current = startPosition;
      startCtxTimeRef.current = now;
      rateTransitionRef.current = {
        startCtxTime: now,
        startPosition,
        from,
        to: clamped,
        duration: RATE_RAMP_SECONDS,
      };
      source.playbackRate.cancelScheduledValues(now);
      source.playbackRate.setValueAtTime(from, now);
      source.playbackRate.setValueCurveAtTime(
        playbackCurve(from, clamped),
        now,
        RATE_RAMP_SECONDS,
      );
    } else {
      rateTransitionRef.current = null;
    }
    playbackRateRef.current = clamped;
    rampElementRate(clamped, RATE_RAMP_SECONDS);
    setPlaybackRateState(clamped);
  }, [positionAtCtxTime, rampElementRate, rateAtCtxTime]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    volumeRef.current = clamped;
    applyOutputMix(0.14);
    setVolumeState(clamped);
  }, [applyOutputMix]);

  const setAmbientDucking = useCallback(
    (ducked: boolean) => {
      if (ambientDuckedRef.current === ducked) return;
      ambientDuckedRef.current = ducked;
      applyOutputMix(MIX_RAMP_SECONDS);
    },
    [applyOutputMix],
  );

  const getCurrentTime = useCallback(() => currentTimeRef.current, []);

  // Tear down the AudioContext when the hook unmounts.
  useEffect(() => {
    return () => {
      stopWeb(false);
      if (elementVolumeRafRef.current !== null) {
        cancelAnimationFrame(elementVolumeRafRef.current);
      }
      if (elementRateRafRef.current !== null) {
        cancelAnimationFrame(elementRateRafRef.current);
      }
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      gainRef.current = null;
      filterRef.current = null;
      fadeGainRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    playbackRate,
    getCurrentTime,
    play,
    pause,
    toggle,
    seek,
    setPlaybackRate,
    setVolume,
    setAmbientDucking,
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
