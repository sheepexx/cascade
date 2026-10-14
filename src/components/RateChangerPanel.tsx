import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  parseBpmInput,
  parseRateInput,
  quantizeRate,
  rateForBpm,
  type RateCreateOptions,
} from "../lib/rateChange";
import { Slider, Toggle } from "./ui/Controls";
import { buttonClass } from "./ui/buttonStyles";
import { useT } from "../lib/i18n";

const EXIT_MS = 180;

const showBpmValue = (bpm: number): string =>
  bpm > 0 ? String(Math.round(bpm * 100) / 100) : "";

type Props = {
  open: boolean;
  difficulty: Difficulty | null;
  existingNames: string[];
  durationMs: number | null;
  canEdit: boolean;
  onCreate: (options: RateCreateOptions) => void;
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
  const t = useT();
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [rate, setRate] = useState(1);
  const [rateDraft, setRateDraft] = useState("1.00");
  const [bpmDraft, setBpmDraft] = useState("");
  const [invalid, setInvalid] = useState<"rate" | "bpm" | null>(null);
  const [onlyRateAsName, setOnlyRateAsName] = useState(false);
  const [showBpm, setShowBpm] = useState(true);
  const [preservePitch, setPreservePitch] = useState(false);
  const rateInputRef = useRef<HTMLInputElement>(null);

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
            showBpm,
            existingNames,
            durationMs,
          })
        : null,
    [difficulty, rate, onlyRateAsName, showBpm, existingNames, durationMs],
  );
  const baseBpm = preview?.baseBpm ?? 0;

  // Rate is the single source of truth; both fields are written from it, so a
  // half-typed value never survives a commit, a reopen or a difficulty switch.
  const commitRate = (next: number) => {
    const q = quantizeRate(next);
    setRate(q);
    setRateDraft(formatRateDisplay(q));
    setBpmDraft(showBpmValue(baseBpm * q));
    setInvalid(null);
  };

  useEffect(() => {
    if (!open) return;
    setRateDraft(formatRateDisplay(rate));
    setBpmDraft(showBpmValue(baseBpm * rate));
    setInvalid(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, baseBpm]);

  const commitRateDraft = (): number | null => {
    const parsed = parseRateInput(rateDraft);
    if (parsed === null) {
      setInvalid("rate");
      return null;
    }
    commitRate(parsed);
    return parsed;
  };

  const commitBpmDraft = (): number | null => {
    const parsed = parseBpmInput(bpmDraft);
    const next = parsed === null ? null : rateForBpm(baseBpm, parsed);
    if (next === null) {
      setInvalid("bpm");
      return null;
    }
    commitRate(next);
    return next;
  };

  const neutral = isNeutralRate(rate);
  const disabled = !difficulty || !canEdit || neutral || invalid !== null;

  const create = (value = rate) => {
    if (!difficulty || !canEdit || isNeutralRate(value) || invalid !== null) return;
    onCreate({ rate: value, onlyRateAsName, showBpm, preservePitch });
  };

  const fieldClass = (bad: boolean) =>
    `min-w-0 h-7 rounded-md bg-black/25 px-2 text-sm tabular-nums text-slate-100 ring-1 ring-inset outline-none transition disabled:cursor-not-allowed disabled:opacity-40 ${
      bad
        ? "ring-rose-400/70"
        : "ring-white/[0.08] hover:ring-white/[0.14] focus:ring-accent/70"
    }`;

  if (!mounted) return null;

  return (
    <div className="rate-panel-reveal shrink-0" data-open={open && !closing}>
      <div
        className={`mx-1.5 mb-2 rounded-lg bg-white/[0.03] px-3 py-3 ring-1 ring-inset ring-white/[0.05] ${
          closing ? "rate-panel-out" : "rate-panel-in"
        }`}
      >
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-300">
            {t("rate.title")}
          </span>
          <span className="font-display text-lg font-bold tabular-nums leading-none text-slate-50">
            {formatRateDisplay(rate)}x
          </span>
        </div>

        <Slider
          min={RATE_MIN}
          max={RATE_MAX}
          step={RATE_STEP}
          value={rate}
          disabled={!canEdit}
          onChange={(value) => commitRate(value)}
          aria-label={t("rate.rate")}
        />

        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-500">×</span>
          <input
            ref={rateInputRef}
            value={rateDraft}
            inputMode="decimal"
            disabled={!canEdit}
            aria-label={t("rate.rateValue")}
            aria-invalid={invalid === "rate"}
            onChange={(e) => {
              setRateDraft(e.target.value);
              setInvalid(null);
            }}
            onBlur={() => {
              // Commit on blur, not just Enter: clicking straight to Create
              // after typing a rate must use the rate that's on screen.
              if (commitRateDraft() === null) {
                setRateDraft(formatRateDisplay(rate));
                setInvalid(null);
              }
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                const next = commitRateDraft();
                if (next !== null) create(next);
              } else if (e.key === "Escape") {
                setRateDraft(formatRateDisplay(rate));
                setInvalid(null);
                rateInputRef.current?.blur();
              }
            }}
            className={`w-[4.25rem] ${fieldClass(invalid === "rate")}`}
          />
          <input
            value={bpmDraft}
            inputMode="decimal"
            disabled={!canEdit || baseBpm <= 0}
            aria-label={t("rate.targetBpm")}
            aria-invalid={invalid === "bpm"}
            onChange={(e) => {
              setBpmDraft(e.target.value);
              setInvalid(null);
            }}
            onBlur={() => {
              if (commitBpmDraft() === null) {
                setBpmDraft(showBpmValue(baseBpm * rate));
                setInvalid(null);
              }
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                const next = commitBpmDraft();
                if (next !== null) create(next);
              } else if (e.key === "Escape") {
                setBpmDraft(showBpmValue(baseBpm * rate));
                setInvalid(null);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={`flex-1 ${fieldClass(invalid === "bpm")}`}
          />
          <span className="text-2xs font-medium text-slate-500">BPM</span>
        </div>

        {invalid && (
          <p className="mt-1.5 text-2xs leading-tight text-rose-300">
            {invalid === "rate"
              ? t("rate.invalidRate", { min: formatRate(RATE_MIN), max: formatRate(RATE_MAX) })
              : t("rate.invalidBpm", { min: Math.round(baseBpm * RATE_MIN), max: Math.round(baseBpm * RATE_MAX) })}
          </p>
        )}

        <div className="mt-2.5 grid grid-cols-4 gap-1">
          {RATE_PRESETS.map((preset) => {
            const selected = Math.abs(preset - rate) < 1e-6;
            return (
              <button
                key={preset}
                type="button"
                disabled={!canEdit}
                onClick={() => commitRate(preset)}
                className={`h-6 rounded text-[11px] font-medium tabular-nums transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected
                    ? "bg-ink-500 text-slate-50 shadow-[0_1px_2px_rgb(0_0_0/0.4)]"
                    : "bg-black/20 text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
                }`}
              >
                {formatRate(preset)}x
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 flex flex-col gap-1.5">
          <ToggleRow
            label={t("rate.onlyRateName")}
            checked={onlyRateAsName}
            disabled={!canEdit}
            onChange={setOnlyRateAsName}
          />
          <ToggleRow
            label={t("rate.showBpm")}
            checked={showBpm}
            disabled={!canEdit}
            onChange={setShowBpm}
          />
          <ToggleRow
            label={t("rate.preservePitch")}
            title={t("rate.preservePitchHint")}
            checked={preservePitch}
            disabled={!canEdit}
            onChange={setPreservePitch}
          />
        </div>

        {preview && (
          <div className="mt-2.5 flex flex-col gap-1 border-t border-white/[0.06] pt-2.5 text-[11px]">
            <PreviewRow label="BPM" from={preview.bpmBefore} to={preview.bpmAfter} />
            {preview.lengthBefore && preview.lengthAfter && (
              <PreviewRow
                label={t("rate.length")}
                from={preview.lengthBefore}
                to={preview.lengthAfter}
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">{t("common.name")}</span>
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
          className={buttonClass("accent", "sm", "mt-2.5 w-full")}
        >
          {t("rate.create")}
        </button>

        {neutral && (
          <p className="mt-1.5 text-center text-2xs leading-tight text-slate-500">
            {t("rate.neutral")}
          </p>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  title,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  title?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center justify-between gap-2"
      title={title}
    >
      <span className="min-w-0 text-[11px] leading-tight text-slate-400">
        {label}
      </span>
      <Toggle
        size="sm"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
      />
    </label>
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
}): ReactNode {
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
