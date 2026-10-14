/**
 * The hitsound panel's add buttons and the selection toolbar's action buttons.
 */

export function HitsoundAddBtn({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`h-6 w-6 rounded font-mono text-xs font-semibold transition ${
        active
          ? "bg-emerald-400/90 text-ink-950"
          : "bg-white/[0.06] text-slate-300 hover:bg-white/[0.1] hover:text-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

export function SelectionActionButton({
  label,
  title,
  danger = false,
  onClick,
}: {
  label: string;
  title: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-6 rounded-md px-2 text-xs font-medium transition ${
        danger
          ? "text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
          : "text-slate-300 hover:bg-white/[0.08] hover:text-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
