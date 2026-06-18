import { useCallback, useMemo, useState } from "react";

/**
 * "Tap to the beat" tempo detection.
 *
 * Each tap records a timestamp (in milliseconds). BPM is the average of the
 * intervals between consecutive taps. When the timestamps come from the audio
 * playback clock, the first tap also gives a sensible Offset, so the detected
 * timing lines up with the song.
 *
 * Pass `getTime` returning the current reference time in ms (e.g. the audio
 * playback position). It falls back to nothing special — any monotonic clock
 * works for BPM alone.
 */
export function useTapTempo(getTime: () => number) {
  const [taps, setTaps] = useState<number[]>([]);

  const tap = useCallback(() => {
    const now = getTime();
    setTaps((prev) => {
      // If the gap since the last tap is very large, assume a fresh count.
      if (prev.length > 0 && now - prev[prev.length - 1] > 2000) {
        return [now];
      }
      // Keep a rolling window so the estimate tracks the current section.
      const next = [...prev, now];
      return next.slice(-16);
    });
  }, [getTime]);

  const reset = useCallback(() => setTaps([]), []);

  const { bpm, offset, count } = useMemo(() => {
    if (taps.length < 2) {
      return { bpm: null as number | null, offset: taps[0] ?? null, count: taps.length };
    }
    let total = 0;
    for (let i = 1; i < taps.length; i++) total += taps[i] - taps[i - 1];
    const avg = total / (taps.length - 1);
    const raw = avg > 0 ? 60000 / avg : null;
    // Round to 2 decimals — clean enough for a single timing point.
    const rounded = raw ? Math.round(raw * 100) / 100 : null;
    return { bpm: rounded, offset: taps[0], count: taps.length };
  }, [taps]);

  return { tap, reset, bpm, offset, count };
}
