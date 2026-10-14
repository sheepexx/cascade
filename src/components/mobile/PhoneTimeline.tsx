import { useMemo } from "react";
import type { Waveform } from "../../hooks/useWaveform";
import { useT } from "../../lib/i18n";

/** A compact seek strip. The full timeline remains available in its own sheet. */
export function PhoneTimeline({ waveform, duration, time, onSeek, onOpen }: { waveform: Waveform | null; duration: number; time: number; onSeek: (ms: number) => void; onOpen: () => void }) {
  const t = useT();
  const peaks = useMemo(() => {
    const data = waveform?.peaks;
    return Array.from({ length: 100 }, (_, i) => data?.length ? Math.abs(data[Math.min(data.length - 1, Math.floor(i / 100 * data.length))]) : 0.08);
  }, [waveform]);
  const seek = (e: React.PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); if (duration > 0) onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration); };
  return <div className="phone-timeline flex h-11 shrink-0 items-center border-t border-white/[0.06] bg-ink-900">
    <svg viewBox="0 0 400 36" preserveAspectRatio="none" role="slider" tabIndex={0} aria-label={t("mobile.seek")} aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)} className="h-11 min-w-0 flex-1 touch-none" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); seek(e); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e); }} onPointerUp={e => { seek(e); e.currentTarget.releasePointerCapture(e.pointerId); }} onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); onSeek(Math.max(0, Math.min(duration, time + (e.key === "ArrowLeft" ? -1000 : 1000)))); } }}>
      {peaks.map((peak, i) => <rect key={i} x={i * 4 + 1} y={18 - Math.max(2, peak * 15)} width="2" height={Math.max(4, peak * 30)} fill="currentColor" className={i / 100 * duration <= time ? "text-slate-400" : "text-slate-600"} />)}
      <rect x={duration > 0 ? Math.min(398, time / duration * 400) : 0} y="0" width="2" height="36" fill="currentColor" className="text-accent" />
    </svg>
    <button type="button" onClick={onOpen} className="phone-icon-button px-2 text-xs" aria-label={t("mobile.timeline")}>⋯</button>
  </div>;
}
