import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  DOCK_PANELS,
  applyDockDrop,
  computeDock,
  dockDropAt,
  dockDropKey,
  movePanelToEdge,
  sameDockLayout,
  type DockDrop,
  type DockEdge,
  type DockGeometry,
  type DockLayout,
  type DockOrientation,
  type DockPanelId,
  type DockRect,
  type DockSize,
  DOCK_CORNERS,
  cornerRect,
  nearestCorner,
  type DockCorner,
} from "../../lib/editorDock";
import { useT } from "../../lib/i18n";

/** How long a box takes to reach its new place; matches --dock-ms in index.css. */
const DOCK_MS = 380;
const DRAG_THRESHOLD_PX = 5;
/** The least a strip is across while arranging, px. */
const ARRANGE_MIN_CROSS = 44;

export type DockPanelSpec = {
  id: DockPanelId;
  label: string;
  icon: ReactNode;
  /** Shown outside the arrange view. Hidden panels take no room. */
  visible: boolean;
  /** Offered as a show/hide switch on its tile while arranging. */
  onToggleVisible?: (visible: boolean) => void;
  /** Thickness across its strip, px, or "measure" to use the content's own. */
  cross: Record<DockOrientation, number | "measure">;
  /** Along its strip: share the room ("fill") or keep the content's own length. */
  length: Record<DockOrientation, "fill" | "measure">;
  /** Drawn over the playfield instead of taking room from it. */
  overlay?: boolean;
  /** Stays mounted while hidden (it holds state worth keeping). */
  keepMounted?: boolean;
  /** A pull tab on the strip's inner edge that folds the whole strip away. */
  tab?: { open: boolean; label: { open: string; closed: string }; onToggle: () => void };
  render: (orientation: DockOrientation, edge: DockEdge) => ReactNode;
};

/**
 * A small widget floating in a corner of the playfield (the speed and pp
 * chips). While arranging it is picked up like a panel but only ever lands in
 * a corner.
 */
export type DockCornerSpec = {
  id: string;
  label: string;
  icon: ReactNode;
  corner: DockCorner;
  visible: boolean;
  onToggleVisible?: (visible: boolean) => void;
  onCorner: (corner: DockCorner) => void;
};

type Measured = Partial<Record<DockPanelId, Partial<Record<DockOrientation, { w: number; h: number }>>>>;

/** Until a panel has been measured in an orientation, these stand in, px at 1rem = 16px. */
const FALLBACK: Record<DockPanelId, Record<DockOrientation, { cross: number; length: number }>> = {
  header: { horizontal: { cross: 53, length: 1200 }, vertical: { cross: 216, length: 640 } },
  transport: { horizontal: { cross: 41, length: 1200 }, vertical: { cross: 216, length: 210 } },
  difficulties: { horizontal: { cross: 92, length: 900 }, vertical: { cross: 240, length: 480 } },
  info: { horizontal: { cross: 96, length: 560 }, vertical: { cross: 240, length: 210 } },
  skillsets: { horizontal: { cross: 48, length: 900 }, vertical: { cross: 56, length: 600 } },
  timeline: { horizontal: { cross: 96, length: 900 }, vertical: { cross: 96, length: 600 } },
};

function sameRect(a: DockRect, b: DockRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function rectStyle(rect: DockRect): CSSProperties {
  return { left: rect.x, top: rect.y, width: rect.w, height: rect.h };
}

/** The hairline on a box's inner edge, and between panels sharing a strip. */
function hairlines(edge: DockEdge, first: boolean): string[] {
  const inner = edge === "top" ? "bottom" : edge === "bottom" ? "top" : edge === "left" ? "right" : "left";
  const lines = [`dock-edge-${inner}`];
  if (!first) lines.push(edge === "top" || edge === "bottom" ? "dock-div-left" : "dock-div-top");
  return lines;
}

export function DockFrame({
  layout,
  panels,
  center,
  remPx,
  arranging,
  onLayout,
  onArrangeDone,
  onArrangeReset,
  canReset,
  corners = [],
}: {
  layout: DockLayout;
  panels: DockPanelSpec[];
  /** Corner widgets, movable while arranging. */
  corners?: DockCornerSpec[];
  /** The playfield and everything drawn over it. */
  center: ReactNode;
  /** One rem in px, so measured fallbacks follow the interface scale. */
  remPx: number;
  arranging: boolean;
  onLayout: (layout: DockLayout) => void;
  onArrangeDone: () => void;
  onArrangeReset: () => void;
  canReset: boolean;
}) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [measured, setMeasured] = useState<Measured>({});
  const [morphing, setMorphing] = useState<ReadonlySet<DockPanelId>>(() => new Set());
  const [mountedHidden, setMountedHidden] = useState<ReadonlySet<DockPanelId>>(() => new Set());
  const morphTimers = useRef(new Map<DockPanelId, number>());
  const hideTimers = useRef(new Map<DockPanelId, number>());
  const specs = useMemo(() => {
    const map = {} as Record<DockPanelId, DockPanelSpec>;
    for (const spec of panels) map[spec.id] = spec;
    return map;
  }, [panels]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const read = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      setFrame((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // One observer for every panel's content, reporting its own size in the
  // orientation it is drawn in.
  const contentObserver = useRef<ResizeObserver | null>(null);
  if (!contentObserver.current && typeof ResizeObserver !== "undefined") {
    contentObserver.current = new ResizeObserver((entries) => {
      setMeasured((prev) => {
        let next = prev;
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const id = el.dataset.dockId as DockPanelId | undefined;
          const orientation = el.dataset.dockOrientation as DockOrientation | undefined;
          // A hidden panel is laid out at its last real size; nothing to learn.
          if (!id || !orientation || el.parentElement?.hasAttribute("data-hidden")) continue;
          const w = el.offsetWidth;
          const h = el.offsetHeight;
          if (w === 0 && h === 0) continue;
          const old = prev[id]?.[orientation];
          if (old && Math.abs(old.w - w) < 0.5 && Math.abs(old.h - h) < 0.5) continue;
          if (next === prev) next = { ...prev };
          next[id] = { ...next[id], [orientation]: { w, h } };
        }
        return next;
      });
    });
  }
  // Each panel's content element, so an unmounted one is let go of and every
  // one is picked up again if the effect re-runs (StrictMode does that).
  const observed = useRef(new Map<DockPanelId, HTMLElement>());
  const contentRefs = useRef(new Map<DockPanelId, (el: HTMLDivElement | null) => void>());
  const observeContent = (id: DockPanelId) => {
    let ref = contentRefs.current.get(id);
    if (!ref) {
      ref = (el) => {
        const previous = observed.current.get(id);
        if (previous && previous !== el) contentObserver.current?.unobserve(previous);
        if (el) {
          observed.current.set(id, el);
          contentObserver.current?.observe(el);
        } else {
          observed.current.delete(id);
        }
      };
      contentRefs.current.set(id, ref);
    }
    return ref;
  };
  useEffect(() => {
    const observer = contentObserver.current;
    for (const el of observed.current.values()) observer?.observe(el);
    return () => observer?.disconnect();
  }, []);

  // A pull tab that is closed folds every panel in its strip away.
  const foldedIds = useMemo(() => {
    const folded = new Set<DockPanelId>();
    if (arranging) return folded;
    for (const strip of layout.strips) {
      if (strip.panels.some((id) => specs[id]?.tab && !specs[id].tab!.open)) {
        for (const id of strip.panels) folded.add(id);
      }
    }
    return folded;
  }, [arranging, layout, specs]);

  const sizeOf = useCallback(
    (id: DockPanelId, orientation: DockOrientation, forceVisible = false): DockSize => {
      const spec = specs[id];
      const scale = remPx / 16;
      const fallback = FALLBACK[id][orientation];
      const seen = measured[id]?.[orientation];
      const crossMode = spec?.cross[orientation] ?? "measure";
      const lengthMode = spec?.length[orientation] ?? "fill";
      const cross =
        crossMode === "measure"
          ? (seen ? (orientation === "horizontal" ? seen.h : seen.w) : fallback.cross * scale)
          : crossMode;
      const length =
        lengthMode === "fill"
          ? null
          : seen
            ? orientation === "horizontal"
              ? seen.w
              : seen.h
            : fallback.length * scale;
      return {
        visible: forceVisible || arranging || (!!spec?.visible && !foldedIds.has(id)),
        // While arranging, thin strips (a folded skillset graph) grow enough
        // to grab and to carry their label.
        cross: arranging || forceVisible ? Math.max(cross, ARRANGE_MIN_CROSS) : cross,
        length,
        overlay: spec?.overlay,
      };
    },
    [arranging, foldedIds, measured, remPx, specs],
  );

  const geometry = useMemo(
    () => computeDock(layout, frame, (id, o) => sizeOf(id, o)),
    [frame, layout, sizeOf],
  );

  // Boxes glide to new places, except when the window itself is resizing:
  // then they follow it at once.
  const committed = useRef<{
    frame: { w: number; h: number };
    geometry: DockGeometry;
    layout: DockLayout;
  } | null>(null);
  const frameChanged =
    !committed.current ||
    committed.current.frame.w !== frame.w ||
    committed.current.frame.h !== frame.h;
  const animate = !frameChanged;

  // Where each panel last showed, so a hidden one keeps laying out at a real
  // size instead of wrapping into a zero-wide box.
  const lastShown = useRef<Partial<Record<DockPanelId, DockRect>>>({});
  for (const id of DOCK_PANELS) {
    const place = geometry.panels[id];
    if (place?.visible) lastShown.current[id] = place.rect;
  }

  useLayoutEffect(() => {
    const prev = committed.current;
    committed.current = { frame, geometry, layout };
    if (!prev || frameChanged) return;
    // A panel whose strip changed (another edge, or other neighbours) hides
    // its content while its box morphs, then fades it back in at the new
    // place. Panels that only slide along keep showing theirs.
    const stripOf = (l: DockLayout, id: DockPanelId) => {
      const strip = l.strips.find((s) => s.panels.includes(id));
      return strip ? `${strip.edge}:${strip.panels.join(",")}` : "";
    };
    const moved = DOCK_PANELS.filter((id) => {
      const a = prev.geometry.panels[id];
      const b = geometry.panels[id];
      return (
        a &&
        b &&
        b.visible &&
        stripOf(prev.layout, id) !== stripOf(layout, id) &&
        !sameRect(a.rect, b.rect)
      );
    });
    if (!moved.length) return;
    setMorphing((current) => new Set([...current, ...moved]));
    // Geometry is rebuilt on every render, so these timers live in a ref and
    // are only cancelled by a newer move of the same panel, or on unmount.
    for (const id of moved) {
      window.clearTimeout(morphTimers.current.get(id));
      morphTimers.current.set(
        id,
        window.setTimeout(() => {
          morphTimers.current.delete(id);
          setMorphing((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        }, DOCK_MS),
      );
    }
  }, [frame, frameChanged, geometry, layout]);

  // Hidden panels stay mounted through their exit, then unmount.
  const prevVisible = useRef<Partial<Record<DockPanelId, boolean>>>({});
  useEffect(() => {
    for (const id of DOCK_PANELS) {
      const visible = geometry.panels[id]?.visible ?? false;
      const wasVisible = prevVisible.current[id];
      prevVisible.current[id] = visible;
      if (!wasVisible || visible) continue;
      setMountedHidden((current) => new Set([...current, id]));
      window.clearTimeout(hideTimers.current.get(id));
      hideTimers.current.set(
        id,
        window.setTimeout(() => {
          hideTimers.current.delete(id);
          setMountedHidden((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        }, DOCK_MS),
      );
    }
  }, [geometry]);

  useEffect(
    () => () => {
      for (const timer of morphTimers.current.values()) window.clearTimeout(timer);
      for (const timer of hideTimers.current.values()) window.clearTimeout(timer);
    },
    [],
  );

  return (
    <div
      ref={rootRef}
      className="dock-frame relative min-h-0 flex-1 overflow-hidden"
      data-animate={animate ? "" : undefined}
      data-arranging={arranging ? "" : undefined}
    >
      <div
        className="dock-center absolute flex flex-col"
        style={rectStyle(geometry.center)}
      >
        {center}
      </div>

      {DOCK_PANELS.map((id) => {
        const spec = specs[id];
        const place = geometry.panels[id];
        if (!spec || !place) return null;
        // A panel hidden in this render was showing in the last one: keep it
        // until the effect below has marked it as leaving, or its content
        // would unmount for a frame and come back empty.
        const mounted =
          place.visible ||
          arranging ||
          spec.keepMounted ||
          mountedHidden.has(id) ||
          prevVisible.current[id] === true;
        const crossMode = spec.cross[place.orientation];
        const lengthMode = spec.length[place.orientation];
        const sizing = place.visible ? place.rect : (lastShown.current[id] ?? place.rect);
        const contentStyle: CSSProperties =
          place.orientation === "horizontal"
            ? {
                width: lengthMode === "fill" ? sizing.w : "max-content",
                height: crossMode === "measure" ? "auto" : sizing.h,
              }
            : {
                width: crossMode === "measure" ? "auto" : sizing.w,
                height: lengthMode === "fill" ? sizing.h : "auto",
              };
        const strip = layout.strips[place.strip];
        const first = strip
          ? strip.panels.findIndex((p) => geometry.panels[p]?.visible) === place.index
          : true;
        return (
          <div
            key={id}
            className={`dock-box absolute overflow-hidden bg-ink-900 ${hairlines(place.edge, first).join(" ")} ${
              spec.overlay ? "z-30" : "z-20"
            }`}
            style={rectStyle(place.rect)}
            data-dock-box={id}
            data-hidden={place.visible ? undefined : ""}
            data-morph={morphing.has(id) ? "" : undefined}
            aria-hidden={place.visible ? undefined : true}
            {...({ inert: place.visible && !arranging ? undefined : "" } as { inert?: string })}
          >
            <div className="dock-morph-label" aria-hidden>
              <span className="[&>svg]:h-5 [&>svg]:w-5">{spec.icon}</span>
            </div>
            {mounted && (
              <div
                ref={observeContent(id)}
                className="dock-content"
                data-dock-id={id}
                data-dock-orientation={place.orientation}
                style={contentStyle}
              >
                {spec.render(place.orientation, place.edge)}
              </div>
            )}
          </div>
        );
      })}

      {!arranging &&
        DOCK_PANELS.map((id) => {
          const spec = specs[id];
          const place = geometry.panels[id];
          if (!spec?.tab || !place) return null;
          const strip = geometry.strips[place.strip];
          if (!strip) return null;
          return (
            <DockTab
              key={`tab-${id}`}
              edge={place.edge}
              strip={strip.rect}
              open={spec.tab.open}
              label={spec.tab.open ? spec.tab.label.open : spec.tab.label.closed}
              onToggle={spec.tab.onToggle}
            />
          );
        })}

      {arranging && (
        <ArrangeLayer
          layout={layout}
          geometry={geometry}
          frame={frame}
          specs={specs}
          corners={corners}
          remPx={remPx}
          sizeOf={sizeOf}
          rootRef={rootRef}
          onLayout={onLayout}
          onDone={onArrangeDone}
          onReset={onArrangeReset}
          canReset={canReset}
          labels={{
            title: t("dock.title"),
            hint: t("dock.hint"),
            reset: t("dock.reset"),
            done: t("dock.done"),
            playfield: t("dock.playfield"),
            hidden: t("dock.hidden"),
            show: t("dock.show"),
            hide: t("dock.hide"),
          }}
        />
      )}
    </div>
  );
}

/**
 * The pull tab on a folding strip's inner edge: tucked in until hovered, then
 * sliding out, as the difficulty list's tab always has.
 */
function DockTab({
  edge,
  strip,
  open,
  label,
  onToggle,
}: {
  edge: DockEdge;
  strip: DockRect;
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  // Anchor on the strip's inner edge, halfway along it.
  const x = edge === "left" ? strip.x + strip.w : edge === "right" ? strip.x : strip.x + strip.w / 2;
  const y = edge === "top" ? strip.y + strip.h : edge === "bottom" ? strip.y : strip.y + strip.h / 2;
  // Drawn as the left-edge tab, then turned to face the right way.
  const rotate = edge === "left" ? 0 : edge === "right" ? 180 : edge === "top" ? 90 : -90;
  // The chevron points the way the strip will go: out to fold, in to open.
  const pointsOut = open;
  return (
    <div
      className="dock-tab pointer-events-none absolute z-30"
      style={{ left: x, top: y, transform: `rotate(${rotate}deg)` }}
    >
      <div className="group pointer-events-auto absolute left-0 h-32 w-11 -translate-y-1/2 overflow-hidden">
        <button
          type="button"
          onClick={onToggle}
          title={label}
          aria-label={label}
          aria-expanded={open}
          className="absolute left-0 top-1/2 grid h-14 w-8 -translate-x-[76%] -translate-y-1/2 place-items-center rounded-r-xl border border-l-0 border-white/10 bg-ink-700/90 text-slate-300 shadow-lg backdrop-blur-sm transition-[transform,background-color,color] duration-200 ease-out hover:bg-ink-600 hover:text-white focus-visible:translate-x-0 group-hover:translate-x-0"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={`h-4 w-4 transition-transform duration-200 ${pointsOut ? "" : "rotate-180"}`}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

type DragState = {
  kind: "panel" | "corner";
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
};

/** Until a corner widget has been seen on screen, its tile is this big. */
const CORNER_FALLBACK = { w: 236, h: 40 };

function sameSizes(
  a: Record<string, { w: number; h: number }>,
  b: Record<string, { w: number; h: number }>,
): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => b[key] && a[key].w === b[key].w && a[key].h === b[key].h)
  );
}

/** Six dots: the "this can be picked up" mark on every tile. */
function GripIcon() {
  return (
    <svg viewBox="0 0 10 16" aria-hidden className="h-3.5 w-2 shrink-0" fill="currentColor">
      {[3, 8, 13].map((y) => (
        <g key={y}>
          <circle cx="2.5" cy={y} r="1.25" />
          <circle cx="7.5" cy={y} r="1.25" />
        </g>
      ))}
    </svg>
  );
}

function ArrangeLayer({
  layout,
  geometry,
  frame,
  specs,
  corners,
  remPx,
  sizeOf,
  rootRef,
  onLayout,
  onDone,
  onReset,
  canReset,
  labels,
}: {
  layout: DockLayout;
  geometry: DockGeometry;
  frame: { w: number; h: number };
  specs: Record<DockPanelId, DockPanelSpec>;
  corners: DockCornerSpec[];
  remPx: number;
  sizeOf: (id: DockPanelId, orientation: DockOrientation, forceVisible?: boolean) => DockSize;
  rootRef: { current: HTMLDivElement | null };
  onLayout: (layout: DockLayout) => void;
  onDone: () => void;
  onReset: () => void;
  canReset: boolean;
  labels: Record<"title" | "hint" | "reset" | "done" | "playfield" | "hidden" | "show" | "hide", string>;
}) {
  const drag = useRef<DragState | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<DockPanelId | null>(null);
  const [draggingCorner, setDraggingCorner] = useState<string | null>(null);
  const [drop, setDrop] = useState<DockDrop | null>(null);
  const dropRef = useRef<DockDrop | null>(null);
  const [cornerTarget, setCornerTarget] = useState<DockCorner | null>(null);
  const cornerTargetRef = useRef<DockCorner | null>(null);
  const [widgetSizes, setWidgetSizes] = useState<Record<string, { w: number; h: number }>>({});
  const inset = 0.75 * remPx;
  const c = geometry.center;

  // Corner widgets live in the playfield; their tiles take their real size.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const next: Record<string, { w: number; h: number }> = {};
    for (const spec of corners) {
      const el = root.querySelector<HTMLElement>(`[data-corner-widget="${spec.id}"]`);
      if (el && el.offsetWidth > 0) next[spec.id] = { w: el.offsetWidth, h: el.offsetHeight };
    }
    setWidgetSizes((prev) => (sameSizes(prev, next) ? prev : next));
  }, [rootRef, corners, geometry]);

  const preview = useMemo(() => {
    if (!dragging || !drop) return null;
    const next = applyDockDrop(layout, dragging, drop);
    if (sameDockLayout(next, layout)) return null;
    return computeDock(next, frame, (id, o) => sizeOf(id, o, true));
  }, [dragging, drop, frame, layout, sizeOf]);

  const cancel = useCallback(() => {
    drag.current = null;
    dropRef.current = null;
    cornerTargetRef.current = null;
    setDragging(null);
    setDraggingCorner(null);
    setDrop(null);
    setCornerTarget(null);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (drag.current?.active) cancel();
      else onDone();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cancel, onDone]);

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: clientX, y: clientY };
  };

  const placeGhost = (x: number, y: number) => {
    const ghost = ghostRef.current;
    if (ghost) ghost.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  };

  const onPointerDown =
    (kind: DragState["kind"], id: string) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest("[data-tile-action]")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        kind,
        id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
      };
    };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (!state.active) {
      if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < DRAG_THRESHOLD_PX) return;
      state.active = true;
      if (state.kind === "panel") setDragging(state.id as DockPanelId);
      else setDraggingCorner(state.id);
    }
    const point = local(event.clientX, event.clientY);
    placeGhost(point.x, point.y);
    if (state.kind === "corner") {
      // Wherever it is let go, it lands in the nearest corner.
      const target = nearestCorner(c, point.x, point.y);
      if (target !== cornerTargetRef.current) {
        cornerTargetRef.current = target;
        setCornerTarget(target);
      }
      return;
    }
    const next = dockDropAt(geometry, frame, state.id as DockPanelId, point.x, point.y);
    if (dockDropKey(next) !== dockDropKey(dropRef.current)) {
      dropRef.current = next;
      setDrop(next);
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (state.active && state.kind === "panel" && dropRef.current) {
      const next = applyDockDrop(layout, state.id as DockPanelId, dropRef.current);
      if (!sameDockLayout(next, layout)) onLayout(next);
    }
    if (state.active && state.kind === "corner") {
      const spec = corners.find((s) => s.id === state.id);
      const target = cornerTargetRef.current;
      if (spec && target && target !== spec.corner) spec.onCorner(target);
    }
    cancel();
  };

  const arrowEdge = (key: string): DockEdge | null =>
    key === "ArrowLeft"
      ? "left"
      : key === "ArrowRight"
        ? "right"
        : key === "ArrowUp"
          ? "top"
          : key === "ArrowDown"
            ? "bottom"
            : null;

  const onTileKey = (id: DockPanelId) => (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const edge = arrowEdge(event.key);
    if (!edge) return;
    event.preventDefault();
    event.stopPropagation();
    const next = movePanelToEdge(layout, id, edge);
    if (next !== layout) onLayout(next);
  };

  const onCornerKey = (spec: DockCornerSpec) => (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const edge = arrowEdge(event.key);
    if (!edge) return;
    event.preventDefault();
    event.stopPropagation();
    const [vertical, horizontal] = spec.corner.split("-");
    const next = (
      edge === "top" || edge === "bottom" ? `${edge}-${horizontal}` : `${vertical}-${edge}`
    ) as DockCorner;
    if (next !== spec.corner) spec.onCorner(next);
  };

  // Lay the ghost on the pointer before its first paint.
  useLayoutEffect(() => {
    const state = drag.current;
    if ((!dragging && !draggingCorner) || !state) return;
    const point = local(state.startX, state.startY);
    placeGhost(point.x, point.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, draggingCorner]);

  const targetId = drop && drop.kind !== "edge" ? drop.target : null;
  const movingCorner = draggingCorner ? corners.find((s) => s.id === draggingCorner) : undefined;
  const ghost = dragging
    ? { icon: specs[dragging]?.icon, label: specs[dragging]?.label }
    : movingCorner
      ? { icon: movingCorner.icon, label: movingCorner.label }
      : null;

  return (
    <div
      className="dock-arrange absolute inset-0 z-40"
      data-dragging={dragging || draggingCorner ? "" : undefined}
    >
      <div className="dock-arrange-center absolute" style={rectStyle(c)}>
        <span className="dock-arrange-center-label">{labels.playfield}</span>
      </div>

      {DOCK_PANELS.map((id) => {
        const spec = specs[id];
        const place = geometry.panels[id];
        if (!spec || !place) return null;
        const hidden = !spec.visible;
        // Narrow columns stack the chip; short rows keep it in a line.
        const compact = place.rect.w < 132;
        const state =
          dragging === id ? "source" : targetId === id ? (drop?.kind === "swap" ? "swap" : "insert") : "idle";
        return (
          <div
            key={id}
            role="button"
            tabIndex={0}
            aria-label={`${spec.label}${hidden ? ` (${labels.hidden})` : ""}`}
            className="dock-tile absolute"
            style={rectStyle(place.rect)}
            data-state={state}
            data-hidden={hidden ? "" : undefined}
            onPointerDown={onPointerDown("panel", id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={cancel}
            onKeyDown={onTileKey(id)}
          >
            <span className={`dock-tile-chip ${compact ? "dock-tile-chip-compact" : ""}`}>
              {!compact && (
                <span className="dock-tile-grip">
                  <GripIcon />
                </span>
              )}
              <span className="dock-tile-icon [&>svg]:h-4 [&>svg]:w-4">{spec.icon}</span>
              {!compact && <span className="truncate">{spec.label}</span>}
              {!compact && hidden && <span className="dock-tile-badge">{labels.hidden}</span>}
              {spec.onToggleVisible && (
                <button
                  type="button"
                  data-tile-action=""
                  onClick={() => spec.onToggleVisible?.(hidden)}
                  aria-pressed={!hidden}
                  aria-label={`${hidden ? labels.show : labels.hide}: ${spec.label}`}
                  title={hidden ? labels.show : labels.hide}
                  className="dock-tile-eye"
                >
                  <EyeIcon open={!hidden} />
                </button>
              )}
            </span>
          </div>
        );
      })}

      {corners.map((spec) => {
        const size = widgetSizes[spec.id] ?? CORNER_FALLBACK;
        const rect = cornerRect(c, spec.corner, size, inset);
        const hidden = !spec.visible;
        return (
          <div
            key={`corner-${spec.id}`}
            role="button"
            tabIndex={0}
            aria-label={`${spec.label}${hidden ? ` (${labels.hidden})` : ""}`}
            className="dock-tile dock-corner-tile absolute"
            style={rectStyle(rect)}
            data-state={draggingCorner === spec.id ? "source" : "idle"}
            data-hidden={hidden ? "" : undefined}
            onPointerDown={onPointerDown("corner", spec.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={cancel}
            onKeyDown={onCornerKey(spec)}
          >
            <span className="dock-tile-chip">
              <span className="dock-tile-grip">
                <GripIcon />
              </span>
              <span className="dock-tile-icon [&>svg]:h-4 [&>svg]:w-4">{spec.icon}</span>
              {rect.w >= 150 && <span className="truncate">{spec.label}</span>}
              {spec.onToggleVisible && (
                <button
                  type="button"
                  data-tile-action=""
                  onClick={() => spec.onToggleVisible?.(hidden)}
                  aria-pressed={!hidden}
                  aria-label={`${hidden ? labels.show : labels.hide}: ${spec.label}`}
                  title={hidden ? labels.show : labels.hide}
                  className="dock-tile-eye"
                >
                  <EyeIcon open={!hidden} />
                </button>
              )}
            </span>
          </div>
        );
      })}

      {preview && dragging && (
        <div className="dock-preview pointer-events-none absolute inset-0">
          {DOCK_PANELS.map((id) => {
            const place = preview.panels[id];
            if (!place?.visible) return null;
            return (
              <div
                key={id}
                className="dock-preview-box absolute"
                data-moving={id === dragging ? "" : undefined}
                style={rectStyle(place.rect)}
              >
                {id === dragging && (
                  <span className="dock-preview-label">
                    <span className="[&>svg]:h-4 [&>svg]:w-4">{specs[id]?.icon}</span>
                    {specs[id]?.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {movingCorner && (
        // The four places it can snap to; the nearest one is lit.
        <div className="dock-preview pointer-events-none absolute inset-0">
          {DOCK_CORNERS.map((corner) => (
            <div
              key={corner}
              className="dock-slot absolute"
              data-target={cornerTarget === corner ? "" : undefined}
              style={rectStyle(cornerRect(c, corner, widgetSizes[movingCorner.id] ?? CORNER_FALLBACK, inset))}
            />
          ))}
        </div>
      )}

      {ghost && (
        <div ref={ghostRef} className="dock-ghost pointer-events-none absolute left-0 top-0">
          <span className="dock-ghost-inner">
            <span className="[&>svg]:h-4 [&>svg]:w-4">{ghost.icon}</span>
            {ghost.label}
          </span>
        </div>
      )}

      <div
        className="dock-toolbar absolute"
        style={{ left: c.x + c.w / 2, top: c.y + 16 }}
        data-faded={dragging || draggingCorner ? "" : undefined}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-50">{labels.title}</div>
          <div className="text-xs text-slate-400">{labels.hint}</div>
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={!canReset}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.07] hover:text-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {labels.reset}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover active:scale-[0.97]"
        >
          {labels.done}
        </button>
      </div>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-3.5 w-3.5">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M4 4l16 16" />}
    </svg>
  );
}
