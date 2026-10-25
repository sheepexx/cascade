import { useEffect, useState } from "react";
import { SegmentedControl } from "../ui/Controls";
import { Dropdown } from "../ui/Dropdown";
import { useLocale, type MessageKey } from "../../lib/i18n";
import {
  DISPLAY_MODES,
  FRAME_CAPS,
  WINDOW_SIZES,
  getDisplay,
  setDisplay,
  type DisplayInfo,
  type DisplayMode,
  type DisplaySettings,
  type FrameLimit,
} from "../../lib/displaySettings";
import { SettingRow, SettingsSection } from "./settingsLayout";

const MODE_LABELS: Record<DisplayMode, MessageKey> = {
  fullscreen: "graphics.fullscreen",
  borderless: "graphics.borderless",
  windowed: "graphics.windowed",
};

const sizeKey = (width: number, height: number) => `${width}x${height}`;

/** Desktop only: how the window is shown, and the frame limiter. */
export function GraphicsSettings() {
  const { t } = useLocale();
  const [info, setInfo] = useState<DisplayInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getDisplay()
      .then((next) => {
        if (live) setInfo(next);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
  }, []);

  if (!info) {
    return error ? <p className="text-xs text-rose-300">{error}</p> : null;
  }

  const { settings } = info;
  const update = (patch: Partial<DisplaySettings>) => {
    const next = { ...settings, ...patch };
    // Shown at once; the window catches up a moment later.
    setInfo({ ...info, settings: next });
    setError(null);
    setDisplay(next)
      .then(setInfo)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const windowed = settings.mode === "windowed";
  const fits = WINDOW_SIZES.filter(
    ([w, h]) => w <= info.monitorWidth && h <= info.monitorHeight,
  );
  const current = sizeKey(settings.width, settings.height);
  const sizeOptions = fits.map(([w, h]) => ({ value: sizeKey(w, h), label: `${w} × ${h}` }));
  if (!sizeOptions.some((option) => option.value === current)) {
    sizeOptions.unshift({
      value: current,
      label: t("graphics.customSize", { size: `${settings.width} × ${settings.height}` }),
    });
  }

  const limits: FrameLimit[] = ["vsync", ...FRAME_CAPS];
  const limitLabel = (limit: FrameLimit) =>
    limit === "vsync" ? t("graphics.vsync") : t("graphics.fpsCap", { fps: limit });

  return (
    <>
      <SettingsSection title={t("graphics.display")}>
        <SettingRow label={t("graphics.mode")} tip={t("graphics.modeHint")}>
          <SegmentedControl
            size="sm"
            options={DISPLAY_MODES.map((mode) => ({ value: mode, label: t(MODE_LABELS[mode]) }))}
            value={settings.mode}
            onChange={(mode: DisplayMode) => update({ mode })}
          />
        </SettingRow>
        <SettingRow
          label={t("graphics.windowSize")}
          tip={t("graphics.windowSizeHint")}
          disabled={!windowed}
        >
          <Dropdown
            className="w-48"
            aria-label={t("graphics.windowSize")}
            disabled={!windowed}
            value={current}
            options={sizeOptions}
            onChange={(value: string) => {
              const [width, height] = value.split("x").map(Number);
              update({ width, height });
            }}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t("graphics.frameRate")}>
        <SettingRow label={t("graphics.frameLimiter")} tip={t("graphics.frameLimiterHint")}>
          <Dropdown
            className="w-48"
            aria-label={t("graphics.frameLimiter")}
            value={settings.frameLimit}
            options={limits.map((limit) => ({ value: limit, label: limitLabel(limit) }))}
            onChange={(frameLimit: FrameLimit) => update({ frameLimit })}
          />
        </SettingRow>
      </SettingsSection>
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </>
  );
}
