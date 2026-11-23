import { useState } from "react";
import { useT } from "../../lib/i18n";
import { Slider } from "./Controls";

// The exact-number box and the slider-plus-box row the HUD editor and the
// audio setup share.

export function NumberBox({
  label,
  ariaLabel,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  ariaLabel?: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-white/10 bg-ink-700/60 px-2 transition focus-within:border-accent/60">
      {label && <span className="text-[11px] font-semibold text-slate-500">{label}</span>}
      <input
        type="number"
        inputMode="numeric"
        aria-label={ariaLabel ?? label}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n)) {
            onChange(Math.round(Math.min(max, Math.max(min, n))));
          }
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => e.stopPropagation()}
        className="w-full min-w-0 bg-transparent py-1.5 text-right text-sm tabular-nums text-slate-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {unit && <span className="text-[11px] text-slate-500">{unit}</span>}
    </label>
  );
}

export /** A slider with an exact number box beside it, for values that need both. */
function SliderInputRow({
  label,
  hint,
  value,
  min,
  max,
  sliderMin = min,
  sliderMax = max,
  step,
  unit,
  resetTo,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  sliderMin?: number;
  sliderMax?: number;
  step: number;
  unit?: string;
  /** Shows a Reset button that puts the value back to this. */
  resetTo?: number;
  onChange: (value: number) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
        <span className="min-w-0">{label}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {resetTo !== undefined && (
            <button
              type="button"
              disabled={value === resetTo}
              onClick={() => onChange(resetTo)}
              aria-label={`${t("common.reset")} ${label}`}
              className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {t("common.reset")}
            </button>
          )}
          <span className="w-24">
            <NumberBox label="" ariaLabel={label} value={value} min={min} max={max} unit={unit} onChange={onChange} />
          </span>
        </span>
      </div>
      <Slider
        size="sm"
        min={sliderMin}
        max={sliderMax}
        step={step}
        value={Math.min(sliderMax, Math.max(sliderMin, value))}
        onChange={onChange}
        aria-label={label}
      />
      {hint && <p className="text-[11px] leading-snug text-slate-500">{hint}</p>}
    </div>
  );
}
