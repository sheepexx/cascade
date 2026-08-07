import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let openDialogs = 0;

export function dialogIsOpen(): boolean {
  return openDialogs > 0;
}

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
  );
}

export function useDialog(open: boolean) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openDialogs++;
    const restoreTo = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const first = panel ? focusable(panel)[0] : null;
    (first ?? panel)?.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const node = panelRef.current;
      if (!node) return;
      const items = focusable(node);
      if (items.length === 0) {
        e.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      if (active === edge || !node.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? items[items.length - 1] : items[0]).focus({
          preventScroll: true,
        });
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openDialogs = Math.max(0, openDialogs - 1);
      restoreTo?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return panelRef;
}
