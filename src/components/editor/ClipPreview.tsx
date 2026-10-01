import { memo, useEffect, useRef } from "react";
import type { NoteClip } from "../../lib/clipboardStore";
import { defaultLaneColour } from "../../lib/laneColours";
import { roundRect } from "./canvasDraw";

/**
 * Thumbnails of the clipboard clips in the editor's side panel. A clip can be
 * dragged from its thumbnail onto the playfield to paste it there.
 */

type ClipPreviewSize = "small" | "normal" | "large";

const ClipPreview = memo(function ClipPreview({
  clip,
  keyCount,
  size = "normal",
}: {
  clip: NoteClip;
  keyCount: number;
  size?: ClipPreviewSize;
}) {
  const cellW = size === "small" ? 5 : size === "large" ? 18 : 8;
  const w = Math.max(1, keyCount) * cellW;
  const h = size === "small" ? 22 : size === "large" ? 160 : 44;
  const pad = size === "large" ? 6 : 3;
  const riceH = size === "large" ? 6 : 3;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const maxTime = clip.notes.reduce(
      (max, n) => Math.max(max, n.endTime ?? n.startTime),
      1,
    );
    const ty = (time: number) => h - pad - (time / maxTime) * (h - 2 * pad);
    for (const n of clip.notes) {
      const x = n.column * cellW + 0.5;
      const hold = n.endTime !== undefined && n.endTime > n.startTime;
      const top = hold ? ty(n.endTime!) : ty(n.startTime) - riceH / 2;
      const height = hold ? Math.max(2, ty(n.startTime) - top) : riceH;
      ctx.fillStyle = hold
        ? "rgba(232,104,104,0.85)"
        : defaultLaneColour(n.column, keyCount);
      roundRect(ctx, x, top, cellW - 1, height, 1);
      ctx.fill();
    }
  }, [clip, keyCount, cellW, w, h, pad, riceH]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      style={{ width: w, height: h }}
      className="shrink-0 rounded bg-ink-900/70"
      aria-hidden
    />
  );
});

export function ClipThumb({
  clip,
  keyCount,
  small,
}: {
  clip: NoteClip;
  keyCount: number;
  small?: boolean;
}) {
  return (
    <span className="group/clip relative shrink-0">
      <ClipPreview
        clip={clip}
        keyCount={keyCount}
        size={small ? "small" : "normal"}
      />
      <span className="pointer-events-none absolute right-full top-1/2 z-30 mr-2 -translate-y-1/2 rounded-md border border-ink-500 bg-ink-900/95 p-2 opacity-0 shadow-2xl transition-opacity duration-150 group-hover/clip:opacity-100">
        <ClipPreview clip={clip} keyCount={keyCount} size="large" />
      </span>
    </span>
  );
}
