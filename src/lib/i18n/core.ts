import { en } from "./locales/en";
import { de } from "./locales/de";
import { ru } from "./locales/ru";
import { zhCN } from "./locales/zh-CN";
import { ptBR } from "./locales/pt-BR";

export type Locale = "en" | "de" | "ru" | "zh-CN" | "pt-BR";

export type PluralSuffix = "zero" | "one" | "two" | "few" | "many" | "other";

type CatalogKey = keyof typeof en;

type StripPlural<K extends string> = K extends `${infer Base}.${PluralSuffix}`
  ? Base
  : K;

export type MessageKey = StripPlural<CatalogKey>;

export type Catalog = Record<CatalogKey, string>;

export type PartialCatalog = Partial<Record<CatalogKey, string>> &
  Partial<Record<`${MessageKey}.${PluralSuffix}`, string>>;

export type LocaleOption = {
  code: Locale;
  nativeName: string;
  englishName: string;
};

export const LOCALES: LocaleOption[] = [
  { code: "en", nativeName: "English", englishName: "English" },
  { code: "de", nativeName: "Deutsch", englishName: "German" },
  { code: "ru", nativeName: "Русский", englishName: "Russian" },
  { code: "zh-CN", nativeName: "简体中文", englishName: "Chinese (Simplified)" },
  { code: "pt-BR", nativeName: "Português (Brasil)", englishName: "Portuguese (Brazil)" },
];

export const DEFAULT_LOCALE: Locale = "en";

const CATALOGS: Record<Locale, PartialCatalog> = {
  en,
  de,
  ru,
  "zh-CN": zhCN,
  "pt-BR": ptBR,
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && LOCALES.some((l) => l.code === value)
  );
}

export function resolveLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if (isLocale(tag)) return tag;
  if (lower === "zh-cn") return "zh-CN";
  if (lower === "pt-br") return "pt-BR";
  const base = lower.split("-")[0];
  if (base === "zh") return "zh-CN";
  if (base === "pt") return "pt-BR";
  if (base === "de") return "de";
  if (base === "ru") return "ru";
  if (base === "en") return "en";
  return null;
}

export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const tags = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const tag of tags) {
    const match = resolveLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

export type TranslateParams = Record<string, string | number>;

const pluralRules = new Map<Locale, Intl.PluralRules>();

function pluralCategory(locale: Locale, count: number): string {
  let rules = pluralRules.get(locale);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale);
    } catch {
      rules = new Intl.PluralRules(DEFAULT_LOCALE);
    }
    pluralRules.set(locale, rules);
  }
  return rules.select(count);
}

function lookup(locale: Locale, key: string): string | undefined {
  const catalog = CATALOGS[locale] as Record<string, string | undefined>;
  const hit = catalog?.[key];
  if (hit !== undefined) return hit;
  if (locale !== DEFAULT_LOCALE) {
    const fallback = CATALOGS[DEFAULT_LOCALE] as Record<
      string,
      string | undefined
    >;
    return fallback?.[key];
  }
  return undefined;
}

function resolveKey(
  locale: Locale,
  key: MessageKey,
  params?: TranslateParams,
): string {
  const count = params?.count;
  if (typeof count === "number") {
    const category = pluralCategory(locale, count);
    return (
      lookup(locale, `${key}.${category}`) ??
      lookup(locale, `${key}.other`) ??
      lookup(locale, key) ??
      key
    );
  }
  return lookup(locale, key) ?? key;
}

function interpolate(
  template: string,
  locale: Locale,
  params?: TranslateParams,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole;
    if (typeof value === "number") return formatNumber(value, locale);
    return value;
  });
}

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: TranslateParams,
): string {
  return interpolate(resolveKey(locale, key, params), locale, params);
}

const numberFormats = new Map<string, Intl.NumberFormat>();

export function formatNumber(value: number, locale: Locale): string {
  const cacheKey = `${locale}:${Number.isInteger(value)}`;
  let formatter = numberFormats.get(cacheKey);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(locale, {
        maximumFractionDigits: Number.isInteger(value) ? 0 : 3,
      });
    } catch {
      formatter = new Intl.NumberFormat(DEFAULT_LOCALE);
    }
    numberFormats.set(cacheKey, formatter);
  }
  return formatter.format(value);
}

let activeLocale: Locale = DEFAULT_LOCALE;

export function getActiveLocale(): Locale {
  return activeLocale;
}

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
}

export function t(key: MessageKey, params?: TranslateParams): string {
  return translate(activeLocale, key, params);
}
