import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  DUCK_FILTER_HZ,
  MIX_RAMP_SECONDS,
  NORMAL_FILTER_HZ,
  effectiveAudioPower,
} from "../lib/audioAtmosphere";
import {
  createPlaybackClock,
  createSteadyClock,
  latencyCompensatedPosition,
  sourcePositionForAudible,
} from "../lib/playbackClock";
import type {
  AudioSeekSignal,
  AudioSeekTransition,
} from "../lib/audioSeek";
import { createSeekVisualClock } from "../lib/seekVisualClock";
import {
  HANDOFF_CROSSFADE_SECONDS,
  HANDOFF_GIVE_UP_MS,
  HANDOFF_LOCK_FRAMES,
  HANDOFF_LOCK_SECONDS,
  HANDOFF_MAX_SEEKS,
  HANDOFF_RESEEK_SECONDS,
  HANDOFF_STARTUP_GUESS_SECONDS,
  handoffCatchUpRate,
  learnHandoffStartup,
} from "../lib/pitchHandoff";
import { useNativeAudio } from "./useNativeAudio";
import { supportsExclusiveAudio } from "../lib/nativeAudio";

const RATE_RAMP_SECONDS = 0.34;
const CLOCK_UI_INTERVAL_MS = 100;

const MIN_EFFECTIVE_RATE = 0.0625;
const MAX_EFFECTIVE_RATE = 8;

const clampTimeScale = (scale: number): number =>
  !Number.isFinite(scale) || scale <= 0 ? 1 : Math.max(0.05, Math.min(16, scale));

const clampEffectiveRate = (rate: number): number =>
  Math.max(MIN_EFFECTIVE_RATE, Math.min(MAX_EFFECTIVE_RATE, rate));

type RateTransition = {
  startCtxTime: number;
  startPosition: number;
  from: number;
  to: number;
  duration: number;
};

export type AudioRegion = {
  startMs?: number;
  endMs?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  loop?: boolean;
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
 * Plays the project audio.
 *
 * Internally everything is kept in *audio time* — positions within the source
 * file. Publicly the hook speaks *map time*: `currentTime`, `duration`, `seek`,
 * `getCurrentTime` and `region` are all divided by `timeScale`, so a difficulty
 * written against a 1.2x rate gets a timeline that matches its own notes while
 * the untouched source file is simply played 1.2x faster.
 *
 * `playbackRate` stays the *user* rate (1 = normal). The rate actually sent to
 * the audio graph is `playbackRate * timeScale`, so transport speed, playtest
 * rate mods and the hold-to-slow key compose with the difficulty's rate instead
 * of fighting it.
 */
export function useAudio(
  src: string | null,
  knownDurationMs?: number | null,
  buffer?: AudioBuffer | null,
  region?: AudioRegion | null,
  timeScale = 1,
  preservePitch = false,
  exclusive = false,
  masterVolume = 1,
  keepPitchWhenSlowed = false,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const fadeGainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(buffer ?? null);
  const positionRef = useRef(0);
  const startCtxTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const audibleStartPositionRef = useRef(0);
  const manualStopRef = useRef(false);
  // The buffer engine's clock: the Web Audio context ticks once per render
  // quantum, so the raw reading repeats for several frames at a high refresh
  // rate.
  const clockRef = useRef(createPlaybackClock());
  // The media element's clock. Its currentTime is a snapshot refreshed once
  // per task, so on a busy page it arrives a varying amount stale; pulling the
  // playhead toward each reading made the playfield jitter during pitch-kept
  // slow playback.
  const elementClockRef = useRef(createSteadyClock());
  const seekVisualClockRef = useRef(createSeekVisualClock());

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  const lastClockUiUpdateRef = useRef(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.2);
  const volumeRef = useRef(0.2);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [seekSignal, setSeekSignal] = useState<AudioSeekSignal>({
    revision: 0,
    transition: "instant",
    targetTime: 0,
  });
  const playbackRateRef = useRef(1);
  const rateTransitionRef = useRef<RateTransition | null>(null);
  const elementVolumeRafRef = useRef<number | null>(null);
  const elementRateRafRef = useRef<number | null>(null);
  const ambientDuckedRef = useRef(false);
  const [nativeDucked, setNativeDucked] = useState(false);
  const hasKnownDurationRef = useRef(false);

  if (audioRef.current === null && typeof Audio !== "undefined") {
    const el = new Audio();
    el.volume = 0.2 * 0.2;
    audioRef.current = el;
  }

  const scale = clampTimeScale(timeScale);
  const timeScaleRef = useRef(scale);
  timeScaleRef.current = scale;

  // AudioBufferSourceNode.playbackRate has no pitch correction, so preserving
  // pitch means handing playback to the media element, which time-stretches
  // natively. Costs output-latency compensation; see `webAudioActive`.
  // Slowing the transport below 100% takes the same route when
  // keepPitchWhenSlowed is on. Exclusive output cannot time-stretch, and
  // reopening the device on every speed change would stall playback, so it
  // keeps its engine and slowed audio still plays lower there.
  const pitchLocked =
    preservePitch ||
    (keepPitchWhenSlowed &&
      playbackRate < 1 &&
      !(exclusive && supportsExclusiveAudio()));
  const preservePitchRef = useRef(pitchLocked);
  preservePitchRef.current = pitchLocked;
  // The engine actually playing. It trails `pitchLocked` while the element is
  // getting ready to take over, so until then everything keeps reading the
  // buffer engine. See `armPitchHandoff`.
  const appliedPitchRef = useRef(pitchLocked);
  const cancelPitchHandoffRef = useRef<(() => void) | null>(null);
  const armPitchHandoffRef = useRef<() => void>(() => {});

  /** Whether the buffer-source engine (rather than the element) drives playback. */
  const webAudioActive = useCallback(
    (): boolean => bufferRef.current !== null && !appliedPitchRef.current,
    [],
  );

  const regionRef = useRef<AudioRegion | null>(null);
  regionRef.current = scaleRegionToAudio(region ?? null, scale);

  /** Rate handed to the audio graph: user rate composed with the map rate. */
  const effectiveRate = useCallback(
    (): number =>
      clampEffectiveRate(playbackRateRef.current * timeScaleRef.current),
    [],
  );

  const masterVolumeRef = useRef(clamp01(masterVolume));
  masterVolumeRef.current = clamp01(masterVolume);

  const effectivePower = useCallback(
    () =>
      effectiveAudioPower(
        volumeRef.current * masterVolumeRef.current,
        ambientDuckedRef.current,
      ),
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

  const ensureCtx = useCallback((): AudioContext | null => {
    let ctx = ctxRef.current;
    if (!ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      const rate = bufferRef.current?.sampleRate;
      ctx = new Ctor({
        latencyHint: "interactive",
        ...(rate ? { sampleRate: rate } : {}),
      });
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const fadeGain = ctx.createGain();
      filter.type = "lowpass";
      filter.frequency.value = targetFilterFrequency();
      filter.Q.value = 0.65;
      gain.gain.value = effectivePower();
      fadeGain.gain.value = 1;
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
    if (!tr) return effectiveRate();
    if (tr.duration <= 0) return tr.to;
    const t = clamp01((ctxTime - tr.startCtxTime) / tr.duration);
    return tr.from + (tr.to - tr.from) * easeOutCubic(t);
  }, [effectiveRate]);

  const syncLivePlaybackRate = useCallback((): number => {
    const ctx = ctxRef.current;
    return ctx ? rateAtCtxTime(ctx.currentTime) : effectiveRate();
  }, [rateAtCtxTime, effectiveRate]);

  const positionAtCtxTime = useCallback((ctxTime: number): number => {
    const tr = rateTransitionRef.current;
    if (!tr) {
      return (
        startOffsetRef.current +
        (ctxTime - startCtxTimeRef.current) * effectiveRate()
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
  }, [effectiveRate]);

  const webPosition = useCallback((): number => {
    const ctx = ctxRef.current;
    if (sourceRef.current && ctx) {
      return clockRef.current.read(
        positionAtCtxTime(ctx.currentTime),
        // Instantaneous rate, so extrapolation stays right mid rate-ramp.
        syncLivePlaybackRate(),
        performance.now(),
      );
    }
    clockRef.current.reset();
    return positionRef.current;
  }, [positionAtCtxTime, syncLivePlaybackRate]);

  const outputLatencyMs = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return 0;
    const lat =
      typeof ctx.outputLatency === "number" && ctx.outputLatency > 0
        ? ctx.outputLatency
        : ctx.baseLatency || 0;
    return lat * 1000;
  }, []);

  const audibleWebPosition = useCallback(
    (sourceSeconds: number): number =>
      latencyCompensatedPosition(
        sourceSeconds,
        outputLatencyMs() / 1000,
        syncLivePlaybackRate(),
        audibleStartPositionRef.current,
      ),
    [outputLatencyMs, syncLivePlaybackRate],
  );

  const stopWeb = useCallback(
    (savePosition: boolean) => {
      cancelPitchHandoffRef.current?.();
      const source = sourceRef.current;
      if (!source) return;
      if (savePosition) positionRef.current = webPosition();
      manualStopRef.current = true;
      source.onended = null;
      try {
        source.stop();
      } catch {
      }
      source.disconnect();
      sourceRef.current = null;
    },
    [webPosition],
  );

  const scheduleFadeEnvelope = useCallback(
    (ctx: AudioContext, startPositionSec: number, durMs: number) => {
      const fadeGain = fadeGainRef.current;
      if (!fadeGain) return;
      const region = regionRef.current;
      const g = fadeGain.gain;
      const t0 = ctx.currentTime;
      g.cancelScheduledValues(t0);

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
      const rate = effectiveRate() || 1;

      const gainAt = (q: number): number => {
        let v = 1;
        if (fiS > 0 && q < startS + fiS) v = Math.min(v, (q - startS) / fiS);
        if (foS > 0 && q > endS - foS) v = Math.min(v, (endS - q) / foS);
        return Math.max(0, Math.min(1, v));
      };
      const wall = (q: number): number => t0 + Math.max(0, (q - p) / rate);

      g.setValueAtTime(gainAt(p), t0);
      const breakpoints = [startS, startS + fiS, endS - foS, endS]
        .filter((q) => q > p)
        .sort((a, b) => a - b);
      for (const q of breakpoints) {
        g.linearRampToValueAtTime(gainAt(q), wall(q));
      }
    },
    [effectiveRate],
  );

  const startWeb = useCallback((): boolean => {
    const audioBuffer = bufferRef.current;
    const ctx = ensureCtx();
    const gain = gainRef.current;
    if (!audioBuffer || !ctx || !gain) return false;
    stopWeb(false);
    clockRef.current.reset();

    const durMs =
      Number.isFinite(duration) && duration > 0
        ? duration
        : audioBuffer.duration * 1000;
    const region = regionRef.current;
    const regionStartMs = Math.max(0, region?.startMs ?? 0);
    if (positionRef.current * 1000 >= durMs - 1) {
      seekVisualClockRef.current.cancel();
      positionRef.current = regionStartMs / 1000;
      currentTimeRef.current = regionStartMs;
    }

    audibleStartPositionRef.current = Math.max(
      regionStartMs / 1000,
      Math.min(positionRef.current, currentTimeRef.current / 1000),
    );

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = effectiveRate();
    source.connect(fadeGainRef.current ?? filterRef.current ?? gain);
    scheduleFadeEnvelope(ctx, positionRef.current, durMs);
    source.onended = () => {
      seekVisualClockRef.current.cancel();
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
      from: effectiveRate(),
      to: effectiveRate(),
      duration: 0,
    };
    manualStopRef.current = false;
    source.start(0, positionRef.current);
    sourceRef.current = source;
    // Restarted while the element was getting ready (a seek or a loop), so
    // aim it again from the new position.
    if (preservePitchRef.current) armPitchHandoffRef.current();
    return true;
  }, [duration, effectiveRate, ensureCtx, scheduleFadeEnvelope, stopWeb]);

  const startWebRef = useRef(startWeb);
  startWebRef.current = startWeb;

  useEffect(() => {
    const audio = audioRef.current;
    stopWeb(false);
    positionRef.current = 0;
    currentTimeRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    setDuration(0);
    setSeekSignal((previous) => ({
      revision: previous.revision + 1,
      transition: "instant",
      targetTime: 0,
    }));
    hasKnownDurationRef.current = false;
    if (!audio) return;
    if (!src) {
      audio.removeAttribute("src");
      audio.load();
      return;
    }
    audio.src = src;
    audio.load();
    applyRate(audio, effectiveRate(), preservePitchRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    bufferRef.current = buffer ?? null;
    if (!buffer) return;
    hasKnownDurationRef.current = true;
    setDuration(buffer.duration * 1000);
    const audio = audioRef.current;
    if (audio && !audio.paused && !preservePitchRef.current) {
      positionRef.current = audio.currentTime;
      audio.pause();
      if (startWebRef.current()) setIsPlaying(true);
    }
  }, [buffer]);

  useEffect(() => {
    if (typeof knownDurationMs === "number" && knownDurationMs > 0) {
      hasKnownDurationRef.current = true;
      setDuration(knownDurationMs);
    }
  }, [knownDurationMs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      if (hasKnownDurationRef.current) return;
      const d = audio.duration;
      if (Number.isFinite(d) && d > 0) setDuration(d * 1000);
    };
    const onEnded = () => {
      // A seek away from EOF can race an already queued media event.
      if (audio.ended) {
        seekVisualClockRef.current.cancel();
        setIsPlaying(false);
      }
    };
    const onPause = () => {
      if (!webAudioActive()) setIsPlaying(false);
    };
    const onPlay = () => {
      if (!webAudioActive()) setIsPlaying(true);
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
  }, [webAudioActive]);

  useEffect(() => {
    const audio = audioRef.current;

    const tick = () => {
      let next = currentTimeRef.current;
      if (webAudioActive()) {
        next = webPosition() * 1000;
      } else if (audio) {
        next = audio.currentTime * 1000;
      }

      const endMs = regionRef.current?.endMs;
      if (endMs != null && next >= endMs) {
        const region = regionRef.current;
        if (region?.loop) {
          seekVisualClockRef.current.cancel();
          next = Math.max(0, region.startMs ?? 0);
          positionRef.current = next / 1000;
          currentTimeRef.current = next;
          setCurrentTime(next);
          if (webAudioActive()) {
            stopWeb(false);
            startWebRef.current();
          } else if (audio) {
            audio.currentTime = next / 1000;
          }
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        seekVisualClockRef.current.cancel();
        next = endMs;
        positionRef.current = next / 1000;
        currentTimeRef.current = next;
        setCurrentTime(next);
        if (webAudioActive()) {
          stopWeb(false);
        } else if (audio && !audio.paused) {
          audio.pause();
        }
        setIsPlaying(false);
        return;
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
  }, [isPlaying, webPosition, stopWeb, webAudioActive]);

  const play = useCallback(() => {
    // With the buffer engine silent there is nothing to hand over, so start
    // straight on the engine the pitch setting asks for.
    if (!sourceRef.current) appliedPitchRef.current = preservePitchRef.current;
    const region = regionRef.current;
    if (region) {
      const startMs = Math.max(0, region.startMs ?? 0);
      const endMs = region.endMs;
      const posMs = positionRef.current * 1000;
      if (posMs < startMs - 1 || (endMs != null && posMs >= endMs - 1)) {
        seekVisualClockRef.current.cancel();
        positionRef.current = startMs / 1000;
        currentTimeRef.current = startMs;
        setCurrentTime(startMs);
        const a = audioRef.current;
        if (a) a.currentTime = startMs / 1000;
      }
    }
    if (webAudioActive()) {
      const audio = audioRef.current;
      if (audio && !audio.paused) audio.pause();
      if (startWeb()) setIsPlaying(true);
      return;
    }
    const audio = audioRef.current;
    if (audio) {
      applyRate(audio, effectiveRate(), preservePitchRef.current);
      audio.currentTime = positionRef.current;
      elementClockRef.current.reset();
      void audio.play().catch(() => {});
    }
  }, [startWeb, webAudioActive, effectiveRate]);

  const pause = useCallback(() => {
    const now = performance.now();
    const audio = audioRef.current;
    const webWasPlaying = sourceRef.current !== null;
    const visualWasMoving = seekVisualClockRef.current.active(now);
    const liveRate = syncLivePlaybackRate();
    const latencySeconds = outputLatencyMs() / 1000;
    let resumePosition = positionRef.current;
    let liveAudioPosition = currentTimeRef.current / 1000;

    if (webWasPlaying) {
      resumePosition = webPosition();
      liveAudioPosition = latencyCompensatedPosition(
        resumePosition,
        latencySeconds,
        liveRate,
        audibleStartPositionRef.current,
      );
    } else if (audio && !audio.paused) {
      resumePosition = elementClockRef.current.read(
        audio.currentTime,
        audio.playbackRate,
        now,
      );
      liveAudioPosition = resumePosition;
    }

    const liveMapTime =
      (liveAudioPosition * 1000) / timeScaleRef.current;
    const frozenMapTime = seekVisualClockRef.current.freeze(liveMapTime, now);
    if (visualWasMoving) {
      const frozenAudioPosition =
        (frozenMapTime * timeScaleRef.current) / 1000;
      resumePosition = webWasPlaying
        ? sourcePositionForAudible(
            frozenAudioPosition,
            latencySeconds,
            liveRate,
          )
        : frozenAudioPosition;
    }

    const regionStart = Math.max(0, regionRef.current?.startMs ?? 0) / 1000;
    const audioDuration =
      Number.isFinite(duration) && duration > 0
        ? duration / 1000
        : audio && Number.isFinite(audio.duration)
          ? audio.duration
          : Number.POSITIVE_INFINITY;
    const regionEnd = Math.min(
      audioDuration,
      (regionRef.current?.endMs ?? Number.POSITIVE_INFINITY) / 1000,
    );
    resumePosition = Math.max(
      regionStart,
      Math.min(regionEnd, resumePosition),
    );

    clockRef.current.reset();
    elementClockRef.current.reset();
    if (webWasPlaying) stopWeb(false);
    if (audio && !audio.paused) audio.pause();
    positionRef.current = resumePosition;
    if (audio && Number.isFinite(resumePosition)) {
      audio.currentTime = resumePosition;
    }

    const frozenAudioPosition = webWasPlaying
      ? latencyCompensatedPosition(
          resumePosition,
          latencySeconds,
          liveRate,
          visualWasMoving ? regionStart : audibleStartPositionRef.current,
        )
      : resumePosition;
    const frozenAudioMs = frozenAudioPosition * 1000;
    setCurrentTime(frozenAudioMs);
    currentTimeRef.current = frozenAudioMs;
    setIsPlaying(false);
  }, [
    duration,
    outputLatencyMs,
    stopWeb,
    syncLivePlaybackRate,
    webPosition,
  ]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    const playing = sourceRef.current !== null || !!audio && !audio.paused;
    if (playing) pause();
    else play();
  }, [play, pause]);

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
      applyRate(
        audio,
        from + (target - from) * easeOutCubic(t),
        preservePitchRef.current,
      );
      if (t < 1) {
        elementRateRafRef.current = requestAnimationFrame(step);
      } else {
        applyRate(audio, target, preservePitchRef.current);
        elementRateRafRef.current = null;
      }
    };
    elementRateRafRef.current = requestAnimationFrame(step);
  }, []);

  /**
   * Moves the audio graph onto `target` (an already-composed effective rate),
   * re-anchoring the position model so the playhead stays exact across the
   * change. Must be called *before* the refs feeding `effectiveRate` are
   * updated, so the ramp starts from the rate currently being played.
   */
  const retargetRate = useCallback(
    (target: number, rampSeconds: number) => {
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
          to: target,
          duration: rampSeconds,
        };
        source.playbackRate.cancelScheduledValues(now);
        source.playbackRate.setValueAtTime(from, now);
        if (rampSeconds > 0) {
          source.playbackRate.setValueCurveAtTime(
            playbackCurve(from, target),
            now,
            rampSeconds,
          );
        } else {
          source.playbackRate.setValueAtTime(target, now);
        }
      } else {
        rateTransitionRef.current = null;
      }
      rampElementRate(target, rampSeconds);
    },
    [positionAtCtxTime, rampElementRate, rateAtCtxTime],
  );

  const setPlaybackRate = useCallback(
    (rate: number) => {
      const clamped = Math.max(0.1, Math.min(4, rate));
      retargetRate(
        clampEffectiveRate(clamped * timeScaleRef.current),
        RATE_RAMP_SECONDS,
      );
      playbackRateRef.current = clamped;
      setPlaybackRateState(clamped);
    },
    [retargetRate],
  );

  // Switching to a difficulty with a different rate re-targets the live audio
  // immediately: the position model is in audio time, so the playhead holds the
  // same musical moment while map time re-scales around it.
  const appliedScaleRef = useRef(scale);
  useEffect(() => {
    if (appliedScaleRef.current === scale) return;
    retargetRate(clampEffectiveRate(playbackRateRef.current * scale), 0);
    appliedScaleRef.current = scale;
  }, [scale, retargetRate]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    volumeRef.current = clamped;
    applyOutputMix(0.14);
    setVolumeState(clamped);
  }, [applyOutputMix]);

  // Alt+wheel can fire several times per frame, so it needs the committed
  // volume rather than the value React has rendered so far.
  const getVolume = useCallback(() => volumeRef.current, []);

  useEffect(() => {
    applyOutputMix(0.14);
  }, [masterVolume, applyOutputMix]);

  const setAmbientDucking = useCallback(
    (ducked: boolean) => {
      if (ambientDuckedRef.current === ducked) return;
      ambientDuckedRef.current = ducked;
      setNativeDucked(ducked);
      applyOutputMix(MIX_RAMP_SECONDS);
    },
    [applyOutputMix],
  );

  const getCurrentTime = useCallback(() => {
    const audioMs = (() => {
      if (webAudioActive() && sourceRef.current) {
        return audibleWebPosition(webPosition()) * 1000;
      }
      const audio = audioRef.current;
      if (!webAudioActive() && audio && !audio.paused) {
        // Pitch-kept playback runs on the media element, read through its
        // own steady clock at the rate the element is actually playing.
        return (
          elementClockRef.current.read(
            audio.currentTime,
            audio.playbackRate,
            performance.now(),
          ) * 1000
        );
      }
      return currentTimeRef.current;
    })();
    return audioMs / timeScaleRef.current;
  }, [
    webPosition,
    audibleWebPosition,
    webAudioActive,
  ]);

  const getVisualCurrentTime = useCallback(
    (frameNow = performance.now()) =>
      seekVisualClockRef.current.read(getCurrentTime(), frameNow),
    [getCurrentTime],
  );

  const isVisualSeekActive = useCallback(
    (frameNow = performance.now()) =>
      seekVisualClockRef.current.active(frameNow),
    [],
  );

  const cancelVisualSeek = useCallback(() => {
    seekVisualClockRef.current.cancel();
  }, []);

  /**
   * Stops the buffer engine over `seconds` instead of cutting it, so the
   * element taking over can fade in across it.
   */
  const fadeOutWeb = useCallback(
    (seconds: number) => {
      const ctx = ctxRef.current;
      const source = sourceRef.current;
      if (!ctx || !source) return;
      positionRef.current = webPosition();
      manualStopRef.current = true;
      sourceRef.current = null;
      const fade = ctx.createGain();
      fade.connect(
        fadeGainRef.current ?? filterRef.current ?? gainRef.current ?? ctx.destination,
      );
      const now = ctx.currentTime;
      fade.gain.setValueAtTime(1, now);
      fade.gain.linearRampToValueAtTime(0, now + seconds);
      // Rewired within one task, so the graph switches between render quanta
      // without a click.
      source.disconnect();
      source.connect(fade);
      source.onended = () => {
        source.disconnect();
        fade.disconnect();
      };
      try {
        source.stop(now + seconds);
      } catch {
        // Already stopped.
      }
    },
    [webPosition],
  );

  // How long a paused element takes to start playing, learned from each
  // handoff so the next one is aimed closer.
  const handoffStartupRef = useRef(HANDOFF_STARTUP_GUESS_SECONDS);

  // Moving onto the pitch-preserving element used to stop the buffer engine
  // and start the element, so the song went quiet until the element really
  // played, and the playhead waited with it. Now the element starts muted
  // beside the buffer engine, aimed where that will be once it has started,
  // runs a touch fast or slow until the two line up, and they crossfade.
  const armPitchHandoff = useCallback(() => {
    const audio = audioRef.current;
    const ctx = ctxRef.current;
    const source = sourceRef.current;
    if (!audio || !ctx || !source || cancelPitchHandoffRef.current) return;

    const startedAt = performance.now();
    let frame = 0;
    let seeks = 0;
    let lastSeen = Number.NaN;
    let moving = false;
    let lined = 0;

    const release = () => {
      cancelAnimationFrame(frame);
      if (cancelPitchHandoffRef.current === cancel) {
        cancelPitchHandoffRef.current = null;
      }
    };
    const cancel = () => {
      release();
      // Called off before the swap: the muted element must not play on.
      if (!appliedPitchRef.current) audio.pause();
      audio.muted = false;
    };
    cancelPitchHandoffRef.current = cancel;

    const bufferPosition = () => audibleWebPosition(webPosition());
    // Both engines follow the same rate ramp; nudging waits until it is over.
    const rateSettled = () => {
      const tr = rateTransitionRef.current;
      return (
        elementRateRafRef.current === null &&
        (!tr || ctx.currentTime - tr.startCtxTime >= tr.duration)
      );
    };

    const aim = () => {
      seeks += 1;
      moving = false;
      lined = 0;
      applyRate(audio, effectiveRate(), true);
      audio.muted = true;
      // Where the buffer engine will be heard once the element has started,
      // mid rate-ramp included.
      audio.currentTime = latencyCompensatedPosition(
        positionAtCtxTime(ctx.currentTime + handoffStartupRef.current),
        outputLatencyMs() / 1000,
        effectiveRate(),
      );
      lastSeen = audio.currentTime;
      void audio.play().catch(() => {});
    };

    const commit = () => {
      release();
      if (sourceRef.current !== source || !preservePitchRef.current) {
        cancel();
        return;
      }
      const now = performance.now();
      const previousVisual = seekVisualClockRef.current.read(getCurrentTime(), now);
      const playing = moving && !audio.paused && !audio.seeking;
      fadeOutWeb(HANDOFF_CROSSFADE_SECONDS);
      appliedPitchRef.current = true;
      applyRate(audio, effectiveRate(), true);
      if (playing) {
        positionRef.current = audio.currentTime;
      } else {
        // Never got going: start it where the buffer engine left off.
        audio.currentTime = positionRef.current;
        void audio.play().catch(() => {});
      }
      audio.volume = 0;
      audio.muted = false;
      rampElementVolume(effectivePower(), HANDOFF_CROSSFADE_SECONDS);
      elementClockRef.current.reset();
      // Whatever gap is left between the engines glides away instead of
      // jumping the playfield.
      seekVisualClockRef.current.begin(previousVisual, getCurrentTime(), "smooth", now);
    };

    const step = () => {
      frame = requestAnimationFrame(step);
      if (sourceRef.current !== source || !preservePitchRef.current) {
        cancel();
        return;
      }
      const overdue = performance.now() - startedAt > HANDOFF_GIVE_UP_MS;
      const position = audio.currentTime;
      if (!moving) {
        if (audio.paused || audio.seeking || position === lastSeen) {
          if (overdue) commit();
          return;
        }
        moving = true;
        if (seeks === 1) {
          handoffStartupRef.current = learnHandoffStartup(
            handoffStartupRef.current,
            position - bufferPosition(),
            effectiveRate(),
          );
        }
      }
      const gap = position - bufferPosition();
      if (
        Math.abs(gap) > HANDOFF_RESEEK_SECONDS &&
        seeks < HANDOFF_MAX_SEEKS &&
        !overdue
      ) {
        aim();
        return;
      }
      if (!rateSettled() && !overdue) return;
      lined = Math.abs(gap) <= HANDOFF_LOCK_SECONDS ? lined + 1 : 0;
      if (lined >= HANDOFF_LOCK_FRAMES || overdue) {
        commit();
        return;
      }
      applyRate(audio, handoffCatchUpRate(gap, effectiveRate()), true);
    };

    aim();
    frame = requestAnimationFrame(step);
  }, [
    audibleWebPosition,
    effectivePower,
    effectiveRate,
    fadeOutWeb,
    getCurrentTime,
    outputLatencyMs,
    positionAtCtxTime,
    rampElementVolume,
    webPosition,
  ]);
  armPitchHandoffRef.current = armPitchHandoff;

  // Flipping pitch preservation swaps playback engines, keeping the playhead
  // where it is.
  useEffect(() => {
    if (!pitchLocked) cancelPitchHandoffRef.current?.();
    if (appliedPitchRef.current === pitchLocked) return;
    const audio = audioRef.current;

    if (pitchLocked && sourceRef.current) {
      armPitchHandoff();
      return;
    }

    // The buffer engine starts the instant it is asked, so coming back needs
    // no run-up.
    if (!pitchLocked && audio && !audio.paused && bufferRef.current) {
      const now = performance.now();
      const previousVisual = seekVisualClockRef.current.read(getCurrentTime(), now);
      positionRef.current = elementClockRef.current.read(
        audio.currentTime,
        audio.playbackRate,
        now,
      );
      appliedPitchRef.current = false;
      audio.pause();
      if (startWebRef.current()) {
        // Glide over the output latency rather than holding the playhead
        // still until the buffer engine's audible position catches up.
        audibleStartPositionRef.current =
          Math.max(0, regionRef.current?.startMs ?? 0) / 1000;
        seekVisualClockRef.current.begin(previousVisual, getCurrentTime(), "smooth", now);
        setIsPlaying(true);
      }
      return;
    }

    // Stopped, or the element is the only engine because the song has not
    // decoded yet: only the element's pitch flag needs to follow.
    appliedPitchRef.current = pitchLocked;
    if (audio) applyRate(audio, effectiveRate(), pitchLocked);
  }, [pitchLocked, armPitchHandoff, effectiveRate, getCurrentTime]);

  const seek = useCallback(
    (mapMs: number, transition: AudioSeekTransition = "instant") => {
      if (!Number.isFinite(mapMs)) return;
      const ms = mapMs * timeScaleRef.current;
      const audio = audioRef.current;
      const max =
        Number.isFinite(duration) && duration > 0
          ? duration
          : audio && Number.isFinite(audio.duration)
            ? audio.duration * 1000
            : ms;
      const clamped = Math.max(0, Math.min(ms, max));
      if (!Number.isFinite(clamped)) return;
      const acceptedMapTime = clamped / timeScaleRef.current;
      const now = performance.now();
      const previousVisualTime = seekVisualClockRef.current.read(
        getCurrentTime(),
        now,
      );
      // Drop the interpolation anchor so the actual audio jump remains exact.
      clockRef.current.reset();
      elementClockRef.current.reset();

      if (webAudioActive()) {
        const wasPlaying = sourceRef.current !== null;
        stopWeb(false);
        positionRef.current = clamped / 1000;
        currentTimeRef.current = clamped;
        setCurrentTime(clamped);
        if (wasPlaying) startWeb();
      } else {
        positionRef.current = clamped / 1000;
        currentTimeRef.current = clamped;
        setCurrentTime(clamped);
        if (audio) audio.currentTime = clamped / 1000;
      }

      seekVisualClockRef.current.begin(
        previousVisualTime,
        getCurrentTime(),
        transition,
        now,
      );
      setSeekSignal((previous) => ({
        revision: previous.revision + 1,
        transition,
        targetTime: acceptedMapTime,
      }));
    },
    [
      duration,
      stopWeb,
      startWeb,
      webAudioActive,
      getCurrentTime,
    ],
  );

  useLayoutEffect(() => {
    seekVisualClockRef.current.cancel();
  }, [src, scale]);

  useEffect(() => {
    return () => {
      cancelPitchHandoffRef.current?.();
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

  const native = useNativeAudio({ enabled: exclusive && supportsExclusiveAudio() && !preservePitch,
    buffer: buffer ?? null, region, timeScale: scale, rate: playbackRate,
    volume: effectiveAudioPower(volume * clamp01(masterVolume), nativeDucked), initialPositionMs: getCurrentTime() * scale });
  const previousNative = useRef(false);
  const getNativeTime = native.controller.getCurrentTime;
  useLayoutEffect(() => {
    if (native.selected === previousNative.current) return;
    if (native.selected) {
      stopWeb(true); audioRef.current?.pause(); setIsPlaying(false);
    } else {
      const position = getNativeTime() * scale;
      positionRef.current = position / 1000; currentTimeRef.current = position; setCurrentTime(position);
      if (audioRef.current) audioRef.current.currentTime = position / 1000;
    }
    previousNative.current = native.selected;
  }, [native.selected, getNativeTime, stopWeb, scale]);

  return {
    isPlaying,
    // Map time: the rate-adjusted timeline the editor and its notes live on.
    currentTime: currentTime / scale,
    duration: duration / scale,
    volume,
    playbackRate,
    timeScale: scale,
    seekSignal,
    /** Rate the source file is actually played at, for video/visual sync. */
    effectiveRate: clampEffectiveRate(playbackRate * scale),
    getCurrentTime,
    getVisualCurrentTime,
    isVisualSeekActive,
    cancelVisualSeek,
    play,
    pause,
    toggle,
    seek,
    setPlaybackRate,
    setVolume,
    getVolume,
    setAmbientDucking,
    ...(native.selected ? native.controller : {}),
    nativeAudio: { selected: native.selected, ready: native.ready, error: native.error,
      latencyMs: native.status?.latencyMs ?? null, device: native.status?.device ?? null,
      fallbackReason: exclusive && preservePitch ? "Pitch-preserving playback uses shared audio." : native.error },
  };
}

export type AudioController = ReturnType<typeof useAudio>;

function scaleRegionToAudio(
  region: AudioRegion | null,
  scale: number,
): AudioRegion | null {
  if (!region || scale === 1) return region;
  const at = (ms: number | undefined) => (ms === undefined ? undefined : ms * scale);
  return {
    startMs: at(region.startMs),
    endMs: at(region.endMs),
    fadeInMs: at(region.fadeInMs),
    fadeOutMs: at(region.fadeOutMs),
    loop: region.loop,
  };
}

function applyRate(
  audio: HTMLAudioElement | null,
  rate: number,
  preservePitch = false,
) {
  if (!audio) return;
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
  audio.preservesPitch = preservePitch;
  // @ts-expect-error non-standard
  audio.mozPreservesPitch = preservePitch;
  // @ts-expect-error non-standard
  audio.webkitPreservesPitch = preservePitch;
}
