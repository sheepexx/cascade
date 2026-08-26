import { MAX_SCROLL_SPEED, MIN_SCROLL_SPEED } from "../types";

export const MIN_PLAYFIELD_SCALE = 0.5;
export const MAX_PLAYFIELD_SCALE = 2.5;
export const PLAYFIELD_SCALE_STEP = 0.05;

function wheelDirection(deltaY: number): -1 | 0 | 1 {
  if (deltaY === 0) return 0;
  return deltaY < 0 ? 1 : -1;
}

export function timelineZoomFromWheel(
  current: number,
  deltaY: number,
): number {
  const direction = wheelDirection(deltaY);
  return Math.max(
    MIN_SCROLL_SPEED,
    Math.min(MAX_SCROLL_SPEED, current + direction),
  );
}

export function playfieldScaleFromWheel(
  current: number,
  deltaY: number,
): number {
  const direction = wheelDirection(deltaY);
  return (
    Math.round(
      Math.max(
        MIN_PLAYFIELD_SCALE,
        Math.min(
          MAX_PLAYFIELD_SCALE,
          current + direction * PLAYFIELD_SCALE_STEP,
        ),
      ) * 100,
    ) / 100
  );
}

export const VOLUME_STEP = 0.05;

export function volumeFromWheel(current: number, deltaY: number): number {
  const direction = wheelDirection(deltaY);
  const safeCurrent = Number.isFinite(current) ? current : 0;
  return (
    Math.round(
      Math.max(0, Math.min(1, safeCurrent + direction * VOLUME_STEP)) * 100,
    ) / 100
  );
}
