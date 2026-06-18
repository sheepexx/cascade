import { useEffect, useState } from "react";

export type Waveform = {
  /** Per-bucket peak amplitude, 0..1. */
  peaks: Float32Array;
  /** Decoded duration in seconds. */
  duration: number;
};

/**
 * Decode an audio blob into a downsampled peaks array for waveform rendering.
 * Uses the Web Audio API's decodeAudioData. Returns null until ready.
 */
export function useWaveform(
  blob: Blob | null,
  buckets = 1800,
): Waveform | null {
  const [waveform, setWaveform] = useState<Waveform | null>(null);

  useEffect(() => {
    if (!blob) {
      setWaveform(null);
      return;
    }
    let cancelled = false;
    setWaveform(null);

    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();

    blob
      .arrayBuffer()
      .then((buf) => ctx.decodeAudioData(buf))
      .then((audioBuffer) => {
        if (cancelled) return;
        const channel = audioBuffer.getChannelData(0);
        const blockSize = Math.max(1, Math.floor(channel.length / buckets));
        const peaks = new Float32Array(buckets);

        // RMS (average energy) per bucket — far less twitchy than peak/max,
        // since a single loud transient no longer spikes the whole bar.
        for (let i = 0; i < buckets; i++) {
          const start = i * blockSize;
          let sumSq = 0;
          for (let j = 0; j < blockSize; j++) {
            const v = channel[start + j] ?? 0;
            sumSq += v * v;
          }
          peaks[i] = Math.sqrt(sumSq / blockSize);
        }

        // Normalize against a high percentile rather than the absolute max,
        // so the overall loud sections fill the band without a few outliers
        // flattening everything else.
        const sorted = Array.from(peaks).sort((a, b) => a - b);
        const ref = sorted[Math.floor(sorted.length * 0.95)] || 1;
        if (ref > 0) {
          for (let i = 0; i < peaks.length; i++) {
            peaks[i] = Math.min(1, peaks[i] / ref);
          }
        }

        setWaveform({ peaks, duration: audioBuffer.duration });
      })
      .catch(() => {
        if (!cancelled) setWaveform(null);
      })
      .finally(() => {
        ctx.close().catch(() => {});
      });

    return () => {
      cancelled = true;
      ctx.close().catch(() => {});
    };
  }, [blob, buckets]);

  return waveform;
}
