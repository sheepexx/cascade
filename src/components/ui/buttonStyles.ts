import { mergeClasses } from "./cx";

/**
 * Four levels of emphasis, so only one thing on a surface asks to be pressed:
 * - `accent`: the primary action (one per surface at most).
 * - `primary`: a secondary action on a raised plate. (The name predates the
 *   system; it is the neutral button.)
 * - `ghost`: tertiary, text until hovered.
 * - `danger`: destructive, red text on a faint red plate.
 */
export const BUTTON_VARIANTS = {
  accent:
    "bg-accent font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] hover:bg-[#ee7676] active:bg-accent-deep",
  primary:
    "bg-white/[0.07] text-slate-100 ring-1 ring-inset ring-white/[0.07] hover:bg-white/[0.11] active:bg-white/[0.05]",
  ghost:
    "bg-transparent text-slate-300 hover:bg-white/[0.07] hover:text-slate-100 active:bg-white/[0.04]",
  danger:
    "bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-400/25 hover:bg-rose-500/20 hover:text-rose-200 active:bg-rose-500/15",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export const BUTTON_BASE =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium " +
  "transition duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 " +
  "disabled:cursor-not-allowed disabled:opacity-40";

const BUTTON_SM = "h-7 px-2.5 text-xs";

/** The button look for an element that cannot be a <Button>, like a label. */
export function buttonClass(
  variant: ButtonVariant = "ghost",
  size: "sm" | "md" = "md",
  className = "",
) {
  const sized = size === "sm" ? mergeClasses(BUTTON_BASE, BUTTON_SM) : BUTTON_BASE;
  return `ui-btn ui-btn-${variant} ${mergeClasses(mergeClasses(sized, BUTTON_VARIANTS[variant]), className)}`;
}

