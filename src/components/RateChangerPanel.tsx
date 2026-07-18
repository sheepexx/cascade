import { useEffect, useMemo, useRef, useState } from "react";
import type { Difficulty } from "../types";
import {
  RATE_MAX,
  RATE_MIN,
  RATE_PRESETS,
  RATE_STEP,
  describeRateChange,
  formatRate,
  formatRateDisplay,
  isNeutralRate,
  parseRateInput,
  quantizeRate,
} from "../lib/rateChange";
import { Toggle } from "./ui/Controls";

const EXIT_MS = 180;

type Props = {
  open: boolean;
  difficulty: Difficulty | null;
  existingNames: string[];
  durationMs: number | null;
  canEdit: boolean;
  onCreate: (rate: number, onlyRateAsName: boolean) => void;
  onClose: () => void;
};

export function RateChangerPanel({
  open,
  difficulty,
  existingNames,
  durationMs,
  canEdit,
  onCreate,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [rate, setRate] = useState(1);
  const [draft, setDraft] = useState("1.00");
  const [invalid, setInvalid] = useState(false);
  const [onlyRateAsName, setOnlyRateAsName] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const id = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => window.clearTimeout(id);
  }, [open, mounted]);

  // Re-sync the text field whenever the panel is reopened, so a half-typed
  // value never survives a close.
  useEffect(() => {
    if (!open) return;
    setDraft(formatRateDisplay(rate));
    setInvalid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const preview = useMemo(
    () =>
      difficulty
        ? describeRateChange(difficulty, {
            rate,
            onlyRateAsName,
            existingNames,
            durationMs,
          })
        : null,
    [difficulty, rate, onlyRateAsName, existingNames, durationMs],
  );

  const commitRate = (next: number) => {
    const q = quantizeRate(next);
    setRate(q);
    setDraft(formatRateDisplay(q));
    setInvalid(false);
  };

  const commitDraft = (): number | null => {
    const parsed = parseRateInput(draft);
    if (parsed === null) {
      setInvalid(true);
      return null;
    }
    commitRate(parsed);
    return parsed;
  };

  const neutral = isNeutralRate(rate);
  const disabled = !difficulty || !canEdit || neutral || invalid;

  const create = (value = rate) => {
    if (!difficulty || !canEdit || isNeutralRate(value) || invalid) return;
    onCreate(value, onlyRateAsName);
  };

  if (!mounted) return null;

  return (
    <div className="rate-panel-reveal shrink-0" data-open={open && !closing}>
      <div
        className={`border-b border-white/10 bg-white/[0.02] px-3 py-3 ${
          closing ? "rate-panel-out" : "rate-panel-in"
        }`}
      >
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Rate changer
          </span>
          <span className="text-lg font-semibold tabular-nums leading-none text-accent">
            {formatRateDisplay(rate)}x
          </span>
        </div>

        <input
          type="range"
          min={RATE_MIN}
          max={RATE_MAX}
          step={RATE_STEP}
          value={rate}
          disabled={!canEdit}
          onChange={(e) => commitRate(Number(e.target.value))}
          aria-label="Rate"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent disabled:cursor-not-allowed disabled:opacity-40"
        />

        <div className="mt-2.5 flex items-center gap-2">
          <input
            ref={inputRef}
            value={draft}
            inputMode="decimal"
            disabled={!canEdit}
            aria-label="Rate value"
            aria-invalid={invalid}
            onChange={(e) => {
              setDraft(e.target.value);
              setInvalid(false);
            }}
            onBlur={() => {
              if (parseRateInput(draft) === null) setDraft(formatRateDisplay(rate));
              setInvalid(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                const parsed = commitDraft();
                if (parsed !== null) create(parsed);
              } else if (e.key === "Escape") {
                setDraft(formatRateDisplay(rate));
                setInvalid(false);
                inputRef.current?.blur();
              }
            }}
            className={`w-20 rounded-lg border bg-ink-700/65 px-2 py-1.5 text-sm tabular-nums text-slate-100 shadow-inner shadow-black/10 outline-none backdrop-blur-sm transition focus:ring-1 disabled:cursor-not-allowed disabled:opacity-40 ${
              invalid
                ? "border-red-400/70 focus:border-red-400/70 focus:ring-red-400/40"
                : "border-white/10 focus:border-accent/70 focus:ring-accent/40"
            }`}
          />
          <span className="min-w-0 flex-1 text-[10px] leading-tight text-slate-500">
            {invalid
              ? `Enter a rate between ${formatRate(RATE_MIN)} and ${formatRate(RATE_MAX)}.`
              : "Enter to create"}
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-4 gap-1">
          {RATE_PRESETS.map((preset) => {
            const selected = Math.abs(preset - rate) < 1e-6;
            return (
              <button
                key={preset}
                type="button"
                disabled={!canEdit}
                onClick={() => commitRate(preset)}
                className={`rounded-md border px-1 py-1 text-[11px] font-medium tabular-nums transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected
                    ? "border-accent/70 bg-accent/20 text-slate-100"
                    : "border-white/10 bg-ink-700/45 text-slate-300 hover:border-white/20 hover:bg-ink-600/70"
                }`}
              >
                {formatRate(preset)}x
              </button>
            );
          })}
        </div>

        <label className="mt-2.5 flex cursor-pointer items-center justify-between gap-2">
          <span className="min-w-0 text-[11px] leading-tight text-slate-400">
            Only use the rate as the difficulty name
          </span>
          <Toggle
            size="sm"
            checked={onlyRateAsName}
            disabled={!canEdit}
            onChange={setOnlyRateAsName}
            aria-label="Only use the rate as the difficulty name"
          />
        </label>

        {preview && (
          <div className="mt-2.5 flex flex-col gap-1 rounded-lg border border-white/10 bg-ink-900/45 px-2.5 py-2 text-[11px]">
            <PreviewRow label="BPM" from={preview.bpmBefore} to={preview.bpmAfter} />
            {preview.lengthBefore && preview.lengthAfter && (
              <PreviewRow
                label="Length"
                from={preview.lengthBefore}
                to={preview.lengthAfter}
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Name</span>
              <span
                className="min-w-0 truncate font-medium text-slate-200"
                title={preview.name}
              >
                {neutral ? "—" : preview.name}
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={() => create()}
          className="mt-2.5 w-full rounded-lg border border-accent-deep/40 bg-accent/90 px-3 py-2 text-[12px] font-medium text-white shadow-sm backdrop-blur-sm transition hover:bg-accent-soft/95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Create Rate Difficulty
        </button>

        {neutral && (
          <p className="mt-1.5 text-center text-[10px] leading-tight text-slate-500">
            At 1.00x nothing would change — pick another rate.
          </p>
        )}
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  from,
  to,
}: {
  label: string;
  from: string;
  to: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 truncate tabular-nums text-slate-400">
        {from} <span className="text-slate-600">→</span>{" "}
        <span className="font-medium text-slate-200">{to}</span>
      </span>
    </div>
  );
}
