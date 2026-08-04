import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listLocalTracks, loadVolume, type LocalTrack } from "../lib/persistence";

export type MenuTrack = {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  backgroundUrl: string | null;
  previewTime: number;
};

export type MenuMusic = {
  track: MenuTrack | null;
  isPlaying: boolean;
  hasPlaylist: boolean;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  readLevels: () => Uint8Array | null;
};

const FFT_SIZE = 256;
const MENU_VOLUME = 0.55;

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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
  };
}

export function useMenuMusic(enabled: boolean): MenuMusic {
  const [playlist, setPlaylist] = useState<MenuTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const levelsRef = useRef(new Uint8Array(new ArrayBuffer(FFT_SIZE / 2)));
  const wantsPlayRef = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let made: MenuTrack[] = [];
    listLocalTracks()
      .then((rows) => {
        if (cancelled) return;
        made = shuffle(rows).map(toMenuTrack);
        setPlaylist(made);
        setIndex(0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      setPlaylist([]);
      for (const t of made) {
        URL.revokeObjectURL(t.audioUrl);
        if (t.backgroundUrl) URL.revokeObjectURL(t.backgroundUrl);
      }
    };
  }, [enabled]);

  const track = playlist.length ? playlist[index % playlist.length] : null;

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
        analyser.smoothingTimeConstant = 0.75;
        analyser.connect(ctx.destination);
        ctxRef.current = ctx;
        analyserRef.current = analyser;
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
    if (!enabled || !track) return;
    const el = new Audio(track.audioUrl);
    el.preload = "auto";
    const stored = loadVolume();
    el.volume = Math.min(1, Math.max(0, (stored ?? 1) * MENU_VOLUME));
    audioRef.current = el;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIndex((i) => i + 1);
    const onError = () => setIndex((i) => i + 1);
    const onReady = () => {
      const from = track.previewTime / 1000;
      if (from > 0 && Number.isFinite(el.duration) && el.duration > from + 5)
        el.currentTime = from;
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    el.addEventListener("loadedmetadata", onReady);

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
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      el.removeEventListener("loadedmetadata", onReady);
      el.pause();
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      el.removeAttribute("src");
      el.load();
      if (audioRef.current === el) audioRef.current = null;
      setIsPlaying(false);
    };
  }, [enabled, track, connect]);

  useEffect(() => {
    if (enabled) return;
    wantsPlayRef.current = false;
    audioRef.current?.pause();
  }, [enabled]);

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
      el.pause();
    }
  }, [connect]);

  const next = useCallback(() => {
    wantsPlayRef.current = true;
    setIndex((i) => i + 1);
  }, []);

  const previous = useCallback(() => {
    wantsPlayRef.current = true;
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const readLevels = useCallback(() => {
    const analyser = analyserRef.current;
    const el = audioRef.current;
    if (!analyser || !el || el.paused) return null;
    analyser.getByteFrequencyData(levelsRef.current);
    return levelsRef.current;
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
    }),
    [track, isPlaying, playlist.length, toggle, next, previous, readLevels],
  );
}
