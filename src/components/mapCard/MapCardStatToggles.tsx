import type { MapCardConfig, MapCardStat } from "../../lib/mapCard";
import { useT, type MessageKey } from "../../lib/i18n";
import { CheckIcon } from "../ui/Icons";
import { PanelSection } from "./controls";

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

function Chip({
  label,
  hint,
  checked,
  wide = false,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  wide?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hint ? `${label}. ${hint}` : label}
      title={hint}
      onClick={() => onChange(!checked)}
      className={`flex min-h-[2rem] items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs leading-tight transition duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
        wide ? "col-span-2" : ""
      } ${
        checked
          ? "text-slate-100 hover:bg-white/[0.04]"
          : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"
      }`}
    >
      <span
        aria-hidden
        className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm border transition-colors duration-[var(--motion-quick)] ${
          checked ? "border-accent bg-accent text-white" : "border-white/25 bg-black/20"
        }`}
      >
        {checked && <CheckIcon className="h-2.5 w-2.5" />}
      </span>
      <span className="min-w-0">{label}</span>
    </button>
  );
}

export function MapCardStatToggles({
  config,
  onChange,
}: {
  config: MapCardConfig;
  onChange: (patch: Partial<MapCardConfig>) => void;
}) {
  const t = useT();
  const shown = ROWS.filter((row) => config.visibleStats[row.stat]).length;
  return (
    <PanelSection
      title={t("mapCard.showOnCard")}
      aside={
        <span className="text-[11px] tabular-nums text-slate-500">
          {t("mapCard.statsShown", { shown: String(shown), total: String(ROWS.length) })}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-1.5">
        {ROWS.map((row) => (
          <Chip
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
        <Chip
          wide
          label={t("mapCard.branding")}
          hint={t("mapCard.brandingHint")}
          checked={config.showBranding}
          onChange={(showBranding) => onChange({ showBranding })}
        />
      </div>
    </PanelSection>
  );
}
