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
