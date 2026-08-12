import type { ManiaNote } from "../types";

export const PREVIEW_LEAD_IN_MS = 800;

export function previewStartMs(
  notes: ManiaNote[],
  previewTime: number,
): number {
  if (previewTime > 0) return Math.max(0, previewTime - PREVIEW_LEAD_IN_MS);
  const first = notes.reduce(
    (min, note) => (note.startTime < min ? note.startTime : min),
    Number.POSITIVE_INFINITY,
  );
  return Number.isFinite(first)
    ? Math.max(0, first - PREVIEW_LEAD_IN_MS)
    : 0;
}

export function previewMapTimeMs(
  mediaTimeSeconds: number,
  elapsedMs: number,
  playbackRate: number,
  clipStartsAtZero: boolean,
  startMs: number,
): number {
  const rate =
    Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  const mediaMs = mediaTimeSeconds * 1000 + Math.max(0, elapsedMs) * rate;
  const mapTime = mediaMs / rate;
  return clipStartsAtZero ? startMs + mapTime : mapTime;
}

export function longNoteBodyRange(
  headY: number,
  tailY: number,
  receptorY: number,
): { top: number; height: number } {
  const visibleHeadY = Math.min(headY, receptorY);
  return {
    top: Math.min(visibleHeadY, tailY),
    height: Math.abs(visibleHeadY - tailY),
  };
}
