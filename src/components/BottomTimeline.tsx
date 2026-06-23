import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
const AVATAR_R = 9; // collaborator avatar radius (in the top band)
const AVATAR_Y = 11; // collaborator avatar center y
const WAVE_TOP = 34; // waveform band starts here
const WAVE_H = HEIGHT - WAVE_TOP - 6;
const DOT_BAND_H = WAVE_TOP - 6; // density dots live above the waveform
const DENSITY_BUCKETS = 240;
const MAX_DOTS = 6;
const MAIN_REVEAL_MS = 300;
const WAVEFORM_REVEAL_DELAY_MS = MAIN_REVEAL_MS;
const WAVEFORM_REVEAL_MS = 700;

/** Geometry of the trim brackets + fade envelope, in canvas (CSS) pixels. */
type TrimGeom = {
  /** Start / end bracket x. */
  sx: number;
  ex: number;
  /** Top of the fade-in / fade-out ramp (also the fade dot x). */
  fadeInX: number;
  fadeOutX: number;
  /** Envelope y at gain 1 (top) and gain 0 (bottom). */
  envTop: number;
  envBot: number;
};

function trimGeometry(
  duration: number,
  width: number,
  trimStart: number | undefined,
  trimEnd: number | undefined,
  fadeIn: number | undefined,
  fadeOut: number | undefined,
): TrimGeom | null {
  if (!(duration > 0) || !Number.isFinite(duration)) return null;
  const startMs = Math.max(0, Math.min(trimStart ?? 0, duration));
  const endMs = Math.max(startMs, Math.min(trimEnd ?? duration, duration));
  const sx = (startMs / duration) * width;
  const ex = (endMs / duration) * width;
  const regionW = Math.max(0, ex - sx);
  const fiPx = Math.min(regionW, ((fadeIn ?? 0) / duration) * width);
  const foPx = Math.min(regionW, ((fadeOut ?? 0) / duration) * width);
  let midL = sx + fiPx;
  let midR = ex - foPx;
  // If the two ramps would cross, meet them at the midpoint (a single peak).
  if (midL > midR) {
    const m = (midL + midR) / 2;
    midL = m;
    midR = m;
  }
  return {
    sx,
    ex,
    fadeInX: midL,
    fadeOutX: midR,
    envTop: WAVE_TOP + 3,
    envBot: WAVE_TOP + WAVE_H,
  };
}

type Props = {
  waveform: Waveform | null;
  notes: ManiaNote[];
  timingPoints: TimingPoint[];
  previewTime: number;
  /** Audio duration in ms (from the audio element). */
  duration: number;
  currentTime: number;
  getCurrentTime: () => number;
  onSeek: (ms: number) => void;
  /** Waveform amplitude multiplier (adjusted by scrolling over the timeline). */
  sensitivity: number;
  onSensitivity: (value: number) => void;
  revealWaveform: boolean;
  /** Collaborators' current positions, drawn as colored lines + avatars. */
  peers?: {
    color: string;
    playheadMs?: number;
    username: string;
    avatar?: string | null;
  }[];
  /** Comment anchors, drawn as markers above the waveform. */
  comments?: {
    time_ms: number;
    resolved: boolean;
    body?: string;
    author?: string | null;
  }[];
  /** Click a comment marker (top band) → seek there + open the comments panel. */
  onCommentClick?: (timeMs: number) => void;
  /** Editor bookmarks (ms) for the active difficulty, drawn as indigo flags. */
  bookmarks?: number[];
  /** Right-click menu actions (omitted for viewers → no menu). The ms is the
   *  song time under the cursor. */
  onSetPreviewPoint?: (ms: number) => void;
  onAddBookmark?: (ms: number) => void;
  onRemoveBookmark?: (ms: number) => void;
  /** Playback-region trim brackets (ms). Undefined ends default to the song
   *  boundaries (start 0, end = duration). */
  trimStart?: number;
  trimEnd?: number;
  /** Fade-in / fade-out lengths (ms) drawn as ramps inside the region. */
  fadeIn?: number;
  fadeOut?: number;
  /** Drag handlers for the brackets / fade dots (omitted for viewers). */
  onSetTrimStart?: (ms: number) => void;
  onSetTrimEnd?: (ms: number) => void;
  onSetFadeIn?: (ms: number) => void;
  onSetFadeOut?: (ms: number) => void;
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
  getCurrentTime,
  onSeek,
  sensitivity,
  onSensitivity,
  revealWaveform,
  peers,
  comments,
  onCommentClick,
  bookmarks,
  onSetPreviewPoint,
  onAddBookmark,
  onRemoveBookmark,
  trimStart,
  trimEnd,
  fadeIn,
  fadeOut,
  onSetTrimStart,
  onSetTrimEnd,
  onSetFadeIn,
  onSetFadeOut,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef({ width: 800, dpr: 1 });
  const draggingRef = useRef(false);
  // Which trim handle is currently grabbed (null = none). Drives the
  // window-level mousemove so a drag keeps tracking outside the canvas.
  const trimDragRef = useRef<
    "start" | "end" | "fadeIn" | "fadeOut" | null
  >(null);
  // Hover state for the trim handles, so they can highlight on approach.
  const trimHoverRef = useRef<
    "start" | "end" | "fadeIn" | "fadeOut" | null
  >(null);
  const waveformRevealStartRef = useRef(0);
  const revealedWaveformRef = useRef<Waveform | null>(null);
  // Offscreen cache of the expensive, mostly-static timeline layer (background,
  // per-pixel waveform, per-note density, timing/bookmark/preview marks). It's
  // re-rendered only when its inputs change; per frame we just blit it and draw
  // the moving playhead/peers on top — so playback no longer rebuilds it 360×/s.
  const staticLayerRef = useRef<HTMLCanvasElement | null>(null);
  const staticSigRef = useRef<{
    width: number;
    dpr: number;
    waveform: Waveform | null;
    sensitivity: number;
    revealWidth: number;
    notes: unknown;
    timingPoints: unknown;
    duration: number;
    bookmarks: unknown;
    previewTime: number;
  } | null>(null);
  // Cache of decoded avatar images (osu! pfps), keyed by URL, for canvas draws.
  const avatarCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  // Tooltip shown when hovering a comment marker (author + body).
  const [tip, setTip] = useState<{
    x: number;
    author: string;
    body: string;
    resolved: boolean;
  } | null>(null);
  const tipKeyRef = useRef<number | null>(null);
  // Popover shown when hovering a collaborator's avatar (enlarged pfp + name).
  // Positioned in viewport coords (fixed) so it escapes the timeline's
  // overflow-hidden / max-height wrapper instead of being clipped.
  const [peerTip, setPeerTip] = useState<{
    screenX: number;
    anchorTop: number;
    username: string;
    avatar: string | null;
    color: string;
  } | null>(null);
  const peerTipKeyRef = useRef<string | null>(null);

  // Right-click context menu (set preview point / offset / bookmark at a time).
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    ms: number;
    bookmark: number | null;
  } | null>(null);

  const propsRef = useRef({
    waveform,
    notes,
    timingPoints,
    previewTime,
    duration,
    currentTime,
    getCurrentTime,
    sensitivity,
    onSensitivity,
    revealWaveform,
    peers,
    comments,
    bookmarks,
    trimStart,
    trimEnd,
    fadeIn,
    fadeOut,
  });
  propsRef.current = {
    waveform,
    notes,
    timingPoints,
    previewTime,
    duration,
    currentTime,
    getCurrentTime,
    sensitivity,
    onSensitivity,
    revealWaveform,
    peers,
    comments,
    bookmarks,
    trimStart,
    trimEnd,
    fadeIn,
    fadeOut,
  };

  // Latest trim drag handlers, read by the window-level drag listener without
  // re-subscribing it every render.
  const trimHandlersRef = useRef({
    onSetTrimStart,
    onSetTrimEnd,
    onSetFadeIn,
    onSetFadeOut,
  });
  trimHandlersRef.current = {
    onSetTrimStart,
    onSetTrimEnd,
    onSetFadeIn,
    onSetFadeOut,
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
      getCurrentTime,
      sensitivity,
      revealWaveform,
      peers,
      comments,
      bookmarks,
      trimStart,
      trimEnd,
      fadeIn,
      fadeOut,
    } = propsRef.current;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, HEIGHT);

    const midY = WAVE_TOP + WAVE_H / 2;

    // Reveal animation width (the waveform wipes in once on load). Only this and
    // the cache's other inputs decide whether the static layer must re-render.
    let revealWidth = width;
    if (waveform) {
      const elapsed =
        performance.now() -
        waveformRevealStartRef.current -
        WAVEFORM_REVEAL_DELAY_MS;
      const progress = revealWaveform
        ? waveformRevealStartRef.current > 0
          ? Math.min(1, Math.max(0, elapsed / WAVEFORM_REVEAL_MS))
          : 0
        : 1;
      revealWidth = width * (1 - Math.pow(1 - progress, 3));
    }

    // ---- Static layer (cached) ----
    const prev = staticSigRef.current;
    const staticDirty =
      !prev ||
      prev.width !== width ||
      prev.dpr !== dpr ||
      prev.waveform !== waveform ||
      prev.sensitivity !== sensitivity ||
      prev.revealWidth !== Math.round(revealWidth) ||
      prev.notes !== notes ||
      prev.timingPoints !== timingPoints ||
      prev.duration !== duration ||
      prev.bookmarks !== bookmarks ||
      prev.previewTime !== previewTime;

    if (staticDirty) {
      let sc = staticLayerRef.current;
      if (!sc) {
        sc = document.createElement("canvas");
        staticLayerRef.current = sc;
      }
      const bw = Math.max(1, Math.floor(width * dpr));
      const bh = Math.max(1, Math.floor(HEIGHT * dpr));
      if (sc.width !== bw || sc.height !== bh) {
        sc.width = bw;
        sc.height = bh;
      }
      const sctx = sc.getContext("2d");
      if (sctx) {
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sctx.clearRect(0, 0, width, HEIGHT);

        // Background
        sctx.fillStyle = "#16161d";
        sctx.fillRect(0, 0, width, HEIGHT);

        // ---- Waveform ----
        if (waveform) {
          const { peaks } = waveform;
          sctx.save();
          sctx.beginPath();
          sctx.rect(0, WAVE_TOP, revealWidth, WAVE_H);
          sctx.clip();
          sctx.fillStyle = "rgba(91,192,255,0.55)";
          for (let x = 0; x < width; x++) {
            const idx = Math.floor((x / width) * peaks.length);
            const amp = Math.min(1, (peaks[idx] ?? 0) * sensitivity);
            const h = Math.max(1, amp * (WAVE_H / 2));
            sctx.fillRect(x, midY - h, 1, h * 2);
          }
          sctx.restore();
        } else {
          sctx.fillStyle = "#272733";
          sctx.fillRect(0, midY - 1, width, 2);
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

          const bw2 = width / DENSITY_BUCKETS;
          const dotR = 1.6;
          const gap = Math.max(2.4, DOT_BAND_H / MAX_DOTS);
          for (let i = 0; i < DENSITY_BUCKETS; i++) {
            const c = counts[i];
            if (c === 0) continue;
            const bucketTime = ((i + 0.5) / DENSITY_BUCKETS) * duration;
            sctx.fillStyle = inKiai(bucketTime) ? "#e86868" : "#ffd23f";
            const dots = Math.max(1, Math.round((c / peak) * MAX_DOTS));
            const cx = i * bw2 + bw2 / 2;
            for (let d = 0; d < dots; d++) {
              const cy = DOT_BAND_H - 2 - d * gap;
              if (cy < 2) break;
              sctx.beginPath();
              sctx.arc(cx, cy, dotR, 0, Math.PI * 2);
              sctx.fill();
            }
          }
        }

        // ---- Timing point markers: red (uninherited) + green (inherited SV) ----
        if (duration > 0) {
          for (const tp of timingPoints) {
            if (tp.time < 0 || tp.time > duration) continue;
            const tx = (tp.time / duration) * width;
            if (tp.uninherited) {
              sctx.fillStyle = "#ff2d6f";
              sctx.fillRect(tx, WAVE_TOP, 1.5, WAVE_H);
              sctx.beginPath();
              sctx.moveTo(tx, WAVE_TOP);
              sctx.lineTo(tx + 5, WAVE_TOP);
              sctx.lineTo(tx, WAVE_TOP + 5);
              sctx.fill();
            } else {
              sctx.fillStyle = "#2dd4bf";
              sctx.fillRect(tx, WAVE_TOP + WAVE_H * 0.4, 1.2, WAVE_H * 0.6);
            }
          }
        }

        // ---- Bookmarks (indigo flags over the waveform) ----
        if (duration > 0 && bookmarks?.length) {
          for (const b of bookmarks) {
            if (b < 0 || b > duration) continue;
            const bx = (b / duration) * width;
            sctx.strokeStyle = "#818cf8";
            sctx.globalAlpha = 0.5;
            sctx.lineWidth = 1;
            sctx.beginPath();
            sctx.moveTo(bx, WAVE_TOP);
            sctx.lineTo(bx, HEIGHT);
            sctx.stroke();
            sctx.globalAlpha = 1;
            // Small downward flag at the top of the waveform band.
            sctx.fillStyle = "#818cf8";
            sctx.beginPath();
            sctx.moveTo(bx - 4, WAVE_TOP);
            sctx.lineTo(bx + 4, WAVE_TOP);
            sctx.lineTo(bx, WAVE_TOP + 5);
            sctx.closePath();
            sctx.fill();
          }
        }

        // ---- Preview point marker (purple tick) ----
        if (duration > 0 && previewTime >= 0 && previewTime <= duration) {
          const px = (previewTime / duration) * width;
          sctx.fillStyle = "#c084fc";
          sctx.fillRect(px, WAVE_TOP, 2, WAVE_H);
          sctx.beginPath();
          sctx.moveTo(px, WAVE_TOP);
          sctx.lineTo(px + 7, WAVE_TOP);
          sctx.lineTo(px, WAVE_TOP + 7);
          sctx.fill();
        }
      }

      staticSigRef.current = {
        width,
        dpr,
        waveform,
        sensitivity,
        revealWidth: Math.round(revealWidth),
        notes,
        timingPoints,
        duration,
        bookmarks,
        previewTime,
      };
    }

    if (staticLayerRef.current) {
      ctx.drawImage(staticLayerRef.current, 0, 0, width, HEIGHT);
    }

    // ---- Played region tint ----
    if (duration > 0) {
      const currentTime = getCurrentTime();
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

    // ---- Trim region: red brackets + draggable fade envelope ----
    const trim = trimGeometry(
      duration,
      width,
      trimStart,
      trimEnd,
      fadeIn,
      fadeOut,
    );
    if (trim) {
      const { sx, ex, fadeInX, fadeOutX, envTop, envBot } = trim;

      // Dim the cut-away regions outside the brackets so the kept region pops.
      ctx.fillStyle = "rgba(8,9,14,0.58)";
      if (sx > 0.5) ctx.fillRect(0, WAVE_TOP, sx, WAVE_H);
      if (ex < width - 0.5) ctx.fillRect(ex, WAVE_TOP, width - ex, WAVE_H);

      // Volume envelope: gain ramps 0 → 1 over the fade-in, holds, then 1 → 0
      // over the fade-out. Filled translucent, with a crisp top edge.
      ctx.beginPath();
      ctx.moveTo(sx, envBot);
      ctx.lineTo(fadeInX, envTop);
      ctx.lineTo(fadeOutX, envTop);
      ctx.lineTo(ex, envBot);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,77,77,0.13)";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx, envBot);
      ctx.lineTo(fadeInX, envTop);
      ctx.lineTo(fadeOutX, envTop);
      ctx.lineTo(ex, envBot);
      ctx.strokeStyle = "rgba(255,128,128,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const hover = trimHoverRef.current;
      const drag = trimDragRef.current;

      // Brackets — bold red verticals with a grab tab pointing into the region.
      const drawBracket = (x: number, side: "start" | "end") => {
        const active = hover === side || drag === side;
        ctx.fillStyle = active ? "#ff7a7a" : "#ff4d4d";
        ctx.fillRect(x - 1.25, WAVE_TOP - 2, 2.5, WAVE_H + 4);
        const tabY = WAVE_TOP + WAVE_H / 2;
        const dir = side === "start" ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x, tabY - 7);
        ctx.lineTo(x + dir * 8, tabY);
        ctx.lineTo(x, tabY + 7);
        ctx.closePath();
        ctx.fill();
      };
      drawBracket(sx, "start");
      drawBracket(ex, "end");

      // Fade dots — draggable circles at the top of each ramp.
      const drawDot = (x: number, side: "fadeIn" | "fadeOut") => {
        const active = hover === side || drag === side;
        ctx.beginPath();
        ctx.arc(x, envTop, active ? 5.5 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = "#ff4d4d";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
      };
      drawDot(fadeInX, "fadeIn");
      drawDot(fadeOutX, "fadeOut");
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

    // ---- Collaborator position lines + avatars ----
    if (duration > 0 && peers?.length) {
      const cache = avatarCacheRef.current;
      const AR = AVATAR_R; // avatar radius
      const AY = AVATAR_Y; // avatar center y (top band, above the waveform)
      for (const p of peers) {
        if (p.playheadMs === undefined) continue;
        const cx = (p.playheadMs / duration) * width;

        // Vertical position line.
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, AY + AR);
        ctx.lineTo(cx, HEIGHT);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // osu! avatar disc at the top of the line (falls back to an initial).
        let img: HTMLImageElement | undefined;
        if (p.avatar) {
          img = cache.get(p.avatar);
          if (!img) {
            img = new Image();
            img.decoding = "async";
            img.src = p.avatar;
            cache.set(p.avatar, img);
          }
        }
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, AY, AR, 0, Math.PI * 2);
        ctx.closePath();
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.clip();
          ctx.drawImage(img, cx - AR, AY - AR, AR * 2, AR * 2);
        } else {
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.fillStyle = "#0b0b10";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.username.slice(0, 1).toUpperCase(), cx, AY + 0.5);
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
        }
        ctx.restore();
        // Colored ring around the avatar.
        ctx.beginPath();
        ctx.arc(cx, AY, AR, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.color;
        ctx.stroke();
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

  // Hit-test the trim handles. Fade dots win over brackets (they sit on top),
  // and brackets only register within the waveform band.
  const hitTrimHandle = useCallback(
    (clientX: number, clientY: number): typeof trimDragRef.current => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const { duration, trimStart, trimEnd, fadeIn, fadeOut } =
        propsRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      if (my < WAVE_TOP - 5 || my > WAVE_TOP + WAVE_H + 4) return null;
      const t = trimGeometry(
        duration,
        rect.width,
        trimStart,
        trimEnd,
        fadeIn,
        fadeOut,
      );
      if (!t) return null;
      const dotR = 8;
      const dIn = Math.hypot(mx - t.fadeInX, my - t.envTop);
      const dOut = Math.hypot(mx - t.fadeOutX, my - t.envTop);
      if (dIn <= dotR && dIn <= dOut) return "fadeIn";
      if (dOut <= dotR) return "fadeOut";
      if (Math.abs(mx - t.sx) <= 6) return "start";
      if (Math.abs(mx - t.ex) <= 6) return "end";
      return null;
    },
    [],
  );

  // Apply a drag of the grabbed trim handle to the song time under the cursor.
  const applyTrimDrag = useCallback(
    (handle: NonNullable<typeof trimDragRef.current>, clientX: number) => {
      const canvas = canvasRef.current;
      const { duration, trimStart, trimEnd } = propsRef.current;
      if (!canvas || !(duration > 0)) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const ms = ratio * duration;
      const h = trimHandlersRef.current;
      if (handle === "start") h.onSetTrimStart?.(ms);
      else if (handle === "end") h.onSetTrimEnd?.(ms);
      else if (handle === "fadeIn") h.onSetFadeIn?.(Math.max(0, ms - (trimStart ?? 0)));
      else if (handle === "fadeOut")
        h.onSetFadeOut?.(Math.max(0, (trimEnd ?? duration) - ms));
    },
    [],
  );

  const hasTrimHandlers =
    !!onSetTrimStart || !!onSetTrimEnd || !!onSetFadeIn || !!onSetFadeOut;

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // left-click only (right-click → context menu)
    // Trim brackets / fade dots take priority over seeking when grabbed.
    if (hasTrimHandlers) {
      const handle = hitTrimHandle(e.clientX, e.clientY);
      if (handle) {
        trimDragRef.current = handle;
        trimHoverRef.current = handle;
        return;
      }
    }
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

  const hasMenuActions = !!onSetPreviewPoint || !!onAddBookmark;

  // Right-click → context menu at the cursor for the song time under it.
  const onCanvasContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!hasMenuActions) return; // viewers: no actions, no menu
    const canvas = canvasRef.current;
    const { duration, bookmarks } = propsRef.current;
    if (!canvas || !(duration > 0)) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const ms = Math.max(0, Math.min(1, mx / rect.width)) * duration;
    // If they right-clicked on/near a bookmark, offer to remove that one.
    let bookmark: number | null = null;
    let bestDist = 6;
    for (const b of bookmarks ?? []) {
      const bx = (b / duration) * rect.width;
      const d = Math.abs(bx - mx);
      if (d <= bestDist) {
        bestDist = d;
        bookmark = b;
      }
    }
    setMenu({ x: e.clientX, y: e.clientY, ms, bookmark });
  };

  // Close the context menu on Escape.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const clearCommentTip = () => {
    if (tipKeyRef.current !== null) {
      tipKeyRef.current = null;
      setTip(null);
    }
  };
  const clearPeerTip = () => {
    if (peerTipKeyRef.current !== null) {
      peerTipKeyRef.current = null;
      setPeerTip(null);
    }
  };

  // Hover the top band → enlarge a collaborator's avatar, or show a comment pin's
  // author + text. A peer avatar takes precedence over a comment pin underneath.
  const onCanvasMove = (e: React.MouseEvent) => {
    if (draggingRef.current || trimDragRef.current) return;
    const canvas = canvasRef.current;
    const { duration, comments, peers } = propsRef.current;
    if (!canvas || !(duration > 0)) {
      clearPeerTip();
      clearCommentTip();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Trim handles: highlight on hover and switch the cursor to signal a drag.
    if (hasTrimHandlers) {
      const handle = hitTrimHandle(e.clientX, e.clientY);
      if (trimHoverRef.current !== handle) trimHoverRef.current = handle;
      if (handle) {
        canvas.style.cursor =
          handle === "start" || handle === "end" ? "ew-resize" : "grab";
        clearPeerTip();
        clearCommentTip();
        return;
      }
      canvas.style.cursor = "";
    }

    // Collaborator avatars (top band).
    if (peers?.length) {
      let hit: { username: string; avatar: string | null; color: string; cx: number } | null = null;
      let bestDist = (AVATAR_R + 3) ** 2;
      for (const p of peers) {
        if (p.playheadMs === undefined) continue;
        const cx = (p.playheadMs / duration) * rect.width;
        const dx = cx - mx;
        const dy = AVATAR_Y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 <= bestDist) {
          bestDist = d2;
          hit = { username: p.username, avatar: p.avatar ?? null, color: p.color, cx };
        }
      }
      if (hit) {
        clearCommentTip();
        if (peerTipKeyRef.current !== hit.username) {
          peerTipKeyRef.current = hit.username;
          setPeerTip({
            screenX: rect.left + hit.cx,
            anchorTop: rect.top + (AVATAR_Y - AVATAR_R),
            username: hit.username,
            avatar: hit.avatar,
            color: hit.color,
          });
        }
        return;
      }
    }
    clearPeerTip();

    // Comment pins (top band).
    let best: { time_ms: number; cx: number } | null = null;
    let bestDist = 8;
    if (comments?.length && my <= 18) {
      for (const c of comments) {
        const cx = (c.time_ms / duration) * rect.width;
        const d = Math.abs(cx - mx);
        if (d <= bestDist) {
          bestDist = d;
          best = { time_ms: c.time_ms, cx };
        }
      }
    }
    if (best) {
      if (tipKeyRef.current === best.time_ms) return; // unchanged
      const c = comments!.find((x) => x.time_ms === best!.time_ms);
      tipKeyRef.current = best.time_ms;
      setTip({
        x: best.cx,
        author: c?.author ?? "Mapper",
        body: c?.body ?? "",
        resolved: c?.resolved ?? false,
      });
    } else {
      clearCommentTip();
    }
  };

  const clearTip = () => {
    clearCommentTip();
    clearPeerTip();
    // Drop any trim-handle highlight when the cursor leaves the strip (unless a
    // drag is in progress, which the window listener owns).
    if (!trimDragRef.current && trimHoverRef.current !== null) {
      trimHoverRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = "";
    }
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
      if (trimDragRef.current) {
        applyTrimDrag(trimDragRef.current, e.clientX);
        return;
      }
      if (draggingRef.current) seekFromEvent(e.clientX);
    };
    const onUp = () => {
      draggingRef.current = false;
      if (trimDragRef.current) {
        trimDragRef.current = null;
        trimHoverRef.current = null;
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [seekFromEvent, applyTrimDrag]);

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
        onMouseMove={onCanvasMove}
        onMouseLeave={clearTip}
        onContextMenu={onCanvasContextMenu}
      />
      {/* Comment hover tooltip */}
      {tip && (
        <div
          className="pointer-events-none absolute z-20 w-56 -translate-x-1/2 rounded-lg border border-ink-500/70 bg-ink-900/95 px-2.5 py-1.5 shadow-xl"
          style={{
            left: Math.min(
              sizeRef.current.width - 116,
              Math.max(116, tip.x),
            ),
            top: 20,
          }}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
            <span className="truncate">{tip.author}</span>
            {tip.resolved && (
              <span className="rounded bg-ink-600 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-400">
                Resolved
              </span>
            )}
          </div>
          <div className="mt-0.5 line-clamp-4 whitespace-pre-wrap break-words text-xs text-slate-300">
            {tip.body || "(no text)"}
          </div>
        </div>
      )}
      {/* Collaborator avatar hover popover (enlarged pfp + username). Portaled to
          <body> so `fixed` is viewport-relative — the timeline's translate-y
          ancestor would otherwise clip it via the overflow-hidden wrapper. */}
      {peerTip &&
        createPortal(
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: peerTip.screenX, top: peerTip.anchorTop }}
        >
          <div
            key={peerTip.username}
            className="pfp-pop-in absolute bottom-full left-0 mb-1.5 flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-xl border border-ink-500/70 bg-ink-900/95 px-3 py-2.5 shadow-2xl"
          >
            <span
              className="grid h-14 w-14 place-items-center overflow-hidden rounded-full border-2 bg-ink-700/70 text-lg font-semibold text-slate-100 shadow-md"
              style={{ borderColor: peerTip.color }}
            >
              {peerTip.avatar ? (
                <img
                  src={peerTip.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                peerTip.username.slice(0, 1).toUpperCase()
              )}
            </span>
            <span className="max-w-[8.5rem] truncate text-xs font-semibold text-slate-100">
              {peerTip.username}
            </span>
          </div>
        </div>,
          document.body,
        )}

      {/* Sensitivity hint - appears on hover */}
      <div className="pointer-events-none absolute right-2 top-1.5 select-none rounded bg-ink-900/70 px-2 py-0.5 text-[10px] text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
        waveform {sensitivity.toFixed(1)}× · scroll to adjust
      </div>

      {/* Right-click context menu. Portaled to <body> so `fixed` positioning is
          relative to the viewport — an ancestor `transform` (the timeline's
          translate-y) would otherwise make it a containing block and the
          overflow-hidden wrapper would clip the menu out of view. */}
      {menu &&
        createPortal(
        <div
          className="fixed inset-0 z-50"
          onMouseDown={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        >
          <div
            className="absolute min-w-[12rem] overflow-hidden rounded-lg border border-ink-500/70 bg-ink-900/95 py-1 text-sm text-slate-200 shadow-2xl backdrop-blur"
            style={{
              left: Math.min(menu.x, window.innerWidth - 208),
              top: Math.min(menu.y, window.innerHeight - 132),
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {formatTimestamp(menu.ms)}
            </div>
            {onSetPreviewPoint && (
              <MenuItem
                onClick={() => {
                  onSetPreviewPoint(menu.ms);
                  setMenu(null);
                }}
              >
                <span className="text-purple-300">◆</span> Set preview point
              </MenuItem>
            )}
            {menu.bookmark !== null
              ? onRemoveBookmark && (
                  <MenuItem
                    onClick={() => {
                      onRemoveBookmark(menu.bookmark!);
                      setMenu(null);
                    }}
                  >
                    <span className="text-indigo-300">⚑</span> Remove bookmark
                  </MenuItem>
                )
              : onAddBookmark && (
                  <MenuItem
                    onClick={() => {
                      onAddBookmark(menu.ms);
                      setMenu(null);
                    }}
                  >
                    <span className="text-indigo-300">⚑</span> New bookmark
                  </MenuItem>
                )}
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent hover:text-white"
    >
      {children}
    </button>
  );
}

/** mm:ss.mmm for the context-menu header. */
function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${m}:${s.toString().padStart(2, "0")}.${millis
    .toString()
    .padStart(3, "0")}`;
}
