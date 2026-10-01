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
      className={`w-6 rounded py-0.5 font-semibold transition ${
        active
          ? "bg-emerald-500/80 text-ink-900"
          : "bg-ink-700 text-slate-300 hover:bg-ink-600"
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
      className={`rounded px-1.5 py-1 text-[10px] font-medium transition ${
        danger
          ? "text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
          : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
