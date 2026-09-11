import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listLocalTrackSummaries,
  loadLocalTrack,
  type LocalTrack,
  type LocalTrackSummary,
} from "../lib/persistence";
import {
  createPlaybackClock,
  latencyCompensatedPosition,
} from "../lib/playbackClock";
import type { MenuTimingPoint } from "../lib/menuPulse";
import {
  DUCK_FILTER_HZ,
  DUCK_VOLUME_FACTOR,
  MIX_RAMP_SECONDS,
  NORMAL_FILTER_HZ,
} from "../lib/audioAtmosphere";
import type { KiaiRange } from "../lib/timing";

export type MenuTrack = {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  backgroundUrl: string | null;
  previewTime: number;
  bpm: number;
  beatOffsetMs: number;
  /** Every red line, for beat sync across BPM changes. */
  timing: MenuTimingPoint[];
  kiai: KiaiRange[];
};

export type MenuMusic = {
  track: MenuTrack | null;
  isPlaying: boolean;
  hasPlaylist: boolean;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  readLevels: () => Uint8Array | null;
  /** A lightly smoothed spectrum for onset detection. */
  readTransients: () => Uint8Array | null;
  /** The same tap in dB per bin, with the playback volume taken back out. */
  readSpectrum: () => Float32Array | null;
  /** Peak level per channel, 0..1, independent of the playback volume. */
  readAmplitudes: () => { left: number; right: number } | null;
  getPlayback: () => { position: number; duration: number; playing: boolean } | null;
  seek: (ms: number) => void;
  setAmbientDucking: (ducked: boolean) => void;
  fadeOut: (ms: number) => void;
};

const FFT_SIZE = 512;
// ~21 ms at 48 kHz, close to the window osu! reads channel levels over.
const CHANNEL_FFT_SIZE = 1024;
const TRANSIENT_SMOOTHING = 0.2;
const MENU_VOLUME = 0.25;
const FADE_OUT_MS = 260;
const FADE_IN_MS = 520;
// Longer than the start screen's background crossfade.
const URL_GRACE_MS = 2000;

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function rampVolume(
  el: HTMLAudioElement,
  to: number,
  ms: number,
  onDone?: () => void,
): () => void {
  const from = el.volume;
  const started = performance.now();
  let raf = 0;
  const step = () => {
    const t = Math.min(1, (performance.now() - started) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t < 1) raf = requestAnimationFrame(step);
    else onDone?.();
  };
  step();
  return () => cancelAnimationFrame(raf);
}

function toMenuTrack(row: LocalTrack): MenuTrack {
  return {
    id: row.id,
    title: row.title.trim() || "Untitled",
    artist: row.artist.trim(),
    audioUrl: URL.createObjectURL(row.audioBlob),
    backgroundUrl: row.backgroundBlob
      ? URL.createObjectURL(row.backgroundBlob)
      : null,
    previewTime: row.previewTime,
    bpm: row.bpm,
    beatOffsetMs: row.beatOffsetMs,
    timing: row.timing,
    kiai: row.kiai,
  };
}

/** `level` is the music volume already scaled by master, 0..1. */
export function useMenuMusic(
  enabled: boolean,
  suspended = false,
  level = 1,
): MenuMusic {
  const active = enabled && !suspended;
  const [playlist, setPlaylist] = useState<LocalTrackSummary[]>([]);
  const [track, setTrack] = useState<MenuTrack | null>(null);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const duckGainRef = useRef<GainNode | null>(null);
  const duckedRef = useRef(false);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  // Taps straight off the source: a less smoothed spectrum for onsets, and one
  // analyser per channel for peak levels.
  const transientRef = useRef<AnalyserNode | null>(null);
  const stereoRef = useRef<GainNode | null>(null);
  const channelsRef = useRef<[AnalyserNode, AnalyserNode] | null>(null);
  const transientLevelsRef = useRef(
    new Uint8Array(new ArrayBuffer(FFT_SIZE / 2)),
  );
  const waveRef = useRef(new Float32Array(new ArrayBuffer(CHANNEL_FFT_SIZE * 4)));
  const spectrumRef = useRef(new Float32Array(new ArrayBuffer(FFT_SIZE * 2)));
  const clockRef = useRef(createPlaybackClock());
  const levelsRef = useRef(new Uint8Array(new ArrayBuffer(FFT_SIZE / 2)));
  const wantsPlayRef = useRef(true);
  const resumeOnEnableRef = useRef(true);
  const volumeRef = useRef(Math.min(1, Math.max(0, level)) * MENU_VOLUME);
  volumeRef.current = Math.min(1, Math.max(0, level)) * MENU_VOLUME;
  const cancelFadeRef = useRef<(() => void) | null>(null);
  // A skip still fading the current song out, and how far it will move.
  const leavingRef = useRef(false);
  const pendingSkipRef = useRef(0);
  const indexRef = useRef(index);
  indexRef.current = index;
  const playlistRef = useRef(playlist);
  playlistRef.current = playlist;

  const fade = useCallback(
    (el: HTMLAudioElement, to: number, ms: number, onDone?: () => void) => {
      cancelFadeRef.current?.();
      // Any other fade takes over from a skip that was still fading out.
      leavingRef.current = false;
      pendingSkipRef.current = 0;
      cancelFadeRef.current = rampVolume(el, to, ms, () => {
        cancelFadeRef.current = null;
        onDone?.();
      });
    },
    [],
  );

  // Follow Master/Music changes live instead of only on the next track.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || el.paused || !wantsPlayRef.current || leavingRef.current) return;
    fade(el, volumeRef.current, 120);
  }, [level, fade]);

  useEffect(() => {
    if (!enabled) {
      setPlaylist([]);
      setIndex(0);
      return;
    }
    let cancelled = false;
    listLocalTrackSummaries()
      .then((rows) => {
        if (cancelled) return;
        setPlaylist(shuffle(rows));
        setIndex(0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const selected = playlist.length ? playlist[index % playlist.length] : null;

  useEffect(() => {
    // The playing track stays up until the next one is ready, so the song
    // card and background never blank out between songs.
    if (!enabled || !selected) {
      setTrack(null);
      return;
    }
    let cancelled = false;
    loadLocalTrack(selected.id)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setPlaylist((items) => items.filter((item) => item.id !== selected.id));
          setIndex(0);
          return;
        }
        setTrack(toMenuTrack(row));
      })
      .catch(() => {
        if (cancelled) return;
        setPlaylist((items) => items.filter((item) => item.id !== selected.id));
        setIndex(0);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, selected]);

  // Object URLs outlive their track by a moment so the background crossfade
  // can finish drawing from the old picture.
  useEffect(() => {
    if (!track) return;
    return () => {
      const urls = track.backgroundUrl
        ? [track.audioUrl, track.backgroundUrl]
        : [track.audioUrl];
      window.setTimeout(() => {
        for (const url of urls) URL.revokeObjectURL(url);
      }, URL_GRACE_MS);
    };
  }, [track]);

  const connect = useCallback((el: HTMLAudioElement) => {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    try {
      if (!ctxRef.current) {
        const ctx = new Ctor();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.74;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = duckedRef.current
          ? DUCK_FILTER_HZ
          : NORMAL_FILTER_HZ;
        const duckGain = ctx.createGain();
        duckGain.gain.value = duckedRef.current ? DUCK_VOLUME_FACTOR : 1;
        analyser.connect(filter);
        filter.connect(duckGain);
        duckGain.connect(ctx.destination);
        const transient = ctx.createAnalyser();
        transient.fftSize = FFT_SIZE;
        transient.smoothingTimeConstant = TRANSIENT_SMOOTHING;
        // Mono files are up-mixed so both channels read a level.
        const stereo = ctx.createGain();
        stereo.channelCount = 2;
        stereo.channelCountMode = "explicit";
        stereo.channelInterpretation = "speakers";
        const splitter = ctx.createChannelSplitter(2);
        const left = ctx.createAnalyser();
        const right = ctx.createAnalyser();
        left.fftSize = CHANNEL_FFT_SIZE;
        right.fftSize = CHANNEL_FFT_SIZE;
        // A silent sink keeps every browser pulling the taps.
        const sink = ctx.createGain();
        sink.gain.value = 0;
        stereo.connect(splitter);
        splitter.connect(left, 0);
        splitter.connect(right, 1);
        left.connect(sink);
        right.connect(sink);
        transient.connect(sink);
        sink.connect(ctx.destination);
        ctxRef.current = ctx;
        analyserRef.current = analyser;
        filterRef.current = filter;
        duckGainRef.current = duckGain;
        transientRef.current = transient;
        stereoRef.current = stereo;
        channelsRef.current = [left, right];
      }
      const ctx = ctxRef.current;
      const analyser = analyserRef.current;
      if (!ctx || !analyser || sourceRef.current) return;
      const source = ctx.createMediaElementSource(el);
      source.connect(analyser);
      if (transientRef.current) source.connect(transientRef.current);
      if (stereoRef.current) source.connect(stereoRef.current);
      sourceRef.current = source;
    } catch {
      sourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (active) {
      if (resumeOnEnableRef.current) wantsPlayRef.current = true;
      if (el && el.paused && wantsPlayRef.current) {
        connect(el);
        void ctxRef.current?.resume().catch(() => {});
        el.play().catch(() => {});
      }
      return;
    }
    resumeOnEnableRef.current = wantsPlayRef.current;
    wantsPlayRef.current = false;
    if (!el) {
      void ctxRef.current?.suspend().catch(() => {});
      return;
    }
    fade(el, 0, FADE_OUT_MS, () => {
      el.pause();
      void ctxRef.current?.suspend().catch(() => {});
    });
  }, [active, connect, fade]);

  useEffect(() => {
    if (!enabled || !track) return;
    const el = new Audio(track.audioUrl);
    el.preload = "auto";
    el.volume = 0;
    audioRef.current = el;

    let seeked = false;
    let advanced = false;
    const advance = () => {
      if (advanced || audioRef.current !== el) return;
      advanced = true;
      setIndex((i) => i + 1);
    };
    const onPlay = () => {
      clockRef.current.reset();
      setIsPlaying(true);
      fade(el, volumeRef.current, FADE_IN_MS);
    };
    const onPause = () => {
      clockRef.current.reset();
      setIsPlaying(false);
    };
    const onEnded = advance;
    const onError = advance;
    const onReady = () => {
      if (seeked) return;
      const from = track.previewTime / 1000;
      if (!(from > 0) || !Number.isFinite(el.duration)) return;
      seeked = true;
      el.currentTime = el.duration > from + 5 ? from : 0;
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    el.addEventListener("loadedmetadata", onReady);
    el.addEventListener("canplay", onReady);

    const start = () => {
      if (!wantsPlayRef.current) return;
      connect(el);
      void ctxRef.current?.resume().catch(() => {});
      el.play().catch(() => {});
    };
    start();

    const onGesture = () => {
      if (audioRef.current === el && el.paused && wantsPlayRef.current) start();
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);

    return () => {
      cancelFadeRef.current?.();
      cancelFadeRef.current = null;
      leavingRef.current = false;
      pendingSkipRef.current = 0;
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      el.removeEventListener("loadedmetadata", onReady);
      el.removeEventListener("canplay", onReady);
      el.pause();
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      el.removeAttribute("src");
      el.load();
      if (audioRef.current === el) audioRef.current = null;
      setIsPlaying(false);
    };
  }, [enabled, track, connect, fade]);

  useEffect(
    () => () => {
      const ctx = ctxRef.current;
      ctxRef.current = null;
      analyserRef.current = null;
      transientRef.current = null;
      stereoRef.current = null;
      channelsRef.current = null;
      void ctx?.close().catch(() => {});
    },
    [],
  );

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      wantsPlayRef.current = true;
      connect(el);
      void ctxRef.current?.resume().catch(() => {});
      el.play().catch(() => {});
    } else {
      wantsPlayRef.current = false;
      fade(el, 0, FADE_OUT_MS, () => el.pause());
    }
  }, [connect, fade]);

  // Presses made while a skip is still fading out add up and land together,
  // instead of restarting the fade and losing the earlier ones.
  const skip = useCallback(
    (step: number) => {
      wantsPlayRef.current = true;
      if (leavingRef.current) {
        pendingSkipRef.current += step;
        return;
      }
      const moveBy = (steps: number) => {
        const list = playlistRef.current;
        const from = indexRef.current;
        const to = Math.max(0, from + steps);
        if (list.length && list[to % list.length] !== list[from % list.length]) {
          setIndex(to);
          return;
        }
        // Nowhere else to go: bring the current song back up.
        const el = audioRef.current;
        if (el && !el.paused) fade(el, volumeRef.current, FADE_IN_MS);
      };
      const el = audioRef.current;
      if (!el || el.paused) {
        moveBy(step);
        return;
      }
      fade(el, 0, FADE_OUT_MS, () => {
        const steps = pendingSkipRef.current;
        leavingRef.current = false;
        pendingSkipRef.current = 0;
        moveBy(steps);
      });
      leavingRef.current = true;
      pendingSkipRef.current = step;
    },
    [fade],
  );

  const next = useCallback(() => skip(1), [skip]);
  const previous = useCallback(() => skip(-1), [skip]);

  const fadeOut = useCallback(
    (ms: number) => {
      wantsPlayRef.current = false;
      const el = audioRef.current;
      if (!el || el.paused) return;
      fade(el, 0, ms, () => el.pause());
    },
    [fade],
  );

  const seek = useCallback((ms: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    clockRef.current.reset();
    el.currentTime = Math.max(0, Math.min(el.duration, ms / 1000));
  }, []);

  const readLevels = useCallback(() => {
    const analyser = analyserRef.current;
    const el = audioRef.current;
    if (!analyser || !el || el.paused) return null;
    analyser.getByteFrequencyData(levelsRef.current);
    return levelsRef.current;
  }, []);

  const readTransients = useCallback(() => {
    const analyser = transientRef.current;
    const el = audioRef.current;
    if (!analyser || !sourceRef.current || !el || el.paused) return null;
    analyser.getByteFrequencyData(transientLevelsRef.current);
    return transientLevelsRef.current;
  }, []);

  const readSpectrum = useCallback(() => {
    const analyser = transientRef.current;
    const el = audioRef.current;
    if (!analyser || !sourceRef.current || !el || el.paused) return null;
    if (el.volume < 0.01) return null;
    const spectrum = spectrumRef.current;
    analyser.getFloatFrequencyData(spectrum);
    // The tap sits after the element's volume; lift it back out so the bars
    // follow the song rather than the menu's playback level.
    const lift = -20 * Math.log10(el.volume);
    for (let i = 0; i < spectrum.length; i++) spectrum[i] += lift;
    return spectrum;
  }, []);

  const readAmplitudes = useCallback(() => {
    const channels = channelsRef.current;
    const el = audioRef.current;
    if (!channels || !sourceRef.current || !el || el.paused) return null;
    // The element's volume, fades included, is applied before the graph.
    // Dividing it back out gives the song's own level, as osu! measures it.
    const volume = el.volume;
    if (volume < 0.01) return null;
    const wave = waveRef.current;
    const peak = (analyser: AnalyserNode) => {
      analyser.getFloatTimeDomainData(wave);
      let max = 0;
      for (let i = 0; i < wave.length; i++) {
        const sample = Math.abs(wave[i]);
        if (sample > max) max = sample;
      }
      return Math.min(1, max / volume);
    };
    return { left: peak(channels[0]), right: peak(channels[1]) };
  }, []);

  const setAmbientDucking = useCallback((ducked: boolean) => {
    if (duckedRef.current === ducked) return;
    duckedRef.current = ducked;
    const ctx = ctxRef.current;
    const filter = filterRef.current;
    const gain = duckGainRef.current;
    if (!ctx || !filter || !gain) return;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(
      ducked ? DUCK_VOLUME_FACTOR : 1,
      now + MIX_RAMP_SECONDS,
    );
    filter.frequency.cancelScheduledValues(now);
    filter.frequency.setValueAtTime(Math.max(40, filter.frequency.value), now);
    filter.frequency.exponentialRampToValueAtTime(
      ducked ? DUCK_FILTER_HZ : NORMAL_FILTER_HZ,
      now + MIX_RAMP_SECONDS,
    );
  }, []);

  // currentTime steps coarsely and runs ahead of what is heard by the output
  // latency, so beat-synced effects read a smoothed, compensated position.
  const getPlayback = useCallback(() => {
    const el = audioRef.current;
    if (!el) return null;
    const playing = !el.paused;
    let seconds = el.currentTime;
    if (playing) {
      const rate = el.playbackRate || 1;
      seconds = clockRef.current.read(seconds, rate, performance.now());
      const ctx = ctxRef.current;
      if (ctx && sourceRef.current) {
        seconds = latencyCompensatedPosition(
          seconds,
          (ctx.baseLatency || 0) + (ctx.outputLatency || 0),
          rate,
        );
      }
    }
    return {
      position: seconds * 1000,
      duration: Number.isFinite(el.duration) ? el.duration * 1000 : 0,
      playing,
    };
  }, []);

  return useMemo(
    () => ({
      track,
      isPlaying,
      hasPlaylist: playlist.length > 0,
      toggle,
      next,
      previous,
      readLevels,
      readTransients,
      readSpectrum,
      readAmplitudes,
      getPlayback,
      seek,
      setAmbientDucking,
      fadeOut,
    }),
    [
      track,
      isPlaying,
      playlist.length,
      toggle,
      next,
      previous,
      readLevels,
      readTransients,
      readSpectrum,
      readAmplitudes,
      getPlayback,
      seek,
      setAmbientDucking,
      fadeOut,
    ],
  );
}
