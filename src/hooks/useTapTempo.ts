import { useCallback, useMemo, useState } from "react";

/**
 * "Click to the beat" tempo + offset detection.
 *
 * Each tap records a timestamp (in milliseconds) from the audio playback clock.
 * Rather than just averaging gaps, the taps are fit to a straight line
 * `t_i ≈ offset + i · interval` by least squares: the slope gives the BPM and
 * the intercept gives the **offset** — the time of the very first beat — even
 * when the user started tapping partway through the song. The more continuous
 * beats are clicked, the more the regression stabilises both values.
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
      return next.slice(-32);
    });
  }, [getTime]);

  const reset = useCallback(() => setTaps([]), []);

  const { bpm, offset, count } = useMemo(() => {
    if (taps.length < 2) {
      return {
        bpm: null as number | null,
        offset: taps[0] ?? null,
        count: taps.length,
      };
    }
    // Least-squares fit of t_i = a + b·i, with i = 0..n-1 the beat index.
    const n = taps.length;
    const sumI = (n * (n - 1)) / 2;
    const sumII = ((n - 1) * n * (2 * n - 1)) / 6;
    let sumT = 0;
    let sumIT = 0;
    for (let i = 0; i < n; i++) {
      sumT += taps[i];
      sumIT += i * taps[i];
    }
    const denom = n * sumII - sumI * sumI;
    const slope = denom !== 0 ? (n * sumIT - sumI * sumT) / denom : 0;
    const intercept = (sumT - slope * sumI) / n;

    const raw = slope > 0 ? 60000 / slope : null;
    const rounded = raw ? Math.round(raw * 100) / 100 : null;
    return { bpm: rounded, offset: Math.round(intercept), count: n };
  }, [taps]);

  return { tap, reset, bpm, offset, count };
}
