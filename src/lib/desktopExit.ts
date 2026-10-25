import { isDesktopApp } from "./pwa";
import { prefersReducedMotion, reduceMotion } from "./performanceMode";

export { prefersReducedMotion };

/**
 * Quitting the way osu!lazer does (IntroScreen.OnResuming and ButtonSystem's
 * Exit state, with the menu voice on): the background goes black, the logo
 * settles in the middle at its resting size, then turns slowly while it fades,
 * and the whole game fades out over three seconds before it closes. The song
 * drops almost silent at once and then eases out over the rest.
 */
export const EXIT_ANIMATION_MS = 3000;
export const EXIT_REDUCED_MS = 140;

export const OUTRO = {
  /** ApplyToBackground(b => b.FadeColour(Color4.Black, 100)). */
  backdropMs: 100,
  /** The logo's quick_appear: MoveTo, ScaleTo and FadeIn, OutQuint. */
  settleMs: 350,
  /** Then RotateTo(20, exit_delay * 1.5f) alongside FadeOut(exit_delay). */
  spinDegrees: 20,
  spinMs: EXIT_ANIMATION_MS * 1.5,
  logoFadeMs: EXIT_ANIMATION_MS,
  /** track.VolumeTo(0.03f, 200).Then().VolumeTo(0, rest, Easing.In). */
  musicDipMs: 200,
  musicDipTo: 0.03,
} as const;

export function canExitDesktop(): boolean {
  return isDesktopApp();
}

export function exitAnimationMs(reduced = reduceMotion()): number {
  return reduced ? EXIT_REDUCED_MS : EXIT_ANIMATION_MS;
}

export async function exitDesktopApp(): Promise<void> {
  if (!isDesktopApp()) return;
  const { exit } = await import("@tauri-apps/plugin-process");
  await exit(0);
}
