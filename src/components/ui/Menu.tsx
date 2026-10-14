import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "./Icons";
import { MOTION } from "../../lib/motion";
import { popoverRight } from "./popoverPlacement";

export type MenuItem =
  | {
      label: string;
      onClick: () => void;
      disabled?: boolean;
      hint?: string;
      title?: string;
      danger?: boolean;
    }
  | { separator: true };

const TRIGGER_TONES = {
  plain: {
    trigger:
      "text-slate-300 hover:bg-white/[0.07] hover:text-slate-100 aria-expanded:bg-white/[0.09] aria-expanded:text-slate-50",
    chevron: "text-slate-500",
  },
  accent: {
    trigger: "bg-accent font-medium text-white hover:bg-[#ee7676]",
    chevron: "text-white/80",
  },
};

/** The floating surface shared by menus, dropdown lists and pickers. */
export const POPOVER_CLASS =
  "ui-popover rounded-xl bg-ink-700 p-1 shadow-[var(--shadow-float)] ring-1 ring-white/[0.09]";

/** One row in a menu or list. */
export const POPOVER_ITEM_CLASS =
  "flex w-full min-h-[1.75rem] items-center justify-between gap-3 rounded-md px-2.5 py-1 text-left text-sm " +
  "transition-colors duration-[var(--motion-quick)] hover:bg-white/[0.07] focus-visible:bg-white/[0.07] " +
  "focus-visible:outline-none active:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export function Menu({
  label,
  items,
  className = "",
  tone = "plain",
  chevron = true,
  "aria-label": ariaLabel,
}: {
  label: ReactNode;
  items: MenuItem[];
  className?: string;
  tone?: keyof typeof TRIGGER_TONES;
  /** Off for an icon-only trigger such as "more actions". */
  chevron?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number }>({
    top: 0,
    right: 0,
  });

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, MOTION.exit);
    return () => window.clearTimeout(timer);
  }, [mounted, open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight ?? 0;
    const right = popoverRight(rect, menuRef.current?.offsetWidth ?? 0);
    // A trigger near the bottom of the window, like the hitsound toolbar,
    // opens its menu upward when there is more room above.
    const viewportTop = window.visualViewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
    const roomBelow = viewportBottom - rect.bottom - 8;
    const roomAbove = rect.top - viewportTop - 8;
    setPos(
      { top: Math.max(viewportTop + 8, Math.min(viewportBottom - height - 8, height > roomBelow && roomAbove > roomBelow ? rect.top - height - 4 : rect.bottom + 4)), right },
    );
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      const enabled = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [])];
      if (!enabled.length) return;
      const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
      const focusAt = (index: number) => {
        e.preventDefault();
        enabled[(index + enabled.length) % enabled.length]?.focus();
      };
      if (e.key === "ArrowDown") focusAt(current + 1);
      else if (e.key === "ArrowUp") focusAt(current < 0 ? enabled.length - 1 : current - 1);
      else if (e.key === "Home") focusAt(0);
      else if (e.key === "End") focusAt(enabled.length - 1);
    };
    // A menu taller than the window scrolls itself; only a scroll elsewhere
    // moves the trigger out from under it.
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
  }, [mounted, open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={`flex h-7 items-center gap-1 rounded-md px-2.5 text-sm transition duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${TRIGGER_TONES[tone].trigger} ${className}`}
      >
        {label}
        {chevron && (
          <ChevronDownIcon
            className={`h-3 w-3 ${TRIGGER_TONES[tone].chevron} transition-transform duration-[var(--motion-exit)] ${
              open ? "rotate-180" : ""
            }`}
          />
        )}
      </button>
      {mounted &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, bottom: pos.bottom, right: pos.right }}
            role="menu"
            className={`z-[100] min-w-[13rem] max-w-[20rem] overflow-y-auto ${POPOVER_CLASS} ${closing ? "menu-pop-out" : "menu-pop-in"}`}
          >
            {items.map((item, i) =>
              "separator" in item ? (
                <div key={i} role="separator" className="mx-1.5 my-1 h-px bg-white/[0.07]" />
              ) : (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`${POPOVER_ITEM_CLASS} ${
                    item.danger ? "text-rose-300" : "text-slate-200"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  {item.hint && (
                    <span className="shrink-0 font-mono text-2xs text-slate-500">
                      {item.hint}
                    </span>
                  )}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
