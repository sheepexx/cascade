import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listLocalTrackSummaries,
  loadLocalTrack,
  loadVolume,
  type LocalTrack,
  type LocalTrackSummary,
} from "../lib/persistence";
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
  getPlayback: () => { position: number; duration: number; playing: boolean } | null;
  seek: (ms: number) => void;
  setAmbientDucking: (ducked: boolean) => void;
  fadeOut: (ms: number) => void;
};

const FFT_SIZE = 512;
const MENU_VOLUME = 0.25;
const FADE_OUT_MS = 260;
const FADE_IN_MS = 520;

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
    kiai: row.kiai,
  };
}

export function useMenuMusic(enabled: boolean, suspended = false): MenuMusic {
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
  const levelsRef = useRef(new Uint8Array(new ArrayBuffer(FFT_SIZE / 2)));
  const wantsPlayRef = useRef(true);
  const resumeOnEnableRef = useRef(true);
  const volumeRef = useRef(MENU_VOLUME);
  const cancelFadeRef = useRef<(() => void) | null>(null);

  const fade = useCallback(
    (el: HTMLAudioElement, to: number, ms: number, onDone?: () => void) => {
      cancelFadeRef.current?.();
      cancelFadeRef.current = rampVolume(el, to, ms, () => {
        cancelFadeRef.current = null;
        onDone?.();
      });
    },
    [],
  );

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
    setTrack(null);
    if (!enabled || !selected) return;
    let cancelled = false;
    let urls: string[] = [];
    loadLocalTrack(selected.id)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setPlaylist((items) => items.filter((item) => item.id !== selected.id));
          setIndex(0);
          return;
        }
        const next = toMenuTrack(row);
        urls = next.backgroundUrl
          ? [next.audioUrl, next.backgroundUrl]
          : [next.audioUrl];
        setTrack(next);
      })
      .catch(() => {
        if (cancelled) return;
        setPlaylist((items) => items.filter((item) => item.id !== selected.id));
        setIndex(0);
      });
    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [enabled, selected]);

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
        ctxRef.current = ctx;
        analyserRef.current = analyser;
        filterRef.current = filter;
        duckGainRef.current = duckGain;
      }
      const ctx = ctxRef.current;
      const analyser = analyserRef.current;
      if (!ctx || !analyser || sourceRef.current) return;
      const source = ctx.createMediaElementSource(el);
      source.connect(analyser);
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
    const stored = loadVolume();
    volumeRef.current = Math.min(1, Math.max(0, (stored ?? 1) * MENU_VOLUME));
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
      setIsPlaying(true);
      fade(el, volumeRef.current, FADE_IN_MS);
    };
    const onPause = () => setIsPlaying(false);
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

  const skip = useCallback(
    (step: number) => {
      wantsPlayRef.current = true;
      const el = audioRef.current;
      const move = () =>
        setIndex((i) => (step < 0 ? (i > 0 ? i - 1 : i) : i + step));
      if (!el || el.paused) {
        move();
        return;
      }
      fade(el, 0, FADE_OUT_MS, move);
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
    el.currentTime = Math.max(0, Math.min(el.duration, ms / 1000));
  }, []);

  const readLevels = useCallback(() => {
    const analyser = analyserRef.current;
    const el = audioRef.current;
    if (!analyser || !el || el.paused) return null;
    analyser.getByteFrequencyData(levelsRef.current);
    return levelsRef.current;
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

  const getPlayback = useCallback(() => {
    const el = audioRef.current;
    if (!el) return null;
    return {
      position: el.currentTime * 1000,
      duration: Number.isFinite(el.duration) ? el.duration * 1000 : 0,
      playing: !el.paused,
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
      getPlayback,
      seek,
      setAmbientDucking,
      fadeOut,
    ],
  );
}
