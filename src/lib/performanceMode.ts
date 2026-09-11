import { useSyncExternalStore } from "react";

const ATTRIBUTE = "data-performance";

let enabled = false;
const listeners = new Set<() => void>();

function motionMedia(): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
}

export function prefersReducedMotion(): boolean {
  return motionMedia()?.matches === true;
}

export function isPerformanceMode(): boolean {
  return enabled;
}

export function setPerformanceMode(value: boolean): void {
  if (enabled === value) return;
  enabled = value;
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (value) root.setAttribute(ATTRIBUTE, "on");
    else root.removeAttribute(ATTRIBUTE);
  }
  for (const fn of listeners) fn();
}

export function subscribePerformanceMode(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function reduceMotion(): boolean {
  return enabled || prefersReducedMotion();
}

export function renderScale(cap = Number.POSITIVE_INFINITY): number {
  if (enabled) return 1;
  if (typeof window === "undefined") return 1;
  return Math.min(cap, window.devicePixelRatio || 1);
}

export function usePerformanceMode(): boolean {
  return useSyncExternalStore(
    subscribePerformanceMode,
    isPerformanceMode,
    () => false,
  );
}

function subscribeMotion(fn: () => void): () => void {
  const stopPerformance = subscribePerformanceMode(fn);
  const media = motionMedia();
  media?.addEventListener("change", fn);
  return () => {
    stopPerformance();
    media?.removeEventListener("change", fn);
  };
}

/**
 * Reduce-motion as the app sees it: the performance setting or the system
 * preference. Unlike `reduceMotion()`, which samples once, this re-renders when
 * either changes, so an animation that stopped starts again as soon as the
 * reason for stopping goes away.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, reduceMotion, () => false);
}
