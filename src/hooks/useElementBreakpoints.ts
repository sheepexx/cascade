import { useLayoutEffect, useRef, useState } from "react";
import {
  UI_BREAKPOINTS,
  effectiveViewportWidth,
  type UiBreakpoint,
} from "../lib/uiBreakpoints";

/**
 * The `uimd`/`uilg`/`uixl` breakpoints for one element's own width rather
 * than the window's. A bar the editor's panel layout puts beside another
 * panel has far less room than the window suggests, so it lays itself out
 * by what it actually got. Like the window versions, the width is divided by
 * the interface scale.
 */
export function useElementBreakpoints<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const next = el.getBoundingClientRect().width;
      setWidth((prev) => (prev !== null && Math.abs(prev - next) < 0.5 ? prev : next));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale =
    typeof document !== "undefined"
      ? parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1
      : 1;
  const raw = width ?? (typeof window !== "undefined" ? window.innerWidth : 1280);
  const effective = effectiveViewportWidth(raw, scale);
  const breakpoints = Object.fromEntries(
    (Object.keys(UI_BREAKPOINTS) as UiBreakpoint[]).map((name) => [
      name,
      effective >= UI_BREAKPOINTS[name],
    ]),
  ) as Record<UiBreakpoint, boolean>;
  return { ref, width: effective, ...breakpoints };
}
