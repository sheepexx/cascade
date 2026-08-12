import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPlaybackClock } from "../lib/playbackClock";
import { previewStartMs } from "../lib/sharedMap";
import { longNoteBodyRange } from "../lib/sharedMapPreview";
import type { ManiaNote } from "../types";

export const PREVIEW_MS = 10000;
const LOOKAHEAD_MS = 700;
const RECEPTOR_FROM_BOTTOM = 58;
const LANE_GAP = 3;
const NOTE_HEIGHT = 15;
const HIT_WINDOW_MS = 90;

const COLD = "#7fb0e8";
const WARM = "#eef1f8";
const CENTRE = "#f0c46a";

function laneColour(column: number, keyCount: number): string {
  if (keyCount % 2 === 1 && column === (keyCount - 1) / 2) return CENTRE;
  return column % 2 === 0 ? COLD : WARM;
}

function firstFrom(sorted: ManiaNote[], time: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].startTime < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function SharedMapPreview({
  notes,
  keyCount,
  previewTime,
  audioUrl,
  audioRate = 1,
  preservePitch = false,
  clipStartsAtZero = false,
  label,
  stopLabel,
}: {
  notes: ManiaNote[];
  keyCount: number;
  previewTime: number;
  audioUrl: string | null;
  audioRate?: number;
  preservePitch?: boolean;
  clipStartsAtZero?: boolean;
  label: string;
  stopLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef(0);
  const startedAtRef = useRef(0);
  const audioPlayingRef = useRef(false);
  const clockRef = useRef(createPlaybackClock());
  const [playing, setPlaying] = useState(false);

  const startMs = previewStartMs(notes, previewTime);
  const rate =
    Number.isFinite(audioRate) && audioRate > 0
      ? Math.max(0.1, Math.min(4, audioRate))
      : 1;

  const { sorted, maxDur } = useMemo(() => {
    const list = [...notes].sort((a, b) => a.startTime - b.startTime);
    let longest = 0;
    for (const n of list) {
      const dur = (n.endTime ?? n.startTime) - n.startTime;
      if (dur > longest) longest = dur;
    }
    return { sorted: list, maxDur: longest };
  }, [notes]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audioRef.current = null;
      audio.removeAttribute("src");
      audio.load();
    }
    audioPlayingRef.current = false;
    clockRef.current.reset();
    setPlaying(false);
  }, []);

  useEffect(() => stop, [stop]);

  const draw = useCallback(
    (nowMs: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const laneWidth = (width - LANE_GAP * (keyCount - 1)) / keyCount;
      const receptorY = height - RECEPTOR_FROM_BOTTOM;
      const pxPerMs = receptorY / LOOKAHEAD_MS;
      const laneX = (c: number) => c * (laneWidth + LANE_GAP);

      ctx.fillStyle = "rgba(6,6,10,0.55)";
      ctx.fillRect(0, 0, width, height);
      for (let c = 0; c < keyCount; c++) {
        ctx.fillStyle = "rgba(255,255,255,0.035)";
        ctx.fillRect(laneX(c), 0, laneWidth, height);
      }

      const glow = new Array<number>(keyCount).fill(0);
      let i = firstFrom(sorted, nowMs - maxDur - HIT_WINDOW_MS);
      for (; i < sorted.length; i++) {
        const n = sorted[i];
        if (n.startTime > nowMs) break;
        const c = n.column;
        if (c < 0 || c >= keyCount) continue;
        const end = n.endTime ?? n.startTime;
        let intensity: number;
        if (nowMs <= end) {
          intensity = 1;
        } else {
          const past = nowMs - end;
          if (past > HIT_WINDOW_MS) continue;
          intensity = 1 - past / HIT_WINDOW_MS;
        }
        if (intensity > glow[c]) glow[c] = intensity;
      }

      for (let c = 0; c < keyCount; c++) {
        const intensity = glow[c];
        if (intensity <= 0) continue;
        const below = height - receptorY;
        if (below <= 0) continue;
        ctx.save();
        ctx.globalAlpha = 0.24 * intensity;
        ctx.fillStyle = laneColour(c, keyCount);
        ctx.fillRect(laneX(c), receptorY, laneWidth, below);
        ctx.restore();
      }

      const to = nowMs + LOOKAHEAD_MS;
      let j = firstFrom(sorted, nowMs - maxDur);
      for (; j < sorted.length; j++) {
        const note = sorted[j];
        if (note.startTime > to) break;
        const end = note.endTime ?? note.startTime;
        if (end < nowMs) continue;
        const x = laneX(note.column);
        const y = receptorY - (note.startTime - nowMs) * pxPerMs;
        const colour = laneColour(note.column, keyCount);

        if (note.endTime != null && note.endTime > note.startTime) {
          const tailY = receptorY - (note.endTime - nowMs) * pxPerMs;
          const bodyRange = longNoteBodyRange(y, tailY, receptorY);
          ctx.globalAlpha = 0.42;
          ctx.fillStyle = colour;
          ctx.beginPath();
          ctx.roundRect(
            x + laneWidth * 0.2,
            bodyRange.top,
            laneWidth * 0.6,
            bodyRange.height,
            4,
          );
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        const noteY = Math.min(y, receptorY);
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.roundRect(x + 2, noteY - NOTE_HEIGHT / 2, laneWidth - 4, NOTE_HEIGHT, 4);
        ctx.fill();
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.roundRect(x + 4, noteY - NOTE_HEIGHT / 2 + 2, laneWidth - 8, 3, 2);
        ctx.fill();
        ctx.restore();
      }

      for (let c = 0; c < keyCount; c++) {
        const x = laneX(c);
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        ctx.beginPath();
        ctx.roundRect(x + 2, receptorY - 3, laneWidth - 4, 7, 3);
        ctx.fill();
        if (glow[c] > 0) {
          ctx.save();
          ctx.globalAlpha = 0.85 * glow[c];
          ctx.fillStyle = laneColour(c, keyCount);
          ctx.beginPath();
          ctx.roundRect(x + 2, receptorY - 3, laneWidth - 4, 7, 3);
          ctx.fill();
          ctx.restore();
        }
      }

      ctx.restore();
    },
    [keyCount, maxDur, sorted],
  );

  const tick = useCallback(() => {
    const audio = audioRef.current;
    const now = performance.now();
    const wall = now - startedAtRef.current;
    let elapsed: number;
    if (audio) {
      const audioTime = audioPlayingRef.current
        ? clockRef.current.read(audio.currentTime, rate, now) * 1000
        : audio.currentTime * 1000;
      const mapTime = audioTime / rate;
      elapsed = clipStartsAtZero ? mapTime : mapTime - startMs;
    } else {
      elapsed = wall;
    }
    if (elapsed >= PREVIEW_MS || wall >= PREVIEW_MS + 4000) {
      stop();
      return;
    }
    draw(startMs + Math.max(0, elapsed));
    rafRef.current = requestAnimationFrame(tick);
  }, [clipStartsAtZero, draw, rate, startMs, stop]);

  const play = useCallback(() => {
    if (playing) {
      stop();
      return;
    }
    setPlaying(true);
    startedAtRef.current = performance.now();
    clockRef.current.reset();
    if (audioUrl) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
      audio.preservesPitch = preservePitch;
      audioRef.current = audio;
      audio.addEventListener("ended", stop, { once: true });
      audio.addEventListener("playing", () => {
        if (audioRef.current !== audio) return;
        audioPlayingRef.current = true;
        startedAtRef.current = performance.now();
        clockRef.current.reset();
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(tick);
        }
      });
      const suspendClock = () => {
        if (audioRef.current !== audio) return;
        audioPlayingRef.current = false;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        clockRef.current.reset();
      };
      audio.addEventListener("pause", suspendClock);
      audio.addEventListener("seeking", suspendClock);
      audio.addEventListener("waiting", suspendClock);
      audio.addEventListener(
        "loadedmetadata",
        () => {
          if (audioRef.current !== audio) return;
          if (!clipStartsAtZero) audio.currentTime = (startMs * rate) / 1000;
          clockRef.current.reset();
          void audio.play().catch(() => {
            if (audioRef.current === audio) stop();
          });
        },
        { once: true },
      );
      audio.src = audioUrl;
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [
    audioUrl,
    clipStartsAtZero,
    playing,
    preservePitch,
    rate,
    startMs,
    stop,
    tick,
  ]);

  useEffect(() => {
    draw(startMs);
  }, [draw, startMs]);

  return (
    <div className="mt-8">
      <div className="mx-auto w-full max-w-[260px]">
        <canvas
          ref={canvasRef}
          className="h-[300px] w-full rounded-xl border border-white/10 bg-ink-900/70"
        />
      </div>
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={play}
          className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-soft"
        >
          {playing ? stopLabel : label}
        </button>
      </div>
    </div>
  );
}
