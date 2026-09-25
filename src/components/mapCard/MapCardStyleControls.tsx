import { SegmentedControl } from "../ui/Controls";
import {
  MAP_CARD_ACCENT_COLORS,
  MAP_CARD_ACCENTS,
  type MapCardAccent,
  type MapCardConfig,
  type MapCardLayout,
  type MapCardSkillsetStyle,
} from "../../lib/mapCard";
import { useT, type MessageKey } from "../../lib/i18n";
import { FieldLabel, PanelSection } from "./controls";

const ACCENT_NAMES: Record<Exclude<MapCardAccent, "auto">, MessageKey> = {
  cascade: "mapCard.accentCascade",
  blue: "mapCard.accentBlue",
  teal: "mapCard.accentTeal",
  violet: "mapCard.accentViolet",
  amber: "mapCard.accentAmber",
  green: "mapCard.accentGreen",
  difficulty: "mapCard.accentDifficulty",
};

const STAR_SPECTRUM =
  "conic-gradient(#4fc0ff, #4fffd5, #7cff4f, #f6f05c, #ff8068, #ff4e6f, #c645b8, #6563de, #4fc0ff)";

const RING =
  "transition duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95";

export function MapCardStyleControls({
  config,
  skillsetsShown,
  autoAccent,
  onChange,
}: {
  config: MapCardConfig;
  skillsetsShown: boolean;
  /** The colour Auto takes from the background, or null when it has none. */
  autoAccent: string | null;
  onChange: (patch: Partial<MapCardConfig>) => void;
}) {
  const t = useT();
  const layouts: { value: MapCardLayout; label: string }[] = [
    { value: "detailed", label: t("mapCard.detailed") },
    { value: "compact", label: t("mapCard.compact") },
  ];
  const skillsetStyles: { value: MapCardSkillsetStyle; label: string }[] = [
    { value: "bars", label: t("mapCard.bars") },
    { value: "tiles", label: t("mapCard.tiles") },
    { value: "pills", label: t("mapCard.pills") },
  ];
  const autoSelected = config.accent === "auto";
  const autoTitle = autoAccent ? t("mapCard.accentAutoHint") : t("mapCard.accentAutoFallback");

  return (
    <PanelSection title={t("mapCard.style")}>
      <div className="flex flex-col gap-1.5">
        <FieldLabel>{t("mapCard.layout")}</FieldLabel>
        <SegmentedControl
          options={layouts}
          value={config.layout}
          onChange={(layout) => onChange({ layout })}
        />
      </div>
      <div
        className={`flex flex-col gap-1.5 transition-opacity ${skillsetsShown ? "" : "opacity-45"}`}
        aria-disabled={!skillsetsShown || undefined}
      >
        <FieldLabel>{t("mapCard.skillsets")}</FieldLabel>
        <SegmentedControl
          options={skillsetStyles}
          value={config.skillsetStyle}
          onChange={(skillsetStyle) => onChange({ skillsetStyle })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <FieldLabel>{t("mapCard.accent")}</FieldLabel>
        <div
          role="radiogroup"
          aria-label={t("mapCard.accentColour")}
          className="flex flex-wrap items-center gap-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={autoSelected}
            aria-label={`${t("mapCard.accentAuto")}. ${autoTitle}`}
            title={autoTitle}
            onClick={() => onChange({ accent: "auto" })}
            className={`mr-0.5 flex h-6 items-center gap-1.5 rounded-full border pl-0.5 pr-2 text-[12px] font-medium ${RING} ${
              autoSelected
                ? "border-white/70 bg-white/10 text-slate-100"
                : "border-white/10 text-slate-400 hover:border-white/30 hover:text-slate-200"
            }`}
          >
            <span
              className="relative h-[18px] w-[18px] rounded-full shadow-inner shadow-black/30"
              style={{ background: autoAccent ?? MAP_CARD_ACCENT_COLORS.cascade }}
            >
              <span className="absolute -right-0.5 -top-0.5 grid h-2.5 w-2.5 place-items-center rounded-full bg-ink-800 text-[7px] leading-none text-slate-200">
                ✦
              </span>
            </span>
            {t("mapCard.accentAuto")}
          </button>
          {MAP_CARD_ACCENTS.filter((accent) => accent !== "auto").map((accent) => {
            const selected = config.accent === accent;
            const name = t(ACCENT_NAMES[accent as Exclude<MapCardAccent, "auto">]);
            return (
              <button
                key={accent}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={name}
                title={name}
                onClick={() => onChange({ accent })}
                className={`grid h-6 w-6 place-items-center rounded-full border ${RING} ${
                  selected
                    ? "border-white/70 bg-white/10"
                    : "border-white/10 hover:border-white/30"
                }`}
              >
                <span
                  className="h-[15px] w-[15px] rounded-full shadow-inner shadow-black/30"
                  style={{
                    background:
                      accent === "difficulty"
                        ? STAR_SPECTRUM
                        : MAP_CARD_ACCENT_COLORS[accent as keyof typeof MAP_CARD_ACCENT_COLORS],
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </PanelSection>
  );
}
