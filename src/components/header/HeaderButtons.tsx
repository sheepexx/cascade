import type { ReactNode } from "react";

/**
 * The header's icon buttons: quiet until hovered, lit while their popover is
 * open. Shared by undo/redo, the inbox, friends and messages.
 */
export const HEADER_ICON_BUTTON =
  "relative grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition duration-[var(--motion-quick)] " +
  "hover:bg-white/[0.07] hover:text-slate-100 aria-expanded:bg-white/[0.09] aria-expanded:text-slate-50 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 " +
  "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

/** A count on a header icon, cut out of the bar with a ring in its colour. */
export const HEADER_BADGE =
  "absolute right-0 top-0 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-accent px-[3px] text-[9px] font-bold leading-none text-white ring-2 ring-ink-900";

/**
 * One entry in the editor's menu bar. `active` marks the tool whose window
 * is open, so the bar always says where you are.
 */
export function MenuButton({
  children,
  onClick,
  active = false,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-7 rounded-md px-2.5 text-sm transition duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
        active
          ? "bg-white/[0.09] text-slate-50"
          : "text-slate-300 hover:bg-white/[0.07] hover:text-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={HEADER_ICON_BUTTON}
    >
      {children}
    </button>
  );
}

export function ChevronIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`h-4 w-4 transition-transform duration-200 ${
        flipped ? "rotate-180" : ""
      }`}
    >
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

