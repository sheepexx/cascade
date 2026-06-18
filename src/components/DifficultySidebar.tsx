import { useMemo } from "react";
import type { Difficulty } from "../types";
import { computeStarRating, starColor, starTier } from "../lib/starRating";

type Props = {
  difficulties: Difficulty[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

export function DifficultySidebar({
  difficulties,
  activeId,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
}: Props) {
  // Compute star ratings once and sort easiest → hardest.
  const sorted = useMemo(
    () =>
      difficulties
        .map((d) => ({
          difficulty: d,
          star: computeStarRating(d.notes, d.keyCount),
        }))
        .sort((a, b) => a.star - b.star),
    [difficulties],
  );

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-ink-600 bg-ink-800/60">
      <div className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Difficulties
          <span className="ml-1.5 text-slate-500">{difficulties.length}</span>
        </h2>
        <button
          onClick={onAdd}
          className="grid h-6 w-6 place-items-center rounded-md bg-ink-600 text-slate-200 transition hover:bg-ink-500"
          title="Add difficulty"
        >
          +
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1.5">
          {sorted.map(({ difficulty: d, star }) => (
            <DiffRow
              key={d.id}
              difficulty={d}
              star={star}
              active={d.id === activeId}
              canDelete={difficulties.length > 1}
              onSelect={() => onSelect(d.id)}
              onDuplicate={() => onDuplicate(d.id)}
              onDelete={() => onDelete(d.id)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function DiffRow({
  difficulty,
  star,
  active,
  canDelete,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  difficulty: Difficulty;
  star: number;
  active: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const color = starColor(star);

  return (
    <div
      onClick={onSelect}
      className={`group cursor-pointer rounded-lg border px-3 py-2.5 transition ${
        active
          ? "border-accent/70 bg-ink-600"
          : "border-transparent bg-ink-700/50 hover:bg-ink-700"
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Star color dot */}
        <span
          className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/30"
          style={{ backgroundColor: color }}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
          {difficulty.name || "Unnamed"}
        </span>
        <span className="text-[10px] text-slate-500">{difficulty.keyCount}K</span>
      </div>

      <div className="mt-1 flex items-center justify-between pl-5">
        <span className="text-xs font-semibold" style={{ color }}>
          ★ {star.toFixed(2)}
        </span>
        <span className="text-[10px] text-slate-500">{starTier(star)}</span>
      </div>

      {/* Row actions */}
      <div className="mt-1.5 flex items-center gap-2 pl-5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="text-[10px] text-slate-400 hover:text-slate-200"
        >
          Duplicate
        </button>
        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-[10px] text-slate-400 hover:text-red-300"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
