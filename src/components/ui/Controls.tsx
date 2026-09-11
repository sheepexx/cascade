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
  "outline-none shadow-inner shadow-black/10 backdrop-blur-sm transition duration-[var(--motion-quick)] focus:border-accent/70 focus:ring-1 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-45";

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

export function Select({
  size = "md",
  className = "",
  children,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: "sm" | "md";
}) {
  const dims =
    size === "sm"
      ? { field: "py-1.5 pl-2.5 pr-7 text-xs", icon: "right-2 h-3 w-3" }
      : { field: "py-2 pl-3 pr-8 text-sm", icon: "right-2.5 h-3.5 w-3.5" };
  return (
    <span className={`relative inline-flex min-w-0 ${className}`}>
      <select
        {...props}
        className={`w-full min-w-0 appearance-none rounded-lg border border-white/10 bg-ink-700/65 ${dims.field} text-slate-100 shadow-inner shadow-black/10 outline-none backdrop-blur-sm transition duration-[var(--motion-quick)] hover:border-white/20 hover:bg-ink-600/70 focus-visible:border-accent/70 focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-45`}
      >
        {children}
      </select>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${dims.icon}`}
      >
        <path
          d="M6 9L12 15L18 9"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </span>
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
      className={`rounded-lg px-3 py-2 text-sm font-medium shadow-sm backdrop-blur-sm transition duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${styles[variant]} ${className}`}
    />
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>(`[data-segment="${value}"]`);
      if (!active) return;
      setPill((prev) =>
        prev?.left === active.offsetLeft && prev.width === active.offsetWidth
          ? prev
          : { left: active.offsetLeft, width: active.offsetWidth },
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(list);
    return () => observer?.disconnect();
  }, [value, options.length]);

  useEffect(() => {
    if (pill) setSettled(true);
  }, [pill]);

  return (
    <div
      ref={listRef}
      role="tablist"
      className={`relative flex gap-1 rounded-xl border border-white/10 bg-ink-700/40 p-1 ${className}`}
    >
      {pill && (
        <span
          aria-hidden
          className={`segmented-pill absolute inset-y-1 rounded-lg bg-accent/90 shadow-sm ${
            settled ? "" : "!transition-none"
          }`}
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          data-segment={option.value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-[var(--motion-exit)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
            value === option.value
              ? "text-white"
              : "text-slate-300 hover:text-slate-100"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
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
      className={`relative inline-flex ${dims.track} shrink-0 cursor-pointer items-center rounded-full border border-white/10 transition-colors duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-800 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-accent/90" : "bg-ink-600"
      }`}
    >
      <span
        className={`inline-block ${dims.knob} transform rounded-full bg-white shadow transition-transform duration-[var(--motion-quick)] ${
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
    <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-ink-600/75 px-3 py-2 text-sm font-medium text-slate-200 shadow-sm backdrop-blur-sm transition duration-[var(--motion-quick)] hover:bg-ink-500/85 focus-within:ring-2 focus-within:ring-accent/60 active:scale-[0.98]">
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
