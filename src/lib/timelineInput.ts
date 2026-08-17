export const TIMELINE_DRAG_SLOP_PX = 4;

/** Distinguishes a deliberate timeline scrub from normal click jitter. */
export function timelineDragStarted(startX: number, currentX: number): boolean {
  return Math.abs(currentX - startX) >= TIMELINE_DRAG_SLOP_PX;
}
