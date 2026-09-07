import { useCallback, useEffect, useRef, useState } from "react";

export type ScrollEdges = { top: boolean; bottom: boolean };

const THRESHOLD = 6;

export function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>({
    top: false,
    bottom: false,
  });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    const top = el.scrollTop > THRESHOLD;
    const bottom = scrollable > THRESHOLD && el.scrollTop < scrollable - THRESHOLD;
    setEdges((prev) =>
      prev.top === top && prev.bottom === bottom ? prev : { top, bottom },
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    for (const child of Array.from(el.children)) observer?.observe(child);
    return () => {
      el.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [measure]);

  return { ref, edges, measure };
}
