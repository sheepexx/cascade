import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

export type PlateBox = { left: number; top: number; width: number; height: number };

/**
 * The box of the selected option inside a group of buttons, for one plate
 * that slides from option to option instead of each button lighting up on
 * its own. `selector` finds the selected button inside `listRef`; null hides
 * the plate. The first placement does not slide (`settled` is false until
 * it has been drawn once), so the plate never flies in from the corner.
 */
export function useSlidingPlate(
  listRef: RefObject<HTMLElement | null>,
  selector: string | null,
): { box: PlateBox | null; settled: boolean; style: CSSProperties | undefined } {
  const [box, setBox] = useState<PlateBox | null>(null);
  const [settled, setSettled] = useState(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !selector) {
      setBox(null);
      return;
    }
    const measure = () => {
      const active = list.querySelector<HTMLElement>(selector);
      if (!active) {
        setBox(null);
        return;
      }
      const next = {
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
      };
      setBox((prev) =>
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.height === next.height
          ? prev
          : next,
      );
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(list);
    return () => observer?.disconnect();
  }, [listRef, selector]);

  useLayoutEffect(() => {
    if (!box || settled) return;
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, [box, settled]);

  return {
    box,
    settled,
    style: box
      ? {
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
        }
      : undefined,
  };
}
