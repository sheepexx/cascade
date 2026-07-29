import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadLocale, saveLocale } from "../persistence";
import {
  detectLocale,
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

function initialLocale(): Locale {
  const stored = resolveLocale(loadLocale());
  if (stored) return stored;
  return detectLocale();
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const next = initialLocale();
    setActiveLocale(next);
    if (typeof document !== "undefined") document.documentElement.lang = next;
    return next;
  });

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
    [locale, setLocale],
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
