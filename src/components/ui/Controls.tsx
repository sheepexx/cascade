import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { formatUiNumber } from "../../lib/formatUiNumber";
import { playSliderTick } from "../../lib/uiSounds";
import { mergeClasses } from "./cx";
import { buttonClass, type ButtonVariant } from "./buttonStyles";

/** Thumb diameter per size, in px; the CSS in index.css draws to the same. */
const SLIDER_THUMB = { sm: 12, md: 14 } as const;

function stepDecimals(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

/**
 * A range slider whose thumb follows the pointer freely rather than jumping
 * between steps; only the value it reports is rounded to `step`. On release
 * (or a click) the thumb glides onto the step it landed on. Arrow keys,
 * Page Up/Down and Home/End work as on a native range input.
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  onChangeEnd,
  disabled = false,
  size = "md",
  className = "",
  "aria-label": ariaLabel,
  "aria-valuetext": valueText,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Fires once a drag ends, or right after a keyboard step. */
  onChangeEnd?: (value: number) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
  "aria-valuetext"?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Unrounded position while the pointer is down; null otherwise.
  const [dragValue, setDragValue] = useState<number | null>(null);
  // Off while the pointer moves, so the thumb tracks it without lag.
  const [gliding, setGliding] = useState(true);
  const draggingRef = useRef(false);
  const lastRef = useRef(value);
  const handlersRef = useRef({ onChange, onChangeEnd });
  handlersRef.current = { onChange, onChangeEnd };

  const span = max - min || 1;
  const decimals = stepDecimals(step);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const snap = (raw: number) =>
    Number(clamp(min + Math.round((clamp(raw) - min) / step) * step).toFixed(decimals));
  const ratio = (clamp(dragValue ?? value) - min) / span;

  const valueAt = (clientX: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return value;
    const thumb = SLIDER_THUMB[size];
    const usable = rect.width - thumb;
    const x = clientX - rect.left - thumb / 2;
    return min + Math.min(1, Math.max(0, usable > 0 ? x / usable : 0)) * span;
  };

  const emit = (raw: number) => {
    const next = snap(raw);
    if (next === lastRef.current) return;
    lastRef.current = next;
    playSliderTick((next - min) / span);
    handlersRef.current.onChange(next);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    draggingRef.current = true;
    lastRef.current = value;
    const raw = valueAt(e.clientX);
    // A click glides to the pointer; dragging from there tracks it exactly.
    setGliding(true);
    setDragValue(raw);
    emit(raw);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const raw = valueAt(e.clientX);
    setGliding(false);
    setDragValue(raw);
    emit(raw);
  };

  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setGliding(true);
    setDragValue(null);
    handlersRef.current.onChangeEnd?.(lastRef.current);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const big = Math.max(step, span / 10);
    let next: number;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = value - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = value + step;
        break;
      case "PageDown":
        next = value - big;
        break;
      case "PageUp":
        next = value + big;
        break;
      case "Home":
        next = min;
        break;
      case "End":
        next = max;
        break;
      default:
        return;
    }
    // Keep arrow keys from also reaching the editor's seek shortcuts.
    e.preventDefault();
    e.stopPropagation();
    const snapped = snap(next);
    lastRef.current = snapped;
    if (snapped !== value) {
      playSliderTick((snapped - min) / span);
      handlersRef.current.onChange(snapped);
    }
    handlersRef.current.onChangeEnd?.(snapped);
  };

  return (
    <div
      ref={rootRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      data-size={size}
      data-active={dragValue !== null ? "" : undefined}
      data-tracking={dragValue !== null && !gliding ? "" : undefined}
      className={`ui-slider ${className}`}
      style={{ "--p": ratio } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
    >
      <span className="ui-slider-track" />
      <span className="ui-slider-fill" />
      <span className="ui-slider-thumb" />
    </div>
  );
}

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
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="text-2xs leading-snug text-slate-500">{hint}</span>}
    </label>
  );
}

/**
 * A heading for a group of settings or fields inside a dialog or panel.
 * Sentence case and a step brighter than the rows under it; hierarchy comes
 * from weight and position, not capitals.
 */
export function SectionHeading({
  children,
  description,
  action,
  className = "",
}: {
  children: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h3 className="ui-section-title font-display text-[0.875rem] font-semibold leading-5 text-slate-100">
          {children}
        </h3>
        {description && (
          <p className="mt-0.5 text-xs leading-snug text-slate-400">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** A keyboard key, or a key combination split on "+". */
export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <kbd className={`keycap ${className}`}>{children}</kbd>;
}

/**
 * Inputs are wells: darker than the surface they sit in, so a field reads as
 * a place to type and never as a button. Exported for the few hand-built
 * fields (a number box with a unit, a search with an icon) to match.
 */
export const INPUT_CLASS =
  "ui-input rounded-md bg-black/25 px-2.5 py-1.5 text-sm text-slate-100 ring-1 ring-inset ring-white/[0.08] " +
  "outline-none transition duration-[var(--motion-quick)] placeholder:text-slate-500 hover:ring-white/[0.14] " +
  "focus:bg-black/35 focus:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-45";

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return <input {...props} className={mergeClasses(INPUT_CLASS, props.className)} />;
}

export function NumberInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return (
    <input
      type="number"
      {...props}
      className={mergeClasses(INPUT_CLASS, props.className)}
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
  size = "md",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}) {
  return (
    <button type={type} {...props} className={buttonClass(variant, size, className)} />
  );
}

/**
 * Two shapes for one job, choosing one of a few options:
 * - `segmented` (default): a compact inset control for a value, such as a
 *   sort order or a mode. The current option is a raised neutral plate.
 * - `tabs`: page-level navigation inside a dialog or view. Text tabs on a
 *   hairline, the current one marked with the accent hit line.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
  accent,
  variant = "segmented",
  size = "md",
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Colours the tabs' hit line for a surface with its own accent. */
  accent?: string;
  variant?: "segmented" | "tabs";
  size?: "sm" | "md";
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (variant === "tabs") return;
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
  }, [value, options.length, variant]);

  useEffect(() => {
    if (pill) setSettled(true);
  }, [pill]);

  if (variant === "tabs") {
    return (
      <div
        ref={listRef}
        role="tablist"
        className={`ui-tabs flex min-w-0 items-stretch gap-1 overflow-x-auto border-b border-white/[0.07] no-scrollbar ${className}`}
        style={accent ? ({ "--hit-line": accent } as CSSProperties) : undefined}
      >
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              data-segment={option.value}
              onClick={() => onChange(option.value)}
              className={`ui-tab hit-line-bottom shrink-0 whitespace-nowrap px-2.5 pb-2 pt-1 font-medium transition-colors duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${
                size === "sm" ? "text-xs" : "text-sm"
              } ${active ? "text-slate-50" : "text-slate-400 hover:text-slate-200"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      className={`ui-segmented relative flex gap-0.5 rounded-lg bg-black/25 p-0.5 ring-1 ring-inset ring-white/[0.06] ${className}`}
    >
      {pill && (
        <span
          aria-hidden
          className={`segmented-pill ui-segmented-pill absolute inset-y-0.5 rounded-md bg-ink-500 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.06)] ${
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
          className={`ui-segment relative z-10 flex-1 whitespace-nowrap rounded-md px-2.5 font-medium transition-colors duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
            size === "sm" ? "h-6 text-xs" : "h-7 text-sm"
          } ${
            value === option.value
              ? "text-slate-50"
              : "text-slate-400 hover:text-slate-200"
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
      ? { track: "h-3.5 w-6", knob: "h-2.5 w-2.5", on: "translate-x-[0.6875rem]", off: "translate-x-0.5" }
      : { track: "h-[1.125rem] w-8", knob: "h-3.5 w-3.5", on: "translate-x-[0.9375rem]", off: "translate-x-0.5" };
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${dims.track} shrink-0 cursor-pointer items-center rounded-full transition-colors duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-800 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-accent" : "bg-white/[0.13] hover:bg-white/[0.18]"
      }`}
    >
      <span
        className={`inline-block ${dims.knob} transform rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.4)] transition-transform duration-[var(--motion-quick)] ${
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
  disabled = false,
}: {
  label: string;
  accept: string;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={buttonClass(
        "primary",
        "md",
        `focus-within:ring-2 focus-within:ring-accent/60 ${
          disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
        }`,
      )}
    >
      {label}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
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
