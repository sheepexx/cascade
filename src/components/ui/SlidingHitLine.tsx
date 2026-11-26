import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

const ACTIVE = {
  left:
    '.hit-line-left[data-active="true"], .hit-line-left[aria-selected="true"], .hit-line-left[aria-current="page"]',
  bottom:
    '.hit-line-bottom[data-active="true"], .hit-line-bottom[aria-selected="true"], .hit-line-bottom[aria-current="page"]',
} as const;

type Line = { left: number; top: number; width: number; height: number };

/**
 * One hit line for a whole list or tab row, gliding to the selected item
 * instead of each item lighting up its own. Put it inside the container of
 * the `.hit-line-left` or `.hit-line-bottom` items; the container must be
 * positioned. While it is there, the items' own marks are hidden (index.css,
 * `[data-hit-rail]`). Nothing selected, nothing drawn.
 */
export function SlidingHitLine({ edge = "left" }: { edge?: "left" | "bottom" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [line, setLine] = useState<Line | null>(null);
  const [hidden, setHidden] = useState(true);
  const [settled, setSettled] = useState(false);

  useLayoutEffect(() => {
    const container = ref.current?.parentElement;
    if (!container) return;
    container.setAttribute("data-hit-rail", edge);
    let frame = 0;
    let grace = 0;
    const measure = () => {
      frame = 0;
      window.clearTimeout(grace);
      const items = container.querySelectorAll<HTMLElement>(ACTIVE[edge]);
      // The first selected item that is laid out; a leaving row is skipped.
      let active: HTMLElement | null = null;
      for (const item of items) {
        if (item.closest("[inert]")) continue;
        if (item.offsetWidth || item.offsetHeight) {
          active = item;
          break;
        }
      }
      if (!active) {
        // A list often drops its selection for a render while the new item
        // arrives (a new difficulty is selected before the sorted list has
        // it). Only fade out if it stays gone; the line keeps its place.
        grace = window.setTimeout(() => {
          const still = [...container.querySelectorAll<HTMLElement>(ACTIVE[edge])].some(
            (item) => !item.closest("[inert]") && (item.offsetWidth || item.offsetHeight),
          );
          if (!still) setHidden(true);
        }, 160);
        return;
      }
      setHidden(false);
      // Offsets add up to the container, whatever sits in between.
      let left = 0;
      let top = 0;
      let node: HTMLElement | null = active;
      while (node && node !== container) {
        left += node.offsetLeft;
        top += node.offsetTop;
        const parent = node.offsetParent as HTMLElement | null;
        if (parent && parent !== container && !container.contains(parent)) break;
        node = parent;
      }
      const w = active.offsetWidth;
      const h = active.offsetHeight;
      // The same proportions as the per-item mark in index.css.
      const next: Line =
        edge === "left"
          ? { left, top: top + h * 0.22, width: 2, height: h * 0.56 }
          : { left: left + 8, top: top + h - 2, width: Math.max(0, w - 16), height: 2 };
      setLine((prev) =>
        prev &&
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.top - next.top) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5 &&
        Math.abs(prev.height - next.height) < 0.5
          ? prev
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const mutations = new MutationObserver(schedule);
    mutations.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-active", "aria-selected", "aria-current", "class", "style"],
    });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(container);
    for (const child of container.children) resize?.observe(child);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(grace);
      mutations.disconnect();
      resize?.disconnect();
      container.removeAttribute("data-hit-rail");
    };
  }, [edge]);

  useLayoutEffect(() => {
    if (!line || settled) return;
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, [line, settled]);

  const style: CSSProperties = line
    ? {
        left: line.left,
        top: line.top,
        width: line.width,
        height: line.height,
        opacity: hidden ? 0 : 1,
      }
    : { opacity: 0 };
  return (
    <span
      ref={ref}
      aria-hidden
      className={`sliding-hit-line ${settled ? "" : "!transition-none"}`}
      style={style}
    />
  );
}
