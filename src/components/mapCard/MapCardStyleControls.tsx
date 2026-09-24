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
import { CARD_LABEL, CardSection } from "./controls";

const ACCENT_NAMES: Record<MapCardAccent, MessageKey> = {
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

export function MapCardStyleControls({
  config,
  skillsetsShown,
  onChange,
}: {
  config: MapCardConfig;
  skillsetsShown: boolean;
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

  return (
    <CardSection title={t("mapCard.style")}>
      <SegmentedControl
        options={layouts}
        value={config.layout}
        onChange={(layout) => onChange({ layout })}
      />
      <div
        className={`flex flex-col gap-1.5 ${skillsetsShown ? "" : "opacity-45"}`}
        aria-disabled={!skillsetsShown || undefined}
      >
        <span className={CARD_LABEL}>{t("mapCard.skillsets")}</span>
        <SegmentedControl
          options={skillsetStyles}
          value={config.skillsetStyle}
          onChange={(skillsetStyle) => onChange({ skillsetStyle })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className={CARD_LABEL}>{t("mapCard.accent")}</span>
        <div
          role="radiogroup"
          aria-label={t("mapCard.accentColour")}
          className="flex flex-wrap gap-2"
        >
          {MAP_CARD_ACCENTS.map((accent) => {
            const selected = config.accent === accent;
            const name = t(ACCENT_NAMES[accent]);
            return (
              <button
                key={accent}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={name}
                title={name}
                onClick={() => onChange({ accent })}
                className={`grid h-7 w-7 place-items-center rounded-full border transition duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95 ${
                  selected
                    ? "border-white/70 bg-white/10"
                    : "border-white/10 hover:border-white/30"
                }`}
              >
                <span
                  className="h-4 w-4 rounded-full shadow-inner shadow-black/30"
                  style={{
                    background:
                      accent === "difficulty"
                        ? STAR_SPECTRUM
                        : MAP_CARD_ACCENT_COLORS[accent],
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </CardSection>
  );
}
