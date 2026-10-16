import { describe, expect, it } from "vitest";
import {
  OVERVIEW_EDGE,
  OVERVIEW_MAX_ZOOM,
  OVERVIEW_MIN_HEIGHT,
  OVERVIEW_MIN_WIDTH,
  OVERVIEW_MIN_ZOOM,
  defaultOverviewRect,
  normalizeMapOverviewLayout,
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
  type OverviewRaster,
} from "./mapOverview";
import { notesByTime } from "./notesMemo";
import { DEFAULT_APP_SETTINGS, makeRedPoint, type ManiaNote } from "../types";

const note = (column: number, startTime: number, endTime?: number): ManiaNote => ({
  id: `${column}-${startTime}`,
  column,
  startTime,
  endTime,
});

/** Rows of one column that hold something, as [first, last] runs. */
function runs(cells: Uint8Array, raster: OverviewRaster, column: number): [number, number][] {
  const out: [number, number][] = [];
  const base = column * raster.rows;
  for (let r = 0; r < raster.rows; r++) {
    if (!cells[base + r]) continue;
    const last = out[out.length - 1];
    if (last && last[1] === r - 1) last[1] = r;
    else out.push([r, r]);
  }
  return out;
}

describe("normalizeMapOverviewLayout", () => {
  it("starts off, in fit mode, with no saved spot", () => {
    expect(normalizeMapOverviewLayout(undefined)).toEqual(DEFAULT_APP_SETTINGS.mapOverview);
    expect(normalizeMapOverviewLayout("nonsense")).toEqual(DEFAULT_APP_SETTINGS.mapOverview);
    expect(DEFAULT_APP_SETTINGS.showMapOverview).toBe(false);
  });

  it("keeps a valid layout and repairs a broken one", () => {
    const rect = { side: "left" as const, x: 20, y: 30, width: 200, height: 400 };
    expect(normalizeMapOverviewLayout({ mode: "scroll", zoom: 90, rect })).toEqual({
      mode: "scroll",
      zoom: 90,
      rect,
    });
    const repaired = normalizeMapOverviewLayout({
      mode: "sideways",
      zoom: 1e9,
      rect: { side: "right", x: -5, y: 10, width: 1, height: 2 },
    });
    expect(repaired.mode).toBe("fit");
    expect(repaired.zoom).toBe(OVERVIEW_MAX_ZOOM);
    expect(repaired.rect).toEqual({
      side: "right",
      x: 0,
      y: 10,
      width: OVERVIEW_MIN_WIDTH,
      height: OVERVIEW_MIN_HEIGHT,
    });
    expect(normalizeMapOverviewLayout({ zoom: 0.1 }).zoom).toBe(OVERVIEW_MIN_ZOOM);
    expect(normalizeMapOverviewLayout({ rect: { side: "top", x: 1, y: 1, width: 300, height: 300 } }).rect).toBeNull();
  });
});

describe("panel placement", () => {
  const container = { width: 1360, height: 700 };

  it("puts a new panel at the bottom right, beside the playfield", () => {
    const rect = defaultOverviewRect(container, 870);
    expect(rect.side).toBe("right");
    expect(rect.x).toBe(12);
    expect(rect.width).toBeLessThanOrEqual(1360 - 870 - 24);
    const box = placeOverviewRect(rect, container);
    expect(box.top + box.height).toBeLessThanOrEqual(700 - 64);
  });

  it("keeps a right-hand panel on the right when the editor narrows", () => {
    const rect = storeOverviewRect({ left: 1000, top: 40, width: 180, height: 500 }, 1200);
    expect(rect).toEqual({ side: "right", x: 20, y: 40, width: 180, height: 500 });
    expect(placeOverviewRect(rect, { width: 900, height: 800 })).toEqual({
      left: 700,
      top: 40,
      width: 180,
      height: 500,
    });
  });

  it("never leaves the panel out of reach", () => {
    const lost = { side: "left" as const, x: 5000, y: 5000, width: 2000, height: 2000 };
    const box = placeOverviewRect(lost, { width: 600, height: 400 });
    expect(box.left).toBeGreaterThanOrEqual(OVERVIEW_EDGE);
    expect(box.top).toBeGreaterThanOrEqual(OVERVIEW_EDGE);
    expect(box.left + box.width).toBeLessThanOrEqual(600 - OVERVIEW_EDGE);
    expect(box.top + box.height).toBeLessThanOrEqual(400 - OVERVIEW_EDGE);
  });
});

describe("overviewSpan", () => {
  it("covers the song and any note past its end", () => {
    const index = notesByTime([note(0, 1000), note(1, 2000, 9000), note(2, 30000)]);
    expect(overviewSpan(index, 60000)).toEqual({ start: 0, end: 60000 });
    expect(overviewSpan(index, 20000)).toEqual({ start: 0, end: 30000 });
    expect(overviewSpan(notesByTime([note(0, 1000, 99000), note(1, 5000)]), 0)).toEqual({ start: 0, end: 99000 });
    expect(overviewSpan(notesByTime([note(0, -400)]), 0)).toEqual({ start: -400, end: 600 });
  });

  it("gives an empty map without audio a usable span", () => {
    const span = overviewSpan(notesByTime([]), 0);
    expect(span.end - span.start).toBeGreaterThan(0);
  });
});

describe("overviewGrid", () => {
  const bars = overviewBars([makeRedPoint(250, 120)]);
  const view = { width: 300, height: 400 };

  it("cuts strips on the first red line's bars", () => {
    expect(bars).toEqual({ time: 250, barMs: 2000 });
    const grid = overviewGrid({ start: 0, end: 180000 }, bars, view, 4, { mode: "fit", zoom: 48 }, false);
    expect(grid.origin).toBe(-1750);
    expect(grid.stripMs % 2000).toBe(0);
    expect(stripStart(grid, 3) - grid.origin).toBe(3 * grid.stripMs);
  });

  it("fits the whole map in the panel, splitting it into several strips", () => {
    const grid = overviewGrid({ start: 0, end: 180000 }, bars, view, 4, { mode: "fit", zoom: 48 }, false);
    expect(grid.strips).toBeGreaterThan(1);
    expect(grid.origin + grid.strips * grid.stripMs).toBeGreaterThanOrEqual(180000);
    expect(grid.contentWidth).toBe(view.width);
    expect(stripLeft(grid, grid.strips - 1) + grid.stripWidth).toBeLessThanOrEqual(view.width);
  });

  it("gives a short map fewer, wider strips", () => {
    const short = overviewGrid({ start: 0, end: 20000 }, bars, view, 4, { mode: "fit", zoom: 48 }, false);
    const long = overviewGrid({ start: 0, end: 600000 }, bars, view, 4, { mode: "fit", zoom: 48 }, false);
    expect(short.strips).toBeLessThan(long.strips);
    expect(short.laneWidth).toBeGreaterThanOrEqual(long.laneWidth);
  });

  it("keeps the zoom in scrollable mode and runs past the panel", () => {
    const grid = overviewGrid({ start: 0, end: 180000 }, bars, view, 7, { mode: "scroll", zoom: 120 }, false);
    expect(grid.pxPerMs * 1000).toBeGreaterThanOrEqual(120);
    expect(grid.contentWidth).toBeGreaterThan(view.width);
    // Zoomed out past the fit, it shows the fit.
    const fit = overviewGrid({ start: 0, end: 20000 }, bars, view, 4, { mode: "fit", zoom: 48 }, false);
    const out = overviewGrid({ start: 0, end: 20000 }, bars, view, 4, { mode: "scroll", zoom: OVERVIEW_MIN_ZOOM }, false);
    expect(out.stripMs).toBe(fit.stripMs);
  });

  it("lays out every key count from 1K to 18K", () => {
    for (let keys = 1; keys <= 18; keys++) {
      const grid = overviewGrid({ start: 0, end: 240000 }, bars, { width: 176, height: 500 }, keys, { mode: "fit", zoom: 48 }, false);
      expect(grid.stripWidth).toBe(grid.laneWidth * keys);
      expect(grid.laneWidth).toBeGreaterThanOrEqual(1);
      expect(stripLeft(grid, grid.strips - 1) + grid.stripWidth).toBeLessThanOrEqual(grid.contentWidth);
    }
  });

  it("maps a click back to the time it was drawn at, either way up", () => {
    for (const upscroll of [false, true]) {
      const grid = overviewGrid({ start: -500, end: 90000 }, bars, view, 4, { mode: "scroll", zoom: 120 }, upscroll);
      for (const time of [-400, 0, 1234.5, 45000, 89999]) {
        const strip = stripOf(grid, time);
        const x = stripLeft(grid, strip) + grid.stripWidth / 2;
        expect(overviewTimeAt(grid, x, stripY(grid, strip, time))).toBeCloseTo(time, 6);
      }
      // A point in the gap goes to the nearer strip, and nothing leaves the map.
      expect(overviewTimeAt(grid, stripLeft(grid, 1) - 1, grid.chartBottom)).toBeGreaterThanOrEqual(stripStart(grid, 1) - 1e-9);
      expect(overviewTimeAt(grid, -50, upscroll ? 0 : grid.height)).toBe(-500);
    }
  });

  it("lists only the strips in view", () => {
    const grid = overviewGrid({ start: 0, end: 600000 }, bars, view, 7, { mode: "scroll", zoom: 200 }, false);
    const pitch = grid.stripWidth + grid.gap;
    const [first, last] = visibleStrips(grid, pitch * 10, view.width);
    expect(first).toBe(10);
    expect(last).toBeLessThan(grid.strips);
    expect(stripLeft(grid, last)).toBeLessThan(pitch * 10 + view.width);
    expect(stripLeft(grid, last + 1)).toBeGreaterThanOrEqual(pitch * 10 + view.width);
  });
});

describe("overviewBarLines", () => {
  const points = [makeRedPoint(0, 120)];

  it("draws every bar when there is room", () => {
    // 120 BPM in 4/4: a bar every 2 seconds.
    expect(overviewBarLines(points, 0, 8000, 0.01, 4)).toEqual([0, 2000, 4000, 6000, 8000]);
  });

  it("thins crowded bars to every 2nd, 4th, 8th… bar", () => {
    // 2s bars at 2px apart need every 2nd bar for 4px of room; at 1px, every 4th.
    expect(overviewBarLines(points, 0, 16000, 0.001, 4)).toEqual([0, 4000, 8000, 12000, 16000]);
    expect(overviewBarLines(points, 0, 32000, 0.0005, 4)).toEqual([0, 8000, 16000, 24000, 32000]);
  });

  it("counts bars from each red line", () => {
    const changed = [makeRedPoint(0, 120), makeRedPoint(5000, 60)];
    expect(overviewBarLines(changed, 0, 13000, 0.01, 4)).toEqual([0, 2000, 4000, 5000, 9000, 13000]);
  });
});

describe("rasterizeOverview", () => {
  // One strip of 4 seconds drawn 400 rows tall, later notes higher up.
  const map = { base: 400, slope: -0.1 };

  it("keeps a staircase looking like a staircase", () => {
    const stairs = notesByTime([note(0, 500), note(1, 1000), note(2, 1500), note(3, 2000)]);
    const raster = rasterizeOverview(stairs, 4, 0, 4000, map, 400, 2, () => 0);
    const heads = [0, 1, 2, 3].map((c) => runs(raster.heads, raster, c));
    for (const column of heads) expect(column).toHaveLength(1);
    // Each later note sits higher (a smaller row), 50 rows apart.
    for (let c = 1; c < 4; c++) expect(heads[c - 1][0][0] - heads[c][0][0]).toBe(50);
    // A head ends on its own time's row.
    expect(heads[0][0]).toEqual([348, 349]);
  });

  it("draws a long note's whole body behind its head", () => {
    const hold = notesByTime([note(2, 1000, 3000)]);
    const raster = rasterizeOverview(hold, 4, 0, 4000, map, 400, 2, () => 0);
    const body = runs(raster.bodies, raster, 2);
    expect(body).toEqual([[100, 299]]);
    expect(runs(raster.heads, raster, 2)).toHaveLength(1);
  });

  it("carries a hold across a strip boundary without a second head", () => {
    const hold = notesByTime([note(0, 3000, 5000)]);
    const next = { base: 800, slope: -0.1 }; // the strip from 4000 to 8000
    const raster = rasterizeOverview(hold, 1, 4000, 8000, next, 400, 2, () => 0);
    expect(runs(raster.bodies, raster, 0)).toEqual([[300, 399]]);
    expect(runs(raster.heads, raster, 0)).toEqual([]);
  });

  it("leaves notes of the next strip to it", () => {
    const notes = notesByTime([note(0, 3999), note(1, 4000)]);
    // With the strip's padding above it, as the panel draws it.
    const raster = rasterizeOverview(notes, 2, 0, 4000, { base: 406, slope: -0.1 }, 412, 2, () => 0);
    expect(runs(raster.heads, raster, 0)).toHaveLength(1);
    expect(runs(raster.heads, raster, 1)).toEqual([]);
  });

  it("skips notes outside the key count instead of failing", () => {
    const odd = notesByTime([note(-1, 500), note(9, 600), note(1.5, 700), { id: "x", column: 0, startTime: NaN }]);
    const raster = rasterizeOverview(odd, 4, 0, 4000, map, 400, 2, () => 0);
    expect(raster.heads.every((v) => v === 0)).toBe(true);
  });

  it("stores the colour slot it was given", () => {
    const notes = notesByTime([note(0, 1000), note(1, 1000)]);
    const raster = rasterizeOverview(notes, 2, 0, 4000, map, 400, 4, (n) => n.column * 3);
    const [[from, to]] = runs(raster.heads, raster, 1);
    expect(to - from + 1).toBe(4);
    expect(raster.heads[raster.rows + from]).toBe(4);
  });

  it("follows the grid's own strip mapping", () => {
    const grid = overviewGrid({ start: 0, end: 60000 }, null, { width: 300, height: 400 }, 4, { mode: "scroll", zoom: 100 }, false);
    const rows = stripRows(grid, 2, 2);
    const time = stripStart(grid, 2) + 700;
    expect(rows.base + rows.slope * time).toBeCloseTo(stripY(grid, 2, time) * 2, 6);
  });

  it("paints one rectangle per run, not per note", () => {
    // A dense stream at this scale merges into one solid run.
    const stream = notesByTime(Array.from({ length: 200 }, (_, i) => note(0, 1000 + i * 5)));
    const raster = rasterizeOverview(stream, 1, 0, 4000, map, 400, 2, () => 0);
    const calls: number[][] = [];
    const ctx = {
      fillStyle: "",
      globalAlpha: 1,
      fillRect: (...args: number[]) => calls.push(args),
    };
    paintOverviewRaster(ctx, raster, overviewColumns(0, 40, 1, 1), ["#fff"]);
    expect(calls).toHaveLength(1);
  });
});

describe("overviewColumns", () => {
  it("splits a strip into whole-pixel lanes", () => {
    for (let keys = 1; keys <= 18; keys++) {
      const boxes = overviewColumns(100, keys * 6, keys, 1);
      expect(boxes).toHaveLength(keys);
      expect(boxes[0].x).toBe(100);
      for (let i = 1; i < boxes.length; i++) {
        expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width);
      }
      const last = boxes[boxes.length - 1];
      expect(last.x + last.width).toBeLessThanOrEqual(100 + keys * 6);
      expect(boxes.every((b) => Number.isInteger(b.x) && b.width >= 1)).toBe(true);
    }
  });
});
