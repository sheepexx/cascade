import type { MapCardConfig, MapCardStat } from "../../lib/mapCard";
import { useT, type MessageKey } from "../../lib/i18n";
import { CardSection, ToggleRow } from "./controls";

const ROWS: { stat: MapCardStat; label: MessageKey | null; hint?: MessageKey }[] = [
  { stat: "starRating", label: "mapCard.statStar" },
  { stat: "msd", label: "mapCard.statMsd", hint: "mapCard.statMsdHint" },
  { stat: "bpm", label: null },
  { stat: "length", label: "mapCard.statLength" },
  { stat: "notes", label: "mapCard.statNotes" },
  { stat: "longNotes", label: "mapCard.statLongNotes", hint: "mapCard.statLongNotesHint" },
  { stat: "nps", label: "mapCard.statNps" },
  { stat: "judgement", label: "mapCard.statJudgement" },
];

export function MapCardStatToggles({
  config,
  onChange,
}: {
  config: MapCardConfig;
  onChange: (patch: Partial<MapCardConfig>) => void;
}) {
  const t = useT();
  return (
    <CardSection title={t("mapCard.showOnCard")}>
      <div className="flex flex-col gap-2.5">
        {ROWS.map((row) => (
          <ToggleRow
            key={row.stat}
            label={row.label ? t(row.label) : "BPM"}
            hint={row.hint ? t(row.hint) : undefined}
            checked={config.visibleStats[row.stat]}
            onChange={(value) =>
              onChange({
                visibleStats: { ...config.visibleStats, [row.stat]: value },
              })
            }
          />
        ))}
        <ToggleRow
          label={t("mapCard.branding")}
          hint={t("mapCard.brandingHint")}
          checked={config.showBranding}
          onChange={(showBranding) => onChange({ showBranding })}
        />
      </div>
    </CardSection>
  );
}
