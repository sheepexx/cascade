import {
  DEFAULT_APP_SETTINGS,
  isAltWheelAction,
  type AppSettings,
  type HumanizeSettings,
  type PlaytestSettings,
} from "../types";
import { clampUiScale } from "../lib/uiScale";
import { isSnapPresetId, normalizeCustomDivisors } from "../lib/snapPresets";
import { normalizePlaytestTiming } from "../lib/playtestClock";
import { normalizePlaytestKeybinds } from "../lib/playtestKeybinds";
import { normalizeHudLayout } from "../lib/hudLayout";
import { normalizePlaytestSkin } from "../lib/playtestSkin";

export function normalizeHumanize(
  saved: Partial<HumanizeSettings> | undefined,
): HumanizeSettings {
  const legacy = saved as { greatChance?: number } | undefined;
  const { slipChance, ...rest } = saved ?? {};
  return {
    ...DEFAULT_APP_SETTINGS.playtest.humanize,
    ...rest,
    slipChance:
      slipChance ??
      (typeof legacy?.greatChance === "number"
        ? Math.min(0.1, legacy.greatChance / 4)
        : DEFAULT_APP_SETTINGS.playtest.humanize.slipChance),
  };
}

export function normalizeAppSettings(
  prefs: Partial<AppSettings> | null,
): AppSettings {
  const playtestPrefs = prefs?.playtest as Partial<PlaytestSettings> | undefined;
  const suggestedUiScale =
    typeof window !== "undefined" &&
    (window.innerWidth >= 2000 || window.innerHeight >= 1200)
      ? 1.15
      : 1;
  const uiScale =
    typeof prefs?.uiScale === "number" && Number.isFinite(prefs.uiScale)
      ? clampUiScale(prefs.uiScale)
      : suggestedUiScale;
  return {
    ...DEFAULT_APP_SETTINGS,
    ...(prefs ?? {}),
    uiScale,
    masterVolume:
      typeof prefs?.masterVolume === "number" &&
      Number.isFinite(prefs.masterVolume)
        ? Math.max(0, Math.min(1, prefs.masterVolume))
        : DEFAULT_APP_SETTINGS.masterVolume,
    unfocusedVolume:
      typeof prefs?.unfocusedVolume === "number" &&
      Number.isFinite(prefs.unfocusedVolume)
        ? Math.max(0, Math.min(1, prefs.unfocusedVolume))
        : DEFAULT_APP_SETTINGS.unfocusedVolume,
    snapPreset: isSnapPresetId(prefs?.snapPreset)
      ? prefs.snapPreset
      : DEFAULT_APP_SETTINGS.snapPreset,
    customSnapDivisors: normalizeCustomDivisors(prefs?.customSnapDivisors),
    altWheelAction: isAltWheelAction(prefs?.altWheelAction)
      ? prefs.altWheelAction
      : DEFAULT_APP_SETTINGS.altWheelAction,
    playtest: {
      ...normalizePlaytestTiming(
        { ...DEFAULT_APP_SETTINGS.playtest, ...(playtestPrefs ?? {}) },
        DEFAULT_APP_SETTINGS.playtest,
      ),
      keybinds: normalizePlaytestKeybinds(playtestPrefs?.keybinds),
      hud: normalizeHudLayout(playtestPrefs?.hud),
      skin: normalizePlaytestSkin(playtestPrefs?.skin),
      humanize: normalizeHumanize(playtestPrefs?.humanize),
      skill: {
        ...DEFAULT_APP_SETTINGS.playtest.skill,
        ...(playtestPrefs?.skill ?? {}),
        enabled: true,
        lnProfile: playtestPrefs?.skill
          ? playtestPrefs.skill.lnProfile
          : DEFAULT_APP_SETTINGS.playtest.skill.lnProfile,
        danSelections: playtestPrefs?.skill
          ? (playtestPrefs.skill.danSelections ?? {})
          : DEFAULT_APP_SETTINGS.playtest.skill.danSelections,
      },
    },
  };
}
