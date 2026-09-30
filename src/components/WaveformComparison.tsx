import { useEffect, useRef, useState } from "react";
import type { TimingPoint } from "../types";
import { comparisonRows, windowPeaks } from "../lib/waveformComparison";
import { useT } from "../lib/i18n";

const ROWS_BEFORE = 5;
const ROWS_AFTER = 6;
const ROW_HEIGHT = 22;
const LABEL_WIDTH = 34;
/** Window each row shows, as a share of a beat on either side of its centre. */
const ZOOMS = [0.5, 0.25, 0.125] as const;

/**
 * osu!lazer's waveform comparison: one row per beat around the playhead, each
 * centred on where the red line puts that beat. Hits stacked on the centre
 * line mean the timing is right; a column off to one side is the offset, and
 * a slant from row to row is the BPM.
 */
export function WaveformComparison({
  audioBuffer,
  timeScale,
  timingPoints,
  getCurrentTime,
}: {
  audioBuffer: AudioBuffer | null;
  /** Map time to audio time: the song plays this much faster. */
  timeScale: number;
  timingPoints: TimingPoint[];
  getCurrentTime: () => number;
}) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(0.25);
  const [width, setWidth] = useState(0);
  const [hasRed, setHasRed] = useState(true);
  const inputsRef = useRef({ audioBuffer, timeScale, timingPoints, getCurrentTime, zoom });
  inputsRef.current = { audioBuffer, timeScale, timingPoints, getCurrentTime, zoom };

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer || width <= 0) return;
    const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, i) =>
      audioBuffer.getChannelData(i),
    );
    const rowsTotal = ROWS_BEFORE + ROWS_AFTER + 1;
    const height = rowsTotal * ROW_HEIGHT;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastKey = "";
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const input = inputsRef.current;
      const layout = comparisonRows(input.timingPoints, input.getCurrentTime(), ROWS_BEFORE, ROWS_AFTER);
      // Only a new beat, timing change or zoom redraws; idle frames cost a lookup.
      const key = layout
        ? `${layout.red.id}:${layout.red.time}:${layout.red.bpm}:${layout.red.meter}:${layout.rows[0]?.beat}:${input.zoom}:${input.timeScale}`
        : "none";
      if (key === lastKey) return;
      lastKey = key;
      setHasRed(layout !== null);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (!layout) return;
      const plot = width - LABEL_WIDTH;
      const centre = LABEL_WIDTH + plot / 2;
      const halfMs = layout.beatMs * input.zoom;
      const sampleRate = audioBuffer.sampleRate;

      layout.rows.forEach((row, i) => {
        const top = i * ROW_HEIGHT;
        const mid = top + ROW_HEIGHT / 2;
        if (row.downbeat) {
          ctx.fillStyle = "rgba(255,255,255,0.04)";
          ctx.fillRect(0, top, width, ROW_HEIGHT);
        }
        ctx.fillStyle = row.downbeat ? "rgba(226,232,240,0.9)" : "rgba(148,163,184,0.7)";
        ctx.font = "10px ui-monospace, monospace";
        ctx.textBaseline = "middle";
        ctx.fillText(row.label, 4, mid);

        const startSec = ((row.time - halfMs) * input.timeScale) / 1000;
        const endSec = ((row.time + halfMs) * input.timeScale) / 1000;
        const peaks = windowPeaks(channels, sampleRate, startSec, endSec, Math.floor(plot));
        ctx.fillStyle = "rgba(148,163,184,0.85)";
        const amp = ROW_HEIGHT / 2 - 2;
        for (let x = 0; x < peaks.length / 2; x++) {
          const lo = peaks[x * 2];
          const hi = peaks[x * 2 + 1];
          const y1 = mid - hi * amp;
          const y2 = mid - lo * amp;
          ctx.fillRect(LABEL_WIDTH + x, y1, 1, Math.max(1, y2 - y1));
        }
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(LABEL_WIDTH, top + ROW_HEIGHT - 1, plot, 1);
      });

      ctx.fillStyle = "#e86868";
      ctx.fillRect(Math.round(centre), 0, 1, layout.rows.length * ROW_HEIGHT);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [audioBuffer, width]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] leading-snug text-slate-500">
          {!audioBuffer
            ? t("timing.loadAudioFirst")
            : hasRed
              ? t("waveCompare.hint")
              : t("waveCompare.noRed")}
        </p>
        <div className="flex shrink-0 gap-1" role="group" aria-label={t("waveCompare.zoom")}>
          {ZOOMS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={zoom === value}
              onClick={() => setZoom(value)}
              className={`rounded-lg border px-2 py-1 text-[11px] tabular-nums transition duration-[var(--motion-quick)] ${
                zoom === value
                  ? "border-accent/60 bg-accent/15 text-slate-100"
                  : "border-white/10 bg-ink-700/60 text-slate-300 hover:bg-ink-600"
              }`}
            >
              ±1/{Math.round(1 / value)}
            </button>
          ))}
        </div>
      </div>
      <div ref={boxRef} className="w-full overflow-hidden rounded-lg bg-black/25">
        <canvas ref={canvasRef} className="block" aria-label={t("waveCompare.title")} role="img" />
      </div>
    </div>
  );
}
