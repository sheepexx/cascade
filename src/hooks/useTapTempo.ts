import { useCallback, useMemo, useState } from "react";

export function useTapTempo(getTime: () => number) {
  const [taps, setTaps] = useState<number[]>([]);

  const tap = useCallback(() => {
    const now = getTime();
    setTaps((prev) => {
      if (prev.length > 0 && now - prev[prev.length - 1] > 2000) {
        return [now];
      }
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
