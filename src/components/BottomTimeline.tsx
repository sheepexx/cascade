import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ManiaNote, TimingPoint } from "../types";
import type { Waveform } from "../hooks/useWaveform";
import { kiaiRanges } from "../lib/timing";
import { buildSvMap, hasSv } from "../lib/sv";
import {
  bookmarkLabel,
  type BookmarkLoopRange,
} from "../lib/bookmarks";

const HEIGHT = 96;
const AVATAR_R = 9;
const AVATAR_Y = 11;
const WAVE_TOP = 34;
const WAVE_H = HEIGHT - WAVE_TOP - 6;
const DOT_BAND_H = WAVE_TOP - 6;
const DENSITY_BUCKETS = 240;
const MAIN_REVEAL_MS = 300;
const WAVEFORM_REVEAL_DELAY_MS = MAIN_REVEAL_MS;
const WAVEFORM_REVEAL_MS = 700;
const RESIZE_SETTLE_MS = 90;
const SCRUB_SEEK_INTERVAL_MS = 32;

type TrimGeom = {
  sx: number;
  ex: number;
  fadeInX: number;
  fadeOutX: number;
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
  duration: number;
  getCurrentTime: () => number;
  isPlaying: boolean;
  onSeek: (ms: number) => void;
  sensitivity: number;
  onSensitivity: (value: number) => void;
  revealWaveform: boolean;
  peers?: {
    color: string;
    playheadMs?: number;
    username: string;
    avatar?: string | null;
  }[];
  comments?: {
    time_ms: number;
    resolved: boolean;
    body?: string;
    author?: string | null;
  }[];
  onCommentClick?: (timeMs: number) => void;
  bookmarks?: number[];
  /** Include BPM in the scroll-rate lane, matching the editor setting. */
  svBpmScroll?: boolean;
  bookmarkLabels?: Record<string, string>;
  loopRange?: BookmarkLoopRange | null;
  loopEnabled?: boolean;
  onSetPreviewPoint?: (ms: number) => void;
  onAddBookmark?: (ms: number, label?: string) => void;
  onRenameBookmark?: (ms: number, label: string) => void;
  onRemoveBookmark?: (ms: number) => void;
  onPreviousBookmark?: () => void;
  onNextBookmark?: () => void;
  onSetLoopStart?: (ms: number) => void;
  onSetLoopEnd?: (ms: number) => void;
  onToggleLoop?: () => void;
  onClearLoop?: () => void;
  trimStart?: number;
  trimEnd?: number;
  fadeIn?: number;
  fadeOut?: number;
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
  getCurrentTime,
  isPlaying,
  onSeek,
  sensitivity,
  onSensitivity,
  revealWaveform,
  peers,
  comments,
  onCommentClick,
  bookmarks,
  svBpmScroll,
  bookmarkLabels,
  loopRange,
  loopEnabled,
  onSetPreviewPoint,
  onAddBookmark,
  onRenameBookmark,
  onRemoveBookmark,
  onPreviousBookmark,
  onNextBookmark,
  onSetLoopStart,
  onSetLoopEnd,
  onToggleLoop,
  onClearLoop,
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
  const dragStartXRef = useRef(0);
  const dragMovedRef = useRef(false);
  const seekRafRef = useRef(0);
  const pendingSeekXRef = useRef<number | null>(null);
  const lastScrubSeekRef = useRef(0);
  const scheduleDrawRef = useRef<() => void>(() => {});
  const trimDragRef = useRef<
    "start" | "end" | "fadeIn" | "fadeOut" | null
  >(null);
  const trimHoverRef = useRef<
    "start" | "end" | "fadeIn" | "fadeOut" | null
  >(null);
  const waveformRevealStartRef = useRef(0);
  const revealedWaveformRef = useRef<Waveform | null>(null);
  const staticLayerRef = useRef<HTMLCanvasElement | null>(null);
  const staticSigRef = useRef<{
    width: number;
    dpr: number;
    waveform: Waveform | null;
    sensitivity: number;
    notes: unknown;
    timingPoints: unknown;
    duration: number;
    bookmarks: unknown;
    previewTime: number;
    svBpmScroll: boolean | undefined;
  } | null>(null);
  const avatarCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [tip, setTip] = useState<{
    x: number;
    author: string;
    body: string;
    resolved: boolean;
  } | null>(null);
  const tipKeyRef = useRef<number | null>(null);
  const [bookmarkTip, setBookmarkTip] = useState<{
    x: number;
    timeMs: number;
    label: string;
  } | null>(null);
  const bookmarkTipKeyRef = useRef<number | null>(null);
  const [peerTip, setPeerTip] = useState<{
    screenX: number;
    anchorTop: number;
    username: string;
    avatar: string | null;
    color: string;
  } | null>(null);
  const peerTipKeyRef = useRef<string | null>(null);

  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    ms: number;
    bookmark: number | null;
  } | null>(null);
  const [bookmarkDraft, setBookmarkDraft] = useState("");

  const propsRef = useRef({
    waveform,
    notes,
    timingPoints,
    previewTime,
    duration,
    getCurrentTime,
    isPlaying,
    sensitivity,
    onSensitivity,
    revealWaveform,
    svBpmScroll,
    peers,
    comments,
    bookmarks,
    bookmarkLabels,
    loopRange,
    loopEnabled,
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
    getCurrentTime,
    isPlaying,
    sensitivity,
    onSensitivity,
    revealWaveform,
    svBpmScroll,
    peers,
    comments,
    bookmarks,
    bookmarkLabels,
    loopRange,
    loopEnabled,
    trimStart,
    trimEnd,
    fadeIn,
    fadeOut,
  };

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
    scheduleDrawRef.current();
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
      svBpmScroll,
      peers,
      comments,
      bookmarks,
      loopRange,
      loopEnabled,
      trimStart,
      trimEnd,
      fadeIn,
      fadeOut,
    } = propsRef.current;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, HEIGHT);

    const midY = WAVE_TOP + WAVE_H / 2;

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

    const prev = staticSigRef.current;
    const dataDirty =
      !prev ||
      prev.waveform !== waveform ||
      prev.sensitivity !== sensitivity ||
      prev.notes !== notes ||
      prev.timingPoints !== timingPoints ||
      prev.duration !== duration ||
      prev.bookmarks !== bookmarks ||
      prev.previewTime !== previewTime ||
      prev.svBpmScroll !== svBpmScroll;

    const geometryDirty =
      !prev ||
      prev.width !== width ||
      prev.dpr !== dpr;

    const staticDirty = dataDirty || geometryDirty;

    if (staticDirty) {
      let sc = staticLayerRef.current;
      if (!sc) {
        sc = document.createElement("canvas");
        staticLayerRef.current = sc;
      }
      const bw = Math.max(1, Math.floor(width * dpr));
      const bh = Math.max(1, Math.floor(HEIGHT * dpr));
      if (sc.width !== bw) sc.width = bw;
      if (sc.height !== bh) sc.height = bh;
      const sctx = sc.getContext("2d");
      if (sctx) {
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sctx.clearRect(0, 0, width, HEIGHT);

        sctx.fillStyle = "#16161d";
        sctx.fillRect(0, 0, width, HEIGHT);

        if (waveform) {
          const { peaks } = waveform;
          sctx.fillStyle = "rgba(91,192,255,0.55)";
          for (let x = 0; x < width; x++) {
            const idx = Math.floor((x / width) * peaks.length);
            const amp = Math.min(1, (peaks[idx] ?? 0) * sensitivity);
            const h = Math.max(1, amp * (WAVE_H / 2));
            sctx.fillRect(x, midY - h, 1, h * 2);
          }
        } else {
          sctx.fillStyle = "#272733";
          sctx.fillRect(0, midY - 1, width, 2);
        }

        if (duration > 0 && notes.length > 0) {
          const counts = new Array<number>(DENSITY_BUCKETS).fill(0);
          for (const n of notes) {
            const b = Math.floor((n.startTime / duration) * DENSITY_BUCKETS);
            if (b >= 0 && b < DENSITY_BUCKETS) counts[b]++;
            if (n.endTime !== undefined) {
              const be = Math.floor((n.endTime / duration) * DENSITY_BUCKETS);
              if (be >= 0 && be < DENSITY_BUCKETS && be !== b) counts[be]++;
            }
          }
          let peak = 1;
          for (const c of counts) if (c > peak) peak = c;

          const kiais = kiaiRanges(timingPoints, duration);
          const inKiai = (t: number) =>
            kiais.some((k) => t >= k.start && t < k.end);

          // NPS area graph: bar per bucket, height scaled to the busiest bucket,
          // tinted red inside kiai and yellow elsewhere.
          const bw2 = width / DENSITY_BUCKETS;
          const baseY = DOT_BAND_H - 1;
          const usableH = DOT_BAND_H - 3;
          for (let i = 0; i < DENSITY_BUCKETS; i++) {
            const c = counts[i];
            if (c === 0) continue;
            const bucketTime = ((i + 0.5) / DENSITY_BUCKETS) * duration;
            const kiai = inKiai(bucketTime);
            const h = Math.max(1.5, (c / peak) * usableH);
            const x0 = i * bw2;
            const barW = Math.max(1, bw2 - 0.3);
            const grad = sctx.createLinearGradient(0, baseY - h, 0, baseY);
            grad.addColorStop(0, kiai ? "#ff7a7a" : "#ffe066");
            grad.addColorStop(1, kiai ? "rgba(232,104,104,0.25)" : "rgba(255,210,63,0.22)");
            sctx.fillStyle = grad;
            sctx.fillRect(x0, baseY - h, barW, h);
          }
        }

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

        if (duration > 0 && hasSv(timingPoints, { bpmScroll: svBpmScroll })) {
          // Stepped scroll-rate curve along the bottom of the wave band,
          // log-scaled so 0.5x dips read as clearly as 4x spikes. Drawn from
          // the same map the editor scrolls by, so BPM gimmicks show up here
          // too. One vertex per rate change rather than per sample, so brief
          // stutters stay visible.
          const segments = buildSvMap(timingPoints, {
            bpmScroll: svBpmScroll,
          }).segments;
          const svBase = WAVE_TOP + WAVE_H - 1;
          const svH = WAVE_H * 0.45;
          const yOfSv = (sv: number) =>
            svBase -
            ((Math.log10(Math.max(0.01, Math.min(100, sv))) + 2) / 4) * svH;
          const xOf = (t: number) => (Math.max(0, t) / duration) * width;
          sctx.strokeStyle = "rgba(45,212,191,0.75)";
          sctx.lineWidth = 1;
          sctx.beginPath();
          let lastX = 0;
          let lastY = yOfSv(1);
          sctx.moveTo(0, lastY);
          for (const seg of segments) {
            if (seg.time > duration) break;
            const x = xOf(seg.time);
            const y = yOfSv(seg.sv);
            sctx.lineTo(x, lastY);
            sctx.lineTo(x, y);
            lastX = x;
            lastY = y;
          }
          if (lastX < width) sctx.lineTo(width, lastY);
          sctx.stroke();
        }

        if (duration > 0 && bookmarks?.length) {
          // Amber, matching the bookmark lines in the editor lane and staying
          // clear of the pink timing points these used to disappear into. Maps
          // can carry dozens of bookmarks, so the line stays inside the
          // waveform band and the locator tab goes in the gap above it — the
          // one strip nothing else draws in, which keeps them scannable as a
          // row without burying the NPS graph.
          for (const b of bookmarks) {
            if (b < 0 || b > duration) continue;
            const bx = (b / duration) * width;

            // The line is a position guide, deliberately soft so a map with
            // dozens of bookmarks doesn't bury its own waveform.
            sctx.globalAlpha = 0.6;
            sctx.strokeStyle = "#fbbf24";
            sctx.lineWidth = 1.5;
            sctx.beginPath();
            sctx.moveTo(bx, WAVE_TOP);
            sctx.lineTo(bx, HEIGHT);
            sctx.stroke();
            sctx.globalAlpha = 1;

            // The marker does the work: full strength, in the gap above the
            // waveform that nothing else draws in, and pointed so it reads as
            // a marker rather than another density bar.
            sctx.fillStyle = "#fbbf24";
            sctx.strokeStyle = "rgba(0,0,0,0.55)";
            sctx.lineWidth = 1;
            sctx.beginPath();
            sctx.moveTo(bx - 3.5, DOT_BAND_H);
            sctx.lineTo(bx + 3.5, DOT_BAND_H);
            sctx.lineTo(bx, WAVE_TOP);
            sctx.closePath();
            sctx.fill();
            sctx.stroke();
          }
        }

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
        notes,
        timingPoints,
        duration,
        bookmarks,
        previewTime,
        svBpmScroll,
      };
    }

    if (staticLayerRef.current) {
      ctx.drawImage(staticLayerRef.current, 0, 0, width, HEIGHT);
    }
    if (waveform && revealWidth < width) {
      ctx.fillStyle = "#16161d";
      ctx.fillRect(revealWidth, WAVE_TOP, width - revealWidth, WAVE_H);
    }

    if (duration > 0 && loopRange && loopRange.endMs > loopRange.startMs) {
      const sx = (loopRange.startMs / duration) * width;
      const ex = (loopRange.endMs / duration) * width;
      ctx.fillStyle = loopEnabled
        ? "rgba(45,212,191,0.14)"
        : "rgba(148,163,184,0.08)";
      ctx.fillRect(sx, WAVE_TOP, Math.max(1, ex - sx), WAVE_H);
      ctx.strokeStyle = loopEnabled
        ? "rgba(45,212,191,0.95)"
        : "rgba(148,163,184,0.6)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, WAVE_TOP + 0.75, Math.max(1, ex - sx), WAVE_H - 1.5);
    }

    if (duration > 0) {
      const currentTime = getCurrentTime();
      const px = (currentTime / duration) * width;
      ctx.fillStyle = "rgba(255,93,177,0.10)";
      ctx.fillRect(0, WAVE_TOP, px, WAVE_H);

      ctx.strokeStyle = "#e86868";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, HEIGHT);
      ctx.stroke();
    }

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

      ctx.fillStyle = "rgba(8,9,14,0.58)";
      if (sx > 0.5) ctx.fillRect(0, WAVE_TOP, sx, WAVE_H);
      if (ex < width - 0.5) ctx.fillRect(ex, WAVE_TOP, width - ex, WAVE_H);

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

    if (duration > 0 && comments?.length) {
      for (const c of comments) {
        if (c.time_ms < 0 || c.time_ms > duration) continue;
        const cx = (c.time_ms / duration) * width;
        const col = c.resolved ? "rgba(148,163,184,0.6)" : "#fbbf24";
        ctx.strokeStyle = col;
        ctx.globalAlpha = c.resolved ? 0.3 : 0.55;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, 13);
        ctx.lineTo(cx, HEIGHT);
        ctx.stroke();
        ctx.globalAlpha = 1;
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
        ctx.fillStyle = "#0b0b10";
        ctx.beginPath();
        ctx.arc(cx, 7, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (duration > 0 && peers?.length) {
      const cache = avatarCacheRef.current;
      const AR = AVATAR_R;
      const AY = AVATAR_Y;
      for (const p of peers) {
        if (p.playheadMs === undefined) continue;
        const cx = (p.playheadMs / duration) * width;

        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, AY + AR);
        ctx.lineTo(cx, HEIGHT);
        ctx.stroke();
        ctx.globalAlpha = 1;

        let img: HTMLImageElement | undefined;
        if (p.avatar) {
          img = cache.get(p.avatar);
          if (!img) {
            img = new Image();
            img.decoding = "async";
            img.onload = () => scheduleDrawRef.current();
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
        ctx.beginPath();
        ctx.arc(cx, AY, AR, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.color;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, []);

  useEffect(() => {
    let raf = 0;
    let stopped = false;
    const shouldAnimate = () => {
      const { waveform, revealWaveform, isPlaying } = propsRef.current;
      if (isPlaying) return true;
      const revealStart = waveformRevealStartRef.current;
      return (
        !!waveform &&
        revealWaveform &&
        revealStart > 0 &&
        performance.now() - revealStart <
          WAVEFORM_REVEAL_DELAY_MS + WAVEFORM_REVEAL_MS
      );
    };
    const schedule = () => {
      if (!stopped && !raf) raf = requestAnimationFrame(loop);
    };
    const loop = () => {
      raf = 0;
      draw();
      if (shouldAnimate()) schedule();
    };
    scheduleDrawRef.current = schedule;
    schedule();
    return () => {
      stopped = true;
      scheduleDrawRef.current = () => {};
      cancelAnimationFrame(raf);
    };
  }, [draw]);

  useEffect(() => scheduleDrawRef.current());

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let settle = 0;
    let pending = -1;

    const applyWidth = (width: number) => {
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { width, dpr };
      const bw = Math.max(1, Math.floor(width * dpr));
      const bh = Math.max(1, Math.floor(HEIGHT * dpr));
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      scheduleDrawRef.current();
    };

    const measure = () => {
      const width = wrap.getBoundingClientRect().width;
      if (width === pending) return;
      pending = width;
      window.clearTimeout(settle);
      settle = window.setTimeout(() => applyWidth(width), RESIZE_SETTLE_MS);
    };

    applyWidth(wrap.getBoundingClientRect().width);
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      window.clearTimeout(settle);
    };
  }, []);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const canvas = canvasRef.current;
      const { duration } = propsRef.current;
      if (!canvas || !(duration > 0) || !Number.isFinite(duration)) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
      scheduleDrawRef.current();
    },
    [onSeek],
  );

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
    if (e.button !== 0) return;
    if (hasTrimHandlers) {
      const handle = hitTrimHandle(e.clientX, e.clientY);
      if (handle) {
        trimDragRef.current = handle;
        trimHoverRef.current = handle;
        return;
      }
    }
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
    dragStartXRef.current = e.clientX;
    dragMovedRef.current = false;
    seekFromEvent(e.clientX);
    lastScrubSeekRef.current = performance.now();
  };

  const hasMenuActions = !!onSetPreviewPoint || !!onAddBookmark;

  const onCanvasContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!hasMenuActions) return;
    const canvas = canvasRef.current;
    const { duration, bookmarks } = propsRef.current;
    if (!canvas || !(duration > 0)) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const ms = Math.max(0, Math.min(1, mx / rect.width)) * duration;
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
    setBookmarkDraft(
      bookmark === null ? "" : bookmarkLabel(bookmarkLabels, bookmark),
    );
    setMenu({ x: e.clientX, y: e.clientY, ms, bookmark });
  };

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
  const clearBookmarkTip = () => {
    if (bookmarkTipKeyRef.current !== null) {
      bookmarkTipKeyRef.current = null;
      setBookmarkTip(null);
    }
  };
  const clearPeerTip = () => {
    if (peerTipKeyRef.current !== null) {
      peerTipKeyRef.current = null;
      setPeerTip(null);
    }
  };

  const onCanvasMove = (e: React.MouseEvent) => {
    if (draggingRef.current || trimDragRef.current) return;
    const canvas = canvasRef.current;
    const { duration, comments, peers, bookmarks, bookmarkLabels } =
      propsRef.current;
    if (!canvas || !(duration > 0)) {
      clearPeerTip();
      clearCommentTip();
      clearBookmarkTip();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (hasTrimHandlers) {
      const handle = hitTrimHandle(e.clientX, e.clientY);
      if (trimHoverRef.current !== handle) trimHoverRef.current = handle;
      if (handle) {
        canvas.style.cursor =
          handle === "start" || handle === "end" ? "ew-resize" : "grab";
        clearPeerTip();
        clearCommentTip();
        clearBookmarkTip();
        return;
      }
      canvas.style.cursor = "";
    }

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
        clearBookmarkTip();
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

    let bookmarkHit: { timeMs: number; cx: number } | null = null;
    let bookmarkDist = 8;
    if (
      bookmarks?.length &&
      my >= DOT_BAND_H - 7 &&
      my <= WAVE_TOP + 9
    ) {
      for (const timeMs of bookmarks) {
        const cx = (timeMs / duration) * rect.width;
        const distance = Math.abs(cx - mx);
        if (distance <= bookmarkDist) {
          bookmarkDist = distance;
          bookmarkHit = { timeMs, cx };
        }
      }
    }
    if (bookmarkHit) {
      clearCommentTip();
      if (bookmarkTipKeyRef.current !== bookmarkHit.timeMs) {
        bookmarkTipKeyRef.current = bookmarkHit.timeMs;
        setBookmarkTip({
          x: bookmarkHit.cx,
          timeMs: bookmarkHit.timeMs,
          label: bookmarkLabel(bookmarkLabels, bookmarkHit.timeMs),
        });
      }
      return;
    }
    clearBookmarkTip();

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
      if (tipKeyRef.current === best.time_ms) return;
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
    clearBookmarkTip();
    clearPeerTip();
    if (!trimDragRef.current && trimHoverRef.current !== null) {
      trimHoverRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = "";
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { sensitivity, onSensitivity } = propsRef.current;
      const dir = e.deltaY < 0 ? 1 : -1;
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
    const flushSeek = () => {
      const now = performance.now();
      if (now - lastScrubSeekRef.current < SCRUB_SEEK_INTERVAL_MS) {
        seekRafRef.current = requestAnimationFrame(flushSeek);
        return;
      }
      seekRafRef.current = 0;
      const clientX = pendingSeekXRef.current;
      pendingSeekXRef.current = null;
      if (clientX !== null) {
        lastScrubSeekRef.current = now;
        seekFromEvent(clientX);
      }
    };
    const scheduleSeek = (clientX: number) => {
      pendingSeekXRef.current = clientX;
      if (!seekRafRef.current) {
        seekRafRef.current = requestAnimationFrame(flushSeek);
      }
    };
    const onMove = (e: MouseEvent) => {
      if (trimDragRef.current) {
        applyTrimDrag(trimDragRef.current, e.clientX);
        return;
      }
      if (draggingRef.current) {
        if (Math.abs(e.clientX - dragStartXRef.current) >= 0.5) {
          dragMovedRef.current = true;
        }
        scheduleSeek(e.clientX);
      }
    };
    const onUp = (e: MouseEvent) => {
      if (draggingRef.current) {
        pendingSeekXRef.current = null;
        cancelAnimationFrame(seekRafRef.current);
        seekRafRef.current = 0;
        const moved =
          dragMovedRef.current ||
          Math.abs(e.clientX - dragStartXRef.current) >= 0.5;
        if (moved) {
          lastScrubSeekRef.current = performance.now();
          seekFromEvent(e.clientX);
        }
      }
      draggingRef.current = false;
      dragMovedRef.current = false;
      if (trimDragRef.current) {
        trimDragRef.current = null;
        trimHoverRef.current = null;
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      pendingSeekXRef.current = null;
      cancelAnimationFrame(seekRafRef.current);
      seekRafRef.current = 0;
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
      {bookmarkTip && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-md border border-amber-300/30 bg-ink-900/95 px-2 py-1 text-[11px] text-slate-200 shadow-xl"
          style={{
            left: Math.min(
              sizeRef.current.width - 70,
              Math.max(70, bookmarkTip.x),
            ),
            top: 39,
          }}
        >
          <span className="font-medium text-amber-300">
            {bookmarkTip.label || "Bookmark"}
          </span>{" "}
          <span className="font-mono text-slate-500">
            {formatTimestamp(bookmarkTip.timeMs)}
          </span>
        </div>
      )}
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

      <div className="pointer-events-none absolute right-2 top-1.5 select-none rounded bg-ink-900/70 px-2 py-0.5 text-[10px] text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
        waveform {sensitivity.toFixed(1)}× · scroll to adjust
      </div>

      {!!bookmarks?.length && (
        <div className="absolute bottom-1.5 left-2 z-10 flex items-center gap-0.5 rounded-md border border-white/10 bg-ink-900/85 p-0.5 text-[10px] shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={onPreviousBookmark}
            disabled={!onPreviousBookmark}
            className="rounded px-1.5 py-1 text-amber-300 hover:bg-white/10 disabled:opacity-40"
            title="Previous bookmark (Page Up)"
          >
            ‹ ⚑
          </button>
          <button
            type="button"
            onClick={onNextBookmark}
            disabled={!onNextBookmark}
            className="rounded px-1.5 py-1 text-amber-300 hover:bg-white/10 disabled:opacity-40"
            title="Next bookmark (Page Down)"
          >
            ⚑ ›
          </button>
          {onToggleLoop && (
            <button
              type="button"
              onClick={onToggleLoop}
              disabled={bookmarks.length < 2}
              className={`rounded px-1.5 py-1 font-medium transition disabled:opacity-40 ${
                loopEnabled
                  ? "bg-teal-400 text-ink-900"
                  : "text-slate-300 hover:bg-white/10"
              }`}
              title={
                loopRange
                  ? `${loopEnabled ? "Disable" : "Enable"} bookmark loop (${formatTimestamp(
                      loopRange.startMs,
                    )}–${formatTimestamp(loopRange.endMs)})`
                  : "Loop between the bookmarks around the playhead"
              }
            >
              ↻ Loop
            </button>
          )}
          {loopRange && onClearLoop && (
            <button
              type="button"
              onClick={onClearLoop}
              className="rounded px-1 py-1 text-slate-500 hover:bg-white/10 hover:text-slate-200"
              title="Clear loop range"
            >
              ✕
            </button>
          )}
        </div>
      )}

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
              top: Math.min(menu.y, window.innerHeight - 292),
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
            {((menu.bookmark === null && onAddBookmark) ||
              (menu.bookmark !== null && onRenameBookmark)) && (
                <div className="border-t border-white/10 px-2 py-2">
                  <label className="mb-1 block text-[10px] text-slate-500">
                    {menu.bookmark === null
                      ? "Bookmark name (optional)"
                      : "Bookmark name"}
                  </label>
                  <div className="flex gap-1">
                    <input
                      autoFocus
                      value={bookmarkDraft}
                      maxLength={80}
                      onChange={(e) => setBookmarkDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        if (menu.bookmark === null) {
                          onAddBookmark?.(menu.ms, bookmarkDraft);
                        } else {
                          onRenameBookmark?.(menu.bookmark, bookmarkDraft);
                        }
                        setMenu(null);
                      }}
                      placeholder="e.g. chorus"
                      className="min-w-0 flex-1 rounded border border-ink-500 bg-ink-700 px-2 py-1 text-xs text-slate-100 outline-none focus:border-accent/70"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (menu.bookmark === null) {
                          onAddBookmark?.(menu.ms, bookmarkDraft);
                        } else {
                          onRenameBookmark?.(menu.bookmark, bookmarkDraft);
                        }
                        setMenu(null);
                      }}
                      className="rounded bg-accent px-2 text-[10px] font-medium text-ink-900"
                    >
                      {menu.bookmark === null ? "Add" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            {menu.bookmark !== null && (
              <>
                {onSetLoopStart && (
                  <MenuItem
                    onClick={() => {
                      onSetLoopStart(menu.bookmark!);
                      setMenu(null);
                    }}
                  >
                    <span className="text-teal-300">[</span> Use as loop start
                  </MenuItem>
                )}
                {onSetLoopEnd && (
                  <MenuItem
                    onClick={() => {
                      onSetLoopEnd(menu.bookmark!);
                      setMenu(null);
                    }}
                  >
                    <span className="text-teal-300">]</span> Use as loop end
                  </MenuItem>
                )}
                {onRemoveBookmark && (
                  <MenuItem
                    onClick={() => {
                      onRemoveBookmark(menu.bookmark!);
                      setMenu(null);
                    }}
                  >
                    <span className="text-indigo-300">⚑</span> Remove bookmark
                  </MenuItem>
                )}
              </>
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

function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${m}:${s.toString().padStart(2, "0")}.${millis
    .toString()
    .padStart(3, "0")}`;
}
