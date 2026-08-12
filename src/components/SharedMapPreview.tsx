import { useCallback, useEffect, useRef, useState } from "react";
import { previewStartMs } from "../lib/sharedMap";
import type { ManiaNote } from "../types";

export const PREVIEW_MS = 10000;
const LOOKAHEAD_MS = 700;
const RECEPTOR_FROM_BOTTOM = 56;
const LANE_GAP = 3;
const NOTE_HEIGHT = 16;

const LANE_TINT = ["#7fb0e8", "#e8e8f2", "#7fb0e8", "#e8e8f2"];

function laneColour(column: number, keyCount: number): string {
  if (keyCount % 2 === 1 && column === (keyCount - 1) / 2) return "#f0c46a";
  return LANE_TINT[column % 2 === 0 ? 0 : 1];
}

export function SharedMapPreview({
  notes,
  keyCount,
  previewTime,
  audioUrl,
  clipStartsAtZero = false,
  label,
  stopLabel,
}: {
  notes: ManiaNote[];
  keyCount: number;
  previewTime: number;
  audioUrl: string | null;
  clipStartsAtZero?: boolean;
  label: string;
  stopLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef(0);
  const startedAtRef = useRef(0);
  const [playing, setPlaying] = useState(false);

  const startMs = previewStartMs(notes, previewTime);

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

      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, width, height);

      const laneWidth = (width - LANE_GAP * (keyCount - 1)) / keyCount;
      const receptorY = height - RECEPTOR_FROM_BOTTOM;
      const pxPerMs = receptorY / LOOKAHEAD_MS;

      for (let c = 0; c < keyCount; c++) {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(c * (laneWidth + LANE_GAP), 0, laneWidth, height);
      }

      for (const note of notes) {
        const delta = note.startTime - nowMs;
        const end = note.endTime ?? note.startTime;
        if (end < nowMs || delta > LOOKAHEAD_MS) continue;
        const x = note.column * (laneWidth + LANE_GAP);
        const y = receptorY - delta * pxPerMs;
        const colour = laneColour(note.column, keyCount);

        if (note.endTime != null && note.endTime > note.startTime) {
          const tailY = receptorY - (note.endTime - nowMs) * pxPerMs;
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = colour;
          ctx.beginPath();
          ctx.roundRect(
            x + laneWidth * 0.18,
            Math.min(y, tailY),
            laneWidth * 0.64,
            Math.abs(y - tailY) + NOTE_HEIGHT / 2,
            4,
          );
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.roundRect(x + 2, y - NOTE_HEIGHT / 2, laneWidth - 4, NOTE_HEIGHT, 4);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillRect(0, receptorY - 2, width, 3);
      ctx.restore();
    },
    [keyCount, notes],
  );

  const tick = useCallback(() => {
    const audio = audioRef.current;
    const wall = performance.now() - startedAtRef.current;
    const playing = audio != null && !audio.paused && audio.currentTime > 0;
    const audioMs = audio ? audio.currentTime * 1000 : 0;
    const elapsed = playing
      ? (clipStartsAtZero ? audioMs : audioMs - startMs)
      : wall;
    if (elapsed >= PREVIEW_MS || wall >= PREVIEW_MS + 4000) {
      stop();
      return;
    }
    draw(startMs + Math.max(0, elapsed));
    rafRef.current = requestAnimationFrame(tick);
  }, [clipStartsAtZero, draw, startMs, stop]);

  const play = useCallback(() => {
    if (playing) {
      stop();
      return;
    }
    setPlaying(true);
    startedAtRef.current = performance.now();
    if (audioUrl) {
      const audio = new Audio();
      audio.preload = "metadata";
      audioRef.current = audio;
      audio.addEventListener("ended", stop, { once: true });
      audio.addEventListener(
        "loadedmetadata",
        () => {
          if (audioRef.current !== audio) return;
          if (!clipStartsAtZero) audio.currentTime = startMs / 1000;
          void audio.play().catch(() => {});
        },
        { once: true },
      );
      audio.src = audioUrl;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [audioUrl, clipStartsAtZero, playing, startMs, stop, tick]);

  useEffect(() => {
    draw(startMs);
  }, [draw, startMs]);

  return (
    <div className="mt-8">
      <div className="mx-auto w-full max-w-[260px]">
        <canvas
          ref={canvasRef}
          className="h-[300px] w-full rounded-xl border border-white/10 bg-ink-900/60"
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
