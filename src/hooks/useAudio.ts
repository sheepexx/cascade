import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Thin wrapper around an HTMLAudioElement that exposes a high-resolution
 * playback clock (updated via requestAnimationFrame) plus play/pause/seek.
 *
 * The current time is exposed in **milliseconds** to match the editor domain.
 */
export function useAudio(src: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // ms
  const [duration, setDuration] = useState(0); // ms
  const [volume, setVolumeState] = useState(1);

  // Create the audio element once.
  if (audioRef.current === null && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }

  // Wire up the source.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (src) {
      audio.src = src;
      audio.load();
    } else {
      audio.removeAttribute("src");
    }
    setCurrentTime(0);
    setIsPlaying(false);
  }, [src]);

  // Track metadata + end of playback.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let fixingDuration = false;

    const onLoaded = () => {
      const d = audio.duration;
      if (Number.isFinite(d) && d > 0) {
        setDuration(d * 1000);
        return;
      }
      // Some MP3s (VBR / streamed) report Infinity or NaN until the browser
      // scans to the end. Nudge currentTime far ahead to force a real duration,
      // then rewind. Without this the seek clamp never bounds the playhead and
      // dragging the timeline scrolls past the actual end of the song.
      if (fixingDuration) return;
      fixingDuration = true;
      const onUpdate = () => {
        if (!Number.isFinite(audio.duration)) return;
        audio.removeEventListener("timeupdate", onUpdate);
        fixingDuration = false;
        setDuration(audio.duration * 1000);
        audio.currentTime = 0;
        setCurrentTime(0);
      };
      audio.addEventListener("timeupdate", onUpdate);
      audio.currentTime = 1e7;
    };
    const onEnded = () => setIsPlaying(false);
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);

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
    if (!audio) return;

    const tick = () => {
      setCurrentTime(audio.currentTime * 1000);
      rafRef.current = requestAnimationFrame(tick);
    };

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  const play = useCallback(() => {
    audioRef.current?.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, []);

  /** Seek to an absolute time in milliseconds. */
  const seek = useCallback(
    (ms: number) => {
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(ms)) return;
      // Prefer the tracked duration, falling back to the element's own (finite)
      // duration so a non-finite `duration` can never leave the seek unbounded.
      const max =
        Number.isFinite(duration) && duration > 0
          ? duration
          : Number.isFinite(audio.duration)
            ? audio.duration * 1000
            : ms;
      const clamped = Math.max(0, Math.min(ms, max));
      if (!Number.isFinite(clamped)) return;
      audio.currentTime = clamped / 1000;
      setCurrentTime(clamped);
    },
    [duration],
  );

  const setPlaybackRate = useCallback((rate: number) => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    if (audioRef.current) audioRef.current.volume = clamped;
    setVolumeState(clamped);
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    play,
    pause,
    toggle,
    seek,
    setPlaybackRate,
    setVolume,
  };
}

export type AudioController = ReturnType<typeof useAudio>;
