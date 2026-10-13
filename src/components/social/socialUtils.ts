import { createContext, useContext, useEffect, useState } from "react";
import { useLocale, type Translate } from "../../lib/i18n";

/** Helpers the social views share (components live in socialUi). */

export function relativeTime(iso: string | null | undefined, t: Translate): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const minutes = Math.floor(Math.max(0, Date.now() - at) / 60_000);
  if (minutes < 1) return t("inbox.justNow");
  if (minutes < 60) return t("menu.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("menu.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t("menu.daysAgo", { n: days });
  return new Date(at).toLocaleDateString();
}

export function formatNumber(value: number | null | undefined, locale: string, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function useNumberFormat() {
  const { locale } = useLocale();
  return (value: number | null | undefined, digits = 0) => formatNumber(value, locale, digits);
}

export type Notice = { tone: "success" | "error" | "info"; text: string };

const NoticeContext = createContext<(notice: Notice) => void>(() => {});

export const NoticeProvider = NoticeContext.Provider;


/** Shows a short message at the bottom of the social overlay. */
export function useNotice() {
  return useContext(NoticeContext);
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
