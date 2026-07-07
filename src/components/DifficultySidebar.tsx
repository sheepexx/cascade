import { useMemo, useState, useRef, useEffect } from "react";
import type { Difficulty } from "../types";
import { computeStarRating, starColor, starTier } from "../lib/starRating";

/** A collaborator's presence, enough to badge the difficulty they're editing. */
type PeerLite = {
  id: string;
  username: string;
  avatar: string | null;
  color: string;
  activeDiffId?: string;
};

type Props = {
  difficulties: Difficulty[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  /** Live collaborators; each is shown on the difficulty they're working on. */
  peers?: PeerLite[];
};

export function DifficultySidebar({
  difficulties,
  activeId,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onRename,
  peers,
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
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-white/10 bg-ink-800/45 shadow-[10px_0_30px_rgba(0,0,0,0.12)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Difficulties
          <span className="ml-1.5 text-slate-500">{difficulties.length}</span>
        </h2>
        <button
          onClick={onAdd}
          className="grid h-6 w-6 place-items-center rounded-md border border-white/10 bg-ink-600/70 text-slate-200 shadow-sm backdrop-blur-sm transition hover:bg-ink-500/85"
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
              peersHere={peers?.filter((p) => p.activeDiffId === d.id) ?? []}
              onSelect={() => onSelect(d.id)}
              onDuplicate={() => onDuplicate(d.id)}
              onDelete={() => onDelete(d.id)}
              onRename={(name) => onRename(d.id, name)}
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
  peersHere,
  onSelect,
  onDuplicate,
  onDelete,
  onRename,
}: {
  difficulty: Difficulty;
  star: number;
  active: boolean;
  canDelete: boolean;
  peersHere: PeerLite[];
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const color = starColor(star);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(difficulty.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus + select the text when entering edit mode (Windows Explorer style).
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEditing = () => {
    setDraft(difficulty.name);
    setEditing(true);
  };

  const commit = () => {
    const name = draft.trim();
    if (name && name !== difficulty.name) onRename(name);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(difficulty.name);
    setEditing(false);
  };

  return (
    <div
      onClick={onSelect}
      className={`group cursor-pointer rounded-lg border px-3 py-2.5 transition ${
        active
          ? "border-accent/70 bg-ink-600/72 shadow-lg shadow-black/15"
          : "border-transparent bg-ink-700/32 hover:border-white/10 hover:bg-ink-700/58"
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Star color dot */}
        <span
          className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/30"
          style={{ backgroundColor: color }}
        />
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") cancel();
            }}
            className="min-w-0 flex-1 rounded border border-accent/70 bg-ink-800 px-1 py-0.5 text-sm font-medium text-slate-100 outline-none"
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
            title="Double-click to rename"
            className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100"
          >
            {difficulty.name || "Unnamed"}
          </span>
        )}
        {difficulty.sourceFormat && (
          <img
            src={`/${difficulty.sourceFormat === "sm" ? "etterna-logo" : "osu-logo"}.png`}
            alt={difficulty.sourceFormat}
            className="ml-1.5 h-3.5 w-3.5 object-contain opacity-70 flex-shrink-0"
            title={difficulty.sourceFormat === "sm" ? "Etterna Map" : "osu! Map"}
          />
        )}
        {peersHere.length > 0 && (
          <span className="flex items-center -space-x-1.5" title="Editing here">
            {peersHere.slice(0, 4).map((p) => (
              <span
                key={p.id}
                className="grid h-5 w-5 place-items-center overflow-hidden rounded-full border bg-ink-700 text-[8px] font-semibold text-slate-100"
                style={{ borderColor: p.color }}
                title={p.username}
              >
                {p.avatar ? (
                  <img src={p.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  p.username.slice(0, 1).toUpperCase()
                )}
              </span>
            ))}
          </span>
        )}
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
            // Opens the "are you sure" modal (which has its own chime); skip the
            // general UI click so the two sounds don't overlap.
            data-no-uisound=""
            className="text-[10px] text-slate-400 hover:text-red-300"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
