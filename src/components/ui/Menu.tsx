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
    trigger: "text-slate-300 hover:bg-white/10 hover:text-slate-100",
    chevron: "text-slate-500",
  },
  // Filled with the Cascade accent so a menu people hunt for stands out.
  accent: {
    trigger: "bg-accent/90 font-medium text-white shadow-sm hover:bg-accent-soft/95",
    chevron: "text-white/80",
  },
};

export function Menu({
  label,
  items,
  className = "",
  tone = "plain",
}: {
  label: ReactNode;
  items: MenuItem[];
  className?: string;
  tone?: keyof typeof TRIGGER_TONES;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

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
    const width = menuRef.current?.offsetWidth ?? 0;
    const maxRight = Math.max(8, window.innerWidth - width - 8);
    setPos({
      top: rect.bottom + 4,
      right: Math.min(Math.max(8, window.innerWidth - rect.right), maxRight),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98] ${TRIGGER_TONES[tone].trigger} ${className}`}
      >
        {label}
        <ChevronDownIcon
          className={`h-3 w-3 ${TRIGGER_TONES[tone].chevron} transition-transform duration-[var(--motion-exit)] ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {mounted &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            role="menu"
            className={`z-[100] w-52 overflow-hidden rounded-xl border border-white/10 bg-ink-800/82 py-1 shadow-2xl ring-1 ring-white/5 backdrop-blur-2xl ${closing ? "menu-pop-out" : "menu-pop-in"}`}
          >
            {items.map((item, i) =>
              "separator" in item ? (
                <div key={i} className="my-1 h-px bg-white/10" />
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
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition duration-[var(--motion-quick)] hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
                    item.danger ? "text-rose-300" : "text-slate-200"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.hint && (
                    <span className="ml-3 font-mono text-[10px] text-slate-500">
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
