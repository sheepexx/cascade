import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { en } from "./locales/en";
import { de } from "./locales/de";
import { ru } from "./locales/ru";
import { zhCN } from "./locales/zh-CN";
import { ptBR } from "./locales/pt-BR";
import {
  LOCALES,
  detectLocale,
  localeFromPath,
  registerCatalog,
  resolveLocale,
  translate,
  type Locale,
  type MessageKey,
  type PartialCatalog,
} from "./core";

const TRANSLATIONS: [Locale, PartialCatalog][] = [
  ["de", de],
  ["ru", ru],
  ["zh-CN", zhCN],
  ["pt-BR", ptBR],
];

beforeAll(() => {
  for (const [locale, catalog] of TRANSLATIONS) registerCatalog(locale, catalog);
});

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

function baseKey(key: string): string {
  return key.replace(/\.(zero|one|two|few|many|other)$/, "");
}

describe("resolveLocale", () => {
  it("maps regional tags to supported locales", () => {
    expect(resolveLocale("de-AT")).toBe("de");
    expect(resolveLocale("pt")).toBe("pt-BR");
    expect(resolveLocale("pt-PT")).toBe("pt-BR");
    expect(resolveLocale("zh")).toBe("zh-CN");
    expect(resolveLocale("zh-TW")).toBe("zh-CN");
    expect(resolveLocale("ru-RU")).toBe("ru");
  });

  it("returns null for unsupported languages", () => {
    expect(resolveLocale("ja")).toBeNull();
    expect(resolveLocale("")).toBeNull();
    expect(resolveLocale(null)).toBeNull();
  });

});

describe("localeFromPath", () => {
  it("reads the locale prefix of a localised home", () => {
    expect(localeFromPath("/de")).toBe("de");
    expect(localeFromPath("/ru/")).toBe("ru");
    expect(localeFromPath("/zh-cn")).toBe("zh-CN");
    expect(localeFromPath("/pt-br/")).toBe("pt-BR");
  });

  it("reads the prefix of a localised landing page", () => {
    expect(localeFromPath("/de/osu-mania-playtest")).toBe("de");
  });

  it("ignores the English root and unprefixed pages", () => {
    expect(localeFromPath("/")).toBeNull();
    expect(localeFromPath("")).toBeNull();
    expect(localeFromPath("/osu-mania-sv-editor")).toBeNull();
    expect(localeFromPath("/how-to-make-an-osu-mania-map")).toBeNull();
    expect(localeFromPath("/privacy")).toBeNull();
  });
});

describe("detectLocale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function withLanguages(languages: string[], language = languages[0]) {
    vi.stubGlobal("navigator", { languages, language });
  }

  it("picks the browser's preferred language", () => {
    withLanguages(["de-DE", "en-US"]);
    expect(detectLocale()).toBe("de");
  });

  it("skips unsupported languages and takes the first supported one", () => {
    withLanguages(["ja-JP", "ko-KR", "ru-RU", "en-US"]);
    expect(detectLocale()).toBe("ru");
  });

  it("maps regional variants onto the shipped locale", () => {
    withLanguages(["zh-TW"]);
    expect(detectLocale()).toBe("zh-CN");
    vi.unstubAllGlobals();
    withLanguages(["pt-PT"]);
    expect(detectLocale()).toBe("pt-BR");
  });

  it("falls back to navigator.language when languages is empty", () => {
    vi.stubGlobal("navigator", { languages: [], language: "pt-BR" });
    expect(detectLocale()).toBe("pt-BR");
  });

  it("falls back to English when nothing is supported", () => {
    withLanguages(["ja-JP", "ko-KR"]);
    expect(detectLocale()).toBe("en");
  });

  it("falls back to English when navigator is unavailable", () => {
    vi.stubGlobal("navigator", undefined);
    expect(detectLocale()).toBe("en");
  });
});

describe("translate", () => {
  it("interpolates named params", () => {
    expect(translate("en", "share.removeTitle", { name: "peppy" })).toBe(
      "Remove peppy",
    );
  });

  it("leaves unknown placeholders untouched", () => {
    expect(translate("en", "share.removeTitle", {})).toBe("Remove {name}");
  });

  it("selects English plural forms by count", () => {
    expect(
      translate("en", "startModal.projectNote", { count: 1, date: "x" }),
    ).toBe("1 diff · saved x");
    expect(
      translate("en", "startModal.projectNote", { count: 3, date: "x" }),
    ).toBe("3 diffs · saved x");
  });

  it("selects Russian one/few/many forms", () => {
    const one = translate("ru", "startModal.deleteCount", { count: 1 });
    const few = translate("ru", "startModal.deleteCount", { count: 3 });
    const many = translate("ru", "startModal.deleteCount", { count: 7 });
    expect(one).toContain("Этот проект");
    expect(few).toContain("проекта");
    expect(many).toContain("проектов");
  });

  it("uses the single Chinese plural form for any count", () => {
    expect(translate("zh-CN", "startModal.deleteCount", { count: 1 })).toBe(
      "将永久删除 1 个项目。",
    );
    expect(translate("zh-CN", "startModal.deleteCount", { count: 9 })).toBe(
      "将永久删除 9 个项目。",
    );
  });

  it("falls back to English for untranslated keys", () => {
    const sparse = "de" as Locale;
    expect(translate(sparse, "common.save")).toBe("Speichern");
    expect(translate(sparse, "settings.tabAudio")).toBe("Audio");
  });

  it("returns the key itself when nothing is found", () => {
    expect(translate("en", "does.not.exist" as MessageKey)).toBe(
      "does.not.exist",
    );
  });
});

describe("lazy catalogs", () => {
  it("ships English up front and loads the rest on demand", async () => {
    vi.resetModules();
    const core = await import("./core");
    expect(core.isCatalogLoaded("en")).toBe(true);
    expect(core.isCatalogLoaded("ru")).toBe(false);
    expect(core.translate("ru", "common.save")).toBe("Save");

    await core.loadCatalog("ru");
    expect(core.isCatalogLoaded("ru")).toBe(true);
    expect(core.translate("ru", "common.save")).toBe("Сохранить");
  });
});

describe("catalogs", () => {
  it.each(TRANSLATIONS)("%s translates the HUD editor", (_, catalog) => {
    const keys = (Object.keys(en) as Array<keyof typeof en>).filter((key) =>
      key.startsWith("hud.") || key.startsWith("settings.hudEditor"),
    );
    expect(keys.filter((key) => !catalog[key])).toEqual([]);
  });

  it("declares every locale in LOCALES", () => {
    expect(LOCALES.map((l) => l.code).sort()).toEqual(
      ["de", "en", "pt-BR", "ru", "zh-CN"].sort(),
    );
  });

  it.each(TRANSLATIONS)("%s has no keys missing from English", (_, catalog) => {
    const englishBases = new Set(Object.keys(en).map(baseKey));
    const orphans = Object.keys(catalog).filter(
      (key) => !englishBases.has(baseKey(key)),
    );
    expect(orphans).toEqual([]);
  });

  it.each(TRANSLATIONS)("%s keeps the same placeholders", (_, catalog) => {
    const mismatches: string[] = [];
    for (const [key, value] of Object.entries(catalog)) {
      const source =
        (en as Record<string, string | undefined>)[key] ??
        (en as Record<string, string | undefined>)[`${baseKey(key)}.other`];
      if (!source || !value) continue;
      const expected = placeholders(source);
      const actual = placeholders(value);
      if (expected.join(",") !== actual.join(",")) {
        mismatches.push(`${key}: expected ${expected} got ${actual}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it.each(TRANSLATIONS)("%s has no empty strings", (_, catalog) => {
    const empties = Object.entries(catalog)
      .filter(([, value]) => typeof value === "string" && value.trim() === "")
      .map(([key]) => key);
    expect(empties).toEqual([]);
  });
});
