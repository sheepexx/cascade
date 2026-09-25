import { useEffect, useMemo, useRef } from "react";
import type { ManiaNote } from "../types";
import { computeNpsSeries, rollingNpsAt, type NpsSeries } from "../lib/nps";
import { FONT_STACK } from "../lib/fontStack";

const WIDTH = 76;
const PADDING_TOP = 26;
const PADDING_BOTTOM = 18;

function intensityColor(ratio: number, alpha = 1): string {
  const r = Math.max(0, Math.min(1, ratio));
  if (r < 0.5) {
    const k = r / 0.5;
    return `rgba(${Math.round(91 + k * 20)}, ${Math.round(192 - k * 12)}, ${Math.round(255 - k * 160)}, ${alpha})`;
  }
  const k = (r - 0.5) / 0.5;
  return `rgba(${Math.round(111 + k * 121)}, ${Math.round(180 - k * 90)}, ${Math.round(95 - k * 40)}, ${alpha})`;
}

export function PlaytestNpsGraph({
  notes,
  durationMs,
  getCurrentTime,
  active,
  running = active,
  label,
  peakLabel,
  embedded = false,
}: {
  notes: ManiaNote[];
  durationMs: number;
  getCurrentTime: () => number;
  active: boolean;
  running?: boolean;
  label: string;
  peakLabel: string;
  /** Placed by the HUD rather than pinned to the left edge itself. */
  embedded?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const staticKeyRef = useRef("");

  const series = useMemo<NpsSeries>(
    () => computeNpsSeries(notes, 500, durationMs),
    [notes, durationMs],
  );

  const clock = useRef(getCurrentTime);
  clock.current = getCurrentTime;

  useEffect(() => {
    if (!active || !running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastHeight = 0;
    staticKeyRef.current = "";

    const buildStatic = (height: number, dpr: number) => {
      const key = `${series.values.length}:${series.peak}:${height}:${dpr}`;
      if (staticKeyRef.current === key && staticRef.current) return staticRef.current;
      const layer = staticRef.current ?? document.createElement("canvas");
      layer.width = Math.max(1, Math.round(WIDTH * dpr));
      layer.height = Math.max(1, Math.round(height * dpr));
      const lctx = layer.getContext("2d");
      if (!lctx) return null;
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, WIDTH, height);

      const plotTop = PADDING_TOP;
      const plotHeight = Math.max(1, height - PADDING_TOP - PADDING_BOTTOM);
      const barLeft = 8;
      const barMax = WIDTH - barLeft - 8;
      const peak = series.peak || 1;
      const count = series.values.length;

      lctx.fillStyle = "rgba(255,255,255,0.04)";
      lctx.fillRect(barLeft, plotTop, barMax, plotHeight);

      if (count > 0) {
        const rowHeight = plotHeight / count;
        const step = Math.max(1, Math.floor(count / (plotHeight * 2)));
        for (let i = 0; i < count; i += step) {
          let value = 0;
          for (let j = i; j < Math.min(count, i + step); j++) {
            if (series.values[j] > value) value = series.values[j];
          }
          if (value <= 0) continue;
          const ratio = value / peak;
          const y = plotTop + i * rowHeight;
          const h = Math.max(1, rowHeight * step);
          lctx.fillStyle = intensityColor(ratio, 0.85);
          lctx.fillRect(barLeft, y, Math.max(1, barMax * ratio), h);
        }
      }

      lctx.strokeStyle = "rgba(255,255,255,0.08)";
      lctx.lineWidth = 1;
      lctx.strokeRect(barLeft + 0.5, plotTop + 0.5, barMax - 1, plotHeight - 1);

      lctx.fillStyle = "rgba(148,163,184,0.85)";
      lctx.font = `9px ${FONT_STACK}`;
      lctx.textAlign = "left";
      lctx.textBaseline = "alphabetic";
      lctx.fillText(
        `${peakLabel} ${series.peak.toFixed(1)}`,
        barLeft,
        height - 6,
      );

      staticRef.current = layer;
      staticKeyRef.current = key;
      return layer;
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const parent = canvas.parentElement;
      const height = parent?.clientHeight ?? 0;
      if (height <= 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);

      if (height !== lastHeight) {
        canvas.width = Math.max(1, Math.round(WIDTH * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        canvas.style.width = `${WIDTH}px`;
        canvas.style.height = `${height}px`;
        lastHeight = height;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, WIDTH, height);

      const layer = buildStatic(height, dpr);
      if (layer) {
        ctx.drawImage(layer, 0, 0, WIDTH, height);
      }

      const plotTop = PADDING_TOP;
      const plotHeight = Math.max(1, height - PADDING_TOP - PADDING_BOTTOM);
      const time = clock.current();
      const span = series.values.length * series.binMs;
      const progress = span > 0 ? (time - series.startMs) / span : 0;
      const clamped = Math.max(0, Math.min(1, progress));
      const y = plotTop + clamped * plotHeight;

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(8, plotTop, WIDTH - 16, Math.max(0, y - plotTop));

      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(4, y);
      ctx.lineTo(WIDTH - 4, y);
      ctx.stroke();

      const live = rollingNpsAt(series, time, 2000);
      const text = live.toFixed(1);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = `bold 15px ${FONT_STACK}`;
      const textWidth = ctx.measureText(text).width;
      ctx.fillStyle = "#f1f5f9";
      ctx.fillText(text, 8, 17);
      ctx.fillStyle = "rgba(148,163,184,0.9)";
      ctx.font = `8px ${FONT_STACK}`;
      ctx.fillText(label, 8 + textWidth + 3, 17);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, running, series, label, peakLabel]);

  if (!active) return null;

  return (
    <div
      className={
        embedded
          ? "pointer-events-none h-full"
          : "pointer-events-none absolute bottom-28 left-3 top-52 z-30"
      }
    >
      <div className="h-full rounded-xl border border-white/10 bg-ink-900/55 shadow-xl shadow-black/25 backdrop-blur-xl">
        <canvas ref={canvasRef} className="block" />
      </div>
    </div>
  );
}
