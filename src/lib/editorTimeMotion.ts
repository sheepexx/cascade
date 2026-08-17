import type { AudioSeekTransition } from "./audioSeek";

export const EDITOR_SEEK_GLIDE_MS = 240;

export type EditorSeekMotion = {
  renderedTime: number;
  smoothFrom: number | null;
  smoothTarget: number | null;
};

/**
 * Applies an explicit seek to the editor's visual clock.
 *
 * Smooth seeks use a fixed wall-clock duration, regardless of distance.
 * Repeated input rebases from the currently rendered frame, so retargeting is
 * continuous and the final input still has a strict completion deadline.
 */
export function applyEditorSeek(
  renderedTime: number,
  targetTime: number,
  transition: AudioSeekTransition,
  allowSmooth: boolean,
): EditorSeekMotion {
  if (!Number.isFinite(targetTime)) {
    return {
      renderedTime,
      smoothFrom: null,
      smoothTarget: null,
    };
  }
  if (transition !== "smooth" || !allowSmooth) {
    return {
      renderedTime: targetTime,
      smoothFrom: null,
      smoothTarget: null,
    };
  }
  if (Math.abs(targetTime - renderedTime) < 0.001) {
    return {
      renderedTime: targetTime,
      smoothFrom: null,
      smoothTarget: null,
    };
  }
  return {
    renderedTime,
    smoothFrom: renderedTime,
    smoothTarget: targetTime,
  };
}

/** Advances a bounded ease-out glide using total wall time since the seek. */
export function nextEditorRenderTime(
  fromTime: number,
  targetTime: number,
  elapsedMs: number,
  smooth: boolean,
): number {
  if (!Number.isFinite(targetTime)) return fromTime;
  if (!smooth || !Number.isFinite(fromTime)) return targetTime;

  const progress = Math.min(1, Math.max(0, elapsedMs / EDITOR_SEEK_GLIDE_MS));
  if (progress >= 1) return targetTime;
  // Ease-out sine keeps the first painted frame close enough to the origin
  // that the motion reads as a glide, without adding a sluggish ease-in delay.
  const eased = Math.sin((progress * Math.PI) / 2);
  return fromTime + (targetTime - fromTime) * eased;
}
