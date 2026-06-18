import { useCallback, useEffect, useRef, useState } from "react";
import type { ManiaNote, TimingPoint } from "../types";
import type { Waveform } from "../hooks/useWaveform";
import { formatTime } from "../lib/timing";

/**
 * Song-wide navigation strip at the bottom of the editor.
 *
 *  - Renders a clean waveform of the whole song.
 *  - Click or drag anywhere to seek to that part of the song.
 *  - Yellow dots above the waveform show note density: each x-bucket stacks
 *    more dots the more notes are mapped around that time.
 */

const HEIGHT = 96;
const WAVE_TOP = 34; // waveform band starts here
const WAVE_H = HEIGHT - WAVE_TOP - 6;
const DOT_BAND_H = WAVE_TOP - 6; // density dots live above the waveform
const DENSITY_BUCKETS = 240;
const MAX_DOTS = 6;
const MAIN_REVEAL_MS = 300;
const WAVEFORM_REVEAL_DELAY_MS = MAIN_REVEAL_MS;
const WAVEFORM_REVEAL_MS = 700;

type Props = {
  waveform: Waveform | null;
  notes: ManiaNote[];
  timingPoints: TimingPoint[];
  previewTime: number;
  /** Audio duration in ms (from the audio element). */
  duration: number;
  currentTime: number;
  onSeek: (ms: number) => void;
  /** Waveform amplitude multiplier (adjusted by scrolling over the timeline). */
  sensitivity: number;
  onSensitivity: (value: number) => void;
  revealWaveform: boolean;
};

const SENS_MIN = 0.5;
const SENS_MAX = 3;
const SENS_STEP = 0.1;

export function BottomTimeline({
  waveform,
  notes,
  timingPoints,
  previewTime,
  duration,
  currentTime,
  onSeek,
  sensitivity,
  onSensitivity,
  revealWaveform,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef({ width: 800, dpr: 1 });
  const draggingRef = useRef(false);
  const waveformRevealStartRef = useRef(0);
  const revealedWaveformRef = useRef<Waveform | null>(null);
  const [copied, setCopied] = useState(false);

  const propsRef = useRef({
    waveform,
    notes,
    timingPoints,
    previewTime,
    duration,
    currentTime,
    sensitivity,
    onSensitivity,
    revealWaveform,
  });
  propsRef.current = {
    waveform,
    notes,
    timingPoints,
    previewTime,
    duration,
    currentTime,
    sensitivity,
    onSensitivity,
    revealWaveform,
  };

  useEffect(() => {
    if (!revealWaveform || !waveform) {
      waveformRevealStartRef.current = 0;
      revealedWaveformRef.current = null;
      return;
    }
    if (revealedWaveformRef.current !== waveform) {
      revealedWaveformRef.current = waveform;
      waveformRevealStartRef.current = performance.now();
    }
  }, [revealWaveform, waveform]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width, dpr } = sizeRef.current;
    const {
      waveform,
      notes,
      timingPoints,
      previewTime,
      duration,
      currentTime,
      sensitivity,
      revealWaveform,
    } = propsRef.current;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, HEIGHT);

    // Background
    ctx.fillStyle = "#16161d";
    ctx.fillRect(0, 0, width, HEIGHT);

    // ---- Waveform ----
    const midY = WAVE_TOP + WAVE_H / 2;
    if (waveform) {
      const { peaks } = waveform;
      const elapsed =
        performance.now() -
        waveformRevealStartRef.current -
        WAVEFORM_REVEAL_DELAY_MS;
      const progress =
        revealWaveform
          ? waveformRevealStartRef.current > 0
            ? Math.min(1, Math.max(0, elapsed / WAVEFORM_REVEAL_MS))
            : 0
          : 1;
      const eased = 1 - Math.pow(1 - progress, 3);
      const revealWidth = width * eased;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, WAVE_TOP, revealWidth, WAVE_H);
      ctx.clip();
      ctx.fillStyle = "rgba(91,192,255,0.55)";
      for (let x = 0; x < width; x++) {
        const idx = Math.floor((x / width) * peaks.length);
        const amp = Math.min(1, (peaks[idx] ?? 0) * sensitivity);
        const h = Math.max(1, amp * (WAVE_H / 2));
        ctx.fillRect(x, midY - h, 1, h * 2);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = "#272733";
      ctx.fillRect(0, midY - 1, width, 2);
    }

    // ---- Note density dots ----
    if (duration > 0 && notes.length > 0) {
      const counts = new Array<number>(DENSITY_BUCKETS).fill(0);
      for (const n of notes) {
        const b = Math.floor((n.startTime / duration) * DENSITY_BUCKETS);
        if (b >= 0 && b < DENSITY_BUCKETS) counts[b]++;
        // Long notes also contribute at their end.
        if (n.endTime !== undefined) {
          const be = Math.floor((n.endTime / duration) * DENSITY_BUCKETS);
          if (be >= 0 && be < DENSITY_BUCKETS && be !== b) counts[be]++;
        }
      }
      let peak = 1;
      for (const c of counts) if (c > peak) peak = c;

      const bw = width / DENSITY_BUCKETS;
      const dotR = 1.6;
      const gap = Math.max(2.4, DOT_BAND_H / MAX_DOTS);
      ctx.fillStyle = "#ffd23f";
      for (let i = 0; i < DENSITY_BUCKETS; i++) {
        const c = counts[i];
        if (c === 0) continue;
        const dots = Math.max(1, Math.round((c / peak) * MAX_DOTS));
        const cx = i * bw + bw / 2;
        for (let d = 0; d < dots; d++) {
          const cy = DOT_BAND_H - 2 - d * gap;
          if (cy < 2) break;
          ctx.beginPath();
          ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ---- Timing point markers (red ticks) ----
    if (duration > 0) {
      ctx.fillStyle = "#ff2d6f";
      for (const tp of timingPoints) {
        if (tp.time < 0 || tp.time > duration) continue;
        const tx = (tp.time / duration) * width;
        ctx.fillRect(tx, WAVE_TOP, 1.5, WAVE_H);
        // little flag at the top
        ctx.beginPath();
        ctx.moveTo(tx, WAVE_TOP);
        ctx.lineTo(tx + 5, WAVE_TOP);
        ctx.lineTo(tx, WAVE_TOP + 5);
        ctx.fill();
      }
    }

    // ---- Preview point marker (green tick) ----
    if (duration > 0 && previewTime >= 0 && previewTime <= duration) {
      const px = (previewTime / duration) * width;
      ctx.fillStyle = "#33d17a";
      ctx.fillRect(px, WAVE_TOP, 2, WAVE_H);
      ctx.beginPath();
      ctx.moveTo(px, WAVE_TOP);
      ctx.lineTo(px + 7, WAVE_TOP);
      ctx.lineTo(px, WAVE_TOP + 7);
      ctx.fill();
    }

    // ---- Played region tint ----
    if (duration > 0) {
      const px = (currentTime / duration) * width;
      ctx.fillStyle = "rgba(255,93,177,0.10)";
      ctx.fillRect(0, WAVE_TOP, px, WAVE_H);

      // Playhead
      ctx.strokeStyle = "#ff5db1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, HEIGHT);
      ctx.stroke();
    }

    ctx.restore();
  }, []);

  // rAF loop so the playhead tracks playback smoothly.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  // Resize
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { width: rect.width, dpr };
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(HEIGHT * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${HEIGHT}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // ---- Seeking ----
  const seekFromEvent = useCallback(
    (clientX: number) => {
      const canvas = canvasRef.current;
      const { duration } = propsRef.current;
      if (!canvas || !(duration > 0) || !Number.isFinite(duration)) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
    },
    [onSeek],
  );

  const onMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    seekFromEvent(e.clientX);
  };

  // Scroll over the timeline to adjust waveform sensitivity.
  // Native listener with passive:false so we can stop the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { sensitivity, onSensitivity } = propsRef.current;
      const dir = e.deltaY < 0 ? 1 : -1; // scroll up = more sensitive
      const next = Math.round(
        Math.max(
          SENS_MIN,
          Math.min(SENS_MAX, sensitivity + dir * SENS_STEP),
        ) * 10,
      ) / 10;
      if (next !== sensitivity) onSensitivity(next);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // Handle copy timestamp to clipboard
  const handleTimestampClick = useCallback(() => {
    const timestamp = formatTime(currentTime);
    navigator.clipboard.writeText(timestamp).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [currentTime]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingRef.current) seekFromEvent(e.clientX);
    };
    const onUp = () => (draggingRef.current = false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [seekFromEvent]);

  return (
    <div
      ref={wrapRef}
      className="group relative w-full border-t border-ink-600 bg-ink-800"
      style={{ height: HEIGHT }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-pointer"
        onMouseDown={onMouseDown}
      />
      {/* Sensitivity hint — appears on hover */}
      <div className="pointer-events-none absolute right-2 top-1.5 select-none rounded bg-ink-900/70 px-2 py-0.5 text-[10px] text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
        waveform {sensitivity.toFixed(1)}× · scroll to adjust
      </div>
    </div>
  );
}
