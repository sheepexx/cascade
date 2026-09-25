import {
  HUD_ELEMENTS,
  type HudElementId,
  type HudPlacement,
  type PlaytestSettings,
} from "../types";

export const DEFAULT_HUD_PLACEMENT: HudPlacement = { x: 0, y: 0, scale: 1 };
export const HUD_PANEL_WIDTH = 320;
/** Fit the whole gameplay viewport beside the panel without reflowing it. */
export function hudPreviewGeometry(width: number, height: number) {
  const stageWidth = Math.max(1, width);
  const stageHeight = Math.max(1, height);
  const left = Math.min(HUD_PANEL_WIDTH, stageWidth - 1);
  const scale = (stageWidth - left) / stageWidth;
  return {
    width: stageWidth,
    height: stageHeight,
    left,
    top: (stageHeight * (1 - scale)) / 2,
    scale,
  };
}

export type PlayfieldBounds = { left: number; width: number; hitY: number; height: number };
export const MIN_HUD_SCALE = 0.5;
export const MAX_HUD_SCALE = 2;
const MAX_HUD_OFFSET = 4000;

/** The setting that shows or hides each element. */
export const HUD_VISIBILITY: Record<HudElementId, keyof PlaytestSettings> = {
  combo: "showCombo",
  judgement: "showJudgements",
  accuracy: "showAccuracy",
  counts: "showCounts",
  errorBar: "showErrorBar",
  keys: "showKeys",
  npsGraph: "showNpsGraph",
  runStats: "showRunStats",
};

export function hudPlacement(
  hud: PlaytestSettings["hud"] | undefined,
  id: HudElementId,
): HudPlacement {
  return hud?.[id] ?? DEFAULT_HUD_PLACEMENT;
}

export function isDefaultPlacement(placement: HudPlacement): boolean {
  return placement.x === 0 && placement.y === 0 && placement.scale === 1;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** A saved layout with unknown elements dropped and every value in range. */
export function normalizeHudLayout(saved: unknown): PlaytestSettings["hud"] {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  const raw = saved as Record<string, unknown>;
  const out: PlaytestSettings["hud"] = {};
  for (const id of HUD_ELEMENTS) {
    const entry = raw[id];
    if (!entry || typeof entry !== "object") continue;
    const { x, y, scale } = entry as Record<string, unknown>;
    const placement: HudPlacement = {
      x: typeof x === "number" && Number.isFinite(x) ? Math.round(clamp(x, -MAX_HUD_OFFSET, MAX_HUD_OFFSET)) : 0,
      y: typeof y === "number" && Number.isFinite(y) ? Math.round(clamp(y, -MAX_HUD_OFFSET, MAX_HUD_OFFSET)) : 0,
      scale:
        typeof scale === "number" && Number.isFinite(scale)
          ? Math.round(clamp(scale, MIN_HUD_SCALE, MAX_HUD_SCALE) * 100) / 100
          : 1,
    };
    if (!isDefaultPlacement(placement)) out[id] = placement;
  }
  return out;
}

/** The layout with one element moved, leaving defaults out of it. */
export function withPlacement(
  hud: PlaytestSettings["hud"],
  id: HudElementId,
  placement: HudPlacement,
): PlaytestSettings["hud"] {
  const next = { ...hud };
  if (isDefaultPlacement(placement)) delete next[id];
  else next[id] = placement;
  return next;
}
