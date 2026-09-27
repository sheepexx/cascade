/**
 * Two settings about how the interface feels rather than what it shows.
 *
 * The hold-to-confirm time is how long a destructive button has to be held
 * before it fires. The default suits most people; someone who finds it
 * fiddly can stretch it, and someone who deletes a lot can cut it right down.
 * Zero is deliberately not allowed — the hold is the safeguard.
 *
 * Parallax strength scales how far the menu and the editor background drift
 * with the pointer. 100% is what Cascade has always done; 0% pins everything
 * still for anyone who finds the movement distracting.
 */
export const DEFAULT_HOLD_CONFIRM_MS = 750;
export const MIN_HOLD_CONFIRM_MS = 200;
export const MAX_HOLD_CONFIRM_MS = 3000;

export const DEFAULT_PARALLAX_STRENGTH = 1;
export const MAX_PARALLAX_STRENGTH = 2;

export function clampHoldConfirmMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HOLD_CONFIRM_MS;
  return Math.min(MAX_HOLD_CONFIRM_MS, Math.max(MIN_HOLD_CONFIRM_MS, Math.round(value)));
}

export function clampParallaxStrength(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PARALLAX_STRENGTH;
  return Math.min(MAX_PARALLAX_STRENGTH, Math.max(0, value));
}

/**
 * Both are read from places that are nowhere near the settings: a hold button
 * buried in a dialog, a pointer handler running off a frame loop. App pushes
 * the current values here as it renders, the way it does the lane colours,
 * rather than threading a prop through everything in between.
 */
let holdMs = DEFAULT_HOLD_CONFIRM_MS;
let parallax = DEFAULT_PARALLAX_STRENGTH;

export function setHoldConfirmMs(value: number): void {
  holdMs = clampHoldConfirmMs(value);
}

export function holdConfirmDuration(): number {
  return holdMs;
}

export function setParallaxStrength(value: number): void {
  parallax = clampParallaxStrength(value);
}

export function parallaxScale(): number {
  return parallax;
}
