import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useT } from "../lib/i18n";

function clockText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * The bar that fills the empty strip under the HUD editor's stage.
 *
 * Scaling the stage to sit beside the panel leaves a band above and below it,
 * so the one at the bottom carries the run's position rather than nothing. The
 * playhead is read on a frame loop and written straight to the DOM: the HUD
 * editor re-renders enough as elements are dragged without the clock adding to
 * it.
 */
export function HudScrubber({
  getCurrentTime,
  duration,
  onSeek,
}: {
  getCurrentTime: () => number;
  /** Song length in ms; the bar stays inert until it is known. */
  duration: number;
  onSeek: (ms: number) => void;
}) {
  const t = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);
  scrubRef.current = scrub;

  const live = { getCurrentTime, duration };
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { getCurrentTime: now, duration: total } = liveRef.current;
      if (total <= 0) return;
      const at = scrubRef.current ?? now();
      const pct = Math.max(0, Math.min(1, at / total)) * 100;
      if (fillRef.current) fillRef.current.style.width = `${pct}%`;
      if (handleRef.current) handleRef.current.style.left = `${pct}%`;
      if (elapsedRef.current) elapsedRef.current.textContent = clockText(at);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const timeAt = (clientX: number): number => {
    const track = trackRef.current;
    if (!track || duration <= 0) return 0;
    const box = track.getBoundingClientRect();
    const ratio = (clientX - box.left) / Math.max(1, box.width);
    return Math.max(0, Math.min(1, ratio)) * duration;
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setScrub(timeAt(e.clientX));
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrubRef.current === null) return;
    setScrub(timeAt(e.clientX));
  };

  // The run is restarted at the dragged spot on release rather than on every
  // move: each seek rebuilds the playtest, which a drag would do 60 times a
  // second.
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const at = scrubRef.current;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setScrub(null);
    if (at !== null) onSeek(at);
  };

  return (
    <div className="flex h-full w-full items-center gap-3 px-6">
      <span
        ref={elapsedRef}
        className="w-10 shrink-0 text-right text-[11px] tabular-nums text-slate-400"
      >
        0:00
      </span>
      <div
        ref={trackRef}
        role="slider"
        aria-label={t("nowPlaying.seek")}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(scrub ?? 0)}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="group relative h-6 min-w-0 flex-1 cursor-pointer touch-none"
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
          <div ref={fillRef} className="h-full w-0 rounded-full bg-accent" />
        </div>
        <div
          ref={handleRef}
          className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
          style={{ left: 0, opacity: scrub === null ? undefined : 1 }}
        />
      </div>
      <span className="w-10 shrink-0 text-[11px] tabular-nums text-slate-500">
        {clockText(duration)}
      </span>
    </div>
  );
}
