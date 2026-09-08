import { useLocale } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { isDesktopApp } from "../lib/pwa";
import { DesktopIcon } from "./ui/Icons";

const PREFIX: Record<Locale, string> = {
  en: "",
  de: "de",
  ru: "ru",
  "zh-CN": "zh-cn",
  "pt-BR": "pt-br",
};

export function DesktopDownloadLink() {
  const { locale, t } = useLocale();
  if (isDesktopApp()) return null;
  const prefix = PREFIX[locale];
  return (
    <a
      href={prefix ? `/${prefix}/download` : "/download"}
      title={t("nav.desktopAppTitle")}
      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-700/70 px-2.5 py-1.5 text-xs font-medium text-slate-200 shadow-sm backdrop-blur-sm transition duration-150 hover:border-white/20 hover:bg-ink-600/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
    >
      <DesktopIcon className="h-3.5 w-3.5" />
      <span className="hidden uimd:inline">{t("nav.desktopApp")}</span>
    </a>
  );
}
