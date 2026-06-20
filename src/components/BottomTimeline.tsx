import { useCallback, useEffect, useRef } from "react";
import type { ManiaNote, TimingPoint } from "../types";
import type { Waveform } from "../hooks/useWaveform";
import { kiaiRanges } from "../lib/timing";

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
  /** Collaborators' current positions, drawn as colored lines. */
  peers?: { color: string; playheadMs?: number; username: string }[];
  /** Comment anchors, drawn as markers above the waveform. */
  comments?: { time_ms: number; resolved: boolean }[];
  /** Click a comment marker (top band) → seek there + open the comments panel. */
  onCommentClick?: (timeMs: number) => void;
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
  peers,
  comments,
  onCommentClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef({ width: 800, dpr: 1 });
  const draggingRef = useRef(false);
  const waveformRevealStartRef = useRef(0);
  const revealedWaveformRef = useRef<Waveform | null>(null);

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
    peers,
    comments,
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
    peers,
    comments,
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
      peers,
      comments,
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

      // Dots inside a kiai section are drawn pink instead of yellow.
      const kiais = kiaiRanges(timingPoints, duration);
      const inKiai = (t: number) =>
        kiais.some((k) => t >= k.start && t < k.end);

      const bw = width / DENSITY_BUCKETS;
      const dotR = 1.6;
      const gap = Math.max(2.4, DOT_BAND_H / MAX_DOTS);
      for (let i = 0; i < DENSITY_BUCKETS; i++) {
        const c = counts[i];
        if (c === 0) continue;
        const bucketTime = ((i + 0.5) / DENSITY_BUCKETS) * duration;
        ctx.fillStyle = inKiai(bucketTime) ? "#e86868" : "#ffd23f";
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

    // ---- Timing point markers: red (uninherited) + green (inherited SV) ----
    if (duration > 0) {
      for (const tp of timingPoints) {
        if (tp.time < 0 || tp.time > duration) continue;
        const tx = (tp.time / duration) * width;
        if (tp.uninherited) {
          ctx.fillStyle = "#ff2d6f";
          ctx.fillRect(tx, WAVE_TOP, 1.5, WAVE_H);
          ctx.beginPath();
          ctx.moveTo(tx, WAVE_TOP);
          ctx.lineTo(tx + 5, WAVE_TOP);
          ctx.lineTo(tx, WAVE_TOP + 5);
          ctx.fill();
        } else {
          ctx.fillStyle = "#2dd4bf";
          ctx.fillRect(tx, WAVE_TOP + WAVE_H * 0.4, 1.2, WAVE_H * 0.6);
        }
      }
    }

    // ---- Preview point marker (purple tick) ----
    if (duration > 0 && previewTime >= 0 && previewTime <= duration) {
      const px = (previewTime / duration) * width;
      ctx.fillStyle = "#c084fc";
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
      ctx.strokeStyle = "#e86868";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, HEIGHT);
      ctx.stroke();
    }

    // ---- Comment markers (clickable pins above the waveform) ----
    if (duration > 0 && comments?.length) {
      for (const c of comments) {
        if (c.time_ms < 0 || c.time_ms > duration) continue;
        const cx = (c.time_ms / duration) * width;
        const col = c.resolved ? "rgba(148,163,184,0.6)" : "#fbbf24";
        // Faint stem down through the strip so the anchor time is obvious.
        ctx.strokeStyle = col;
        ctx.globalAlpha = c.resolved ? 0.3 : 0.55;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, 13);
        ctx.lineTo(cx, HEIGHT);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Pin: rounded head + pointer.
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, 7, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - 3.5, 10);
        ctx.lineTo(cx + 3.5, 10);
        ctx.lineTo(cx, 14.5);
        ctx.closePath();
        ctx.fill();
        // Dark dot in the head so it reads as a comment.
        ctx.fillStyle = "#0b0b10";
        ctx.beginPath();
        ctx.arc(cx, 7, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- Collaborator position lines ----
    if (duration > 0 && peers?.length) {
      ctx.font = "10px sans-serif";
      for (const p of peers) {
        if (p.playheadMs === undefined) continue;
        const cx = (p.playheadMs / duration) * width;
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, WAVE_TOP - 2);
        ctx.lineTo(cx, HEIGHT);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.color;
        const label = p.username.slice(0, 12);
        const w = ctx.measureText(label).width + 6;
        const lx = Math.min(width - w, Math.max(0, cx + 2));
        ctx.fillRect(lx, HEIGHT - 13, w, 12);
        ctx.fillStyle = "#0b0b10";
        ctx.fillText(label, lx + 3, HEIGHT - 4);
      }
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
    // A click in the top band on a comment pin opens that comment instead of
    // seeking (the rest of the strip still scrubs as before).
    const canvas = canvasRef.current;
    if (canvas && onCommentClick && duration > 0 && comments?.length) {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      if (clickY <= 16) {
        let best: { time_ms: number } | null = null;
        let bestDist = 8;
        for (const c of comments) {
          const cx = (c.time_ms / duration) * rect.width;
          const d = Math.abs(cx - clickX);
          if (d <= bestDist) {
            bestDist = d;
            best = c;
          }
        }
        if (best) {
          onCommentClick(best.time_ms);
          return;
        }
      }
    }
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
      {/* Sensitivity hint - appears on hover */}
      <div className="pointer-events-none absolute right-2 top-1.5 select-none rounded bg-ink-900/70 px-2 py-0.5 text-[10px] text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
        waveform {sensitivity.toFixed(1)}× · scroll to adjust
      </div>
    </div>
  );
}
