import { useMemo, useState, useRef, useEffect } from "react";
import type { Difficulty } from "../types";
import { computeStarRating, starColor, starTextOn, starTier } from "../lib/starRating";
import { computeMapStats } from "../lib/mapStats";
import { useMsdRatings } from "../lib/msd/useMsd";
import { msdColor, msdTooltip } from "../lib/msd/display";
import type { MsdRating } from "../lib/msd/minacalc";
import { MarqueeText } from "./ui/MarqueeText";
import { RateChangerPanel } from "./RateChangerPanel";
import type { RateCreateOptions } from "../lib/rateChange";

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
  onCreateRate: (options: RateCreateOptions) => void;
  canEdit: boolean;
  songDurationMs: number | null;
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
  onCreateRate,
  canEdit,
  songDurationMs,
  peers,
}: Props) {
  const [rateOpen, setRateOpen] = useState(false);
  const msdRatings = useMsdRatings(difficulties);
  const active = difficulties.find((d) => d.id === activeId) ?? null;
  const stats = useMemo(
    () => (active ? computeMapStats(active.notes, active.keyCount) : null),
    [active],
  );
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
  const existingNames = useMemo(
    () => difficulties.map((d) => d.name),
    [difficulties],
  );

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-white/10 bg-ink-800/45 shadow-[10px_0_30px_rgba(0,0,0,0.12)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Difficulties
          <span className="ml-1.5 text-slate-500">{difficulties.length}</span>
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setRateOpen((v) => !v)}
            aria-expanded={rateOpen}
            className={`grid h-6 w-6 place-items-center rounded-md border shadow-sm backdrop-blur-sm transition ${
              rateOpen
                ? "border-accent/70 bg-accent/20 text-slate-100"
                : "border-white/10 bg-ink-600/70 text-slate-200 hover:bg-ink-500/85"
            }`}
            title="Rate changer"
          >
            <RateIcon />
          </button>
          <button
            onClick={onAdd}
            className="grid h-6 w-6 place-items-center rounded-md border border-white/10 bg-ink-600/70 text-slate-200 shadow-sm backdrop-blur-sm transition hover:bg-ink-500/85"
            title="Add difficulty"
          >
            +
          </button>
        </div>
      </div>

      <RateChangerPanel
        open={rateOpen}
        difficulty={active}
        existingNames={existingNames}
        durationMs={songDurationMs}
        canEdit={canEdit}
        onCreate={(options) => {
          onCreateRate(options);
          setRateOpen(false);
        }}
        onClose={() => setRateOpen(false)}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1.5">
          {sorted.map(({ difficulty: d, star }) => (
            <DiffRow
              key={d.id}
              difficulty={d}
              star={star}
              msd={msdRatings[d.id] ?? null}
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

      {stats && stats.notes > 0 && (
        <div className="border-t border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {active?.name || "Active"} · stats
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
            <Stat label="Notes" value={String(stats.notes)} />
            <Stat label="LN" value={`${Math.round(stats.lnRatio * 100)}%`} />
            <Stat label="Chords" value={`${Math.round(stats.chordRatio * 100)}%`} />
            <Stat label="Avg NPS" value={stats.avgNps.toFixed(1)} />
            <Stat label="Peak NPS" value={String(stats.peakNps)} />
            <Stat label="Rice/LN" value={`${stats.rice}/${stats.holds}`} />
          </div>
          <ColumnHistogram
            counts={stats.columnCounts}
            handBalance={stats.handBalance}
          />
        </div>
      )}
    </aside>
  );
}

function RateIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 17.5a9 9 0 1 1 16 0" />
      <path d="M12 17.5 16 11" />
    </svg>
  );
}

function ColumnHistogram({
  counts,
  handBalance,
}: {
  counts: number[];
  handBalance: number;
}) {
  const max = Math.max(...counts, 1);
  const leftPct = Math.round(handBalance * 100);
  return (
    <div className="mt-2.5">
      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
        <span>Columns</span>
        <span
          className="tabular-nums"
          title="Share of notes on the left vs right hand"
        >
          L {leftPct}% · R {100 - leftPct}%
        </span>
      </div>
      <div className="flex h-9 items-end gap-1">
        {counts.map((count, i) => (
          <div
            key={i}
            className="group/bar relative flex-1 rounded-t-sm bg-accent/60 transition hover:bg-accent"
            style={{ height: `${Math.max(4, (count / max) * 100)}%` }}
            title={`Column ${i + 1}: ${count} note${count === 1 ? "" : "s"}`}
          />
        ))}
      </div>
      <div className="mt-0.5 flex gap-1">
        {counts.map((count, i) => (
          <span
            key={i}
            className="flex-1 text-center text-[9px] tabular-nums text-slate-500"
          >
            {count}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium tabular-nums text-slate-200">{value}</span>
    </div>
  );
}

function DiffRow({
  difficulty,
  star,
  msd,
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
  msd: MsdRating | null;
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
          <MarqueeText
            text={difficulty.name || "Unnamed"}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
            title="Double-click to rename"
            className="min-w-0 flex-1 text-sm font-medium text-slate-100"
          />
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

      <div className="mt-1 flex items-center justify-between gap-1.5 pl-5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ backgroundColor: color, color: starTextOn(star) }}
          >
            ★ {star.toFixed(2)}
          </span>
          {difficulty.keyCount === 4 && msd && msd.overall > 0 && (
            <span
              className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-ink-900/70 px-2 py-0.5 text-[11px] font-bold"
              style={{ color: msdColor(msd.overall) }}
              title={msdTooltip(msd, difficulty.keyCount)}
            >
              {msd.overall.toFixed(2)} MSD
            </span>
          )}
        </span>
        <span className="truncate text-[10px] text-slate-500">
          {starTier(star)}
        </span>
      </div>

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
