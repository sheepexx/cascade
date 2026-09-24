import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MOTION } from "../lib/motion";
import { msdSkillsetLabel } from "../lib/msd/display";
import {
  SKILLSET_GRAPH_KEYS,
  type SkillsetGraphKey,
  type SkillsetPoint,
} from "../lib/msd/minacalc";
import { ChevronDownIcon } from "./ui/Icons";

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

/** The header row stays visible when the graph is minimised. */
const HEADER_HEIGHT = 18;
const BARS_HEIGHT = 30;
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
}: Omit<Props, "open">) {
  const barsRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ index: number; x: number } | null>(null);

  useEffect(() => {
    const el = barsRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  const indexAt = (clientX: number): number => {
    const rect = barsRef.current?.getBoundingClientRect();
    if (!rect || !points?.length || duration <= 0) return -1;
    const sec = ((clientX - rect.left) / rect.width) * (duration / 1000);
    return points.findIndex((point) => sec >= point.startSec && sec < point.endSec);
  };

  const hovered = hover && points ? points[hover.index] : null;
  const toggleLabel = collapsed ? "Show the skillset graph" : "Minimise the skillset graph";

  return (
    <div className="w-full select-none border-t border-ink-600 bg-ink-900">
      <div
        className="flex items-center gap-2.5 overflow-hidden whitespace-nowrap pl-1.5 pr-2 text-[10px] text-slate-400"
        style={{ height: HEADER_HEIGHT }}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="flex items-center gap-1 rounded px-1 py-px font-semibold uppercase tracking-wide text-slate-500 transition duration-[var(--motion-quick)] hover:bg-white/10 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <ChevronDownIcon
            className={`h-3 w-3 transition-transform duration-[var(--motion-enter)] ease-[var(--ease-emphasized)] motion-reduce:transition-none ${
              collapsed ? "rotate-180" : ""
            }`}
          />
          Skillsets
        </button>
        {!supported ? (
          <span className="text-slate-500">Rates 4K, 6K and 7K maps</span>
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
            {!points && <span className="text-slate-500">Rating…</span>}
          </>
        )}
      </div>
      <div
        ref={barsRef}
        className="relative w-full"
        style={{ height: BARS_HEIGHT }}
        onMouseMove={(e) => {
          if (collapsed || !supported) return;
          const index = indexAt(e.clientX);
          const rect = barsRef.current!.getBoundingClientRect();
          setHover(index >= 0 ? { index, x: e.clientX - rect.left } : null);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const index = indexAt(e.clientX);
          if (index >= 0 && points) onSeek(points[index].startSec * 1000);
        }}
        role="img"
        aria-label="Skillset difficulty across the song"
      >
        {supported && (
          <svg width={width} height={BARS_HEIGHT} className="block cursor-pointer">
            {bars.map((bar) => (
              <rect
                key={bar.index}
                x={bar.x + GAP_PX / 2}
                y={BARS_HEIGHT - bar.h}
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
      {hovered &&
        hover &&
        barsRef.current &&
        createPortal(
          // The timeline panel clips its children, so the tooltip lives on the
          // page and is placed just above the strip.
          <div
            className="pointer-events-none fixed z-50 w-44 -translate-x-1/2 -translate-y-full rounded-lg border border-ink-500/70 bg-ink-900/95 px-2.5 py-1.5 text-[11px] shadow-xl"
            style={{
              left:
                barsRef.current.getBoundingClientRect().left +
                Math.min(Math.max(90, hover.x), width - 90),
              top: barsRef.current.getBoundingClientRect().top - HEADER_HEIGHT - 6,
            }}
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
          </div>,
          document.body,
        )}
    </div>
  );
}
