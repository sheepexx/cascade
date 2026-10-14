import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../lib/i18n";
import { LOCALES } from "../lib/i18n/core";
import { MOTION } from "../lib/motion";
import { ChevronDownIcon, CheckIcon } from "./ui/Icons";
import { POPOVER_CLASS, POPOVER_ITEM_CLASS } from "./ui/Menu";
import { popoverRight } from "./ui/popoverPlacement";

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
      right: popoverRight(rect, menuRef.current?.offsetWidth ?? 0),
    });
  }, [open, mounted]);

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
        className={`flex h-8 items-center gap-1.5 rounded-md text-slate-300 transition duration-[var(--motion-quick)] hover:bg-white/[0.07] hover:text-slate-50 aria-expanded:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
          compact ? "px-2" : "px-2.5"
        }`}
      >
        <GlobeIcon className="h-4 w-4 text-slate-400" />
        <span className="text-xs font-semibold uppercase">
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
            className={`z-[100] w-48 overflow-hidden ${POPOVER_CLASS} ${
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
                className={`${POPOVER_ITEM_CLASS} ${
                  option.code === locale ? "bg-white/[0.05] text-slate-50" : "text-slate-200"
                }`}
              >
                <span>{option.nativeName}</span>
                {option.code === locale && (
                  <CheckIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
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
