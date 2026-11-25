import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCK_LAYOUT,
  DOCK_PANELS,
  applyDockDrop,
  computeDock,
  dockDropAt,
  locatePanel,
  movePanelToEdge,
  normalizeDockLayout,
  sameDockLayout,
  nearestCorner,
  cornerRect,
  type DockOrientation,
  type DockPanelId,
  type DockSize,
} from "./editorDock";

const FRAME = { w: 1600, h: 900 };

const SIZES: Record<DockPanelId, Record<DockOrientation, Omit<DockSize, "visible">>> = {
  header: { horizontal: { cross: 52, length: null }, vertical: { cross: 216, length: null } },
  transport: { horizontal: { cross: 44, length: null }, vertical: { cross: 216, length: 220 } },
  difficulties: { horizontal: { cross: 84, length: null }, vertical: { cross: 240, length: null } },
  info: { horizontal: { cross: 90, length: 420 }, vertical: { cross: 240, length: 200 } },
  skillsets: { horizontal: { cross: 48, length: null }, vertical: { cross: 56, length: null } },
  timeline: { horizontal: { cross: 96, length: null }, vertical: { cross: 96, length: null } },
};

const sizeOf =
  (hidden: DockPanelId[] = []) =>
  (id: DockPanelId, orientation: DockOrientation): DockSize => ({
    visible: !hidden.includes(id),
    ...SIZES[id][orientation],
  });

describe("normalizeDockLayout", () => {
  it("falls back to the default for junk", () => {
    expect(sameDockLayout(normalizeDockLayout(null), DEFAULT_DOCK_LAYOUT)).toBe(true);
    expect(sameDockLayout(normalizeDockLayout({ strips: "x" }), DEFAULT_DOCK_LAYOUT)).toBe(true);
  });

  it("keeps each panel once, drops unknowns and empty strips, restores missing ones", () => {
    const layout = normalizeDockLayout({
      strips: [
        { edge: "right", panels: ["timeline", "timeline", "nope"] },
        { edge: "middle", panels: ["header"] },
        { edge: "top", panels: [] },
        { edge: "top", panels: ["header"] },
      ],
    });
    const all = layout.strips.flatMap((s) => s.panels);
    expect(all.sort()).toEqual([...DOCK_PANELS].sort());
    expect(layout.strips[0]).toEqual({ edge: "right", panels: ["timeline"] });
    expect(layout.strips.every((s) => s.panels.length > 0)).toBe(true);
    // The missing transport joins the existing top strip, as the default has it on top.
    expect(locatePanel(layout, "transport")?.edge).toBe("top");
  });
});

describe("computeDock", () => {
  it("reproduces the classic arrangement", () => {
    const g = computeDock(DEFAULT_DOCK_LAYOUT, FRAME, sizeOf());
    expect(g.panels.header.rect).toEqual({ x: 0, y: 0, w: 1600, h: 52 });
    expect(g.panels.difficulties.rect.x).toBe(0);
    expect(g.panels.difficulties.rect.y).toBe(52);
    // The stats keep their own height under the list, which takes the rest.
    expect(g.panels.info.rect.h).toBe(200);
    expect(g.panels.difficulties.rect.h).toBe(900 - 52 - 200);
    expect(g.panels.transport.rect).toEqual({ x: 240, y: 52, w: 1360, h: 44 });
    expect(g.panels.timeline.rect).toEqual({ x: 240, y: 900 - 96, w: 1360, h: 96 });
    expect(g.panels.skillsets.rect.y).toBe(900 - 96 - 48);
    expect(g.center).toEqual({ x: 240, y: 96, w: 1360, h: 900 - 96 - 96 - 48 });
  });

  it("gives hidden panels no room but a place", () => {
    const g = computeDock(DEFAULT_DOCK_LAYOUT, FRAME, sizeOf(["difficulties", "info"]));
    expect(g.panels.difficulties.visible).toBe(false);
    expect(g.panels.difficulties.rect.w).toBe(0);
    expect(g.panels.transport.rect.x).toBe(0);
    expect(g.center.x).toBe(0);
  });

  it("lets a lone natural-length panel fill its strip", () => {
    const layout = normalizeDockLayout({
      strips: [
        { edge: "top", panels: ["header"] },
        { edge: "right", panels: ["info"] },
      ],
    });
    // The restored transport shares the header's strip, so only that is above it.
    const g = computeDock(layout, FRAME, sizeOf());
    expect(g.panels.info.rect.h).toBe(900 - 52);
  });

  it("never lets a strip swallow the playfield", () => {
    const g = computeDock(DEFAULT_DOCK_LAYOUT, { w: 300, h: 200 }, sizeOf());
    expect(g.center.w).toBeGreaterThan(0);
    expect(g.center.h).toBeGreaterThanOrEqual(0);
  });
});

describe("drops", () => {
  it("swaps two panels' places", () => {
    const next = applyDockDrop(DEFAULT_DOCK_LAYOUT, "timeline", { kind: "swap", target: "transport" });
    expect(locatePanel(next, "timeline")?.edge).toBe("top");
    expect(locatePanel(next, "transport")?.edge).toBe("bottom");
  });

  it("slots a panel in beside another and closes the strip it left", () => {
    const next = applyDockDrop(DEFAULT_DOCK_LAYOUT, "skillsets", {
      kind: "insert",
      target: "timeline",
      after: true,
    });
    const at = locatePanel(next, "timeline")!;
    expect(next.strips[at.strip].panels).toEqual(["timeline", "skillsets"]);
    expect(next.strips).toHaveLength(DEFAULT_DOCK_LAYOUT.strips.length - 1);
  });

  it("starts new strips inside or outside the rest", () => {
    const inner = applyDockDrop(DEFAULT_DOCK_LAYOUT, "timeline", { kind: "edge", edge: "right", outer: false });
    expect(inner.strips[inner.strips.length - 1]).toEqual({ edge: "right", panels: ["timeline"] });
    const outer = applyDockDrop(DEFAULT_DOCK_LAYOUT, "timeline", { kind: "edge", edge: "right", outer: true });
    expect(outer.strips[0]).toEqual({ edge: "right", panels: ["timeline"] });
  });

  it("moves to an edge from the keyboard, and does nothing when already there", () => {
    const moved = movePanelToEdge(DEFAULT_DOCK_LAYOUT, "timeline", "right");
    expect(locatePanel(moved, "timeline")?.edge).toBe("right");
    expect(movePanelToEdge(moved, "timeline", "right")).toBe(moved);
  });

  it("reads the pointer: window edge, panel ends, panel middle, playfield edge", () => {
    const g = computeDock(DEFAULT_DOCK_LAYOUT, FRAME, sizeOf());
    expect(dockDropAt(g, FRAME, "timeline", 1590, 450)).toEqual({ kind: "edge", edge: "right", outer: true });
    // The transport spans x 240..1600; its first quarter inserts before it.
    expect(dockDropAt(g, FRAME, "timeline", 260, 70)).toEqual({ kind: "insert", target: "transport", after: false });
    expect(dockDropAt(g, FRAME, "timeline", 900, 70)).toEqual({ kind: "swap", target: "transport" });
    expect(dockDropAt(g, FRAME, "timeline", 1500, 450)).toEqual({ kind: "edge", edge: "right", outer: false });
    // Over itself, or the middle of the playfield, is not a drop.
    expect(dockDropAt(g, FRAME, "timeline", 900, 860)).toBeNull();
    expect(dockDropAt(g, FRAME, "timeline", 920, 450)).toBeNull();
  });
});

describe("corners", () => {
  const area = { x: 100, y: 50, w: 800, h: 600 };
  it("snaps to the nearest corner from anywhere", () => {
    expect(nearestCorner(area, 120, 70)).toBe("top-left");
    expect(nearestCorner(area, 880, 70)).toBe("top-right");
    expect(nearestCorner(area, 499, 600)).toBe("bottom-left");
    expect(nearestCorner(area, 2000, 2000)).toBe("bottom-right");
  });
  it("tucks a widget into a corner", () => {
    expect(cornerRect(area, "bottom-right", { w: 200, h: 40 })).toEqual({ x: 688, y: 598, w: 200, h: 40 });
    expect(cornerRect(area, "top-left", { w: 200, h: 40 })).toEqual({ x: 112, y: 62, w: 200, h: 40 });
  });
});
