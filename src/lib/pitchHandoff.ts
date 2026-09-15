// Tuning for the swap from the buffer engine onto the pitch-preserving media
// element when playback slows down. The element starts muted beside the buffer
// engine, is nudged into line with it, and the two crossfade; see
// armPitchHandoff in useAudio.

/** Wall seconds a paused element is first assumed to take to start playing. */
export const HANDOFF_STARTUP_GUESS_SECONDS = 0.15;
/** Media seconds apart the two engines may be and still swap unheard. */
export const HANDOFF_LOCK_SECONDS = 0.004;
/** Frames in a row the engines must stay lined up before they swap. */
export const HANDOFF_LOCK_FRAMES = 3;
/** Past this many media seconds apart, seek the element again instead. */
export const HANDOFF_RESEEK_SECONDS = 0.25;
/** Seeks allowed before settling for nudging from wherever it landed. */
export const HANDOFF_MAX_SEEKS = 3;
/** Wall ms after which the engines swap however far apart they still are. */
export const HANDOFF_GIVE_UP_MS = 2000;
/** Wall seconds the buffer engine fades out over as the element fades in. */
export const HANDOFF_CROSSFADE_SECONDS = 0.06;

/** Wall seconds over which the element's rate closes the gap. */
const CATCH_UP_SECONDS = 0.15;
/** Largest share of the rate the element runs fast or slow to catch up. */
const MAX_NUDGE = 0.25;

/**
 * Rate for the muted element while it catches up with the buffer engine.
 * `gap` is the element's position minus the buffer engine's, in media seconds.
 */
export function handoffCatchUpRate(gap: number, rate: number): number {
  if (!Number.isFinite(gap) || !(rate > 0)) return rate;
  const nudge = Math.max(
    -MAX_NUDGE,
    Math.min(MAX_NUDGE, gap / (rate * CATCH_UP_SECONDS)),
  );
  return rate * (1 - nudge);
}

/**
 * The next guess at how long a paused element takes to start, from how the
 * last one went: aimed `guess` seconds ahead, it started `gap` media seconds
 * from the buffer engine, so it really took `guess - gap / rate`.
 */
export function learnHandoffStartup(
  guess: number,
  gap: number,
  rate: number,
): number {
  const next = rate > 0 ? guess - gap / rate : Number.NaN;
  if (!Number.isFinite(next)) return guess;
  return Math.max(0.02, Math.min(1, next));
}
