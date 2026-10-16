import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ManiaNote, MapOverviewLayout, TimingPoint } from "../types";
import type { AudioSeekTransition } from "../lib/audioSeek";
import {
  subscribeEditorViewport,
  type EditorViewportChannel,
} from "../lib/editorViewport";
import {
  OVERVIEW_EDGE,
  OVERVIEW_LABEL_H,
  OVERVIEW_MAX_ZOOM,
  OVERVIEW_MIN_HEIGHT,
  OVERVIEW_MIN_WIDTH,
  OVERVIEW_ZOOM_STEP,
  clampOverviewZoom,
  defaultOverviewRect,
  overviewBarLines,
  overviewBars,
  overviewColumns,
  overviewGrid,
  overviewSpan,
  overviewTimeAt,
  paintOverviewRaster,
  placeOverviewRect,
  rasterizeOverview,
  storeOverviewRect,
  stripLeft,
  stripOf,
  stripRows,
  stripStart,
  stripY,
  visibleStrips,
  type OverviewGrid,
  type OverviewRaster,
  type PanelBox,
} from "../lib/mapOverview";
import { notesByTime } from "../lib/notesMemo";
import { defaultLaneColour, type LaneColourScheme } from "../lib/laneColours";
import { noteSnapColour, noteSnapDivisor, redPoints, snapTime } from "../lib/timing";
import {
  timelineDragStarted,
  timelineSeekTransition,
  type TimelineSeekPhase,
} from "../lib/timelineInput";
import { renderScale, usePerformanceMode } from "../lib/performanceMode";
import { formatOsuClock } from "../lib/osuTimestamp";
import { useT } from "../lib/i18n";
import { SegmentedControl } from "./ui/Controls";
import { CloseIcon } from "./ui/Icons";

type Props = {
  notes: ManiaNote[];
  keyCount: number;
  timingPoints: TimingPoint[];
  /** Length of the song in map time; 0 before the audio has loaded. */
  durationMs: number;
  upscroll: boolean;
  snapDivisor: number;
  snapColours: boolean;
  laneColourScheme: LaneColourScheme;
  selectedIds?: ReadonlySet<string> | null;
  viewport: EditorViewportChannel;
  /** Used until the playfield has drawn a frame. */
  getCurrentTime: () => number;
  playfieldBoundsRef?: { readonly current: { left: number; width: number } | null };
  layout: MapOverviewLayout;
  onLayout: (patch: Partial<MapOverviewLayout>) => void;
  onSeek: (ms: number, transition?: AudioSeekTransition) => void;
  onClose: () => void;
};

/**
 * A note head covers this much map time, between a device pixel and 4 CSS
 * pixels: squeezed to fit a long map, heads shrink with it instead of merging
 * every stream into a solid bar.
 */
const HEAD_MS = 50;
const MAX_HEAD_PX = 4;
/** Bar lines closer than this are thinned to every 2nd, 4th… bar. */
const BAR_GAP_PX = 5;
/** How close the playhead's strip may come to an edge before the view pages. */
const FOLLOW_EDGE_PX = 4;
/** After paging, the playhead's strip sits this far in from the left. */
const FOLLOW_LEFT_SHARE = 0.25;
/** The playfield's selection colour, so selected notes match in both views. */
const SELECTED_COLOUR = "rgb(255,214,102)";
const LABEL_COLOUR = "rgb(131,130,154)";
const LABEL_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
/** Wide enough for the title and every control on one row. */
const WIDE_HEADER_REM = 18.25;

type Size = { width: number; height: number };
type ViewSize = Size & { dpr: number };
type Edges = { left?: boolean; right?: boolean; bottom?: boolean };
type Gesture = {
  pointerId: number;
  edges: Edges | null;
  startX: number;
  startY: number;
  start: PanelBox;
};
type Scrub = {
  pointerId: number;
  /** Grabbing the highlighted range moves the playfield by the pointer's travel. */
  grab: boolean;
  offset: number;
  startX: number;
  startY: number;
  moved: boolean;
};

const RESIZE_HANDLES: { edges: Edges; className: string }[] = [
  { edges: { left: true }, className: "-left-1 top-3 bottom-3 w-2 cursor-ew-resize" },
  { edges: { right: true }, className: "-right-1 top-3 bottom-3 w-2 cursor-ew-resize" },
  { edges: { bottom: true }, className: "-bottom-1 left-3 right-3 h-2 cursor-ns-resize" },
  { edges: { left: true, bottom: true }, className: "-bottom-1 -left-1 h-3 w-3 cursor-nesw-resize" },
  { edges: { right: true, bottom: true }, className: "-bottom-1 -right-1 h-3 w-3 cursor-nwse-resize" },
];

/** m:ss for a strip's start, never below zero. */
function stripClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The whole chart in strips side by side, floating over the editor. Notes
 * keep their columns, holds their length and bars their lines, so patterns stay
 * recognisable; clicking or dragging moves the playfield there.
 *
 * Two canvases: notes, redrawn only when the chart, the panel or the scroll
 * position changes, and an overlay with the playhead and the playfield's
 * range, redrawn as the playfield draws.
 */
export function MapOverview(props: Props) {
  const { layout, onLayout } = props;
  const t = useT();
  const lowSpec = usePerformanceMode();
  const propsRef = useRef(props);
  propsRef.current = props;

  const areaRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const notesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoverLabelRef = useRef<HTMLDivElement | null>(null);

  const [area, setArea] = useState<(Size & { rem: number }) | null>(null);
  const [view, setView] = useState<ViewSize>({ width: 0, height: 0, dpr: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  // The panel's box while it is being moved or resized; saved on release.
  const [live, setLive] = useState<PanelBox | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;
  const gestureRef = useRef<Gesture | null>(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      // The interface scale changes the root font size, and with it the
      // editor area, so this is the moment to read it.
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setArea((prev) =>
        prev && prev.width === width && prev.height === height && prev.rem === rem
          ? prev
          : { width, height, rem },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const placed = useMemo(() => {
    if (!area || area.width <= 0 || area.height <= 0) return null;
    let rect = layout.rect;
    if (!rect) {
      const bounds = props.playfieldBoundsRef?.current;
      rect = defaultOverviewRect(area, bounds ? bounds.left + bounds.width : null);
    }
    return placeOverviewRect(rect, area);
  }, [area, layout.rect, props.playfieldBoundsRef]);
  const box = live ?? placed;
  const hasBox = box !== null;

  const index = useMemo(() => notesByTime(props.notes), [props.notes]);
  const indexRef = useRef(index);
  indexRef.current = index;
  const span = useMemo(() => overviewSpan(index, props.durationMs), [index, props.durationMs]);
  const bars = useMemo(() => overviewBars(props.timingPoints), [props.timingPoints]);
  const grid = useMemo(
    () =>
      overviewGrid(
        span,
        bars,
        view,
        props.keyCount,
        { mode: layout.mode, zoom: layout.zoom },
        props.upscroll,
      ),
    [span, bars, view, props.keyCount, layout.mode, layout.zoom, props.upscroll],
  );
  const gridRef = useRef<OverviewGrid>(grid);
  gridRef.current = grid;
  const scrolling = layout.mode === "scroll";

  const rasterRef = useRef<OverviewRaster | null>(null);
  const rasterLeftRef = useRef(0);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const placeHoverLabelRef = useRef<(point: { x: number; y: number } | null) => void>(() => {});
  const scrubRef = useRef<Scrub | null>(null);
  const followRef = useRef(true);
  /** The strip last clicked or scrubbed in, until the playhead leaves it. */
  const pinRef = useRef<{ strip: number; at: number; reached: boolean } | null>(null);
  const expectedScrollRef = useRef<number | null>(null);
  const anchorRef = useRef<{ time: number; viewX: number } | null>(null);
  const accentRef = useRef("#e86868");

  useEffect(() => {
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim();
    if (accent) accentRef.current = accent;
  }, []);

  const scrollLeft = useCallback(() => {
    const scroller = scrollerRef.current;
    return scroller && propsRef.current.layout.mode === "scroll" ? scroller.scrollLeft : 0;
  }, []);

  const drawNotes = useCallback(() => {
    const canvas = notesCanvasRef.current;
    if (!canvas) return;
    const { width, height, dpr } = viewRef.current;
    const bw = Math.max(1, Math.round(width * dpr));
    const bh = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    const p = propsRef.current;
    const grid = gridRef.current;
    const keyCount = grid.keys;
    if (!(width > 0 && height > 0)) return;
    const left = scrollLeft();
    rasterLeftRef.current = left;

    const palette: string[] = [];
    const slots = new Map<string, number>();
    const slotFor = (colour: string) => {
      let slot = slots.get(colour);
      if (slot === undefined) {
        slot = palette.length;
        palette.push(colour);
        slots.set(colour, slot);
      }
      return slot;
    };
    const laneSlots = Array.from({ length: keyCount }, (_, c) =>
      slotFor(defaultLaneColour(c, keyCount, p.laneColourScheme)),
    );
    const selected = p.selectedIds?.size ? p.selectedIds : null;
    const selectedSlot = selected ? slotFor(SELECTED_COLOUR) : 0;
    const slotOf = (note: ManiaNote) => {
      if (selected?.has(note.id)) return selectedSlot;
      if (p.snapColours) {
        return slotFor(noteSnapColour(noteSnapDivisor(note.startTime, p.timingPoints)));
      }
      return laneSlots[note.column] ?? 0;
    };
    const headRows = Math.max(1, Math.min(MAX_HEAD_PX, grid.pxPerMs * HEAD_MS) * dpr);
    const chartTop = Math.round(grid.chartTop * dpr);
    const chartBottom = Math.round(grid.chartBottom * dpr);
    const labelY = grid.upscroll
      ? (grid.chartTop - OVERVIEW_LABEL_H / 2 - 3) * dpr
      : (grid.chartBottom + OVERVIEW_LABEL_H / 2 + 3) * dpr;
    ctx.font = `${Math.round(9 * dpr)}px ${LABEL_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let labelEdge = -Infinity;

    const [first, last] = visibleStrips(grid, left, width);
    for (let strip = first; strip <= last; strip++) {
      const x0 = Math.round((stripLeft(grid, strip) - left) * dpr);
      const x1 = Math.round((stripLeft(grid, strip) + grid.stripWidth - left) * dpr);
      const lanes = overviewColumns(x0, x1 - x0, keyCount, dpr);
      // Alternate lane shading; with the gaps between lanes it separates columns.
      for (let c = 0; c < lanes.length; c++) {
        ctx.fillStyle = c % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.025)";
        ctx.fillRect(lanes[c].x, chartTop, lanes[c].width, chartBottom - chartTop);
      }
      const from = stripStart(grid, strip);
      const to = from + grid.stripMs;
      ctx.fillStyle = "rgba(255,255,255,0.11)";
      for (const time of overviewBarLines(p.timingPoints, from, to, grid.pxPerMs, BAR_GAP_PX)) {
        const y = Math.round(stripY(grid, strip, time) * dpr);
        if (y >= chartTop - 1 && y <= chartBottom) ctx.fillRect(x0, y, x1 - x0, 1);
      }
      const raster = rasterizeOverview(
        indexRef.current,
        keyCount,
        from,
        to,
        stripRows(grid, strip, dpr),
        bh,
        headRows,
        slotOf,
        rasterRef.current,
      );
      rasterRef.current = raster;
      paintOverviewRaster(ctx, raster, lanes, palette);

      // Each strip's start time, skipping any that would run into the last one.
      const label = stripClock(Math.max(from, grid.span.start));
      const labelW = ctx.measureText(label).width;
      const mid = (x0 + x1) / 2;
      if (mid - labelW / 2 >= labelEdge + 4 * dpr) {
        ctx.fillStyle = LABEL_COLOUR;
        ctx.fillText(label, mid, labelY);
        labelEdge = mid + labelW / 2;
      }
    }
  }, [scrollLeft]);

  /**
   * In scrollable mode, pages the view when the playhead's strip leaves it,
   * unless the mapper scrolled away to look at something else.
   */
  const follow = useCallback(
    (time: number) => {
      const scroller = scrollerRef.current;
      if (!scroller || propsRef.current.layout.mode !== "scroll" || scrubRef.current) {
        return;
      }
      const grid = gridRef.current;
      const viewW = viewRef.current.width;
      const left = scroller.scrollLeft;
      const strip = stripOf(grid, time);
      // A strip the mapper just clicked stays put even when it is cut off at
      // the edge: the view must not slide away under the pointer. That holds
      // through the seek's glide and lasts until the playhead moves on.
      const pin = pinRef.current;
      if (pin) {
        if (strip === pin.strip) pin.reached = true;
        if ((pin.reached && strip !== pin.strip) || (!pin.reached && performance.now() - pin.at > 1000)) {
          pinRef.current = null;
        }
      }
      const x0 = stripLeft(grid, strip);
      const x1 = x0 + grid.stripWidth;
      if (x0 >= left + FOLLOW_EDGE_PX && x1 <= left + viewW - FOLLOW_EDGE_PX) {
        followRef.current = true;
        return;
      }
      if (pinRef.current) return;
      if (!followRef.current) return;
      const maxLeft = Math.max(0, grid.contentWidth - viewW);
      const next = Math.max(0, Math.min(maxLeft, Math.round(x0 - viewW * FOLLOW_LEFT_SHARE)));
      if (Math.abs(next - left) < 0.5) return;
      expectedScrollRef.current = next;
      scroller.scrollLeft = next;
      drawNotes();
    },
    [drawNotes],
  );

  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const { width, height, dpr } = viewRef.current;
    const bw = Math.max(1, Math.round(width * dpr));
    const bh = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    if (!(width > 0 && height > 0)) return;
    const p = propsRef.current;
    const vp = p.viewport.current;
    const time = vp ? vp.time : p.getCurrentTime();
    if (!Number.isFinite(time)) return;
    follow(time);
    const grid = gridRef.current;
    const left = scrollLeft();
    // Lines land on whole device pixels so they stay sharp at any zoom.
    const hair = Math.max(1, Math.round(dpr));
    const stripBox = (strip: number, overhang = 0) => {
      const x0 = Math.round((stripLeft(grid, strip) - left - overhang) * dpr);
      const x1 = Math.round((stripLeft(grid, strip) + grid.stripWidth - left + overhang) * dpr);
      return [x0, x1 - x0] as const;
    };

    // The playfield's range, cut where it crosses from one strip to the next.
    if (vp && vp.to > vp.from) {
      const a = stripOf(grid, vp.from);
      const b = stripOf(grid, vp.to);
      for (let strip = a; strip <= b && strip - a < 8; strip++) {
        const s0 = Math.max(vp.from, stripStart(grid, strip));
        const s1 = Math.min(vp.to, stripStart(grid, strip) + grid.stripMs);
        const ya = stripY(grid, strip, s0);
        const yb = stripY(grid, strip, s1);
        let y0 = Math.min(ya, yb);
        let y1 = Math.max(ya, yb);
        // Fitted to a long map the range can be under a pixel.
        if (y1 - y0 < 3 && a === b) {
          const mid = (y0 + y1) / 2;
          y0 = mid - 1.5;
          y1 = mid + 1.5;
        }
        const [x, w] = stripBox(strip, 1);
        const d0 = Math.round(y0 * dpr);
        const d1 = Math.max(d0 + hair, Math.round(y1 * dpr));
        ctx.fillStyle = "rgba(255,255,255,0.09)";
        ctx.fillRect(x, d0, w, d1 - d0);
        ctx.fillStyle = "rgba(255,255,255,0.32)";
        ctx.fillRect(x, d0, w, hair);
        ctx.fillRect(x, d1 - hair, w, hair);
      }
    }

    const hover = hoverRef.current;
    if (hover && !scrubRef.current) {
      const hoverTime = overviewTimeAt(grid, left + hover.x, hover.y);
      const strip = stripOf(grid, hoverTime);
      const [x, w] = stripBox(strip);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(x, Math.round(stripY(grid, strip, hoverTime) * dpr), w, hair);
    }

    const strip = stripOf(grid, time);
    const [x, w] = stripBox(strip, 2);
    const playY = Math.round(stripY(grid, strip, time) * dpr);
    const thickness = Math.max(2, Math.round(1.5 * dpr));
    ctx.fillStyle = accentRef.current;
    ctx.fillRect(x, playY - Math.floor(thickness / 2), w, thickness);
  }, [follow, scrollLeft]);

  const frameRef = useRef({ raf: 0, notes: false });
  const schedule = useCallback(
    (notes: boolean) => {
      const frame = frameRef.current;
      if (notes) frame.notes = true;
      if (frame.raf) return;
      frame.raf = requestAnimationFrame(() => {
        frame.raf = 0;
        const redrawNotes = frame.notes;
        frame.notes = false;
        if (redrawNotes) drawNotes();
        drawOverlay();
      });
    },
    [drawNotes, drawOverlay],
  );
  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current.raf);
      frameRef.current.raf = 0;
    },
    [],
  );

  // The playfield publishes while it draws; drawing in a microtask keeps both
  // in the same frame, and a fault here can never break the playfield's draw.
  useEffect(() => {
    let queued = false;
    const flush = () => {
      queued = false;
      drawOverlay();
    };
    return subscribeEditorViewport(props.viewport, () => {
      if (queued) return;
      queued = true;
      queueMicrotask(flush);
    });
  }, [props.viewport, drawOverlay]);

  useEffect(() => {
    schedule(true);
  }, [
    schedule,
    index,
    grid,
    props.timingPoints,
    props.snapColours,
    props.laneColourScheme,
    props.selectedIds,
  ]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      const dpr = renderScale();
      setView((prev) =>
        prev.width === width && prev.height === height && prev.dpr === dpr
          ? prev
          : { width, height, dpr },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Moving to a screen with another pixel density changes nothing a
    // ResizeObserver sees.
    let media: MediaQueryList | null = null;
    const onDensity = () => {
      measure();
      watchDensity();
    };
    const watchDensity = () => {
      media?.removeEventListener("change", onDensity);
      media = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`) ?? null;
      media?.addEventListener("change", onDensity);
    };
    watchDensity();
    return () => {
      observer.disconnect();
      media?.removeEventListener("change", onDensity);
    };
  }, [hasBox, lowSpec]);

  // A zoom or a switch to scrolling keeps the time it was anchored on in place.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const scroller = scrollerRef.current;
    if (!anchor || !scroller || grid.height <= 0) return;
    anchorRef.current = null;
    if (layout.mode !== "scroll") return;
    const maxLeft = Math.max(0, grid.contentWidth - viewRef.current.width);
    const x = stripLeft(grid, stripOf(grid, anchor.time)) + grid.stripWidth / 2;
    const next = Math.max(0, Math.min(maxLeft, Math.round(x - anchor.viewX)));
    expectedScrollRef.current = next;
    scroller.scrollLeft = next;
    followRef.current = true;
    schedule(true);
  }, [grid, layout.mode, schedule]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => {
      const expected = expectedScrollRef.current;
      expectedScrollRef.current = null;
      // The mapper scrolled: stop paging after the playfield until the
      // playhead is back in view.
      if (expected === null || Math.abs(scroller.scrollLeft - expected) > 1) {
        followRef.current = false;
      }
      // The strips moved under a still pointer.
      if (hoverRef.current) placeHoverLabelRef.current(hoverRef.current);
      schedule(Math.abs(scroller.scrollLeft - rasterLeftRef.current) > 0.25);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [hasBox, schedule]);

  /** Multiplies the zoom, holding the strip at `anchorX` (view px) in place. */
  const zoomBy = useCallback((factor: number, anchorX?: number, anchorY?: number) => {
    const p = propsRef.current;
    const grid = gridRef.current;
    const viewW = viewRef.current.width;
    if (!(viewW > 0) || !(factor > 0) || factor === 1) return;
    if (factor < 1 && p.layout.mode === "fit") return;
    const left = scrollLeft();
    const playTime = p.viewport.current?.time ?? p.getCurrentTime();
    const fitGrid = overviewGrid(grid.span, overviewBars(p.timingPoints), viewRef.current, grid.keys, { mode: "fit", zoom: 0 }, grid.upscroll);
    const fit = fitGrid.pxPerMs * 1000;
    const current = grid.pxPerMs * 1000;
    let time = playTime;
    let viewX = viewW * FOLLOW_LEFT_SHARE;
    if (anchorX !== undefined && anchorY !== undefined) {
      time = overviewTimeAt(grid, left + anchorX, anchorY);
      viewX = anchorX;
    } else {
      const playX = stripLeft(grid, stripOf(grid, playTime)) - left;
      if (playX >= 0 && playX <= viewW) viewX = playX + grid.stripWidth / 2;
    }
    const next = clampOverviewZoom(current * factor);
    if (factor < 1 && next <= fit * 1.001) {
      // Zoomed out as far as the panel holds the whole map: that is the fit.
      p.onLayout({ mode: "fit" });
      return;
    }
    if (factor > 1 && next <= current + 1e-6) return;
    anchorRef.current = { time, viewX };
    p.onLayout({ mode: "scroll", zoom: next });
  }, [scrollLeft]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      // Alt + wheel keeps its app-wide meaning.
      if (e.altKey) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (!e.deltaY) return;
        // A wheel notch is one step; a trackpad pinch sends many small ones.
        const steps =
          e.deltaMode === 0
            ? Math.max(-2, Math.min(2, -e.deltaY / 100))
            : e.deltaY < 0 ? 1 : -1;
        const rect = scroller.getBoundingClientRect();
        zoomBy(Math.pow(OVERVIEW_ZOOM_STEP, steps), e.clientX - rect.left, e.clientY - rect.top);
        return;
      }
      e.preventDefault();
      if (propsRef.current.layout.mode !== "scroll") return;
      // The strips run sideways, so the wheel moves along them.
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientWidth : 1;
      scroller.scrollLeft += delta * unit;
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [hasBox, zoomBy]);

  const setMode = (mode: MapOverviewLayout["mode"]) => {
    if (mode === layout.mode) return;
    if (mode === "scroll") {
      // Open the scrollable view where the playfield is.
      const p = propsRef.current;
      anchorRef.current = {
        time: p.viewport.current?.time ?? p.getCurrentTime(),
        viewX: viewRef.current.width * FOLLOW_LEFT_SHARE,
      };
    }
    onLayout({ mode });
  };

  const seekRafRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);
  useEffect(() => () => cancelAnimationFrame(seekRafRef.current), []);

  /** Lands where the playfield's own snapping would, on the current divisor. */
  const snapped = useCallback((time: number) => {
    const p = propsRef.current;
    if (!redPoints(p.timingPoints).length) return Math.round(time);
    return snapTime(time, p.timingPoints, p.snapDivisor);
  }, []);

  const seek = useCallback(
    (time: number, phase: TimelineSeekPhase) => {
      if (!Number.isFinite(time)) return;
      const target = snapped(time);
      pinRef.current = { strip: stripOf(gridRef.current, target), at: performance.now(), reached: false };
      propsRef.current.onSeek(target, timelineSeekTransition(phase));
    },
    [snapped],
  );

  const pointerAt = (e: ReactPointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { width, height } = viewRef.current;
    return {
      x: Math.max(0, Math.min(width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(height, e.clientY - rect.top)),
    };
  };

  const timeAt = useCallback(
    (point: { x: number; y: number }) =>
      overviewTimeAt(gridRef.current, scrollLeft() + point.x, point.y),
    [scrollLeft],
  );

  /** The time under the pointer, beside it; kept in step as the view scrolls. */
  const placeHoverLabel = useCallback(
    (point: { x: number; y: number } | null) => {
      const label = hoverLabelRef.current;
      if (!label) return;
      if (!point) {
        label.style.display = "none";
        return;
      }
      label.textContent = formatOsuClock(snapped(timeAt(point)));
      label.style.display = "block";
      const { width, height } = viewRef.current;
      const labelW = label.offsetWidth;
      const x = point.x + 10 + labelW <= width ? point.x + 10 : point.x - 10 - labelW;
      label.style.left = `${Math.max(0, x)}px`;
      label.style.top = `${Math.max(0, Math.min(height - 16, point.y - 8))}px`;
    },
    [snapped, timeAt],
  );
  placeHoverLabelRef.current = placeHoverLabel;

  /** Whether a point is on the playfield's highlighted range. */
  const onRange = (point: { x: number; y: number }) => {
    const vp = propsRef.current.viewport.current;
    if (!vp) return false;
    const slack = 3 / gridRef.current.pxPerMs;
    const time = timeAt(point);
    return time >= vp.from - slack && time <= vp.to + slack;
  };

  const showHover = (point: { x: number; y: number } | null, target?: HTMLElement) => {
    hoverRef.current = point;
    placeHoverLabel(point);
    if (target) target.style.cursor = point && onRange(point) ? "grab" : "";
    schedule(false);
  };

  const onChartPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const scroller = e.currentTarget;
    const rect = scroller.getBoundingClientRect();
    // Leave the scrollbar to the browser.
    if (e.clientY - rect.top >= scroller.clientHeight) return;
    e.preventDefault();
    scroller.setPointerCapture(e.pointerId);
    const point = pointerAt(e);
    const time = timeAt(point);
    const vp = propsRef.current.viewport.current;
    const grab = !!vp && onRange(point);
    scrubRef.current = {
      pointerId: e.pointerId,
      grab,
      offset: grab && vp ? vp.time - time : 0,
      startX: point.x,
      startY: point.y,
      moved: false,
    };
    followRef.current = true;
    showHover(null);
    scroller.style.cursor = grab ? "grabbing" : "";
    if (!grab) seek(time, "press");
  };

  const onChartPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const scrub = scrubRef.current;
    const point = pointerAt(e);
    if (!scrub || scrub.pointerId !== e.pointerId) {
      if (e.pointerType === "mouse") showHover(point, e.currentTarget);
      return;
    }
    if (
      !scrub.moved &&
      !timelineDragStarted(scrub.startX, point.x) &&
      !timelineDragStarted(scrub.startY, point.y)
    ) {
      return;
    }
    scrub.moved = true;
    pendingSeekRef.current = timeAt(point) + scrub.offset;
    if (!seekRafRef.current) {
      seekRafRef.current = requestAnimationFrame(() => {
        seekRafRef.current = 0;
        const target = pendingSeekRef.current;
        pendingSeekRef.current = null;
        if (target !== null) seek(target, "drag");
      });
    }
  };

  const endScrub = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const scrub = scrubRef.current;
    if (!scrub || scrub.pointerId !== e.pointerId) return;
    scrubRef.current = null;
    cancelAnimationFrame(seekRafRef.current);
    seekRafRef.current = 0;
    pendingSeekRef.current = null;
    e.currentTarget.style.cursor = "";
    if (!commit) return;
    const point = pointerAt(e);
    const time = timeAt(point);
    if (scrub.moved) seek(time + scrub.offset, "release");
    // A click inside the range without dragging still goes where it landed.
    else if (scrub.grab) seek(time, "press");
    if (e.pointerType === "mouse") showHover(point, e.currentTarget);
  };

  const startGesture = (e: ReactPointerEvent<HTMLElement>, edges: Edges | null) => {
    if (e.button !== 0 || !box) return;
    if (!edges && (e.target as HTMLElement).closest("button, input, select, textarea, a")) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    gestureRef.current = {
      pointerId: e.pointerId,
      edges,
      startX: e.clientX,
      startY: e.clientY,
      start: box,
    };
    setLive(box);
  };

  const moveGesture = (e: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId || !area) return;
    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    const { start, edges } = gesture;
    const maxRight = area.width - OVERVIEW_EDGE;
    const maxBottom = area.height - OVERVIEW_EDGE;
    let { left, top, width, height } = start;
    if (!edges) {
      left = Math.max(OVERVIEW_EDGE, Math.min(maxRight - width, start.left + dx));
      top = Math.max(OVERVIEW_EDGE, Math.min(maxBottom - height, start.top + dy));
    } else {
      if (edges.left) {
        const right = start.left + start.width;
        left = Math.max(OVERVIEW_EDGE, Math.min(right - OVERVIEW_MIN_WIDTH, start.left + dx));
        width = right - left;
      }
      if (edges.right) {
        width = Math.max(OVERVIEW_MIN_WIDTH, Math.min(maxRight - start.left, start.width + dx));
      }
      if (edges.bottom) {
        height = Math.max(OVERVIEW_MIN_HEIGHT, Math.min(maxBottom - start.top, start.height + dy));
      }
    }
    setLive({ left, top, width, height });
  };

  const endGesture = (e: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    const final = liveRef.current;
    setLive(null);
    const { start } = gesture;
    if (
      final &&
      area &&
      (final.left !== start.left ||
        final.top !== start.top ||
        final.width !== start.width ||
        final.height !== start.height)
    ) {
      onLayout({ rect: storeOverviewRect(final, area.width) });
    }
  };

  const atMaxZoom = scrolling && grid.pxPerMs * 1000 >= OVERVIEW_MAX_ZOOM - 1e-6;
  const iconButton =
    "grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 transition duration-[var(--motion-quick)] hover:bg-white/[0.07] hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400";
  // Narrow, the controls move under the title so the title stays readable.
  const wide = (box?.width ?? 0) >= WIDE_HEADER_REM * (area?.rem ?? 16);
  const controls = (
    <>
      <SegmentedControl
        size="sm"
        className={wide ? "shrink-0" : "min-w-0 flex-1"}
        value={layout.mode}
        onChange={setMode}
        options={[
          { value: "fit", label: <span title={t("overview.fitTitle")}>{t("overview.fit")}</span> },
          { value: "scroll", label: <span title={t("overview.scrollTitle")}>{t("overview.scroll")}</span> },
        ]}
      />
      <button
        type="button"
        className={iconButton}
        disabled={!scrolling}
        onClick={() => zoomBy(1 / OVERVIEW_ZOOM_STEP)}
        title={t("overview.zoomOut")}
        aria-label={t("overview.zoomOut")}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
          <path d="M3.5 8h9" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className={iconButton}
        disabled={atMaxZoom}
        onClick={() => zoomBy(OVERVIEW_ZOOM_STEP)}
        title={t("overview.zoomIn")}
        aria-label={t("overview.zoomIn")}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
          <path d="M3.5 8h9M8 3.5v9" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </svg>
      </button>
    </>
  );

  return (
    <div ref={areaRef} className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {box && (
        <section
          aria-label={t("overview.title")}
          className="map-overview float-chip pointer-events-auto absolute flex select-none flex-col"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        >
          <header
            className="flex h-8 shrink-0 cursor-move items-center gap-1 pl-2.5 pr-1"
            onPointerDown={(e) => startGesture(e, null)}
            onPointerMove={moveGesture}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
          >
            <h2 className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">
              {t("overview.title")}
            </h2>
            {wide && (
              <>
                {controls}
                <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-white/[0.08]" />
              </>
            )}
            <button
              type="button"
              onClick={props.onClose}
              title={t("overview.close")}
              aria-label={t("overview.close")}
              className={iconButton}
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </header>
          {!wide && <div className="flex shrink-0 items-center gap-1 px-1 pb-1">{controls}</div>}
          <div className="relative mx-1 mb-1 min-h-0 flex-1 overflow-hidden rounded-md bg-ink-950">
            <div
              ref={scrollerRef}
              aria-label={t("overview.chart")}
              className={`absolute inset-0 cursor-pointer touch-none overflow-y-hidden overscroll-contain ${
                scrolling ? "overflow-x-auto" : "overflow-x-hidden"
              }`}
              onPointerDown={onChartPointerDown}
              onPointerMove={onChartPointerMove}
              onPointerUp={(e) => endScrub(e, true)}
              onPointerCancel={(e) => endScrub(e, false)}
              onPointerLeave={(e) => {
                if (!scrubRef.current) showHover(null, e.currentTarget);
              }}
            >
              <div className="relative h-full" style={{ width: scrolling ? grid.contentWidth : "100%" }}>
                <canvas
                  ref={notesCanvasRef}
                  className="sticky left-0 top-0 block"
                  style={{ width: view.width, height: view.height }}
                />
              </div>
            </div>
            <canvas
              ref={overlayCanvasRef}
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 block"
              style={{ width: view.width, height: view.height }}
            />
            <div
              ref={hoverLabelRef}
              aria-hidden
              className="pointer-events-none absolute hidden whitespace-nowrap rounded-sm bg-ink-700 px-1 font-mono text-[10px] leading-4 text-slate-200 ring-1 ring-white/[0.09]"
            />
            {props.notes.length === 0 && (
              <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-2 text-center text-2xs text-slate-500">
                {t("overview.empty")}
              </p>
            )}
          </div>
          {RESIZE_HANDLES.map(({ edges, className }, i) => (
            <div
              key={i}
              aria-hidden
              title={t("overview.resize")}
              className={`absolute ${className}`}
              onPointerDown={(e) => startGesture(e, edges)}
              onPointerMove={moveGesture}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
            />
          ))}
        </section>
      )}
    </div>
  );
}
