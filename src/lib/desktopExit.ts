import { isDesktopApp } from "./pwa";

export const EXIT_ANIMATION_MS = 820;
export const EXIT_REDUCED_MS = 140;

export function canExitDesktop(): boolean {
  return isDesktopApp();
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function exitAnimationMs(reduced = prefersReducedMotion()): number {
  return reduced ? EXIT_REDUCED_MS : EXIT_ANIMATION_MS;
}

export async function exitDesktopApp(): Promise<void> {
  if (!isDesktopApp()) return;
  const { exit } = await import("@tauri-apps/plugin-process");
  await exit(0);
}
