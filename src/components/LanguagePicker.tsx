import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../lib/i18n";
import { LOCALES } from "../lib/i18n/core";
import { MOTION } from "../lib/motion";
import { ChevronDownIcon } from "./ui/Icons";

/** Opens and closes with the same pop as the editor's File/Edit menus. */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();
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
    setPos({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      )
        return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
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

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("settings.language")}
        aria-label={t("settings.language")}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-lg border border-ink-500/60 bg-ink-700/60 text-slate-200 transition duration-[var(--motion-quick)] hover:border-accent/60 hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98] ${
          compact ? "px-2 py-1" : "px-2.5 py-1.5"
        }`}
      >
        <GlobeIcon className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-medium uppercase">
          {current.code.split("-")[0]}
        </span>
        <ChevronDownIcon
          className={`h-3 w-3 text-slate-400 transition-transform duration-[var(--motion-exit)] ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {mounted &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className={`z-[100] w-48 overflow-hidden rounded-xl border border-white/10 bg-ink-800/82 py-1 shadow-2xl ring-1 ring-white/5 backdrop-blur-2xl ${
              closing ? "menu-pop-out" : "menu-pop-in"
            }`}
          >
            {LOCALES.map((option) => (
              <button
                key={option.code}
                type="button"
                role="menuitemradio"
                aria-checked={option.code === locale}
                onClick={() => {
                  setLocale(option.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition duration-[var(--motion-quick)] hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none active:bg-white/15 ${
                  option.code === locale ? "text-accent" : "text-slate-200"
                }`}
              >
                <span>{option.nativeName}</span>
                {option.code === locale && (
                  <span className="text-xs" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.7 3.8 5.8 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.8-3.8-9S9.5 5.7 12 3z" />
    </svg>
  );
}
