import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../lib/i18n";
import { LOCALES } from "../lib/i18n/core";
import { ChevronDownIcon } from "./ui/Icons";

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>({
    top: 0,
    right: 0,
  });

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target))
        return;
      setOpen(false);
    };
    const onScrollOrResize = () => setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("settings.language")}
        aria-label={t("settings.language")}
        className={`flex items-center gap-1.5 rounded-lg border border-ink-500/60 bg-ink-700/60 text-slate-200 transition hover:border-accent/60 hover:bg-ink-700 ${
          compact ? "px-2 py-1" : "px-2.5 py-1.5"
        }`}
      >
        <GlobeIcon className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-medium uppercase">
          {current.code.split("-")[0]}
        </span>
        <ChevronDownIcon
          className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-[100] w-48 overflow-hidden rounded-xl border border-ink-500/60 bg-ink-800 py-1 shadow-2xl"
          >
            {LOCALES.map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => {
                  setLocale(option.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition hover:bg-ink-600 ${
                  option.code === locale
                    ? "text-accent"
                    : "text-slate-200 hover:text-slate-100"
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
