import {
  Children,
  isValidElement,
  useLayoutEffect,
  useReducer,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { reduceMotion } from "../../lib/performanceMode";
import { MOTION_EASE } from "../../lib/motion";

type Axis = "y" | "x" | "fade";

const ENTER_MS = 240;
const EXIT_MS = 200;
const MOVE_MS = 320;

type Item = { key: string; element: ReactElement };
type Leaving = { item: Item; after: string | null; index: number };
type Box = { x: number; y: number };

/**
 * Keyed children that grow in when added, fold away when removed and glide
 * to their new place when the order changes, instead of popping. Each child
 * gets a wrapper div, so the caller's container lays out the wrappers.
 *
 * - `y`: a vertical list; rows open and close in height.
 * - `x`: a row of fixed-width cards; cards open and close in width.
 * - `fade`: a grid, where cells only fade and scale.
 *
 * Nothing animates on the first render or when every key changes at once
 * (another map was opened), so only edits move.
 */
export function AnimatedList({
  children,
  axis = "y",
  itemClassName,
}: {
  children: ReactNode;
  axis?: Axis;
  itemClassName?: string;
}) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const current: Item[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.key != null) {
      current.push({ key: String(child.key), element: child });
    }
  });

  const previous = useRef<Item[]>([]);
  const leaving = useRef(new Map<string, Leaving>());
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const firstRender = useRef(true);

  const currentKeys = new Set(current.map((item) => item.key));
  const previousKeys = new Set(previous.current.map((item) => item.key));
  const kept = current.filter((item) => previousKeys.has(item.key));
  // A whole new set (another map) swaps without ceremony.
  const replaced = kept.length === 0 && previous.current.length > 0;
  const animate = !firstRender.current && !replaced;

  if (!animate) leaving.current.clear();
  if (animate) {
    previous.current.forEach((item, index) => {
      if (currentKeys.has(item.key) || leaving.current.has(item.key)) return;
      leaving.current.set(item.key, {
        item,
        after: index > 0 ? previous.current[index - 1].key : null,
        index,
      });
    });
  }
  for (const key of [...leaving.current.keys()]) {
    if (currentKeys.has(key)) leaving.current.delete(key);
  }

  // Each leaving item stays after the item it followed, folding away there.
  const merged: (Item & { gone: boolean })[] = current.map((item) => ({
    ...item,
    gone: false,
  }));
  for (const { item, after, index } of leaving.current.values()) {
    const anchor = after === null ? -1 : merged.findIndex((m) => m.key === after);
    const at = after === null ? 0 : anchor >= 0 ? anchor + 1 : Math.min(index, merged.length);
    merged.splice(at, 0, { ...item, gone: true });
  }

  const entering = animate
    ? current.filter((item) => !previousKeys.has(item.key)).map((item) => item.key)
    : [];
  const keptBefore = previous.current
    .filter((item) => currentKeys.has(item.key))
    .map((item) => item.key);
  const reordered =
    animate && kept.some((item, index) => keptBefore[index] !== item.key);

  // Where the kept items were, read before React moves them. Layout is
  // normally clean at this point, so the read is cheap, and it only happens
  // when the order really changed.
  const before = useRef(new Map<string, Box>());
  if (reordered) {
    before.current.clear();
    for (const item of kept) {
      const node = nodes.current.get(item.key);
      if (node) before.current.set(item.key, boxOf(node));
    }
  }

  useLayoutEffect(() => {
    const wasFirst = firstRender.current;
    firstRender.current = false;
    previous.current = current;
    if (wasFirst) return;

    if (reduceMotion()) {
      if (leaving.current.size) {
        leaving.current.clear();
        rerender();
      }
      return;
    }

    for (const key of entering) {
      const node = nodes.current.get(key);
      if (!node) continue;
      // Back before it finished leaving (an undo): drop the fold first.
      for (const animation of node.getAnimations({ subtree: true })) animation.cancel();
      delete node.dataset.leaving;
      node.style.height = "";
      node.style.width = "";
      playEnter(node, axis);
    }

    for (const key of leaving.current.keys()) {
      const node = nodes.current.get(key);
      if (!node || node.dataset.leaving === "playing") continue;
      node.dataset.leaving = "playing";
      void playExit(node, axis).then(() => {
        if (node.dataset.leaving !== "playing") return;
        if (leaving.current.delete(key)) rerender();
      });
    }

    if (reordered) {
      for (const [key, was] of before.current) {
        const node = nodes.current.get(key);
        if (!node) continue;
        const now = boxOf(node);
        const dx = was.x - now.x;
        const dy = was.y - now.y;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        node.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
          { duration: MOVE_MS, easing: MOTION_EASE.emphasized },
        );
      }
      before.current.clear();
    }
  });

  return (
    <>
      {merged.map(({ key, element, gone }) => (
        <div
          key={key}
          ref={(node) => {
            if (node) nodes.current.set(key, node);
            else nodes.current.delete(key);
          }}
          className={itemClassName}
          aria-hidden={gone || undefined}
          {...({ inert: gone ? "" : undefined } as { inert?: string })}
          style={gone ? { pointerEvents: "none" } : undefined}
        >
          {element}
        </div>
      ))}
    </>
  );
}

/** Where a wrapper sits inside its parent, so scrolling does not count. */
function boxOf(node: HTMLElement): Box {
  const rect = node.getBoundingClientRect();
  const base = node.parentElement?.getBoundingClientRect();
  return { x: rect.left - (base?.left ?? 0), y: rect.top - (base?.top ?? 0) };
}

function settle(animation: Animation): Promise<void> {
  return animation.finished.then(
    () => undefined,
    () => undefined,
  );
}

function playEnter(node: HTMLElement, axis: Axis) {
  const child = node.firstElementChild as HTMLElement | null;
  if (axis === "fade") {
    node.animate(
      [
        { opacity: 0, transform: "scale(0.94)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: ENTER_MS, easing: MOTION_EASE.emphasized },
    );
    return;
  }
  const prop = axis === "y" ? "height" : "width";
  const size = axis === "y" ? node.offsetHeight : node.offsetWidth;
  // Cards keep their width while their slot opens, so the text inside does
  // not squash.
  if (axis === "x" && child) child.style.width = `${size}px`;
  node.style.overflow = "hidden";
  const grow = node.animate([{ [prop]: "0px" }, { [prop]: `${size}px` }], {
    duration: ENTER_MS,
    easing: MOTION_EASE.emphasized,
  });
  child?.animate(
    [
      {
        opacity: 0,
        transform: axis === "y" ? "translateX(-10px)" : "translateY(6px)",
      },
      { opacity: 1, transform: "none" },
    ],
    { duration: ENTER_MS + 80, easing: MOTION_EASE.emphasized },
  );
  void settle(grow).then(() => {
    node.style.overflow = "";
    if (axis === "x" && child) child.style.width = "";
  });
}

function playExit(node: HTMLElement, axis: Axis): Promise<void> {
  const child = node.firstElementChild as HTMLElement | null;
  if (axis === "fade") {
    return settle(
      node.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "scale(0.94)" },
        ],
        { duration: EXIT_MS, easing: MOTION_EASE.exit, fill: "forwards" },
      ),
    );
  }
  const prop = axis === "y" ? "height" : "width";
  const size = axis === "y" ? node.offsetHeight : node.offsetWidth;
  if (axis === "x" && child) child.style.width = `${size}px`;
  // The slot keeps the size it had when the item left, so nothing that
  // still changes inside it can make the fold jump.
  node.style[prop] = `${size}px`;
  node.style.overflow = "hidden";
  child?.animate(
    [
      { opacity: 1, transform: "none" },
      {
        opacity: 0,
        transform: axis === "y" ? "translateX(-14px)" : "translateY(6px)",
      },
    ],
    { duration: EXIT_MS * 0.8, easing: MOTION_EASE.exit, fill: "forwards" },
  );
  // The slot closes once the row has mostly gone, so the rows below follow
  // it up instead of jumping.
  return settle(
    node.animate([{ [prop]: `${size}px` }, { [prop]: "0px" }], {
      duration: EXIT_MS,
      delay: EXIT_MS * 0.4,
      easing: MOTION_EASE.standard,
      fill: "forwards",
    }),
  );
}
