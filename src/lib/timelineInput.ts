import type { AudioSeekTransition } from "./audioSeek";

export const TIMELINE_DRAG_SLOP_PX = 4;

export type TimelineSeekPhase = "press" | "drag" | "release";

/** Distinguishes a deliberate timeline scrub from normal click jitter. */
export function timelineDragStarted(startX: number, currentX: number): boolean {
  return Math.abs(currentX - startX) >= TIMELINE_DRAG_SLOP_PX;
}

/** Clicks get a readable glide; active scrubbing gets a tighter smooth filter. */
export function timelineSeekTransition(
  phase: TimelineSeekPhase,
): AudioSeekTransition {
  return phase === "press" ? "smooth" : "scrub";
}
