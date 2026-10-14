import { useDeferredValue, useMemo, useState, useRef, useEffect } from "react";
import type { Difficulty, TimingPoint } from "../types";
import { computeStarRating, starColor, starTextOn, starTier } from "../lib/starRating";
import { computeMapStats } from "../lib/mapStats";
import { useMsdRatings } from "../lib/msd/useMsd";
import { msdColor, msdTooltip } from "../lib/msd/display";
import { msdSupportsKeyCount, type MsdRating } from "../lib/msd/minacalc";
import { MarqueeText } from "./ui/MarqueeText";
import { RateChangerPanel } from "./RateChangerPanel";
import { useT } from "../lib/i18n";
import {
  bpmRange,
  formatBpmRange,
  type RateCreateOptions,
} from "../lib/rateChange";

type PeerLite = {
  id: string;
  username: string;
  avatar: string | null;
  color: string;
  activeDiffId?: string;
};

type Props = {
  mobile?: boolean;
  difficulties: Difficulty[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  /** Puts a copy on the clipboard, to paste into this or any other map. */
  onCopy: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onRename: (id: string, name: string) => void;
  onCreateRate: (options: RateCreateOptions) => void;
  canEdit: boolean;
  /** Points in force for the active difficulty, shared fallback already applied. */
  timingPoints: TimingPoint[];
  songDurationMs: number | null;
  peers?: PeerLite[];
  /** Lights a lane up in the editor, from the column chart. */
  onFlashColumn?: (column: number) => void;
};

export function DifficultySidebar({
  mobile,
  difficulties,
  activeId,
  onSelect,
  onAdd,
  onDuplicate,
  onCopy,
  onDelete,
  onRename,
  onCreateRate,
  canEdit,
  timingPoints,
  songDurationMs,
  peers,
  onFlashColumn,
}: Props) {
  const t = useT();
  const [rateOpen, setRateOpen] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const msdRatings = useMsdRatings(difficulties);
  const active = difficulties.find((d) => d.id === activeId) ?? null;

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set(
        [...prev].filter((id) => difficulties.some((d) => d.id === id)),
      );
      return next.size === prev.size ? prev : next;
    });
  }, [difficulties]);

  const handleRowSelect = (id: string, additive: boolean) => {
    if (additive) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setSelected(new Set());
      onSelect(id);
    }
  };

  const handleRowDelete = (id: string) => {
    let ids =
      selected.has(id) && selected.size > 0 ? Array.from(selected) : [id];
    if (ids.length >= difficulties.length) {
      ids = ids.filter((x) => x !== activeId);
    }
    if (ids.length) onDelete(ids);
  };
  // The stats and the star-sorted list trail an edit by a render: they cost
  // tens of milliseconds on a huge map, and the playfield should show the
  // new note first.
  const deferredDifficulties = useDeferredValue(difficulties);
  const deferredActive = useDeferredValue(active);
  const stats = useMemo(
    () => (deferredActive ? computeMapStats(deferredActive.notes, deferredActive.keyCount) : null),
    [deferredActive],
  );
  /** "180", or "150–200" when the map changes tempo. */
  const bpmLabel = useMemo(
    () => formatBpmRange(bpmRange(timingPoints)),
    [timingPoints],
  );
  const sorted = useMemo(
    () =>
      deferredDifficulties
        .map((d) => ({
          difficulty: d,
          star: computeStarRating(d.notes, d.keyCount),
        }))
        .sort((a, b) => a.star - b.star),
    [deferredDifficulties],
  );
  const existingNames = useMemo(
    () => difficulties.map((d) => d.name),
    [difficulties],
  );

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-white/[0.06] bg-ink-900">
      <div className="flex h-10 shrink-0 items-center justify-between pl-3.5 pr-2">
        <h2 className="text-xs font-semibold text-slate-300">
          {t("diffSidebar.title")}
          <span className="ml-1.5 font-medium tabular-nums text-slate-500">{difficulties.length}</span>
        </h2>
        <div className="flex items-center gap-0.5">
          {mobile && <button type="button" aria-pressed={multiSelectMode} onClick={() => setMultiSelectMode(value => !value)} className="rounded-md px-2 text-xs text-slate-300">{t("mobile.select")}</button>}
          <button
            onClick={() => setRateOpen((v) => !v)}
            aria-label={t("diffSidebar.rateChanger")}
            aria-expanded={rateOpen}
            className={`grid h-7 w-7 place-items-center rounded-md transition ${
              rateOpen
                ? "bg-white/[0.09] text-slate-50"
                : "text-slate-400 hover:bg-white/[0.07] hover:text-slate-100"
            }`}
            title={t("diffSidebar.rateChanger")}
          >
            <RateIcon />
          </button>
          <button
            onClick={onAdd}
            aria-label={t("diffSidebar.addDifficulty")}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-100"
            title={t("diffSidebar.addDifficulty")}
          >
            <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
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

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        <div className="flex flex-col gap-px">
          {sorted.map(({ difficulty: d, star }) => (
            <DiffRow
              mobile={mobile}
              multiSelect={mobile && multiSelectMode}
              key={d.id}
              difficulty={d}
              star={star}
              msd={msdRatings[d.id] ?? null}
              active={d.id === activeId}
              selected={selected.has(d.id)}
              selectionCount={selected.size}
              canDelete={difficulties.length > 1}
              peersHere={peers?.filter((p) => p.activeDiffId === d.id) ?? []}
              onSelect={(additive) => handleRowSelect(d.id, additive)}
              onDuplicate={() => onDuplicate(d.id)}
              onCopy={() => onCopy(d.id)}
              onDelete={() => handleRowDelete(d.id)}
              onRename={(name) => onRename(d.id, name)}
            />
          ))}
        </div>
      </div>

      {stats && (stats.notes > 0 || mobile) && (
        <div className="border-t border-white/[0.06] px-3.5 pb-3 pt-2.5">
          <div className="mb-2 truncate text-xs font-semibold text-slate-300">
            {t("diffSidebar.stats", {
              name: active?.name || t("diffSidebar.active"),
            })}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <Stat label="BPM" value={bpmLabel} />
            <Stat label={t("diffSidebar.notes")} value={String(stats.notes)} />
            <Stat label="LN" value={`${Math.round(stats.lnRatio * 100)}%`} />
            <Stat
              label={t("diffSidebar.chords")}
              value={`${Math.round(stats.chordRatio * 100)}%`}
            />
            <Stat label={t("diffSidebar.avgNps")} value={stats.avgNps.toFixed(1)} />
            <Stat label={t("diffSidebar.peakNps")} value={String(stats.peakNps)} />
            <Stat label="Rice/LN" value={`${stats.rice}/${stats.holds}`} />
          </div>
          <ColumnHistogram
            counts={stats.columnCounts}
            handBalance={stats.handBalance}
            onFlashColumn={onFlashColumn}
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
  onFlashColumn,
}: {
  counts: number[];
  handBalance: number;
  onFlashColumn?: (column: number) => void;
}) {
  const t = useT();
  const max = Math.max(...counts, 1);
  const leftPct = Math.round(handBalance * 100);
  return (
    <div className="mt-2.5">
      <div className="mb-1 flex items-center justify-between text-2xs text-slate-500">
        <span>{t("diffSidebar.columns")}</span>
        <span
          className="tabular-nums"
          title={t("diffSidebar.handBalance")}
        >
          L {leftPct}% · R {100 - leftPct}%
        </span>
      </div>
      <div className="flex h-9 items-end gap-1">
        {counts.map((count, i) => {
          const label = t("diffSidebar.columnNotes", { column: i + 1, count });
          return (
            <button
              key={i}
              type="button"
              onClick={() => onFlashColumn?.(i)}
              disabled={!onFlashColumn}
              aria-label={label}
              title={label}
              className="group/bar relative flex-1 rounded-t-sm bg-slate-500/55 transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:brightness-125 disabled:cursor-default"
              style={{ height: `${Math.max(4, (count / max) * 100)}%` }}
            />
          );
        })}
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
  mobile,
  multiSelect,
  difficulty,
  star,
  msd,
  active,
  selected,
  selectionCount,
  canDelete,
  peersHere,
  onSelect,
  onDuplicate,
  onCopy,
  onDelete,
  onRename,
}: {
  mobile?: boolean;
  multiSelect?: boolean;
  difficulty: Difficulty;
  star: number;
  msd: MsdRating | null;
  active: boolean;
  selected: boolean;
  selectionCount: number;
  canDelete: boolean;
  peersHere: PeerLite[];
  onSelect: (additive: boolean) => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const t = useT();
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
      onClick={(e) => onSelect(!!multiSelect || e.ctrlKey || e.metaKey)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(event.ctrlKey || event.metaKey);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      data-active={active}
      className={`hit-line-left group cursor-pointer rounded-md px-2.5 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${
        active ? "bg-white/[0.06]" : "hover:bg-white/[0.035]"
      } ${selected ? "!bg-sky-400/[0.08] ring-1 ring-inset ring-sky-400/45" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
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
            className="min-w-0 flex-1 rounded bg-black/30 px-1 py-px text-sm font-medium text-slate-100 outline-none ring-1 ring-accent/70"
          />
        ) : (
          <MarqueeText
            text={difficulty.name || t("diffSidebar.unnamed")}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
            title={t("diffSidebar.doubleClickRename")}
            className={`min-w-0 flex-1 text-sm font-medium ${active ? "text-slate-50" : "text-slate-200"}`}
          />
        )}
        {(difficulty.sourceFormat === "qua" || difficulty.sourceFormat === "mc") && (
          <span className="ml-1 flex-shrink-0 rounded-sm bg-white/[0.06] px-1 text-[9px] font-semibold uppercase text-slate-400">
            {difficulty.sourceFormat}
          </span>
        )}
        {(difficulty.sourceFormat === "osu" || difficulty.sourceFormat === "sm") && (
          <img
            src={`/${difficulty.sourceFormat === "sm" ? "etterna-logo" : "osu-logo"}.png`}
            alt={difficulty.sourceFormat}
            className="ml-1 h-3.5 w-3.5 flex-shrink-0 object-contain opacity-60"
            title={
              difficulty.sourceFormat === "sm"
                ? t("sampleMaps.etternaMap")
                : t("sampleMaps.osuMap")
            }
          />
        )}
        {peersHere.length > 0 && (
          <span
            className="flex items-center -space-x-1.5"
            title={t("diffSidebar.editingHere")}
          >
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
        <span className="text-2xs font-medium tabular-nums text-slate-500">{difficulty.keyCount}K</span>
      </div>

      <div className="mt-1 flex items-center justify-between gap-1.5 pl-4">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="shrink-0 whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums"
            style={{ backgroundColor: color, color: starTextOn(star) }}
          >
            ★ {star.toFixed(2)}
          </span>
          {msdSupportsKeyCount(difficulty.keyCount) && msd && msd.overall > 0 && (
            <span
              className="shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums"
              style={{ color: msdColor(msd.overall) }}
              title={msdTooltip(msd, difficulty.keyCount)}
            >
              {msd.overall.toFixed(2)}
              <span className="ml-0.5 text-[9px] font-medium opacity-70">MSD</span>
            </span>
          )}
        </span>
        <span className="truncate text-2xs text-slate-500">
          {starTier(star)}
        </span>
      </div>

      {/* Row actions stay out of the way until the row is pointed at,
          focused or open. */}
      <div
        className={`difficulty-row-actions flex flex-wrap items-center gap-0.5 pl-3 transition-[opacity,max-height,margin] duration-[var(--motion-quick)] ${
          active || selected
            ? "mt-1 max-h-6 opacity-100"
            : "max-h-0 overflow-hidden opacity-0 group-hover:mt-1 group-hover:max-h-6 group-hover:opacity-100 group-focus-within:mt-1 group-focus-within:max-h-6 group-focus-within:opacity-100"
        }`}
      >
        {mobile && <button type="button" onClick={e => { e.stopPropagation(); startEditing(); }} className="rounded px-2 text-xs text-slate-300">{t("common.rename")}</button>}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
          title={t("diffSidebar.copyTitle")}
          className="rounded px-1 py-0.5 text-2xs text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-100"
        >
          {t("common.copy")}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="rounded px-1 py-0.5 text-2xs text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-100"
        >
          {t("common.duplicate")}
        </button>
        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            data-no-uisound=""
            title={
              selected && selectionCount > 1
                ? t("diffSidebar.deleteManyTitle", { count: selectionCount })
                : t("diffSidebar.deleteOneTitle")
            }
            className="rounded px-1 py-0.5 text-2xs text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
          >
            {selected && selectionCount > 1
              ? t("diffSidebar.deleteMany", { count: selectionCount })
              : t("common.delete")}
          </button>
        )}
      </div>
    </div>
  );
}
