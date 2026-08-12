import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadLocale, saveLocale } from "../persistence";
import {
  detectLocale,
  isCatalogLoaded,
  loadCatalog,
  localeFromPath,
  resolveLocale,
  setActiveLocale,
  translate,
  type Locale,
  type MessageKey,
  type TranslateParams,
} from "./core";

export type {
  Catalog,
  Locale,
  LocaleOption,
  MessageKey,
  PartialCatalog,
  PluralSuffix,
  TranslateParams,
} from "./core";

export type Translate = (key: MessageKey, params?: TranslateParams) => string;

type LocaleState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
};

const LocaleContext = createContext<LocaleState | null>(null);

const CATALOG_WAIT_MS = 2000;

function initialLocale(): Locale {
  const fromPath =
    typeof location === "undefined" ? null : localeFromPath(location.pathname);
  if (fromPath) return fromPath;
  const stored = resolveLocale(loadLocale());
  if (stored) return stored;
  return detectLocale();
}

export function preloadLocale(): Promise<void> {
  const locale = initialLocale();
  setActiveLocale(locale);
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  if (isCatalogLoaded(locale)) return Promise.resolve();
  return Promise.race([
    loadCatalog(locale),
    new Promise<void>((resolve) => {
      setTimeout(resolve, CATALOG_WAIT_MS);
    }),
  ]);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const next = initialLocale();
    setActiveLocale(next);
    void loadCatalog(next);
    if (typeof document !== "undefined") document.documentElement.lang = next;
    return next;
  });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (isCatalogLoaded(locale)) return;
    let cancelled = false;
    void loadCatalog(locale).then(() => {
      if (!cancelled) setRevision((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setActiveLocale(next);
    saveLocale(next);
    setLocaleState(next);
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
    }
  }, []);

  const value = useMemo<LocaleState>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, setLocale, revision],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleState {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

export function useT(): Translate {
  return useLocale().t;
}
