import { useEffect, useRef } from "react";
import type { TimingPoint } from "../types";
import { activeTimingAt, beatLength, redPoints } from "../lib/timing";

/**
 * A beat metronome that ticks while the song plays.
 *
 * It watches the audio playback clock (in song-time milliseconds) and emits a
 * short click whenever the playhead crosses a beat line of the active red timing
 * point. Downbeats (the first beat of each measure, per the point's meter) get a
 * higher-pitched accent. Detection works in song-time, so it stays correct at
 * reduced playback speeds.
 */
export function useMetronome(
  currentTime: number,
  isPlaying: boolean,
  timingPoints: TimingPoint[],
  enabled: boolean,
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const lastBeatRef = useRef<number | null>(null);

  // Keep the latest values on refs so the rAF loop reads fresh data.
  const stateRef = useRef({ currentTime, isPlaying, timingPoints, enabled });
  stateRef.current = { currentTime, isPlaying, timingPoints, enabled };

  useEffect(() => {
    if (!enabled) {
      lastBeatRef.current = null;
      return;
    }

    let raf = 0;
    const click = (accent: boolean) => {
      let ctx = ctxRef.current;
      if (!ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = accent ? 1760 : 1100;
      gain.gain.setValueAtTime(accent ? 0.35 : 0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    };

    const loop = () => {
      const s = stateRef.current;
      raf = requestAnimationFrame(loop);
      if (!s.isPlaying) {
        lastBeatRef.current = null;
        return;
      }
      const reds = redPoints(s.timingPoints);
      if (!reds.length) return;
      const tp = activeTimingAt(s.currentTime, s.timingPoints);
      const bl = beatLength(tp.bpm);
      if (!(bl > 0)) return;
      const beat = Math.floor((s.currentTime - tp.time) / bl);
      if (lastBeatRef.current === null) {
        lastBeatRef.current = beat;
        return;
      }
      if (beat !== lastBeatRef.current && beat > lastBeatRef.current) {
        const meter = Math.max(1, Math.round(tp.meter || 4));
        const accent = ((beat % meter) + meter) % meter === 0;
        click(accent);
      }
      lastBeatRef.current = beat;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  // Release the audio context when the component using the hook unmounts.
  useEffect(() => {
    return () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);
}
