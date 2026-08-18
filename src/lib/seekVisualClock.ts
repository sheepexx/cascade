import type { AudioSeekTransition } from "./audioSeek";

export const SEEK_EASE_PER_SECOND = 18;
export const SCRUB_EASE_PER_SECOND = 30;
export const SEEK_SETTLE_MS = 0.4;

export type SeekVisualClock = ReturnType<typeof createSeekVisualClock>;

function transitionEase(transition: AudioSeekTransition): number {
  if (transition === "smooth") return SEEK_EASE_PER_SECOND;
  if (transition === "scrub") return SCRUB_EASE_PER_SECOND;
  return 0;
}

export function createSeekVisualClock() {
  let offset = 0;
  let ease = 0;
  let lastAt = Number.NaN;
  let cachedAt = Number.NaN;
  let cachedVisual = Number.NaN;

  const clearCache = () => {
    cachedAt = Number.NaN;
    cachedVisual = Number.NaN;
  };

  const advance = (now: number) => {
    if (offset === 0) {
      lastAt = now;
      return;
    }
    const last = Number.isFinite(lastAt) ? lastAt : now;
    const dt = Math.max(0, (now - last) / 1000);
    lastAt = now;
    offset *= Math.exp(-ease * dt);
    if (Math.abs(offset) < SEEK_SETTLE_MS) {
      offset = 0;
      ease = 0;
    }
  };

  const read = (liveTime: number, now: number): number => {
    if (!Number.isFinite(liveTime)) return liveTime;
    if (now === cachedAt) return cachedVisual;
    advance(now);
    const visual = offset === 0 ? liveTime : liveTime + offset;
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
    const nextEase = transitionEase(transition);
    const nextOffset = previousVisualTime - nextLiveTime;
    if (
      nextEase <= 0 ||
      !Number.isFinite(nextOffset) ||
      Math.abs(nextOffset) < SEEK_SETTLE_MS
    ) {
      offset = 0;
      ease = 0;
    } else {
      offset = nextOffset;
      ease = nextEase;
    }
    lastAt = now;
    clearCache();
  };

  const cancel = () => {
    offset = 0;
    ease = 0;
    lastAt = Number.NaN;
    clearCache();
  };

  const active = (now: number): boolean => {
    if (offset === 0) return false;
    advance(now);
    return offset !== 0;
  };

  return { read, begin, cancel, active };
}
