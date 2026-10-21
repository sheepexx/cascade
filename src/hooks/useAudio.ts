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
  SongVoice,
  loadStretchSong,
  type StretchSongHandle,
} from "../lib/timeStretchEngine";
import {
  easeOutCubic,
  positionAt,
  rateAt,
  type RateTransition,
} from "../lib/rateTransition";
import { useNativeAudio } from "./useNativeAudio";
import { supportsExclusiveAudio } from "../lib/nativeAudio";

const RATE_RAMP_SECONDS = 0.34;
const CLOCK_UI_INTERVAL_MS = 100;
/** Crossfade when a buffer source hands over to a SongVoice mid-play. */
const VOICE_SWAP_SECONDS = 0.02;

const MIN_EFFECTIVE_RATE = 0.0625;
const MAX_EFFECTIVE_RATE = 8;

const clampTimeScale = (scale: number): number =>
  !Number.isFinite(scale) || scale <= 0 ? 1 : Math.max(0.05, Math.min(16, scale));

const clampEffectiveRate = (rate: number): number =>
  Math.max(MIN_EFFECTIVE_RATE, Math.min(MAX_EFFECTIVE_RATE, rate));

/**
 * What a decoded song plays through. A buffer source follows its playbackRate
 * param; a SongVoice is handed the playback model itself and keeps the pitch
 * by itself whenever it should. `gain` is per voice, so two can crossfade.
 */
type WebVoice =
  | { kind: "buffer"; source: AudioBufferSourceNode; gain: GainNode }
  | { kind: "song"; source: SongVoice; gain: GainNode };

export type AudioRegion = {
  startMs?: number;
  endMs?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  loop?: boolean;
};

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
  const voiceRef = useRef<WebVoice | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(buffer ?? null);
  const positionRef = useRef(0);
  const startCtxTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const audibleStartPositionRef = useRef(0);
  const manualStopRef = useRef(false);
  // The Web Audio clock: the context ticks once per render quantum, so the
  // raw reading repeats for several frames at a high refresh rate.
  const clockRef = useRef(createPlaybackClock());
  // The media element's clock, for playback before the song has decoded. Its
  // currentTime is a snapshot refreshed once per task, so on a busy page it
  // arrives a varying amount stale; pulling the playhead toward each reading
  // made the playfield jitter.
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
  // The rate changes of the last moment, oldest first, so the playhead can
  // look back one output latency to what is being heard.
  const transitionHistoryRef = useRef<RateTransition[]>([]);
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

  // AudioBufferSourceNode.playbackRate has no pitch correction, so where the
  // pitch may need keeping the decoded song plays through a SongVoice
  // instead: the song on the audio thread, resampled just like the buffer
  // source or time-stretched, switching between the two on the very block
  // the rate crosses `stretchBelow`. One position drives both, on the Web
  // Audio clock, so the switch is instant and the playhead never moves.
  // Slowing the transport below 100% keeps the pitch when keepPitchWhenSlowed
  // is on. Exclusive output cannot time-stretch, and reopening the device on
  // every speed change would stall playback, so it keeps its engine and
  // slowed audio still plays lower there.
  const keepsPitchOnExclusive = !(exclusive && supportsExclusiveAudio());
  const pitchCapable =
    preservePitch || (keepPitchWhenSlowed && keepsPitchOnExclusive);
  const pitchLockedAt = (rate: number): boolean =>
    preservePitch || (pitchCapable && rate < 1);
  const pitchLocked = pitchLockedAt(playbackRate);
  const preservePitchRef = useRef(pitchLocked);
  preservePitchRef.current = pitchLocked;
  // setPlaybackRate needs the answer for its new rate before React renders.
  const pitchLockedAtRef = useRef(pitchLockedAt);
  pitchLockedAtRef.current = pitchLockedAt;
  // The same rule in effective rate, for SongVoice: user rate 1 is the
  // difficulty's own rate.
  const stretchBelow = preservePitch
    ? Number.POSITIVE_INFINITY
    : pitchCapable
      ? scale
      : 0;
  const stretchBelowRef = useRef(stretchBelow);
  stretchBelowRef.current = stretchBelow;

  // The decoded song as loaded onto the audio thread for SongVoice.
  const stretchSongRef = useRef<StretchSongHandle | null>(null);
  // AudioWorklet is missing outside secure contexts and in old browsers. Only
  // then does pitch-kept playback fall back to the media element, which
  // stretches natively but cannot be held in sync as tightly.
  const stretchUnavailableRef = useRef(false);
  const elementEngineRef = useRef(false);
  const syncEngineRef = useRef<() => void>(() => {});

  /** Whether the Web Audio engine (rather than the element) drives playback. */
  const webAudioActive = useCallback(
    (): boolean => bufferRef.current !== null && !elementEngineRef.current,
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
    // Animation frames stop while the page is hidden, so a hidden page lands
    // on the target straight away instead of stalling partway.
    if (document.visibilityState === "hidden") {
      audio.volume = clamp01(target);
      return;
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

  const createCtx = useCallback((): AudioContext | null => {
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
    return ctx;
  }, [effectivePower, targetFilterFrequency]);

  const ensureCtx = useCallback((): AudioContext | null => {
    const ctx = createCtx();
    if (ctx?.state === "suspended") void ctx.resume();
    return ctx;
  }, [createCtx]);

  const rateAtCtxTime = useCallback((ctxTime: number): number => {
    const tr = rateTransitionRef.current;
    return tr ? rateAt(tr, ctxTime) : effectiveRate();
  }, [effectiveRate]);

  const syncLivePlaybackRate = useCallback((): number => {
    const ctx = ctxRef.current;
    return ctx ? rateAtCtxTime(ctx.currentTime) : effectiveRate();
  }, [rateAtCtxTime, effectiveRate]);

  const positionAtCtxTime = useCallback((ctxTime: number): number => {
    const tr = rateTransitionRef.current;
    if (tr) return positionAt(tr, ctxTime);
    return (
      startOffsetRef.current +
      (ctxTime - startCtxTimeRef.current) * effectiveRate()
    );
  }, [effectiveRate]);

  const outputLatencyMs = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return 0;
    const lat =
      typeof ctx.outputLatency === "number" && ctx.outputLatency > 0
        ? ctx.outputLatency
        : ctx.baseLatency || 0;
    return lat * 1000;
  }, []);

  // The context clock, smoothed into a per-frame one. Smoothing the clock
  // rather than the song position keeps every position read off it exact
  // through a rate ramp.
  const smoothCtxTime = useCallback(
    (ctx: AudioContext): number =>
      clockRef.current.read(ctx.currentTime, 1, performance.now()),
    [],
  );

  /**
   * Song seconds being heard at context time `ctxTime`: what was rendered one
   * output latency before. Read off the rate that was in force back then, so
   * a ramp moves the playhead exactly as it moves the sound. Taking
   * `latency × rate` off the present position instead lurched the playfield
   * forward on slowing down and back on speeding up, by up to a tenth of a
   * second on Bluetooth headphones.
   */
  const positionHeardAt = useCallback(
    (ctxTime: number): number => {
      const t = ctxTime - outputLatencyMs() / 1000;
      const history = transitionHistoryRef.current;
      let i = history.length - 1;
      while (i > 0 && history[i].startCtxTime > t) i--;
      const heard = history[i] ? positionAt(history[i], t) : positionAtCtxTime(t);
      return Math.max(audibleStartPositionRef.current, heard);
    },
    [outputLatencyMs, positionAtCtxTime],
  );

  const webPosition = useCallback((): number => {
    const ctx = ctxRef.current;
    if (voiceRef.current && ctx) return positionAtCtxTime(smoothCtxTime(ctx));
    clockRef.current.reset();
    return positionRef.current;
  }, [positionAtCtxTime, smoothCtxTime]);

  const audibleWebPosition = useCallback((): number => {
    const ctx = ctxRef.current;
    if (voiceRef.current && ctx) return positionHeardAt(smoothCtxTime(ctx));
    return positionRef.current;
  }, [positionHeardAt, smoothCtxTime]);

  const stopWeb = useCallback(
    (savePosition: boolean) => {
      const voice = voiceRef.current;
      if (!voice) return;
      if (savePosition) positionRef.current = webPosition();
      manualStopRef.current = true;
      voice.source.onended = null;
      try {
        voice.source.stop();
      } catch {
      }
      voice.source.disconnect();
      voice.gain.disconnect();
      voiceRef.current = null;
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

  /**
   * Starts the decoded song from `positionRef`, through a SongVoice once the
   * song is on the audio thread. `fadeInSeconds` and `initialRate` let a voice
   * swap pick up seamlessly from the voice before.
   */
  const startWeb = useCallback((
    fadeInSeconds = 0,
    initialRate = effectiveRate(),
  ): boolean => {
    const audioBuffer = bufferRef.current;
    const ctx = ensureCtx();
    const output = fadeGainRef.current ?? filterRef.current ?? gainRef.current;
    if (!audioBuffer || !ctx || !output) return false;
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

    const startAt = ctx.currentTime;
    const transition: RateTransition = {
      startCtxTime: startAt,
      startPosition: positionRef.current,
      from: initialRate,
      to: initialRate,
      duration: 0,
    };
    const gain = ctx.createGain();
    if (fadeInSeconds > 0) {
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(1, startAt + fadeInSeconds);
    }
    const song = stretchSongRef.current;
    let voice: WebVoice | null = null;
    if (song && song.ctx === ctx && song.buffer === audioBuffer) {
      try {
        voice = {
          kind: "song",
          source: new SongVoice(song, stretchBelowRef.current),
          gain,
        };
      } catch (err) {
        // Plain playback still works without the worklet.
        console.warn("Song voice failed to start:", err);
      }
    }
    if (!voice) {
      const node = ctx.createBufferSource();
      node.buffer = audioBuffer;
      node.playbackRate.value = initialRate;
      voice = { kind: "buffer", source: node, gain };
    }
    voice.source.connect(gain);
    gain.connect(output);
    scheduleFadeEnvelope(ctx, positionRef.current, durMs);
    voice.source.onended = () => {
      seekVisualClockRef.current.cancel();
      voiceRef.current = null;
      gain.disconnect();
      positionRef.current = durMs / 1000;
      currentTimeRef.current = durMs;
      setCurrentTime(durMs);
      setIsPlaying(false);
    };
    startOffsetRef.current = positionRef.current;
    startCtxTimeRef.current = startAt;
    rateTransitionRef.current = transition;
    transitionHistoryRef.current = [transition];
    manualStopRef.current = false;
    if (voice.kind === "song") {
      voice.source.start(0, transition);
    } else {
      voice.source.start(0, positionRef.current);
    }
    voiceRef.current = voice;
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
    // Started before the song decoded: move off the element now it has.
    syncEngineRef.current();
  }, [buffer]);

  // Copy the song onto the audio thread as soon as it decodes, so the first
  // slow-down already has the stretch ready instead of waiting on it.
  useEffect(() => {
    if (!buffer || !pitchCapable) return;
    const ctx = createCtx();
    if (!ctx) return;
    let cancelled = false;
    let loaded: StretchSongHandle | null = null;
    void loadStretchSong(ctx, buffer).then((song) => {
      if (cancelled) {
        song?.release();
        return;
      }
      if (song) {
        loaded = song;
        stretchSongRef.current = song;
      } else {
        stretchUnavailableRef.current = true;
      }
      syncEngineRef.current();
    });
    return () => {
      cancelled = true;
      if (loaded && stretchSongRef.current === loaded) stretchSongRef.current = null;
      loaded?.release();
    };
  }, [buffer, pitchCapable, createCtx]);

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
    if (!voiceRef.current) {
      elementEngineRef.current =
        preservePitchRef.current && stretchUnavailableRef.current;
    }
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
    const webWasPlaying = voiceRef.current !== null;
    const visualWasMoving = seekVisualClockRef.current.active(now);
    const liveRate = syncLivePlaybackRate();
    const latencySeconds = outputLatencyMs() / 1000;
    let resumePosition = positionRef.current;
    let liveAudioPosition = currentTimeRef.current / 1000;

    const ctx = ctxRef.current;
    if (webWasPlaying && ctx) {
      const at = smoothCtxTime(ctx);
      resumePosition = positionAtCtxTime(at);
      liveAudioPosition = positionHeardAt(at);
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

    // The playhead stops on what was being heard.
    const frozenAudioPosition = !webWasPlaying
      ? resumePosition
      : visualWasMoving
        ? latencyCompensatedPosition(resumePosition, latencySeconds, liveRate, regionStart)
        : Math.min(liveAudioPosition, resumePosition);
    const frozenAudioMs = frozenAudioPosition * 1000;
    setCurrentTime(frozenAudioMs);
    currentTimeRef.current = frozenAudioMs;
    setIsPlaying(false);
  }, [
    duration,
    outputLatencyMs,
    positionAtCtxTime,
    positionHeardAt,
    smoothCtxTime,
    stopWeb,
    syncLivePlaybackRate,
  ]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    const playing = voiceRef.current !== null || !!audio && !audio.paused;
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
      const voice = voiceRef.current;
      if (voice && ctx) {
        const now = ctx.currentTime;
        const from = rateAtCtxTime(now);
        const startPosition = positionAtCtxTime(now);
        positionRef.current = startPosition;
        startOffsetRef.current = startPosition;
        startCtxTimeRef.current = now;
        const transition: RateTransition = {
          startCtxTime: now,
          startPosition,
          from,
          to: target,
          duration: rampSeconds,
        };
        rateTransitionRef.current = transition;
        const history = transitionHistoryRef.current;
        history.push(transition);
        // Only the last moment is ever looked back on.
        while (history.length > 1 && history[1].startCtxTime < now - 2) history.shift();
        if (voice.kind === "song") {
          voice.source.follow(transition);
        } else {
          const rate = voice.source.playbackRate;
          rate.cancelScheduledValues(now);
          rate.setValueAtTime(from, now);
          if (rampSeconds > 0) {
            rate.setValueCurveAtTime(playbackCurve(from, target), now, rampSeconds);
          } else {
            rate.setValueAtTime(target, now);
          }
        }
      } else {
        rateTransitionRef.current = null;
      }
      rampElementRate(target, rampSeconds);
    },
    [positionAtCtxTime, rampElementRate, rateAtCtxTime],
  );

  /** `rampSeconds` 0 switches at once, as a playtest run needs from its first note. */
  const setPlaybackRate = useCallback(
    (rate: number, rampSeconds = RATE_RAMP_SECONDS) => {
      const clamped = Math.max(0.1, Math.min(4, rate));
      retargetRate(
        clampEffectiveRate(clamped * timeScaleRef.current),
        rampSeconds,
      );
      playbackRateRef.current = clamped;
      setPlaybackRateState(clamped);
      // A SongVoice switches to keeping the pitch by itself. A buffer source
      // still playing makes way for one here rather than a render later, so
      // the new voice takes the whole ramp.
      preservePitchRef.current = pitchLockedAtRef.current(clamped);
      syncEngineRef.current();
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
      if (webAudioActive() && voiceRef.current) {
        return audibleWebPosition() * 1000;
      }
      const audio = audioRef.current;
      if (!webAudioActive() && audio && !audio.paused) {
        // The media element, read through its own steady clock at the rate
        // the element is actually playing.
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
   * Stops the playing voice over `seconds` instead of cutting it, so the
   * voice taking over can fade in across it.
   */
  const fadeOutWeb = useCallback((seconds: number) => {
    const ctx = ctxRef.current;
    const voice = voiceRef.current;
    if (!ctx || !voice) return;
    manualStopRef.current = true;
    voiceRef.current = null;
    const now = ctx.currentTime;
    const level = voice.gain.gain;
    level.cancelScheduledValues(now);
    level.setValueAtTime(level.value, now);
    level.linearRampToValueAtTime(0, now + seconds);
    voice.source.onended = () => {
      voice.source.disconnect();
      voice.gain.disconnect();
    };
    try {
      voice.source.stop(now + seconds);
    } catch {
      // Already stopped.
    }
  }, []);

  // Pitch-kept playback used to hand the song over to the media element,
  // which took up to two seconds to line up, playing the slowed song at the
  // wrong pitch meanwhile, and then drifted, because its currentTime could not
  // be trusted after a seek. A SongVoice now switches by itself, on the
  // context clock, so this only steps in when the engine itself must change.
  /**
   * Puts playback on the engine the pitch setting calls for, keeping the
   * playhead where it is. Does nothing when playback already is there, so it
   * is safe to call whenever something it depends on may have changed.
   */
  const syncEngine = useCallback(() => {
    const audio = audioRef.current;
    const ctx = ctxRef.current;
    const buffer = bufferRef.current;
    const pitch = preservePitchRef.current;
    const voice = voiceRef.current;
    // The element only needs its pitch flag to follow; its rate may be
    // mid-ramp, so that is left alone.
    const flagElement = (preserve: boolean) => {
      if (audio) applyRate(audio, audio.playbackRate || effectiveRate(), preserve);
    };
    if (!buffer) {
      flagElement(pitch);
      return;
    }
    const wantElement = pitch && stretchUnavailableRef.current;
    const elementPlaying = !voice && !!audio && !audio.paused;
    if (!voice && !elementPlaying) {
      // Stopped: the next play starts on whichever engine fits.
      elementEngineRef.current = wantElement;
      flagElement(pitch);
      return;
    }

    const now = performance.now();
    const previousVisual = seekVisualClockRef.current.read(getCurrentTime(), now);
    // Whatever the clocks' smoothing still disagrees by glides away instead
    // of jumping the playfield.
    const glide = () =>
      seekVisualClockRef.current.begin(previousVisual, getCurrentTime(), "smooth", now);
    const keepAudibleRunning = () => {
      audibleStartPositionRef.current =
        Math.max(0, regionRef.current?.startMs ?? 0) / 1000;
    };

    if (voice && ctx) {
      if (wantElement) {
        if (!audio) return;
        const heard = audibleWebPosition();
        stopWeb(false);
        elementEngineRef.current = true;
        positionRef.current = heard;
        applyRate(audio, effectiveRate(), true);
        audio.currentTime = heard;
        elementClockRef.current.reset();
        void audio.play().catch(() => {});
        glide();
        return;
      }
      // A SongVoice keeps the pitch by itself. Only a buffer source, started
      // before the song reached the audio thread, has to make way for one.
      const song = stretchSongRef.current;
      const at = ctx.currentTime;
      const liveRate = rateAtCtxTime(at);
      const pitchWanted = pitch || liveRate < stretchBelowRef.current - 1e-9;
      if (
        voice.kind === "song" ||
        !pitchWanted ||
        !song ||
        song.ctx !== ctx ||
        song.buffer !== buffer
      ) {
        return;
      }
      const transition = rateTransitionRef.current;
      const rampLeft = transition
        ? transition.startCtxTime + transition.duration - at
        : 0;
      positionRef.current = positionAtCtxTime(at);
      fadeOutWeb(VOICE_SWAP_SECONDS);
      if (!startWeb(VOICE_SWAP_SECONDS, liveRate)) return;
      // Carry on whatever rate ramp the old voice was partway through.
      const target = effectiveRate();
      if (Math.abs(target - liveRate) > 1e-6) {
        retargetRate(target, Math.max(0, rampLeft));
      }
      keepAudibleRunning();
      glide();
      return;
    }

    if (!audio) return;
    if (wantElement) {
      flagElement(true);
      return;
    }
    // On the element because playback began before the song decoded, or
    // because pitch-kept playback had no worklet: back onto Web Audio.
    positionRef.current = elementClockRef.current.read(
      audio.currentTime,
      audio.playbackRate,
      now,
    );
    elementEngineRef.current = false;
    audio.pause();
    if (startWeb()) {
      keepAudibleRunning();
      glide();
      setIsPlaying(true);
    }
  }, [
    audibleWebPosition,
    effectiveRate,
    fadeOutWeb,
    getCurrentTime,
    positionAtCtxTime,
    rateAtCtxTime,
    retargetRate,
    startWeb,
    stopWeb,
  ]);
  syncEngineRef.current = syncEngine;

  // The transport rate, the keep-pitch setting or the difficulty's pitch flag
  // changed.
  useEffect(() => {
    syncEngine();
  }, [pitchLocked, syncEngine]);

  useEffect(() => {
    const voice = voiceRef.current;
    if (voice?.kind === "song") voice.source.setStretchBelow(stretchBelow);
  }, [stretchBelow]);

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
        const wasPlaying = voiceRef.current !== null;
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
