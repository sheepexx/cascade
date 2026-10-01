import type { ReactNode } from "react";

export function MenuButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-sm text-slate-300 transition duration-150 hover:bg-white/10 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
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
      className="relative grid h-8 w-8 place-items-center rounded-md text-base text-slate-300 transition duration-150 hover:bg-white/10 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:active:scale-100"
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

