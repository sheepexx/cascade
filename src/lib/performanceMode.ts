import { useSyncExternalStore } from "react";

const ATTRIBUTE = "data-performance";

let enabled = false;
const listeners = new Set<() => void>();

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
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
