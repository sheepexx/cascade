import { useEffect, useRef } from "react";
import type { TimingPoint } from "../types";
import { activeTimingAt, beatLength, redPoints } from "../lib/timing";
import { playNativeClick } from "../lib/nativeAudio";

export function useMetronome(
  getCurrentTime: () => number,
  isPlaying: boolean,
  timingPoints: TimingPoint[],
  enabled: boolean,
  onBeat?: (info: { beat: number; meter: number; accent: boolean }) => void,
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const lastBeatRef = useRef<number | null>(null);

  const stateRef = useRef({ getCurrentTime, isPlaying, timingPoints, enabled, onBeat });
  stateRef.current = { getCurrentTime, isPlaying, timingPoints, enabled, onBeat };

  useEffect(() => {
    if (!enabled) {
      lastBeatRef.current = null;
      return;
    }

    let raf = 0;
    const click = (accent: boolean) => {
      if (playNativeClick(accent)) return;
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
      const now = s.getCurrentTime();
      const tp = activeTimingAt(now, s.timingPoints);
      const bl = beatLength(tp.bpm);
      if (!(bl > 0)) return;
      const beat = Math.floor((now - tp.time) / bl);
      if (lastBeatRef.current === null) {
        lastBeatRef.current = beat;
        return;
      }
      if (beat !== lastBeatRef.current && beat > lastBeatRef.current) {
        const meter = Math.max(1, Math.round(tp.meter || 4));
        const accent = ((beat % meter) + meter) % meter === 0;
        click(accent);
        s.onBeat?.({ beat, meter, accent });
      }
      lastBeatRef.current = beat;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  useEffect(() => {
    return () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);
}
