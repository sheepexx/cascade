import {
  DEFAULT_APP_SETTINGS,
  type ManiaNote,
  type MapOverviewLayout,
  type MapOverviewRect,
  type TimingPoint,
} from "../types";
import { firstNoteFrom, type NotesByTime } from "./notesMemo";
import { activeTimingAt, beatLength, gridLinesInRange, redPoints } from "./timing";

/**
 * The map overview: the whole chart cut into strips laid side by side, the
 * way SDVX and Malody editors preview a chart. Each strip is a small playfield
 * with every column, read bottom to top in downscroll, and the strips run left
 * to right. Everything here is pure; MapOverview.tsx owns canvases and input.
 */

/** Scrollable mode's zoom, in pixels per second of map time. */
export const OVERVIEW_MIN_ZOOM = 4;
export const OVERVIEW_MAX_ZOOM = 480;
/** One wheel notch or button press. */
export const OVERVIEW_ZOOM_STEP = 1.25;

export const OVERVIEW_MIN_WIDTH = 160;
export const OVERVIEW_MIN_HEIGHT = 160;
const DEFAULT_MAX_WIDTH = 320;
const DEFAULT_MAX_HEIGHT = 420;
/** The panel never comes closer than this to the editor's edges. */
export const OVERVIEW_EDGE = 8;

/** Space above and below the chart in a strip, so heads at its ends are whole. */
export const OVERVIEW_PAD = 6;
/** The band under (or, in upscroll, over) the strips that holds their start times. */
export const OVERVIEW_LABEL_H = 12;
const STRIP_GAP = 4;
const SIDE = 2;
const MIN_LANE = 3;
const MAX_LANE = 12;
/** Fit mode uses the fewest strips that still show this much detail. */
const FIT_TARGET_PX_PER_S = 48;
const MAX_STRIPS = 600;
/** A map shorter than this still gets a sensible scale. */
const MIN_SPAN_MS = 1000;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clampOverviewZoom(zoom: number): number {
  if (!finite(zoom)) return DEFAULT_APP_SETTINGS.mapOverview.zoom;
  return Math.max(OVERVIEW_MIN_ZOOM, Math.min(OVERVIEW_MAX_ZOOM, zoom));
}

/** Settings may come from an older build, another device or the account. */
export function normalizeMapOverviewLayout(value: unknown): MapOverviewLayout {
  const defaults = DEFAULT_APP_SETTINGS.mapOverview;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...defaults };
  }
  const raw = value as Partial<Record<keyof MapOverviewLayout, unknown>>;
  const rect = raw.rect as Partial<Record<keyof MapOverviewRect, unknown>> | null | undefined;
  const validRect =
    !!rect &&
    typeof rect === "object" &&
    (rect.side === "left" || rect.side === "right") &&
    finite(rect.x) &&
    finite(rect.y) &&
    finite(rect.width) &&
    finite(rect.height);
  return {
    mode: raw.mode === "scroll" ? "scroll" : "fit",
    zoom: clampOverviewZoom(raw.zoom as number),
    rect: validRect
      ? {
          side: rect.side as MapOverviewRect["side"],
          x: Math.max(0, rect.x as number),
          y: Math.max(0, rect.y as number),
          width: Math.max(OVERVIEW_MIN_WIDTH, rect.width as number),
          height: Math.max(OVERVIEW_MIN_HEIGHT, rect.height as number),
        }
      : null,
  };
}

export type PanelBox = { left: number; top: number; width: number; height: number };

/**
 * Where a first-time panel goes: the bottom right, in the space beside the
 * playfield and above the speed and pp chips, clear of the clipboard column
 * at the top.
 */
export function defaultOverviewRect(
  container: { width: number; height: number },
  playfieldRight: number | null,
): MapOverviewRect {
  const free =
    playfieldRight === null ? container.width / 3 : container.width - playfieldRight;
  const width = Math.max(OVERVIEW_MIN_WIDTH, Math.min(DEFAULT_MAX_WIDTH, free - 24));
  const height = Math.max(
    OVERVIEW_MIN_HEIGHT,
    Math.min(DEFAULT_MAX_HEIGHT, Math.round(container.height * 0.5)),
  );
  const y = Math.max(12, container.height - 64 - height);
  return { side: "right", x: 12, y, width, height };
}

/** The stored rect as it fits the editor right now, never off screen. */
export function placeOverviewRect(
  rect: MapOverviewRect,
  container: { width: number; height: number },
): PanelBox {
  const roomW = Math.max(0, container.width - 2 * OVERVIEW_EDGE);
  const roomH = Math.max(0, container.height - 2 * OVERVIEW_EDGE);
  const width = Math.min(Math.max(OVERVIEW_MIN_WIDTH, rect.width), roomW);
  const height = Math.min(Math.max(OVERVIEW_MIN_HEIGHT, rect.height), roomH);
  const wantedLeft =
    rect.side === "left" ? rect.x : container.width - rect.x - width;
  const left = Math.max(
    OVERVIEW_EDGE,
    Math.min(container.width - width - OVERVIEW_EDGE, wantedLeft),
  );
  const top = Math.max(
    OVERVIEW_EDGE,
    Math.min(container.height - height - OVERVIEW_EDGE, rect.y),
  );
  return { left, top, width, height };
}

/** Back to the stored form, measured from whichever side the panel is nearer. */
export function storeOverviewRect(
  box: PanelBox,
  containerWidth: number,
): MapOverviewRect {
  const right = box.left + box.width / 2 > containerWidth / 2;
  return {
    side: right ? "right" : "left",
    x: Math.round(right ? containerWidth - box.left - box.width : box.left),
    y: Math.round(box.top),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

export type OverviewSpan = { start: number; end: number };

/**
 * The stretch of map time the overview covers: the whole song, and any note
 * outside it (before zero, or past the end of the audio).
 */
export function overviewSpan(index: NotesByTime, durationMs: number): OverviewSpan {
  const { list, maxDur } = index;
  let start = 0;
  let end = finite(durationMs) && durationMs > 0 ? durationMs : 0;
  if (list.length) {
    const first = list[0].startTime;
    if (finite(first)) start = Math.min(start, first);
    // Sorted by start, so the latest end is among the last maxDur of starts.
    const lastStart = list[list.length - 1].startTime;
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if (n.startTime < lastStart - maxDur) break;
      const noteEnd = n.endTime !== undefined && n.endTime > n.startTime ? n.endTime : n.startTime;
      if (finite(noteEnd) && noteEnd > end) end = noteEnd;
    }
  }
  if (end - start < MIN_SPAN_MS) end = start + MIN_SPAN_MS;
  return { start, end };
}

/** The first red line's bar, which strips are cut to so they start on a bar line. */
export type OverviewBars = { time: number; barMs: number } | null;

export function overviewBars(points: TimingPoint[]): OverviewBars {
  const first = redPoints(points)[0];
  if (!first) return null;
  const barMs = beatLength(first.bpm) * Math.max(1, Math.round(first.meter || 4));
  // A gimmick BPM makes bars too short or long to cut strips on.
  if (!(barMs >= 100 && barMs <= 30000)) return null;
  return { time: first.time, barMs };
}

export type OverviewGrid = {
  span: OverviewSpan;
  /** Map time at the start of the first strip; on a bar line when possible. */
  origin: number;
  /** Map time each strip covers. */
  stripMs: number;
  strips: number;
  /** CSS pixels per millisecond, up a strip. */
  pxPerMs: number;
  keys: number;
  laneWidth: number;
  stripWidth: number;
  gap: number;
  /** Left edge of the first strip. */
  side: number;
  /** Where each strip's chart starts and ends, in CSS px from the view's top. */
  chartTop: number;
  chartBottom: number;
  height: number;
  /** Total width of the strips; wider than the view only in scrollable mode. */
  contentWidth: number;
  /** Earlier times at the top of a strip, as the playfield draws upscroll. */
  upscroll: boolean;
};

/** A lane width for scrollable mode that keeps any key count readable. */
function comfortableLane(keys: number): number {
  if (keys <= 4) return 9;
  if (keys <= 6) return 7;
  if (keys <= 8) return 6;
  if (keys <= 10) return 5;
  if (keys <= 14) return 4;
  return MIN_LANE;
}

/**
 * Lays the map out in strips. Fit mode uses the fewest strips that show the
 * map in useful detail, or as many as the width allows, and fills the panel.
 * Scrollable mode keeps the chosen zoom and lets the strips run past the right
 * edge. Either way a strip covers whole bars where the timing allows.
 */
export function overviewGrid(
  span: OverviewSpan,
  bars: OverviewBars,
  view: { width: number; height: number },
  keyCount: number,
  layout: Pick<MapOverviewLayout, "mode" | "zoom">,
  upscroll: boolean,
): OverviewGrid {
  const keys = Math.max(1, Math.floor(finite(keyCount) ? keyCount : 1));
  const origin = bars
    ? bars.time - Math.ceil((bars.time - span.start) / bars.barMs) * bars.barMs
    : span.start;
  const total = Math.max(1, span.end - origin);
  const chartTop = OVERVIEW_PAD + (upscroll ? OVERVIEW_LABEL_H : 0);
  const chartBottom = Math.max(
    chartTop + 1,
    view.height - OVERVIEW_PAD - (upscroll ? 0 : OVERVIEW_LABEL_H),
  );
  const chartH = chartBottom - chartTop;
  const room = Math.max(1, view.width - 2 * SIDE);
  const laneFor = (strips: number) => (room - (strips - 1) * STRIP_GAP) / (strips * keys);
  const toBars = (ms: number, up: boolean) => {
    if (!bars || ms < bars.barMs) return ms;
    const count = ms / bars.barMs;
    return (up ? Math.ceil(count - 1e-9) : Math.floor(count + 1e-9)) * bars.barMs;
  };

  let stripMs = toBars(total, true);
  for (let strips = 1; strips <= MAX_STRIPS; strips++) {
    if (strips > 1 && laneFor(strips) < MIN_LANE) break;
    stripMs = toBars(total / strips, true);
    if ((chartH / stripMs) * 1000 >= FIT_TARGET_PX_PER_S) break;
  }
  let strips = Math.max(1, Math.ceil(total / stripMs - 1e-9));
  let lane = laneFor(strips);

  if (layout.mode === "scroll") {
    const wanted = clampOverviewZoom(layout.zoom) / 1000;
    // Zoomed out past the fit, a scrollable overview would show less than
    // the fit does; it shows the fit instead.
    if (wanted > chartH / stripMs) {
      stripMs = Math.max(1, toBars(chartH / wanted, false));
      strips = Math.max(1, Math.ceil(total / stripMs - 1e-9));
      lane = Math.max(comfortableLane(keys), laneFor(strips));
    }
  }
  lane = Math.max(1, Math.floor(Math.min(MAX_LANE, lane)));
  const stripWidth = lane * keys;
  const used = strips * stripWidth + (strips - 1) * STRIP_GAP;
  return {
    span,
    origin,
    stripMs,
    strips,
    pxPerMs: chartH / stripMs,
    keys,
    laneWidth: lane,
    stripWidth,
    gap: STRIP_GAP,
    // Strips that do not fill the panel sit in its middle.
    side: used + 2 * SIDE <= view.width ? Math.floor((view.width - used) / 2) : SIDE,
    chartTop,
    chartBottom,
    height: view.height,
    contentWidth: Math.max(view.width, used + 2 * SIDE),
    upscroll,
  };
}

export function stripLeft(grid: OverviewGrid, strip: number): number {
  return grid.side + strip * (grid.stripWidth + grid.gap);
}

export function stripStart(grid: OverviewGrid, strip: number): number {
  return grid.origin + strip * grid.stripMs;
}

/** The strip a time is drawn in; the end of the map belongs to the last. */
export function stripOf(grid: OverviewGrid, time: number): number {
  const strip = Math.floor((time - grid.origin) / grid.stripMs);
  return Math.max(0, Math.min(grid.strips - 1, Number.isFinite(strip) ? strip : 0));
}

/** Y of a time inside a given strip, in CSS px from the view's top. */
export function stripY(grid: OverviewGrid, strip: number, time: number): number {
  const d = (time - stripStart(grid, strip)) * grid.pxPerMs;
  return grid.upscroll ? grid.chartTop + d : grid.chartBottom - d;
}

/** The strip range [first, last] that is at least partly in view. */
export function visibleStrips(
  grid: OverviewGrid,
  scrollLeft: number,
  viewWidth: number,
): [number, number] {
  const pitch = grid.stripWidth + grid.gap;
  const first = Math.max(0, Math.floor((scrollLeft - grid.side - grid.stripWidth) / pitch) + 1);
  const last = Math.min(grid.strips - 1, Math.floor((scrollLeft + viewWidth - grid.side) / pitch));
  return [first, last];
}

/**
 * The map time under a point, in content coordinates (scroll included). A
 * point in the gap between strips counts for the nearer one, and the time is
 * kept inside the strip and the map.
 */
export function overviewTimeAt(grid: OverviewGrid, x: number, y: number): number {
  const pitch = grid.stripWidth + grid.gap;
  const raw = Math.floor((x - grid.side + grid.gap / 2) / pitch);
  const strip = Math.max(0, Math.min(grid.strips - 1, Number.isFinite(raw) ? raw : 0));
  const d = grid.upscroll ? y - grid.chartTop : grid.chartBottom - y;
  const local = Math.max(0, Math.min(grid.stripMs, d / grid.pxPerMs));
  const time = stripStart(grid, strip) + local;
  return Math.max(grid.span.start, Math.min(grid.span.end, time));
}

/**
 * Bar lines between two times, thinned so neighbours stay `minGapPx` apart.
 * Thinning keeps every 2nd, 4th, 8th… bar of each red line, so what is left
 * still falls on phrase boundaries.
 */
export function overviewBarLines(
  points: TimingPoint[],
  from: number,
  to: number,
  pxPerMs: number,
  minGapPx: number,
): number[] {
  const out: number[] = [];
  if (!(to > from) || !(pxPerMs > 0)) return out;
  for (const line of gridLinesInRange(from, to, points, 1)) {
    if (!line.barline) continue;
    const tp = activeTimingAt(line.time, points);
    if (!tp) continue;
    const barMs = beatLength(tp.bpm) * Math.max(1, Math.round(tp.meter || 4));
    if (!(barMs > 0) || !Number.isFinite(barMs)) continue;
    let stride = 1;
    while (barMs * stride * pxPerMs < minGapPx && stride < 4096) stride *= 2;
    const index = Math.round((line.time - tp.time) / barMs);
    if (((index % stride) + stride) % stride === 0) out.push(line.time);
  }
  return out;
}

/**
 * Which device-pixel rows of each column hold a note head or a long note's
 * body, for one strip. Values are a palette slot plus one, 0 meaning empty,
 * stored column after column. Drawing runs of equal rows instead of a shape
 * per note ties the cost to the panel's size, not the chart's.
 */
export type OverviewRaster = {
  columns: number;
  rows: number;
  heads: Uint8Array;
  bodies: Uint8Array;
};

/** Device row of a time: `base + slope * time`. */
export type RowMapping = { base: number; slope: number };

/** The device-row mapping for one strip. */
export function stripRows(grid: OverviewGrid, strip: number, dpr: number): RowMapping {
  const start = stripStart(grid, strip);
  return grid.upscroll
    ? { base: (grid.chartTop - start * grid.pxPerMs) * dpr, slope: grid.pxPerMs * dpr }
    : { base: (grid.chartBottom + start * grid.pxPerMs) * dpr, slope: -grid.pxPerMs * dpr };
}

/**
 * Notes starting in [from, to) get a head; holds reaching into it from
 * earlier get the part of their body inside it. Heads sit on their time and
 * reach towards later notes, as on the playfield.
 */
export function rasterizeOverview(
  index: NotesByTime,
  keyCount: number,
  from: number,
  to: number,
  map: RowMapping,
  rows: number,
  /** Head height in device rows. */
  headRows: number,
  slotOf: (note: ManiaNote) => number,
  reuse?: OverviewRaster | null,
): OverviewRaster {
  const columns = Math.max(0, Math.floor(keyCount));
  const size = columns * Math.max(0, rows);
  const raster =
    reuse && reuse.heads.length === size && reuse.columns === columns
      ? reuse
      : { columns, rows, heads: new Uint8Array(size), bodies: new Uint8Array(size) };
  raster.rows = rows;
  raster.heads.fill(0);
  raster.bodies.fill(0);
  if (!size || !(to > from) || !map.slope) return raster;

  const { list, maxDur } = index;
  const head = Math.max(1, Math.round(headRows));
  const later = map.slope < 0 ? -1 : 1;
  const rowOf = (time: number) => map.base + map.slope * time;

  for (let i = firstNoteFrom(list, from - maxDur); i < list.length; i++) {
    const note = list[i];
    if (note.startTime >= to) break;
    const column = note.column;
    if (!Number.isInteger(column) || column < 0 || column >= columns || !finite(note.startTime)) {
      continue;
    }
    const hasHead = note.startTime >= from;
    const hold =
      note.endTime !== undefined && finite(note.endTime) && note.endTime > note.startTime;
    if (!hasHead && !(hold && (note.endTime as number) > from)) continue;
    const slot = Math.max(0, Math.min(254, slotOf(note))) + 1;
    const base = column * rows;
    if (hold) {
      const a = rowOf(Math.max(from, note.startTime));
      const b = rowOf(Math.min(to, note.endTime as number));
      fillRows(raster.bodies, base, rows, Math.min(a, b), Math.max(a, b), slot);
    }
    if (hasHead) {
      // Whole rows, so a one-pixel head never smears across two.
      const edge = Math.round(rowOf(note.startTime));
      const headFrom = later < 0 ? edge - head : edge;
      fillRows(raster.heads, base, rows, headFrom, headFrom + head, slot);
    }
  }
  return raster;
}

function fillRows(
  cells: Uint8Array,
  base: number,
  rows: number,
  from: number,
  to: number,
  value: number,
): void {
  let a = Math.floor(from);
  let b = Math.ceil(to);
  if (b <= a) b = a + 1;
  if (a < 0) a = 0;
  if (b > rows) b = rows;
  if (b <= a) return;
  cells.fill(value, base + a, base + b);
}

/** The few canvas calls painting needs, so tests can record them. */
export type RasterContext = Pick<CanvasRenderingContext2D, "fillRect"> & {
  fillStyle: CanvasRenderingContext2D["fillStyle"];
  globalAlpha: number;
};

export type ColumnBox = { x: number; width: number };

/**
 * Lane positions inside a strip in device pixels, whole pixels so edges stay
 * crisp, with a one-pixel gap between lanes once they are wide enough.
 */
export function overviewColumns(left: number, width: number, keyCount: number, dpr: number): ColumnBox[] {
  const keys = Math.max(1, Math.floor(keyCount));
  const lane = Math.max(0, width) / keys;
  const gap = lane >= 4 * dpr ? Math.max(1, Math.round(dpr)) : 0;
  const boxes: ColumnBox[] = [];
  for (let c = 0; c < keys; c++) {
    const x = Math.round(left + c * lane);
    const right = Math.round(left + (c + 1) * lane) - gap;
    boxes.push({ x, width: Math.max(1, right - x) });
  }
  return boxes;
}

/** Long note bodies are narrower and fainter than heads, as on the playfield. */
const BODY_WIDTH = 0.56;
const BODY_ALPHA = 0.5;

export function paintOverviewRaster(
  ctx: RasterContext,
  raster: OverviewRaster,
  columns: ColumnBox[],
  palette: readonly string[],
): void {
  const { rows } = raster;
  const previousAlpha = ctx.globalAlpha;
  for (const layer of ["bodies", "heads"] as const) {
    const cells = raster[layer];
    ctx.globalAlpha = layer === "bodies" ? BODY_ALPHA : 1;
    for (let c = 0; c < raster.columns && c < columns.length; c++) {
      const box = columns[c];
      let x = box.x;
      let w = box.width;
      if (layer === "bodies") {
        w = Math.max(1, Math.round(box.width * BODY_WIDTH));
        x = box.x + Math.floor((box.width - w) / 2);
      }
      const base = c * rows;
      let r = 0;
      while (r < rows) {
        const value = cells[base + r];
        if (!value) {
          r++;
          continue;
        }
        let end = r + 1;
        while (end < rows && cells[base + end] === value) end++;
        ctx.fillStyle = palette[value - 1] ?? "#ffffff";
        ctx.fillRect(x, r, w, end - r);
        r = end;
      }
    }
  }
  ctx.globalAlpha = previousAlpha;
}
