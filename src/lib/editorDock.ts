/**
 * Where the editor's panels sit around the playfield.
 *
 * The layout is a list of strips, outermost first. Each strip runs along one
 * edge of whatever space the strips before it left over, and holds one or more
 * panels side by side along its length. The playfield takes what is left in
 * the middle. The default reproduces the classic arrangement: the top bar
 * across the whole window, the difficulty list and its stats down the left,
 * then the playback bar, the timeline and the skillset graph around the
 * playfield.
 */

export const DOCK_PANELS = [
  "header",
  "transport",
  "difficulties",
  "info",
  "skillsets",
  "timeline",
] as const;

export type DockPanelId = (typeof DOCK_PANELS)[number];
export type DockEdge = "top" | "bottom" | "left" | "right";
export type DockOrientation = "horizontal" | "vertical";
export type DockStrip = { edge: DockEdge; panels: DockPanelId[] };
export type DockLayout = { strips: DockStrip[] };

export const DOCK_EDGES: DockEdge[] = ["top", "bottom", "left", "right"];

export const DEFAULT_DOCK_LAYOUT: DockLayout = {
  strips: [
    { edge: "top", panels: ["header"] },
    { edge: "left", panels: ["difficulties", "info"] },
    { edge: "top", panels: ["transport"] },
    { edge: "bottom", panels: ["timeline"] },
    { edge: "bottom", panels: ["skillsets"] },
  ],
};

export function orientationOf(edge: DockEdge): DockOrientation {
  return edge === "top" || edge === "bottom" ? "horizontal" : "vertical";
}

function isPanel(value: unknown): value is DockPanelId {
  return typeof value === "string" && (DOCK_PANELS as readonly string[]).includes(value);
}

function isEdge(value: unknown): value is DockEdge {
  return typeof value === "string" && (DOCK_EDGES as string[]).includes(value);
}

function cloneLayout(layout: DockLayout): DockLayout {
  return { strips: layout.strips.map((s) => ({ edge: s.edge, panels: [...s.panels] })) };
}

/**
 * A saved layout made safe to render: every panel exactly once, no empty
 * strips, nothing unknown. Panels a saved layout is missing (one added in a
 * later version) go back where the default puts them.
 */
export function normalizeDockLayout(value: unknown): DockLayout {
  const raw = (value as { strips?: unknown } | null)?.strips;
  if (!Array.isArray(raw)) return cloneLayout(DEFAULT_DOCK_LAYOUT);
  const seen = new Set<DockPanelId>();
  const strips: DockStrip[] = [];
  for (const entry of raw) {
    const edge = (entry as { edge?: unknown } | null)?.edge;
    const panels = (entry as { panels?: unknown } | null)?.panels;
    if (!isEdge(edge) || !Array.isArray(panels)) continue;
    const kept: DockPanelId[] = [];
    for (const id of panels) {
      if (!isPanel(id) || seen.has(id)) continue;
      seen.add(id);
      kept.push(id);
    }
    if (kept.length) strips.push({ edge, panels: kept });
  }
  for (const id of DOCK_PANELS) {
    if (seen.has(id)) continue;
    const home = DEFAULT_DOCK_LAYOUT.strips.find((s) => s.panels.includes(id))!;
    const twin = strips.find((s) => s.edge === home.edge);
    if (twin) twin.panels.push(id);
    else strips.push({ edge: home.edge, panels: [id] });
  }
  return { strips };
}

export function sameDockLayout(a: DockLayout, b: DockLayout): boolean {
  return (
    a.strips.length === b.strips.length &&
    a.strips.every(
      (s, i) =>
        s.edge === b.strips[i].edge &&
        s.panels.length === b.strips[i].panels.length &&
        s.panels.every((id, j) => id === b.strips[i].panels[j]),
    )
  );
}

export function locatePanel(
  layout: DockLayout,
  id: DockPanelId,
): { strip: number; index: number; edge: DockEdge } | null {
  for (let strip = 0; strip < layout.strips.length; strip++) {
    const index = layout.strips[strip].panels.indexOf(id);
    if (index >= 0) return { strip, index, edge: layout.strips[strip].edge };
  }
  return null;
}

export type DockRect = { x: number; y: number; w: number; h: number };

/** How much room one panel asks for in a given orientation. */
export type DockSize = {
  visible: boolean;
  /** Thickness across the strip, in px. */
  cross: number;
  /** Its own length along the strip, or null to share what is left. */
  length: number | null;
  /** Drawn over the playfield instead of taking room from it. */
  overlay?: boolean;
};

export type DockPanelGeometry = {
  rect: DockRect;
  edge: DockEdge;
  orientation: DockOrientation;
  strip: number;
  index: number;
  visible: boolean;
};

export type DockGeometry = {
  panels: Record<DockPanelId, DockPanelGeometry>;
  strips: { edge: DockEdge; rect: DockRect }[];
  center: DockRect;
};

/** A strip never takes more than this share of the room left to it. */
const MAX_STRIP_SHARE = 0.6;

/**
 * Turns a layout into rectangles. Hidden panels keep a place (zero long, or
 * zero thick when their whole strip is hidden) so showing them grows them
 * from where they belong instead of from a corner.
 */
export function computeDock(
  layout: DockLayout,
  frame: { w: number; h: number },
  sizeOf: (id: DockPanelId, orientation: DockOrientation) => DockSize,
): DockGeometry {
  let room: DockRect = { x: 0, y: 0, w: Math.max(0, frame.w), h: Math.max(0, frame.h) };
  const panels = {} as Record<DockPanelId, DockPanelGeometry>;
  const strips: DockGeometry["strips"] = [];

  layout.strips.forEach((strip, stripIndex) => {
    const orientation = orientationOf(strip.edge);
    const items = strip.panels.map((id) => ({ id, size: sizeOf(id, orientation) }));
    const shown = items.filter((item) => item.size.visible);
    const across = orientation === "horizontal" ? room.h : room.w;
    const thick = shown.length
      ? Math.min(Math.max(...shown.map((item) => item.size.cross)), across * MAX_STRIP_SHARE)
      : 0;
    const overlay = shown.length > 0 && shown.every((item) => item.size.overlay);

    let rect: DockRect;
    if (strip.edge === "top") rect = { x: room.x, y: room.y, w: room.w, h: thick };
    else if (strip.edge === "bottom") rect = { x: room.x, y: room.y + room.h - thick, w: room.w, h: thick };
    else if (strip.edge === "left") rect = { x: room.x, y: room.y, w: thick, h: room.h };
    else rect = { x: room.x + room.w - thick, y: room.y, w: thick, h: room.h };
    strips.push({ edge: strip.edge, rect });

    if (!overlay) {
      if (strip.edge === "top") room = { ...room, y: room.y + thick, h: room.h - thick };
      else if (strip.edge === "bottom") room = { ...room, h: room.h - thick };
      else if (strip.edge === "left") room = { ...room, x: room.x + thick, w: room.w - thick };
      else room = { ...room, w: room.w - thick };
    }

    // Along the strip: panels with a length of their own get it (shrunk to
    // fit if they all ask for too much), the rest share what is left. With no
    // sharer, the last panel takes the slack so the strip has no hole.
    const span = orientation === "horizontal" ? rect.w : rect.h;
    const natural = shown.filter((item) => item.size.length !== null);
    const sharers = shown.filter((item) => item.size.length === null);
    const asked = natural.reduce((sum, item) => sum + (item.size.length ?? 0), 0);
    const squeeze = asked > span && asked > 0 ? span / asked : 1;
    const free = Math.max(0, span - asked * squeeze);
    const lengths = new Map<DockPanelId, number>();
    for (const item of natural) lengths.set(item.id, (item.size.length ?? 0) * squeeze);
    for (const item of sharers) lengths.set(item.id, free / sharers.length);
    if (!sharers.length && shown.length) {
      const last = shown[shown.length - 1].id;
      lengths.set(last, (lengths.get(last) ?? 0) + free);
    }

    let cursor = 0;
    items.forEach((item, index) => {
      const length = item.size.visible ? (lengths.get(item.id) ?? 0) : 0;
      const panelRect: DockRect =
        orientation === "horizontal"
          ? { x: rect.x + cursor, y: rect.y, w: length, h: rect.h }
          : { x: rect.x, y: rect.y + cursor, w: rect.w, h: length };
      cursor += length;
      panels[item.id] = {
        rect: panelRect,
        edge: strip.edge,
        orientation,
        strip: stripIndex,
        index,
        visible: item.size.visible && length > 0 && thick > 0,
      };
    });
  });

  return { panels, strips, center: room };
}

export type DockDrop =
  | { kind: "swap"; target: DockPanelId }
  | { kind: "insert"; target: DockPanelId; after: boolean }
  | { kind: "edge"; edge: DockEdge; outer: boolean };

export function dockDropKey(drop: DockDrop | null): string {
  if (!drop) return "";
  if (drop.kind === "edge") return `edge:${drop.edge}:${drop.outer ? "outer" : "inner"}`;
  if (drop.kind === "insert") return `insert:${drop.target}:${drop.after ? "after" : "before"}`;
  return `swap:${drop.target}`;
}

function withoutPanel(layout: DockLayout, id: DockPanelId): DockLayout {
  return {
    strips: layout.strips
      .map((s) => ({ edge: s.edge, panels: s.panels.filter((p) => p !== id) }))
      .filter((s) => s.panels.length > 0),
  };
}

/** The layout after dropping `id` on `drop`. Unchanged when it is a no-op. */
export function applyDockDrop(layout: DockLayout, id: DockPanelId, drop: DockDrop): DockLayout {
  if (drop.kind === "swap") {
    if (drop.target === id) return layout;
    return {
      strips: layout.strips.map((s) => ({
        edge: s.edge,
        panels: s.panels.map((p) => (p === id ? drop.target : p === drop.target ? id : p)),
      })),
    };
  }
  if (drop.kind === "insert") {
    if (drop.target === id) return layout;
    const next = withoutPanel(layout, id);
    const at = locatePanel(next, drop.target);
    if (!at) return layout;
    next.strips[at.strip].panels.splice(at.index + (drop.after ? 1 : 0), 0, id);
    return next;
  }
  const next = withoutPanel(layout, id);
  const strip: DockStrip = { edge: drop.edge, panels: [id] };
  if (drop.outer) next.strips.unshift(strip);
  else next.strips.push(strip);
  return next;
}

/** Keyboard moves: the panel becomes the innermost strip on that edge. */
export function movePanelToEdge(layout: DockLayout, id: DockPanelId, edge: DockEdge): DockLayout {
  const at = locatePanel(layout, id);
  const last = layout.strips[layout.strips.length - 1];
  if (
    at &&
    at.edge === edge &&
    at.strip === layout.strips.length - 1 &&
    last.panels.length === 1
  ) {
    return layout;
  }
  return applyDockDrop(layout, id, { kind: "edge", edge, outer: false });
}

/** Zone along the window's edge that starts a new outermost strip, px. */
export const DOCK_OUTER_BAND = 22;
/** How far into the playfield its edge zones reach, at most, px. */
export const DOCK_INNER_BAND = 120;
/** Panels shorter than this along their strip only swap; no insert ends. */
const INSERT_MIN_LENGTH = 140;
const INSERT_END_SHARE = 0.24;

function contains(rect: DockRect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

/**
 * What dropping the dragged panel at (x, y) would do: start a strip along the
 * window's edge, swap with or slot in beside the panel under the pointer, or
 * start a strip along the playfield's edge.
 */
export function dockDropAt(
  geometry: DockGeometry,
  frame: { w: number; h: number },
  dragged: DockPanelId,
  x: number,
  y: number,
): DockDrop | null {
  if (x < 0 || y < 0 || x > frame.w || y > frame.h) return null;
  const edgeDistances: [DockEdge, number][] = [
    ["top", y],
    ["bottom", frame.h - y],
    ["left", x],
    ["right", frame.w - x],
  ];
  const [nearEdge, nearDistance] = edgeDistances.reduce((best, entry) =>
    entry[1] < best[1] ? entry : best,
  );
  if (nearDistance <= DOCK_OUTER_BAND) return { kind: "edge", edge: nearEdge, outer: true };

  for (const id of DOCK_PANELS) {
    const panel = geometry.panels[id];
    if (!panel?.visible || !contains(panel.rect, x, y)) continue;
    if (id === dragged) return null;
    const along = panel.orientation === "horizontal" ? x - panel.rect.x : y - panel.rect.y;
    const length = panel.orientation === "horizontal" ? panel.rect.w : panel.rect.h;
    if (length >= INSERT_MIN_LENGTH) {
      if (along < length * INSERT_END_SHARE) return { kind: "insert", target: id, after: false };
      if (along > length * (1 - INSERT_END_SHARE)) return { kind: "insert", target: id, after: true };
    }
    return { kind: "swap", target: id };
  }

  const c = geometry.center;
  if (!contains(c, x, y)) return null;
  const sides: [DockEdge, number, number][] = [
    ["top", y - c.y, c.h],
    ["bottom", c.y + c.h - y, c.h],
    ["left", x - c.x, c.w],
    ["right", c.x + c.w - x, c.w],
  ];
  let best: [DockEdge, number] | null = null;
  for (const [edge, distance, span] of sides) {
    const band = Math.min(DOCK_INNER_BAND, span * 0.3);
    if (distance <= band && (!best || distance < best[1])) best = [edge, distance];
  }
  return best ? { kind: "edge", edge: best[0], outer: false } : null;
}

/** The playfield's corners, where small floating widgets snap to. */
export const DOCK_CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type DockCorner = (typeof DOCK_CORNERS)[number];

export function isDockCorner(value: unknown): value is DockCorner {
  return typeof value === "string" && (DOCK_CORNERS as readonly string[]).includes(value);
}

/** Wherever a widget is let go, it lands in the corner nearest the pointer. */
export function nearestCorner(area: DockRect, x: number, y: number): DockCorner {
  const top = y < area.y + area.h / 2;
  const left = x < area.x + area.w / 2;
  return `${top ? "top" : "bottom"}-${left ? "left" : "right"}` as DockCorner;
}

/** A widget of `size` tucked into `corner` of `area`, `inset` px from its edges. */
export function cornerRect(
  area: DockRect,
  corner: DockCorner,
  size: { w: number; h: number },
  inset = 12,
): DockRect {
  const left = corner.endsWith("left");
  const top = corner.startsWith("top");
  return {
    x: left ? area.x + inset : area.x + area.w - inset - size.w,
    y: top ? area.y + inset : area.y + area.h - inset - size.h,
    w: size.w,
    h: size.h,
  };
}
