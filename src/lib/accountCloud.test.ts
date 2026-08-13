import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, DEFAULT_VIEW } from "../types";
import {
  normalizeAccountSettings,
  type AccountSettings,
} from "./accountCloud";

const fallback: AccountSettings = {
  version: 1,
  appSettings: DEFAULT_APP_SETTINGS,
  view: DEFAULT_VIEW,
  volume: 0.5,
  locale: "en",
  hitsoundSkinSource: "visual",
};

describe("normalizeAccountSettings", () => {
  it("keeps a safe fallback for malformed data", () => {
    expect(normalizeAccountSettings(null, fallback)).toBe(fallback);
    expect(normalizeAccountSettings([], fallback)).toBe(fallback);
  });

  it("clamps scalar preferences and ignores unknown options", () => {
    const normalized = normalizeAccountSettings(
      {
        view: { scrollSpeed: 999, snapDivisor: 99 },
        volume: -2,
        locale: "unknown",
        hitsoundSkinSource: "remote",
      },
      fallback,
    );

    expect(normalized.view.scrollSpeed).toBeLessThan(999);
    expect(normalized.view.snapDivisor).toBe(fallback.view.snapDivisor);
    expect(normalized.volume).toBe(0);
    expect(normalized.locale).toBe("en");
    expect(normalized.hitsoundSkinSource).toBe("visual");
  });

  it("fills nested settings added after an older cloud payload", () => {
    const normalized = normalizeAccountSettings(
      {
        appSettings: {
          uiScale: 1.2,
          playtest: {
            zoom: 2,
            humanize: { enabled: true },
          },
        },
      },
      fallback,
    );

    expect(normalized.appSettings.uiScale).toBe(1.2);
    expect(normalized.appSettings.playtest.zoom).toBe(2);
    expect(normalized.appSettings.playtest.humanize.enabled).toBe(true);
    expect(normalized.appSettings.playtest.humanize.biasMs).toBe(
      DEFAULT_APP_SETTINGS.playtest.humanize.biasMs,
    );
    expect(normalized.appSettings.playtest.skill).toEqual(
      DEFAULT_APP_SETTINGS.playtest.skill,
    );
    expect(normalized.appSettings.editorKeybinds).toEqual(
      DEFAULT_APP_SETTINGS.editorKeybinds,
    );
  });
});
