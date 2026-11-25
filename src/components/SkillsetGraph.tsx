import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useT } from "../lib/i18n";
import { MOTION } from "../lib/motion";
import { msdSkillsetLabel } from "../lib/msd/display";
import {
  SKILLSET_GRAPH_KEYS,
  type SkillsetGraphKey,
  type SkillsetPoint,
} from "../lib/msd/minacalc";
import { ChevronDownIcon } from "./ui/Icons";
import type { DockEdge } from "../lib/editorDock";
import {
  SKILLSET_BARS_HEIGHT,
  SKILLSET_HEADER_HEIGHT,
  SKILLSET_VERTICAL_WIDTH,
} from "../lib/skillsetGraphSize";

/**
 * One colour per skillset, always in this order, so a skillset keeps its colour
 * whichever ones a song happens to contain. The six steps pass the categorical
 * palette checks (lightness band, chroma, colourblind separation, contrast) on
 * the timeline's dark surface; the legend and tooltip name them too, so colour
 * is never the only cue.
 */
const SKILLSET_COLOURS: Record<SkillsetGraphKey, string> = {
  stream: "#3987e5",
  jumpstream: "#d95926",
  handstream: "#199e70",
  jackspeed: "#c98500",
  chordjack: "#d55181",
  technical: "#008300",
};

const HEADER_HEIGHT = SKILLSET_HEADER_HEIGHT;
const BARS_HEIGHT = SKILLSET_BARS_HEIGHT;
const GAP_PX = 2;

type Props = {
  /** False plays the exit sweep, then the strip unmounts. */
  open: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  points: SkillsetPoint[] | null;
  /** Song length in ms, the same span the bottom timeline draws. */
  duration: number;
  keyCount: number;
  supported: boolean;
  onSeek: (ms: number) => void;
  /** Placed by the editor's panel layout, which sizes and animates it. */
  docked?: boolean;
  /**
   * The editor edge it sits on. Bars always grow toward the playfield; on the
   * left and right edges time runs with the playfield.
   */
  edge?: DockEdge;
  /** The playfield scrolls up, so later times sit lower. */
  upscroll?: boolean;
};

function dominant(point: SkillsetPoint): SkillsetGraphKey {
  let best: SkillsetGraphKey = SKILLSET_GRAPH_KEYS[0];
  for (const key of SKILLSET_GRAPH_KEYS) {
    if (point.values[key] > point.values[best]) best = key;
  }
  return best;
}

const formatTime = (sec: number): string => {
  const whole = Math.max(0, Math.floor(sec));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/**
 * Sweeps up out of the top of the bottom timeline when switched on and back
 * down when switched off, on the editor's shared motion timings. Minimising
 * folds it to its header row the same way.
 */
export function SkillsetGraph({ open, ...props }: Props) {
  if (props.docked) return <SkillsetStrip {...props} />;
  return <SweepingSkillsetGraph open={open} {...props} />;
}

function SweepingSkillsetGraph({ open, ...props }: Props) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // One frame at zero height gives the sweep somewhere to start from.
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), MOTION.exit);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!mounted) return null;
  const height = !shown
    ? 0
    : props.collapsed
      ? HEADER_HEIGHT
      : HEADER_HEIGHT + BARS_HEIGHT;
  return (
    <div
      className="overflow-hidden motion-reduce:!transition-none"
      style={{
        height,
        transition:
          shown || !open
            ? open
              ? "height var(--motion-enter) var(--ease-emphasized)"
              : "height var(--motion-exit) cubic-bezier(0.55, 0, 1, 0.45)"
            : "none",
      }}
    >
      <SkillsetStrip {...props} />
    </div>
  );
}

function SkillsetStrip({
  collapsed,
  onToggleCollapsed,
  points,
  duration,
  keyCount,
  supported,
  onSeek,
  docked = false,
  edge = "bottom",
  upscroll = false,
}: Omit<Props, "open">) {
  const vertical = edge === "left" || edge === "right";
  const t = useT();
  const barsRef = useRef<HTMLDivElement | null>(null);
  // Along the time axis: the strip's width, or its height when vertical.
  const [width, setWidth] = useState(0);
  // Across it, for vertical bars anchored to the outer side.
  const [cross, setCross] = useState<number>(SKILLSET_VERTICAL_WIDTH.open);
  const [hover, setHover] = useState<{ index: number; x: number } | null>(null);

  useEffect(() => {
    const el = barsRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(vertical ? entry.contentRect.height : entry.contentRect.width);
      if (vertical) setCross(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [vertical, collapsed]);

  useEffect(() => {
    if (collapsed) setHover(null);
  }, [collapsed]);

  const bars = useMemo(() => {
    if (!points?.length || duration <= 0 || width <= 0) return [];
    const peak = Math.max(10, ...points.map((point) => point.values[dominant(point)]));
    const scale = width / (duration / 1000);
    return points
      .map((point, index) => {
        const key = dominant(point);
        const x = point.startSec * scale;
        const w = Math.max(
          1,
          Math.min(width - x, (point.endSec - point.startSec) * scale) - GAP_PX,
        );
        const h = Math.max(2, (point.values[key] / peak) * (BARS_HEIGHT - 4));
        return { key, x, w, h, index };
      })
      // Charts can run past the end of the loaded audio; the timeline stops there too.
      .filter((bar) => bar.x < width);
  }, [points, duration, width]);

  const present = useMemo(
    () => SKILLSET_GRAPH_KEYS.filter((key) => bars.some((bar) => bar.key === key)),
    [bars],
  );

  /** How far along the time axis the pointer is, in px from the start. */
  const alongAt = (clientX: number, clientY: number): number => {
    const rect = barsRef.current?.getBoundingClientRect();
    if (!rect) return -1;
    if (!vertical) return clientX - rect.left;
    return upscroll ? clientY - rect.top : rect.bottom - clientY;
  };

  const indexAt = (clientX: number, clientY: number): number => {
    const rect = barsRef.current?.getBoundingClientRect();
    if (!rect || !points?.length || duration <= 0) return -1;
    const span = vertical ? rect.height : rect.width;
    const sec = (alongAt(clientX, clientY) / span) * (duration / 1000);
    return points.findIndex((point) => sec >= point.startSec && sec < point.endSec);
  };

  const hovered = hover && points ? points[hover.index] : null;
  const toggleLabel = collapsed ? t("skillsets.show") : t("skillsets.hide");

  const tooltip =
    hovered &&
    hover &&
    barsRef.current &&
    createPortal(
      // Panels clip their children, so the tooltip lives on the page.
      (() => {
        const rect = barsRef.current!.getBoundingClientRect();
        const style: CSSProperties = vertical
          ? {
              left: rect.right + 196 > window.innerWidth ? rect.left - 184 : rect.right + 8,
              top: Math.min(
                window.innerHeight - 150,
                Math.max(8, upscroll ? rect.top + hover.x - 40 : rect.bottom - hover.x - 40),
              ),
            }
          : {
              left: rect.left + Math.min(Math.max(90, hover.x), width - 90),
              top: edge === "top" ? rect.bottom + HEADER_HEIGHT + 6 : rect.top - HEADER_HEIGHT - 6,
            };
        return (
          <div
            className={`pointer-events-none fixed z-50 w-44 rounded-lg border border-ink-500/70 bg-ink-900/95 px-2.5 py-1.5 text-[11px] shadow-xl ${
              vertical ? "" : edge === "top" ? "-translate-x-1/2" : "-translate-x-1/2 -translate-y-full"
            }`}
            style={style}
          >
            <div className="mb-1 font-mono text-slate-400">
              {formatTime(hovered.startSec)} – {formatTime(hovered.endSec)}
            </div>
            {[...SKILLSET_GRAPH_KEYS]
              .sort((a, b) => hovered.values[b] - hovered.values[a])
              .map((key) => (
                <div key={key} className="flex items-center gap-1.5 text-slate-300">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ background: SKILLSET_COLOURS[key] }}
                  />
                  <span className="flex-1">{msdSkillsetLabel(key, keyCount)}</span>
                  <span className="font-mono text-slate-200">
                    {hovered.values[key].toFixed(1)}
                  </span>
                </div>
              ))}
          </div>
        );
      })(),
      document.body,
    );

  if (vertical) {
    return (
      <div className="flex h-full w-full select-none flex-col items-stretch bg-ink-900">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          title={`${t("skillsets.title")} · ${toggleLabel}`}
          className={`flex shrink-0 items-center justify-center gap-1.5 text-[10px] font-medium text-slate-400 transition duration-[var(--motion-quick)] hover:bg-white/[0.07] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${
            collapsed ? "flex-1 flex-col py-2" : "h-[18px]"
          }`}
        >
          <ChevronDownIcon
            className={`h-3 w-3 transition-transform duration-[var(--motion-enter)] ease-[var(--ease-emphasized)] motion-reduce:transition-none ${
              collapsed ? "rotate-90" : "-rotate-90"
            }`}
          />
          {collapsed && <span className="[writing-mode:vertical-rl]">{t("skillsets.title")}</span>}
        </button>
        {!collapsed && (
          <div
            ref={barsRef}
            className="relative min-h-0 w-full flex-1"
            onMouseMove={(e) => {
              if (!supported) return;
              const index = indexAt(e.clientX, e.clientY);
              setHover(index >= 0 ? { index, x: alongAt(e.clientX, e.clientY) } : null);
            }}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => {
              const index = indexAt(e.clientX, e.clientY);
              if (index >= 0 && points) onSeek(points[index].startSec * 1000);
            }}
            role="img"
            aria-label={t("skillsets.graphLabel")}
          >
            {supported && (
              <svg width="100%" height={width} className="block cursor-pointer">
                {bars.map((bar) => {
                  // From the outer side toward the playfield.
                  const length = (bar.h / (BARS_HEIGHT - 4)) * (Math.min(cross, SKILLSET_VERTICAL_WIDTH.open) - 10);
                  return (
                  <rect
                    key={bar.index}
                    x={edge === "right" ? cross - 4 - length : 4}
                    y={upscroll ? bar.x + GAP_PX / 2 : width - bar.x - bar.w - GAP_PX / 2}
                    width={length}
                    height={bar.w}
                    rx={Math.min(2, bar.w / 2)}
                    fill={SKILLSET_COLOURS[bar.key]}
                    opacity={hover && hover.index !== bar.index ? 0.55 : 0.9}
                  />
                  );
                })}
              </svg>
            )}
          </div>
        )}
        {tooltip}
      </div>
    );
  }

  return (
    <div className={`flex w-full select-none bg-ink-900 ${edge === "top" ? "flex-col-reverse" : "flex-col"} ${docked ? "h-full" : "border-t border-ink-600"}`}>
      <div
        className="flex shrink-0 items-center gap-2.5 overflow-hidden whitespace-nowrap pl-1.5 pr-2 text-[10px] text-slate-400"
        style={{ height: HEADER_HEIGHT }}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="flex items-center gap-1 rounded px-1 py-px font-medium text-slate-400 transition duration-[var(--motion-quick)] hover:bg-white/[0.07] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <ChevronDownIcon
            className={`h-3 w-3 transition-transform duration-[var(--motion-enter)] ease-[var(--ease-emphasized)] motion-reduce:transition-none ${
              collapsed ? "rotate-180" : ""
            }`}
          />
          {t("skillsets.title")}
        </button>
        {!supported ? (
          <span className="text-slate-500">{t("skillsets.unsupported")}</span>
        ) : (
          <>
            {present.map((key) => (
              <span
                key={key}
                className={`flex items-center gap-1 transition-opacity duration-[var(--motion-quick)] ${
                  collapsed ? "opacity-0" : "opacity-100"
                }`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: SKILLSET_COLOURS[key] }}
                />
                {msdSkillsetLabel(key, keyCount)}
              </span>
            ))}
            {!points && <span className="text-slate-500">{t("skillsets.rating")}</span>}
          </>
        )}
      </div>
      <div
        ref={barsRef}
        className="relative w-full shrink-0"
        style={{ height: BARS_HEIGHT }}
        onMouseMove={(e) => {
          if (collapsed || !supported) return;
          const index = indexAt(e.clientX, e.clientY);
          setHover(index >= 0 ? { index, x: alongAt(e.clientX, e.clientY) } : null);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const index = indexAt(e.clientX, e.clientY);
          if (index >= 0 && points) onSeek(points[index].startSec * 1000);
        }}
        role="img"
        aria-label={t("skillsets.graphLabel")}
      >
        {supported && (
          <svg width={width} height={BARS_HEIGHT} className="block cursor-pointer">
            {bars.map((bar) => (
              <rect
                key={bar.index}
                x={bar.x + GAP_PX / 2}
                y={edge === "top" ? 0 : BARS_HEIGHT - bar.h}
                width={bar.w}
                height={bar.h}
                rx={Math.min(2, bar.w / 2)}
                fill={SKILLSET_COLOURS[bar.key]}
                opacity={hover && hover.index !== bar.index ? 0.55 : 0.9}
              />
            ))}
          </svg>
        )}
      </div>
      {tooltip}
    </div>
  );
}
