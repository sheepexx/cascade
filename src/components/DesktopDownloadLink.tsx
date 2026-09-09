import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import {
  DESKTOP_HINT_DELAY_MS,
  DESKTOP_HINT_VISIBLE_MS,
  dismissDesktopHint,
  loadDesktopHintState,
  recordDesktopHintShown,
  saveDesktopHintState,
  shouldShowDesktopHint,
} from "../lib/desktopHint";
import { isDesktopApp } from "../lib/pwa";
import { CloseIcon, DesktopIcon } from "./ui/Icons";

const PREFIX: Record<Locale, string> = {
  en: "",
  de: "de",
  ru: "ru",
  "zh-CN": "zh-cn",
  "pt-BR": "pt-br",
};

export function DesktopDownloadLink({ active = true }: { active?: boolean }) {
  const { locale, t } = useLocale();
  const [hinting, setHinting] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const desktop = isDesktopApp();

  useEffect(() => {
    if (desktop || !active) return;
    if (!shouldShowDesktopHint(loadDesktopHintState(), Date.now())) return;
    let hide = 0;
    const show = window.setTimeout(() => {
      saveDesktopHintState(
        recordDesktopHintShown(loadDesktopHintState(), Date.now()),
      );
      setHinting(true);
      hide = window.setTimeout(() => setHinting(false), DESKTOP_HINT_VISIBLE_MS);
    }, DESKTOP_HINT_DELAY_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
      setHinting(false);
    };
  }, [desktop, active]);

  useLayoutEffect(() => {
    if (!hinting || !ref.current) return;
    const place = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({
        top: rect.bottom + 10,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [hinting]);

  if (desktop) return null;

  const settle = () => {
    setHinting(false);
    saveDesktopHintState(dismissDesktopHint(loadDesktopHintState()));
  };

  const prefix = PREFIX[locale];
  const href = prefix ? `/${prefix}/download` : "/download";

  return (
    <div className="relative" ref={ref}>
      <a
        href={href}
        title={t("nav.desktopAppTitle")}
        onClick={settle}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-700/70 px-2.5 py-1.5 text-xs font-medium text-slate-200 shadow-sm backdrop-blur-sm transition duration-150 hover:border-white/20 hover:bg-ink-600/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
      >
        <DesktopIcon className="h-3.5 w-3.5" />
        <span className="hidden uimd:inline">{t("nav.desktopApp")}</span>
      </a>

      {hinting &&
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="desktop-hint-in z-[100] w-max max-w-[16rem] rounded-xl border border-accent/30 bg-ink-800/95 py-2 pl-3 pr-8 text-left shadow-[0_16px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
          >
            <span
              aria-hidden
              className="absolute -top-1 right-7 h-2 w-2 rotate-45 border-l border-t border-accent/30 bg-ink-800"
            />
            <p className="text-[11px] font-semibold leading-snug text-slate-100">
              {t("nav.desktopHint")}
            </p>
            <button
              type="button"
              aria-label={t("common.close")}
              onClick={settle}
              className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-md text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
