import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatUiNumber } from "../../lib/formatUiNumber";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

const inputBase =
  "rounded-lg bg-ink-700/65 border border-white/10 px-3 py-2 text-sm text-slate-100 " +
  "outline-none shadow-inner shadow-black/10 backdrop-blur-sm transition duration-150 focus:border-accent/70 focus:ring-1 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-45";

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function NumberInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return (
    <input
      type="number"
      {...props}
      className={`${inputBase} ${props.className ?? ""}`}
    />
  );
}

export function PrecisionNumberInput({
  value,
  onValueChange,
  maximumFractionDigits = 2,
  onFocus,
  onBlur,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number;
  onValueChange: (value: number) => void;
  maximumFractionDigits?: number;
}) {
  const digits = Math.max(0, Math.min(2, Math.trunc(maximumFractionDigits)));
  const formatted = formatUiNumber(value, digits);
  const [draft, setDraft] = useState(formatted);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(formatted);
  }, [formatted]);

  return (
    <NumberInput
      {...props}
      value={draft}
      onFocus={(event) => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (next.trim() === "") return;
        const parsed = Number(next);
        if (Number.isFinite(parsed)) onValueChange(parsed);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        const parsed = Number(event.target.value);
        if (event.target.value.trim() !== "" && Number.isFinite(parsed)) {
          const rounded = Number(parsed.toFixed(digits));
          onValueChange(rounded);
          setDraft(formatUiNumber(rounded, digits));
        } else {
          setDraft(formatted);
        }
        onBlur?.(event);
      }}
    />
  );
}

export function Button({
  variant = "ghost",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "accent";
}) {
  const styles: Record<string, string> = {
    primary:
      "bg-ink-600/75 hover:bg-ink-500/85 text-slate-100 border border-white/10",
    ghost:
      "bg-transparent hover:bg-white/10 text-slate-300 border border-transparent",
    accent:
      "bg-accent/90 hover:bg-accent-soft/95 text-white border border-accent-deep/40",
  };
  return (
    <button
      type={type}
      {...props}
      className={`rounded-lg px-3 py-2 text-sm font-medium shadow-sm backdrop-blur-sm transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${styles[variant]} ${className}`}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  size = "md",
  id,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  id?: string;
  "aria-label"?: string;
}) {
  const dims =
    size === "sm"
      ? { track: "h-4 w-7", knob: "h-3 w-3", on: "translate-x-3.5", off: "translate-x-0.5" }
      : { track: "h-5 w-9", knob: "h-4 w-4", on: "translate-x-4", off: "translate-x-0.5" };
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${dims.track} shrink-0 cursor-pointer items-center rounded-full border border-white/10 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-800 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-accent/90" : "bg-ink-600"
      }`}
    >
      <span
        className={`inline-block ${dims.knob} transform rounded-full bg-white shadow transition-transform ${
          checked ? dims.on : dims.off
        }`}
      />
    </button>
  );
}

export function FileButton({
  label,
  accept,
  onFile,
}: {
  label: string;
  accept: string;
  onFile: (file: File) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-ink-600/75 px-3 py-2 text-sm font-medium text-slate-200 shadow-sm backdrop-blur-sm transition duration-150 hover:bg-ink-500/85 focus-within:ring-2 focus-within:ring-accent/60 active:scale-[0.98]">
      {label}
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}
