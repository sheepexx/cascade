// The playback model: how far into the song playback is at a given
// AudioContext time, across an eased change of rate. useAudio draws the
// playhead from it and the song voice renders from the very same numbers, so
// what is heard and what is shown cannot drift apart.

export type RateTransition = {
  startCtxTime: number;
  /** Song seconds at `startCtxTime`. */
  startPosition: number;
  from: number;
  to: number;
  /** Seconds the rate takes to ease from `from` to `to`; 0 switches at once. */
  duration: number;
};

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const easeOutCubicIntegral = (t: number): number =>
  1.5 * t * t - t * t * t + 0.25 * t * t * t * t;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function rateAt(tr: RateTransition, ctxTime: number): number {
  if (tr.duration <= 0) return tr.to;
  const t = clamp01((ctxTime - tr.startCtxTime) / tr.duration);
  return tr.from + (tr.to - tr.from) * easeOutCubic(t);
}

export function positionAt(tr: RateTransition, ctxTime: number): number {
  if (tr.duration <= 0) {
    return tr.startPosition + (ctxTime - tr.startCtxTime) * tr.to;
  }
  const elapsed = Math.max(0, ctxTime - tr.startCtxTime);
  if (elapsed <= tr.duration) {
    const t = elapsed / tr.duration;
    return (
      tr.startPosition +
      tr.from * elapsed +
      (tr.to - tr.from) * tr.duration * easeOutCubicIntegral(t)
    );
  }
  const transitioned =
    tr.from * tr.duration +
    (tr.to - tr.from) * tr.duration * easeOutCubicIntegral(1);
  return tr.startPosition + transitioned + tr.to * (elapsed - tr.duration);
}
