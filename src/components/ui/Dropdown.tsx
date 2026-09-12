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

export type DropdownOption<T extends string | number> = {
  value: T;
  label: ReactNode;
  /** Shown dimmed on the right of the row, like the File menu's shortcuts. */
  hint?: string;
};

const DIMS = {
  sm: { field: "py-1.5 pl-2.5 pr-7 text-xs", icon: "right-2 h-3 w-3" },
  md: { field: "py-2 pl-3 pr-8 text-sm", icon: "right-2.5 h-3.5 w-3.5" },
} as const;

/**
 * The editor's popover menu in the shape of a form control: the same pop-in,
 * dark surface and keyboard handling as the File menu and the main-menu
 * language picker, rather than a native <select> whose list the OS draws in its
 * own style. The trigger keeps the old Select's metrics so it drops in where
 * one used to be without moving anything around it.
 */
export function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  size = "md",
  className = "",
  disabled = false,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const dims = DIMS[size];
  const selected = options.find((option) => option.value === value);
  // The key handler reads the live list through a ref, so a caller that builds
  // its options inline on every render does not resubscribe it each time.
  const stateRef = useRef({ options, value, onChange });
  stateRef.current = { options, value, onChange };

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

  // Anchored under the trigger and as wide as it, so it reads as the field
  // opening rather than a menu appearing somewhere near it. Flips above when
  // there is more room up there, for a picker near the bottom of the window.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const below = window.innerHeight - rect.bottom;
    const flip = below < menuHeight + 8 && rect.top > below;
    setPos({
      top: flip ? Math.max(8, rect.top - menuHeight - 4) : rect.bottom + 4,
      left: Math.max(
        8,
        Math.min(rect.left, window.innerWidth - rect.width - 8),
      ),
      width: rect.width,
    });
  }, [open]);

  // A long list (snap has 49 entries) opens on the current value instead of at
  // the top, so the choice in effect is the one under the pointer.
  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      )
        return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      const live = stateRef.current;
      const index = live.options.findIndex(
        (option) => option.value === live.value,
      );
      const step = (to: number) => {
        event.preventDefault();
        const next =
          live.options[Math.max(0, Math.min(live.options.length - 1, to))];
        if (next && next.value !== live.value) live.onChange(next.value);
      };
      if (event.key === "ArrowDown") step(index + 1);
      else if (event.key === "ArrowUp") step(index - 1);
      else if (event.key === "Home") step(0);
      else if (event.key === "End") step(live.options.length - 1);
      else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <span className={`relative inline-flex min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-white/10 bg-ink-700/65 ${dims.field} text-left text-slate-100 shadow-inner shadow-black/10 outline-none backdrop-blur-sm transition duration-[var(--motion-quick)] hover:border-white/20 hover:bg-ink-600/70 focus-visible:border-accent/70 focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-45`}
      >
        <span className="min-w-0 truncate">{selected?.label ?? ""}</span>
      </button>
      <ChevronDownIcon
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 transition-transform duration-[var(--motion-exit)] ${
          dims.icon
        } ${open ? "rotate-180" : ""}`}
      />

      {mounted &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              minWidth: pos.width,
            }}
            className={`z-[100] max-h-[min(18rem,60vh)] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-ink-800/82 py-1 shadow-2xl ring-1 ring-white/5 backdrop-blur-2xl ${
              closing ? "menu-pop-out" : "menu-pop-in"
            }`}
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-selected={active || undefined}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm transition duration-[var(--motion-quick)] hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none active:bg-white/15 ${
                    active ? "text-accent" : "text-slate-200"
                  }`}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {option.hint ? (
                    <span className="shrink-0 font-mono text-[10px] text-slate-500">
                      {option.hint}
                    </span>
                  ) : (
                    active && (
                      <span className="shrink-0 text-xs" aria-hidden>
                        ✓
                      </span>
                    )
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </span>
  );
}
