import type { ReactNode } from "react";

/** Small labeled wrapper used across the settings panel. */
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
  "outline-none shadow-inner shadow-black/10 backdrop-blur-sm transition focus:border-accent/70 focus:ring-1 focus:ring-accent/40";

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

export function Button({
  variant = "ghost",
  className = "",
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
      {...props}
      className={`rounded-lg px-3 py-2 text-sm font-medium shadow-sm backdrop-blur-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
    />
  );
}

/** An on/off toggle switch. Drop-in replacement for an enable/disable checkbox. */
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
      className={`relative inline-flex ${dims.track} shrink-0 cursor-pointer items-center rounded-full border border-white/10 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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

/** A file picker styled as a button. */
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
    <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-ink-600/75 px-3 py-2 text-sm font-medium text-slate-200 shadow-sm backdrop-blur-sm transition hover:bg-ink-500/85">
      {label}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}
