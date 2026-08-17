import type { AudioSeekTransition } from "./audioSeek";

export const SEEK_GLIDE_MS = 300;
export const SCRUB_GLIDE_MS = 110;

type VisualSeekMotion = {
  fromOffset: number;
  startedAt: number;
  duration: number;
};

export type SeekVisualClock = ReturnType<typeof createSeekVisualClock>;

function transitionDuration(transition: AudioSeekTransition): number {
  if (transition === "smooth") return SEEK_GLIDE_MS;
  if (transition === "scrub") return SCRUB_GLIDE_MS;
  return 0;
}

/**
 * Builds a visual clock that trails an immediate audio seek by a bounded,
 * decaying offset. Since the offset is applied to the live clock, playback can
 * continue underneath the glide without a catch-up snap at the deadline.
 */
export function createSeekVisualClock() {
  let motion: VisualSeekMotion | null = null;
  let cachedAt = Number.NaN;
  let cachedVisual = Number.NaN;

  const clearCache = () => {
    cachedAt = Number.NaN;
    cachedVisual = Number.NaN;
  };

  const read = (liveTime: number, now: number): number => {
    if (!Number.isFinite(liveTime)) return liveTime;
    // Every rAF callback in a document receives the same timestamp. Cache by
    // that timestamp so independent canvases cannot drift within one frame,
    // even if the underlying AudioContext advances between their callbacks.
    if (now === cachedAt) return cachedVisual;
    if (!motion) {
      cachedAt = now;
      cachedVisual = liveTime;
      return liveTime;
    }

    const progress = Math.min(
      1,
      Math.max(0, (now - motion.startedAt) / motion.duration),
    );
    if (progress >= 1) {
      motion = null;
      cachedAt = now;
      cachedVisual = liveTime;
      return liveTime;
    }

    const residual = 1 - Math.sin((progress * Math.PI) / 2);
    const visual = liveTime + motion.fromOffset * residual;
    cachedAt = now;
    cachedVisual = visual;
    return visual;
  };

  const begin = (
    previousVisualTime: number,
    nextLiveTime: number,
    transition: AudioSeekTransition,
    now: number,
  ) => {
    const duration = transitionDuration(transition);
    const fromOffset = previousVisualTime - nextLiveTime;
    if (
      duration <= 0 ||
      !Number.isFinite(fromOffset) ||
      Math.abs(fromOffset) < 0.001
    ) {
      motion = null;
    } else {
      motion = { fromOffset, startedAt: now, duration };
    }
    clearCache();
  };

  const cancel = () => {
    motion = null;
    clearCache();
  };

  const active = (now: number): boolean => {
    if (!motion) return false;
    if (now - motion.startedAt >= motion.duration) {
      motion = null;
      clearCache();
      return false;
    }
    return true;
  };

  return { read, begin, cancel, active };
}
