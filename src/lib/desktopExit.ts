import { isDesktopApp } from "./pwa";
import { prefersReducedMotion, reduceMotion } from "./performanceMode";

export { prefersReducedMotion };

export const EXIT_ANIMATION_MS = 820;
export const EXIT_REDUCED_MS = 140;

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
