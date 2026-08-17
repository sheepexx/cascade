import { useEffect, useState } from "react";
import { computeWaveformPeaks } from "../lib/waveform";

export type Waveform = {
  peaks: Float32Array;
  duration: number;
  buffer: AudioBuffer;
};

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
        const peaks = computeWaveformPeaks(channel, buckets);

        setWaveform({
          peaks,
          duration: audioBuffer.duration,
          buffer: audioBuffer,
        });
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
