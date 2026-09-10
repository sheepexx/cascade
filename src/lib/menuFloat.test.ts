import { describe, expect, it } from "vitest";
import {
  FLOAT_EDGE_EPSILON,
  makeSlot,
  rescaleSlot,
  slotBoxes,
  type AvatarSlot,
  type FloatRect,
} from "./menuFloat";

const AREA: FloatRect = { left: 18, top: 110, right: 1422, bottom: 792 };

const MENU_GUARDS: FloatRect[] = [
  { left: -18, top: 319, right: 1458, bottom: 491 },
  { left: 446, top: 207, right: 842, bottom: 603 },
  { left: 542, top: 252, right: 898, bottom: 330 },
  { left: 1132, top: 742, right: 1440, bottom: 810 },
];

function overlaps(a: FloatRect, b: FloatRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function inside(a: FloatRect, area: FloatRect): boolean {
  return (
    a.left >= area.left - FLOAT_EDGE_EPSILON &&
    a.top >= area.top - FLOAT_EDGE_EPSILON &&
    a.right <= area.right + FLOAT_EDGE_EPSILON &&
    a.bottom <= area.bottom + FLOAT_EDGE_EPSILON
  );
}

function place(guards: FloatRect[], occupied: AvatarSlot[] = []): AvatarSlot {
  const slot = makeSlot(false, AREA, guards, occupied);
  expect(slot).not.toBeNull();
  return slot as AvatarSlot;
}

describe("makeSlot", () => {
  it("keeps the face and its drift clear of every guard", () => {
    for (let i = 0; i < 40; i++) {
      const boxes = slotBoxes(place(MENU_GUARDS));
      expect(inside(boxes.travel, AREA)).toBe(true);
      for (const guard of MENU_GUARDS) {
        expect(overlaps(boxes.travel, guard)).toBe(false);
      }
    }
  });

  it("points the hover card at the side that stays clear", () => {
    const clear = (box: FloatRect) =>
      inside(box, AREA) && MENU_GUARDS.every((guard) => !overlaps(box, guard));
    for (let i = 0; i < 40; i++) {
      const slot = place(MENU_GUARDS);
      const boxes = slotBoxes(slot);
      if (!clear(boxes.above) && !clear(boxes.below)) continue;
      expect(clear(slot.tipAbove ? boxes.above : boxes.below)).toBe(true);
    }
  });

  it("takes the lanes beside a blocked middle", () => {
    const column: FloatRect[] = [
      { left: 320, top: -18, right: 1120, bottom: 828 },
    ];
    for (let i = 0; i < 20; i++) {
      const boxes = slotBoxes(place(column));
      expect(boxes.travel.right <= 320 || boxes.travel.left >= 1120).toBe(true);
    }
  });

  it("spreads a full cast apart", () => {
    for (let round = 0; round < 10; round++) {
      const placed: AvatarSlot[] = [];
      for (let i = 0; i < 4; i++) placed.push(place(MENU_GUARDS, placed));
      for (let a = 0; a < placed.length; a++) {
        for (let b = a + 1; b < placed.length; b++) {
          const dx =
            placed[a].x + placed[a].size / 2 - (placed[b].x + placed[b].size / 2);
          const dy =
            placed[a].y + placed[a].size / 2 - (placed[b].y + placed[b].size / 2);
          expect(Math.hypot(dx, dy)).toBeGreaterThan(140);
        }
      }
    }
  });

  it("still seats a face when no side has room for the card", () => {
    const cramped: FloatRect = { left: 0, top: 0, right: 420, bottom: 200 };
    for (let i = 0; i < 20; i++) {
      const slot = makeSlot(false, cramped, [], []);
      expect(slot).not.toBeNull();
      expect(inside(slotBoxes(slot as AvatarSlot).travel, cramped)).toBe(true);
    }
  });

  it("gives up when the window leaves no room at all", () => {
    expect(makeSlot(false, { left: 0, top: 0, right: 60, bottom: 60 }, [], [])).toBeNull();
  });
});

describe("makeSlot with an anchor", () => {
  it("reseats a covered face near where it was", () => {
    for (let i = 0; i < 20; i++) {
      const slot = place(MENU_GUARDS);
      const covered: FloatRect = {
        left: slot.x - 40,
        top: slot.y - 40,
        right: slot.x + 160,
        bottom: slot.y + 160,
      };
      const guards = [...MENU_GUARDS, covered];
      const moved = makeSlot(false, AREA, guards, [], { x: slot.x, y: slot.y });
      expect(moved).not.toBeNull();
      const boxes = slotBoxes(moved as AvatarSlot);
      for (const guard of guards) {
        expect(overlaps(boxes.travel, guard)).toBe(false);
      }
      const dx = (moved as AvatarSlot).x - slot.x;
      const dy = (moved as AvatarSlot).y - slot.y;
      expect(Math.hypot(dx, dy)).toBeLessThan(420);
    }
  });
});

describe("rescaleSlot", () => {
  it("carries a face across a resize instead of dropping it", () => {
    const slot = place(MENU_GUARDS);
    const grown: FloatRect = { left: 18, top: 110, right: 1902, bottom: 1062 };
    const moved = rescaleSlot(slot, 1902 / 1422, 1062 / 792, grown);
    expect(moved.size).toBe(slot.size);
    expect(moved.x).toBeGreaterThan(slot.x - 1);
    expect(moved.y).toBeGreaterThan(slot.y - 1);
    expect(inside(slotBoxes(moved).travel, grown)).toBe(true);
  });

  it("keeps a face on screen when the window shrinks", () => {
    const shrunk: FloatRect = { left: 18, top: 110, right: 800, bottom: 500 };
    for (let i = 0; i < 20; i++) {
      const moved = rescaleSlot(place(MENU_GUARDS), 800 / 1422, 500 / 792, shrunk);
      expect(inside(slotBoxes(moved).travel, shrunk)).toBe(true);
    }
  });
});
