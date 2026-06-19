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
  // `volume` is the *perceived* slider position (0–1). Actual audio.volume is
  // derived via a square law so the slider feels linear to the ear.
  const [volume, setVolumeState] = useState(0.2);
  // Playback speed (1 = full speed). Slowing it down also lowers the pitch, the
  // way the osu! editor's 25/50/75% playback does.
  const [playbackRate, setPlaybackRateState] = useState(1);
  // Mirror of the chosen rate so the source-load effect can re-apply it: loading
  // a new media resource resets the element's playbackRate to defaultPlaybackRate
  // (1), so without this, switching difficulties silently snaps back to 100%.
  const playbackRateRef = useRef(1);

  // Create the audio element once.
  if (audioRef.current === null && typeof Audio !== "undefined") {
    const el = new Audio();
    el.volume = 0.5 * 0.5; // apply square law to the initial default
    audioRef.current = el;
  }

  // Wire up the source.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (src) {
      audio.src = src;
      audio.load();
      // Re-apply the chosen speed/pitch: load() reset playbackRate to default.
      applyRate(audio, playbackRateRef.current);
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
    const clamped = Math.max(0.1, Math.min(4, rate));
    playbackRateRef.current = clamped;
    applyRate(audioRef.current, clamped);
    setPlaybackRateState(clamped);
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    // Square law: perceived 50% slider → 25% actual power, much more natural.
    if (audioRef.current) audioRef.current.volume = clamped * clamped;
    setVolumeState(clamped);
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
