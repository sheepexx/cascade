import { useId } from "react";
import { useT, type MessageKey } from "../../lib/i18n";
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  themeVariables,
  usableBackground,
  type ThemePresetId,
  type ThemeSettings,
} from "../../lib/theme";
import { SettingRow, SettingsExtra } from "./settingsLayout";

const PRESET_NAMES: Record<ThemePresetId, MessageKey> = {
  cascade: "settings.themeCascade",
  ocean: "settings.themeOcean",
  orchid: "settings.themeOrchid",
};

/**
 * A little editor in the theme's colours: the top bar, the side panel, the
 * playfield with its lanes and a note in the accent.
 */
function ThemePreview({ accent, background }: { accent: string; background: string }) {
  const vars = themeVariables({ preset: "custom", accent, background });
  const ink = (shade: number) => `rgb(${vars[`--ink-${shade}`]})`;
  const line = `rgb(${vars["--slate-500"]} / 0.35)`;
  return (
    <svg viewBox="0 0 120 68" className="block h-auto w-full" aria-hidden>
      <rect width="120" height="68" fill={ink(950)} />
      <rect width="120" height="11" fill={ink(900)} />
      <circle cx="7" cy="5.5" r="2.6" fill={accent} />
      <rect x="13" y="4" width="16" height="3" rx="1.5" fill={line} />
      <rect x="32" y="4" width="11" height="3" rx="1.5" fill={line} />
      <rect y="11" width="28" height="57" fill={ink(900)} />
      <rect x="4" y="16" width="20" height="7" rx="1.5" fill={ink(700)} />
      <rect x="4" y="16" width="1.6" height="7" rx="0.8" fill={accent} />
      <rect x="4" y="26" width="20" height="5" rx="1.5" fill={ink(800)} />
      <rect x="4" y="34" width="20" height="5" rx="1.5" fill={ink(800)} />
      <rect x="54" y="11" width="40" height="57" fill={ink(800)} />
      {[64, 74, 84].map((x) => (
        <line key={x} x1={x} y1="11" x2={x} y2="68" stroke={ink(600)} strokeWidth="0.6" />
      ))}
      <rect x="56" y="24" width="7" height="3" rx="1" fill={accent} />
      <rect x="76" y="38" width="7" height="3" rx="1" fill={`rgb(${vars["--slate-200"]})`} />
      <rect x="54" y="56" width="40" height="1.2" fill={accent} opacity="0.8" />
      <rect x="28" y="60" width="92" height="8" fill={ink(900)} />
      <rect x="30" y="63" width="40" height="2" rx="1" fill={`rgb(${vars["--accent-rgb"]} / 0.55)`} />
    </svg>
  );
}

export function ThemePresets({
  theme,
  onTheme,
}: {
  theme: ThemeSettings;
  onTheme: (theme: ThemeSettings) => void;
}) {
  const t = useT();
  const cards: {
    id: ThemeSettings["preset"];
    label: string;
    accent: string;
    background: string;
  }[] = THEME_PRESETS.map((preset) => ({
    id: preset.id,
    label: t(PRESET_NAMES[preset.id]),
    accent: preset.accent,
    background: preset.background,
  }));
  if (theme.preset === "custom") {
    cards.push({
      id: "custom",
      label: t("settings.themeCustom"),
      accent: theme.accent,
      background: theme.background,
    });
  }
  return (
    <SettingsExtra
      keywords={[t("settings.theme"), t("settings.accentColour"), t("settings.backgroundColour"), "colour color"]}
      className="grid grid-cols-2 gap-2.5 py-3 sm:grid-cols-4"
    >
      {cards.map((card) => {
        const selected = theme.preset === card.id;
        return (
          <button
            key={card.id}
            type="button"
            aria-pressed={selected}
            onClick={() =>
              card.id !== "custom" &&
              onTheme({ preset: card.id, accent: card.accent, background: card.background })
            }
            className={`group flex flex-col gap-2 rounded-xl p-1.5 text-left transition duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
              selected
                ? "bg-white/[0.06] ring-2 ring-accent"
                : "ring-1 ring-white/[0.08] hover:bg-white/[0.04] hover:ring-white/[0.16]"
            }`}
          >
            <span className="block overflow-hidden rounded-lg ring-1 ring-black/40">
              <ThemePreview accent={card.accent} background={card.background} />
            </span>
            <span className="flex items-center gap-2 px-1 pb-0.5">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/20"
                style={{ background: card.accent }}
              />
              <span className="truncate text-xs font-semibold text-slate-100">{card.label}</span>
            </span>
          </button>
        );
      })}
    </SettingsExtra>
  );
}

/** A colour as a swatch and its hex code; the swatch opens the system picker. */
export function ColourRow({
  label,
  tip,
  value,
  shown,
  onChange,
  onReset,
  resetLabel,
}: {
  label: string;
  tip?: string;
  value: string;
  /** What will actually be used, when it differs from what was picked. */
  shown?: string;
  onChange: (hex: string) => void;
  onReset?: () => void;
  resetLabel: string;
}) {
  const id = useId();
  return (
    <SettingRow label={label} tip={tip}>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-100"
        >
          {resetLabel}
        </button>
      )}
      <label
        htmlFor={id}
        className="flex h-8 cursor-pointer items-center gap-2 rounded-lg bg-black/30 pl-1 pr-2.5 ring-1 ring-inset ring-white/[0.08] transition hover:ring-white/[0.18] focus-within:ring-2 focus-within:ring-accent/60"
      >
        <span
          aria-hidden
          className="h-6 w-6 rounded-md ring-1 ring-inset ring-white/20"
          style={{ background: shown ?? value }}
        />
        <span className="font-mono text-xs uppercase tabular-nums text-slate-300">{shown ?? value}</span>
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="sr-only"
          aria-label={label}
        />
      </label>
    </SettingRow>
  );
}

export function ThemeColourRows({
  theme,
  onTheme,
}: {
  theme: ThemeSettings;
  onTheme: (theme: ThemeSettings) => void;
}) {
  const t = useT();
  const usable = usableBackground(theme.background);
  return (
    <>
      <ColourRow
        label={t("settings.accentColour")}
        tip={t("settings.accentColourHint")}
        value={theme.accent}
        onChange={(accent) => onTheme({ ...theme, preset: "custom", accent })}
        resetLabel={t("settings.themeReset")}
        onReset={theme.preset === "custom" ? () => onTheme({ ...DEFAULT_THEME }) : undefined}
      />
      <ColourRow
        label={t("settings.backgroundColour")}
        tip={t("settings.backgroundColourHint")}
        value={theme.background}
        shown={usable !== theme.background ? usable : undefined}
        onChange={(background) => onTheme({ ...theme, preset: "custom", background })}
        resetLabel={t("settings.themeReset")}
      />
    </>
  );
}
