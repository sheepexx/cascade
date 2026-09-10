// Faces keep at least this much distance (in px) between their centers, so
// the scatter reads as spread out no matter where each one lands.
export const FLOAT_MIN_GAP_DESKTOP = 190;
export const FLOAT_MIN_GAP_PHONE = 130;

export const FLOAT_TOP_GAP_PX = 110;
export const FLOAT_EDGE_GAP_PX = 18;
export const FLOAT_UI_GAP_PX = 18;
export const FLOAT_GRID_STEP = 24;
export const FLOAT_CLEARANCE_CAP = 150;
export const FLOAT_SPREAD_WEIGHT = 10;
export const FLOAT_CLEARANCE_WEIGHT = 0.8;
export const FLOAT_JITTER_WEIGHT = 0.6;
export const FLOAT_TIP_ROOM_WEIGHT = 0.6;
export const FLOAT_ANCHOR_WEIGHT = 2.5;
export const FLOAT_ANCHOR_RANGE = 420;
export const FLOAT_TIP_WIDTH = 176;
export const FLOAT_TIP_HEIGHT = 136;
export const FLOAT_TIP_GAP = 8;
export const FLOAT_GUARD_SELECTOR = "[data-menu-guard]";
export const FLOAT_EDGE_EPSILON = 0.5;

export type FloatRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type SlotBoxes = {
  travel: FloatRect;
  above: FloatRect;
  below: FloatRect;
};

export type AvatarSlot = {
  x: number;
  y: number;
  size: number;
  driftX: number;
  bobY: number;
  tilt: number;
  duration: number;
  delay: number;
  tipAbove: boolean;
};

export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rectsOverlap(a: FloatRect, b: FloatRect): boolean {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

function rectGapSq(a: FloatRect, b: FloatRect): number {
  const dx = Math.max(b.left - a.right, a.left - b.right, 0);
  const dy = Math.max(b.top - a.bottom, a.top - b.bottom, 0);
  return dx * dx + dy * dy;
}

function rectInside(a: FloatRect, area: FloatRect): boolean {
  return (
    a.left >= area.left - FLOAT_EDGE_EPSILON &&
    a.top >= area.top - FLOAT_EDGE_EPSILON &&
    a.right <= area.right + FLOAT_EDGE_EPSILON &&
    a.bottom <= area.bottom + FLOAT_EDGE_EPSILON
  );
}

export function guardRects(root: HTMLElement): FloatRect[] {
  const base = root.getBoundingClientRect();
  const rects: FloatRect[] = [];
  root.ownerDocument
    .querySelectorAll<HTMLElement>(FLOAT_GUARD_SELECTOR)
    .forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      rects.push({
        left: box.left - base.left - FLOAT_UI_GAP_PX,
        top: box.top - base.top - FLOAT_UI_GAP_PX,
        right: box.right - base.left + FLOAT_UI_GAP_PX,
        bottom: box.bottom - base.top + FLOAT_UI_GAP_PX,
      });
    });
  return rects;
}

export function placementArea(root: HTMLElement): FloatRect {
  const base = root.getBoundingClientRect();
  const viewportBottom = (window.innerHeight || base.height) - base.top;
  return {
    left: FLOAT_EDGE_GAP_PX,
    top: Math.max(FLOAT_EDGE_GAP_PX, FLOAT_TOP_GAP_PX - base.top),
    right: base.width - FLOAT_EDGE_GAP_PX,
    bottom: Math.min(base.height, viewportBottom) - FLOAT_EDGE_GAP_PX,
  };
}

export function slotBoxes(slot: {
  x: number;
  y: number;
  size: number;
  driftX: number;
  bobY: number;
}): SlotBoxes {
  const { x, y, size, driftX, bobY } = slot;
  const centerX = x + size / 2;
  const left = centerX - FLOAT_TIP_WIDTH / 2;
  const right = centerX + FLOAT_TIP_WIDTH / 2 + driftX;
  return {
    travel: {
      left: x,
      top: y,
      right: x + size + driftX + 6,
      bottom: y + size + bobY + 6,
    },
    above: {
      left,
      top: y - FLOAT_TIP_GAP - FLOAT_TIP_HEIGHT,
      right,
      bottom: y - FLOAT_TIP_GAP + bobY,
    },
    below: {
      left,
      top: y + size + FLOAT_TIP_GAP,
      right,
      bottom: y + size + bobY + FLOAT_TIP_GAP + FLOAT_TIP_HEIGHT,
    },
  };
}

export function boxClear(
  box: FloatRect,
  area: FloatRect,
  guards: FloatRect[],
): boolean {
  return rectInside(box, area) && guards.every((g) => !rectsOverlap(box, g));
}

export function slotClear(
  slot: AvatarSlot,
  area: FloatRect,
  guards: FloatRect[],
): boolean {
  const boxes = slotBoxes(slot);
  if (!boxClear(boxes.travel, area, guards)) return false;
  return boxClear(slot.tipAbove ? boxes.above : boxes.below, area, guards);
}

export function rescaleSlot(
  slot: AvatarSlot,
  scaleX: number,
  scaleY: number,
  area: FloatRect,
): AvatarSlot {
  const maxX = Math.max(area.left, area.right - (slot.size + slot.driftX + 6));
  const maxY = Math.max(area.top, area.bottom - (slot.size + slot.bobY + 6));
  return {
    ...slot,
    x: Math.min(Math.max(slot.x * scaleX, area.left), maxX),
    y: Math.min(Math.max(slot.y * scaleY, area.top), maxY),
  };
}

export function makeSlot(
  phone: boolean,
  area: FloatRect,
  guards: FloatRect[],
  occupied: AvatarSlot[],
  anchor?: { x: number; y: number },
): AvatarSlot | null {
  const size = phone ? 34 + Math.random() * 8 : 48 + Math.random() * 8;
  const driftX = phone ? 26 + Math.random() * 22 : 44 + Math.random() * 34;
  const bobY = phone ? 12 + Math.random() * 10 : 18 + Math.random() * 14;
  const minGap = phone ? FLOAT_MIN_GAP_PHONE : FLOAT_MIN_GAP_DESKTOP;
  const maxX = area.right - (size + driftX + 6);
  const maxY = area.bottom - (size + bobY + 6);
  if (maxX < area.left || maxY < area.top) return null;

  const middle = (area.top + area.bottom) / 2;
  const build = (x: number, y: number, tipAbove: boolean): AvatarSlot => ({
    x,
    y,
    size,
    driftX,
    bobY,
    tipAbove,
    tilt: (Math.random() - 0.5) * 4,
    duration: phone
      ? 26_000 + Math.random() * 14_000
      : 36_000 + Math.random() * 20_000,
    delay: -Math.random() * 16_000,
  });

  let best: AvatarSlot | null = null;
  let bestScore = -Infinity;
  const startX = Math.min(area.left + Math.random() * FLOAT_GRID_STEP, maxX);
  const startY = Math.min(area.top + Math.random() * FLOAT_GRID_STEP, maxY);

  for (let y = startY; y <= maxY; y += FLOAT_GRID_STEP) {
    for (let x = startX; x <= maxX; x += FLOAT_GRID_STEP) {
      const boxes = slotBoxes({ x, y, size, driftX, bobY });
      if (guards.some((g) => rectsOverlap(boxes.travel, g))) continue;

      let nearest = FLOAT_CLEARANCE_CAP * FLOAT_CLEARANCE_CAP;
      for (const guard of guards) {
        const gap = rectGapSq(boxes.travel, guard);
        if (gap < nearest) nearest = gap;
      }
      let spacing = minGap;
      for (const other of occupied) {
        const dx = x + size / 2 - (other.x + other.size / 2);
        const dy = y + size / 2 - (other.y + other.size / 2);
        spacing = Math.min(spacing, Math.sqrt(dx * dx + dy * dy));
      }
      const above = boxClear(boxes.above, area, guards);
      const below = boxClear(boxes.below, area, guards);
      const pull = anchor
        ? Math.max(
            0,
            1 - Math.hypot(x - anchor.x, y - anchor.y) / FLOAT_ANCHOR_RANGE,
          )
        : 0;
      const score =
        (Math.min(spacing, minGap) / minGap) * FLOAT_SPREAD_WEIGHT +
        pull * FLOAT_ANCHOR_WEIGHT +
        (above || below ? FLOAT_TIP_ROOM_WEIGHT : 0) +
        (Math.sqrt(nearest) / FLOAT_CLEARANCE_CAP) * FLOAT_CLEARANCE_WEIGHT +
        Math.random() * FLOAT_JITTER_WEIGHT;
      if (score > bestScore) {
        bestScore = score;
        best = build(x, y, above === below ? y > middle : above);
      }
    }
  }

  return best;
}
