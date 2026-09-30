import { SV_PRESETS } from "../../lib/sv";
import { formatUiNumber } from "../../lib/formatUiNumber";

/** One-click common SV values; the one matching the current value is lit. */
export function SvPresets({
  value,
  onPick,
}: {
  value: number;
  onPick: (sv: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {SV_PRESETS.map((sv) => {
        const active = Math.abs(value - sv) < 1e-6;
        return (
          <button
            key={sv}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(sv)}
            className={`rounded-lg border px-2 py-1.5 text-[11px] tabular-nums transition duration-[var(--motion-quick)] ${
              active
                ? "border-accent/60 bg-accent/15 text-slate-100"
                : "border-white/10 bg-ink-700/60 text-slate-300 hover:bg-ink-600 hover:text-slate-100"
            }`}
          >
            {formatUiNumber(sv)}×
          </button>
        );
      })}
    </div>
  );
}
