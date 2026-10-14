import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  Fragment,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon } from "./Icons";
import { INPUT_CLASS } from "./Controls";
import { POPOVER_CLASS, POPOVER_ITEM_CLASS } from "./Menu";
import { dropdownKeyTarget } from "./dropdownKeys";
import { MOTION } from "../../lib/motion";

export type DropdownOption<T extends string | number> = {
  value: T;
  label: ReactNode;
  /** Shown dimmed on the right of the row, like the File menu's shortcuts. */
  hint?: string;
  /** Greyed out and not selectable, like a disabled <option>. */
  disabled?: boolean;
  /** Rows sharing a group are listed under one heading, in list order. */
  group?: string;
};

const DIMS = {
  sm: { field: "h-7 py-0 pl-2 pr-6 text-xs", icon: "right-1.5 h-3 w-3" },
  md: { field: "h-8 py-0 pl-2.5 pr-7 text-sm", icon: "right-2 h-3.5 w-3.5" },
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
    const selectedOption = menuRef.current?.querySelector<HTMLElement>(
      '[data-selected="true"]',
    );
    selectedOption?.scrollIntoView({ block: "nearest" });
    selectedOption?.focus();
  }, [mounted, open]);

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
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        event.preventDefault();
        // Disabled rows are skipped, as a click on one does nothing.
        const index = live.options.findIndex(
          (option) => option.value === live.value,
        );
        const to = dropdownKeyTarget(live.options, index, event.key);
        const next = to === null ? undefined : live.options[to];
        if (next && next.value !== live.value) live.onChange(next.value);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    // A long list scrolls itself; only a scroll elsewhere moves the trigger
    // out from under it.
    const onScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
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
        className={`${INPUT_CLASS} flex w-full min-w-0 items-center justify-between gap-2 ${dims.field} text-left aria-expanded:ring-white/[0.18] focus-visible:ring-accent/70`}
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
            className={`z-[200] max-h-[min(18rem,60vh)] overflow-y-auto overscroll-contain ${POPOVER_CLASS} ${
              closing ? "menu-pop-out" : "menu-pop-in"
            }`}
          >
            {options.map((option, index) => {
              const active = option.value === value;
              // A heading wherever the group changes, which is what the
              // <optgroup> of the selects this replaced used to draw.
              const heading =
                option.group && option.group !== options[index - 1]?.group ? (
                  <div className="px-2.5 pb-1 pt-2 text-2xs font-medium text-slate-500">
                    {option.group}
                  </div>
                ) : null;
              return (
                <Fragment key={option.value}>
                {heading}
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-selected={active || undefined}
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`${POPOVER_ITEM_CLASS} ${
                    option.disabled
                      ? "!cursor-not-allowed text-slate-600 hover:bg-transparent"
                      : active
                        ? "bg-white/[0.05] text-slate-50"
                        : "text-slate-200"
                  }`}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {option.hint ? (
                    <span className="shrink-0 font-mono text-2xs text-slate-500">
                      {option.hint}
                    </span>
                  ) : (
                    active && (
                      <CheckIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
                    )
                  )}
                </button>
                </Fragment>
              );
            })}
          </div>,
          document.body,
        )}
    </span>
  );
}
