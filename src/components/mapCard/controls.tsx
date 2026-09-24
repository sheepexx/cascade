import type { CSSProperties, ReactNode } from "react";
import { Slider, Toggle } from "../ui/Controls";

export const CARD_LABEL =
  "text-[11px] font-semibold uppercase tracking-wide text-slate-400";

const SECTION_SURFACE = { "--slider-surface": "#1a1a23" } as CSSProperties;

export function CardSection({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      style={SECTION_SURFACE}
      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-ink-700/40 p-3.5"
    >
      <div className="flex min-h-[1.25rem] items-center justify-between gap-2">
        <h3 className={CARD_LABEL}>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div
      aria-disabled={disabled || undefined}
      className={`flex flex-col gap-1.5 ${disabled ? "opacity-45" : ""}`}
    >
      <div className="flex items-center justify-between text-sm text-slate-200">
        <span>{label}</span>
        <span className="font-medium tabular-nums text-slate-300">
          {format(value)}
        </span>
      </div>
      <Slider
        size="sm"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
        aria-valuetext={format(value)}
      />
    </div>
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 text-sm text-slate-200 ${
        disabled ? "opacity-45" : ""
      }`}
    >
      <span className="min-w-0">
        {label}
        {hint && (
          <span className="block text-[11px] leading-snug text-slate-500">
            {hint}
          </span>
        )}
      </span>
      <Toggle
        size="sm"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
      />
    </div>
  );
}

const NOTICE_TONES = {
  info: "border-white/10 bg-white/[0.03] text-slate-400",
  warn: "border-amber-500/30 bg-amber-950/20 text-amber-100",
  error: "border-red-500/30 bg-red-950/30 text-red-200",
  success: "border-emerald-500/30 bg-emerald-950/30 text-emerald-200",
} as const;

export function Notice({
  tone = "info",
  children,
}: {
  tone?: keyof typeof NOTICE_TONES;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] leading-snug ${NOTICE_TONES[tone]}`}
    >
      {children}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-500 border-t-accent motion-reduce:animate-none ${className}`}
    />
  );
}
