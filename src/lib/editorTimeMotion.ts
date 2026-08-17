import type { AudioSeekTransition } from "./audioSeek";

const TIME_EASE = 40;
const TIME_SETTLE_MS = 0.4;

export type EditorSeekMotion = {
  renderedTime: number;
  smoothTarget: number | null;
};

/**
 * Applies an explicit seek to the editor's visual clock.
 *
 * Absolute seeks (timeline, bookmark, jump-to-time, comments) must land on the
 * requested frame. Only locally initiated snap-wheel movement is allowed to
 * glide, and repeated wheel input catches up to the previous target first so
 * visual lag can never accumulate across many events.
 */
export function applyEditorSeek(
  renderedTime: number,
  previousSmoothTarget: number | null,
  targetTime: number,
  transition: AudioSeekTransition,
  allowSmooth: boolean,
): EditorSeekMotion {
  if (!Number.isFinite(targetTime)) {
    return { renderedTime, smoothTarget: previousSmoothTarget };
  }
  if (transition !== "smooth" || !allowSmooth) {
    return { renderedTime: targetTime, smoothTarget: null };
  }
  return {
    renderedTime: previousSmoothTarget ?? renderedTime,
    smoothTarget: targetTime,
  };
}

/** Advances the short snap-line glide using real elapsed wall time. */
export function nextEditorRenderTime(
  renderedTime: number,
  targetTime: number,
  elapsedSeconds: number,
  smooth: boolean,
): number {
  if (!Number.isFinite(targetTime)) return renderedTime;
  const delta = targetTime - renderedTime;
  if (!smooth || Math.abs(delta) < TIME_SETTLE_MS) return targetTime;

  // A stalled/heavy frame must catch up instead of turning a 150 ms glide into
  // several seconds. One second is already effectively a full exponential
  // settle and merely guards against an unbounded tab-resume delta.
  const dt = Math.min(1, Math.max(0, elapsedSeconds));
  const next = renderedTime + delta * (1 - Math.exp(-TIME_EASE * dt));
  return Math.abs(targetTime - next) < TIME_SETTLE_MS ? targetTime : next;
}
