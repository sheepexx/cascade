import { useDeferredValue, useMemo, useState, useRef, useEffect, type ReactNode } from "react";
import type { Difficulty, TimingPoint } from "../types";
import { computeStarRating, starColor, starTextOn, starTier } from "../lib/starRating";
import { computeMapStats } from "../lib/mapStats";
import { useMsdRatings } from "../lib/msd/useMsd";
import { msdColor, msdTooltip } from "../lib/msd/display";
import { msdSupportsKeyCount, type MsdRating } from "../lib/msd/minacalc";
import { MarqueeText } from "./ui/MarqueeText";
import { AnimatedList } from "./ui/AnimatedList";
import { RollingNumber } from "./ui/RollingNumber";
import { RateChangerPanel } from "./RateChangerPanel";
import { useT } from "../lib/i18n";
import { typedDifficultyName } from "../lib/difficultyName";
import {
  bpmRange,
  formatBpmRange,
  type CreatedRate,
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
  /**
   * `keepOpen` is set while the rate changer is open: the pick only changes
   * the difficulty rates are made from, so a phone sheet stays up.
   */
  onSelect: (id: string, keepOpen?: boolean) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  /** Puts a copy on the clipboard, to paste into this or any other map. */
  onCopy: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onRename: (id: string, name: string) => void;
  onCreateRate: (options: RateCreateOptions) => CreatedRate | null;
  canEdit: boolean;
  /** Points in force for the active difficulty, shared fallback already applied. */
  timingPoints: TimingPoint[];
  songDurationMs: number | null;
  peers?: PeerLite[];
  /** Lights a lane up in the editor, from the column chart. */
  onFlashColumn?: (column: number) => void;
  /**
   * Placed by the editor's panel layout: no border or width of its own, and
   * the stats live in their own panel (DifficultyInfo).
   */
  docked?: boolean;
  /** A row of cards along the top or bottom edge instead of a list. */
  orientation?: "vertical" | "horizontal";
};

export function DifficultySidebar({
  docked = false,
  orientation = "vertical",
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
      onSelect(id, rateOpen);
    }
  };

  const deleteDifficulties = (ids: string[]) => {
    if (ids.length >= difficulties.length) {
      ids = ids.filter((x) => x !== activeId);
    }
    if (ids.length) onDelete(ids);
  };
  const handleRowDelete = (id: string) =>
    deleteDifficulties(selected.has(id) ? Array.from(selected) : [id]);
  // Star ratings trail an edit by a render: they cost tens of milliseconds on
  // a huge map, and the playfield should show the new note first.
  const deferredDifficulties = useDeferredValue(difficulties);
  const deferredStars = useMemo(
    () =>
      new Map(
        deferredDifficulties.map((d) => [d.id, computeStarRating(d.notes, d.keyCount)]),
      ),
    [deferredDifficulties],
  );
  // Which rows there are follows the difficulties at once, so an added or
  // deleted difficulty animates in the same render that changes the
  // selection; only a row the deferred pass has not rated yet (a new one)
  // is rated here.
  const sorted = useMemo(
    () =>
      difficulties
        .map((d) => ({
          difficulty: d,
          star: deferredStars.get(d.id) ?? computeStarRating(d.notes, d.keyCount),
        }))
        .sort((a, b) => a.star - b.star),
    [difficulties, deferredStars],
  );
  const existingNames = useMemo(
    () => difficulties.map((d) => d.name),
    [difficulties],
  );

  const horizontal = docked && orientation === "horizontal";
  const rows = sorted.map(({ difficulty: d, star }) => (
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
  ));
  const rateButton = (
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
      <RateIcon open={rateOpen} />
    </button>
  );
  const addButton = (
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
  );
  const rateChanger = (
    <RateChangerPanel
      open={rateOpen}
      difficulty={active}
      existingNames={existingNames}
      durationMs={songDurationMs}
      canEdit={canEdit}
      onCreate={onCreateRate}
      onOpen={(id) => {
        setRateOpen(false);
        onSelect(id);
      }}
      onClose={() => setRateOpen(false)}
    />
  );

  if (horizontal) {
    return (
      <aside className="flex w-full flex-col bg-ink-900">
        <div className="flex min-w-0 items-stretch">
          <div className="flex w-40 shrink-0 flex-col justify-between border-r border-white/[0.06] py-2.5 pl-3.5 pr-2">
            <h2 className="text-xs font-semibold text-slate-300">
              {t("diffSidebar.title")}
              <RollingNumber value={difficulties.length} className="ml-1.5 font-medium tabular-nums text-slate-500" />
            </h2>
            <div className="flex items-center gap-0.5">
              {rateButton}
              {addButton}
            </div>
          </div>
          {/* Cards sit in a row of fixed height, so their hover actions never
              change the strip's thickness. */}
          <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden px-1.5 py-1.5 [scrollbar-width:thin]">
            <div className="flex h-[5.25rem] items-start gap-1 [&>*]:w-56 [&>*]:shrink-0">
              <AnimatedList axis="x">{rows}</AnimatedList>
            </div>
          </div>
        </div>
        {rateChanger}
      </aside>
    );
  }

  return (
    // Phones scroll the whole sheet, so the open rate changer never squeezes
    // the list out of view; the header stays put.
    <aside className={`flex h-full shrink-0 flex-col bg-ink-900 ${mobile ? "w-full overflow-y-auto overscroll-contain" : docked ? "w-full" : "w-60 border-r border-white/[0.06]"}`}>
      <div className={`flex h-10 shrink-0 items-center justify-between pl-3.5 pr-2 ${mobile ? "sticky top-0 z-10 bg-ink-900" : ""}`}>
        <h2 className="text-xs font-semibold text-slate-300">
          {t("diffSidebar.title")}
          <RollingNumber value={difficulties.length} className="ml-1.5 font-medium tabular-nums text-slate-500" />
        </h2>
        <div className="flex items-center gap-0.5">
          {mobile && <button type="button" aria-pressed={multiSelectMode} onClick={() => setMultiSelectMode(value => !value)} className="rounded-md px-2 text-xs text-slate-300">{t("mobile.select")}</button>}
          {rateButton}
          {addButton}
        </div>
      </div>

      {rateChanger}

      <div className={`px-1.5 pb-2 ${mobile ? "flex-[1_0_auto]" : "min-h-0 flex-1 overflow-y-auto"}`}>
        {/* Phones show the difficulties side by side, two to a row. */}
        <div className={mobile ? "grid grid-cols-2 gap-1.5" : "flex flex-col gap-px"}>
          <AnimatedList
            axis={mobile ? "fade" : "y"}
            itemClassName={mobile ? "flex min-w-0 [&>*]:flex-1" : undefined}
          >
            {rows}
          </AnimatedList>
        </div>
      </div>

      {mobile && active && (
        <PhoneDiffActions
          key={active.id}
          difficulty={active}
          selectionCount={selected.size}
          canDelete={difficulties.length > 1}
          onRename={(name) => onRename(active.id, name)}
          onCopy={() => onCopy(active.id)}
          onDuplicate={() => onDuplicate(active.id)}
          onDelete={() => deleteDifficulties(selected.size ? Array.from(selected) : [active.id])}
        />
      )}

      {!docked && !(mobile && rateOpen) && (
        <DifficultyInfo
          difficulty={active}
          timingPoints={timingPoints}
          onFlashColumn={onFlashColumn}
          showEmpty={mobile}
          reveal
          className="border-t border-white/[0.06]"
        />
      )}
    </aside>
  );
}

/**
 * The active difficulty's numbers: BPM, notes, LN and chord share, NPS and the
 * notes per column. Under the difficulty list by default; its own panel when
 * the editor's layout moves it.
 */
export function DifficultyInfo({
  difficulty,
  timingPoints,
  onFlashColumn,
  orientation = "vertical",
  showEmpty = false,
  reveal = false,
  className = "",
}: {
  difficulty: Difficulty | null;
  timingPoints: TimingPoint[];
  onFlashColumn?: (column: number) => void;
  orientation?: "vertical" | "horizontal";
  /** Show the block even for a difficulty with no notes yet. */
  showEmpty?: boolean;
  /**
   * Open and close in place when there is something to show or not. Off
   * where a container animates the block itself (the editor's dock panel).
   */
  reveal?: boolean;
  className?: string;
}) {
  const t = useT();
  // Trails an edit by a render: on a huge map these cost tens of
  // milliseconds, and the playfield should show the new note first.
  const deferred = useDeferredValue(difficulty);
  const liveStats = useMemo(
    () => (deferred ? computeMapStats(deferred.notes, deferred.keyCount) : null),
    [deferred],
  );
  /** "180", or "150–200" when the map changes tempo. */
  const liveBpm = useMemo(() => formatBpmRange(bpmRange(timingPoints)), [timingPoints]);
  const live = liveStats && (liveStats.notes > 0 || showEmpty) ? liveStats : null;
  // What was last on show stays while the block closes (or while the dock
  // fades its panel out), so the numbers leave with it instead of vanishing
  // a moment before.
  const lastShown = useRef<{
    stats: NonNullable<typeof liveStats>;
    bpmLabel: string;
    name: string | undefined;
  } | null>(null);
  if (live) lastShown.current = { stats: live, bpmLabel: liveBpm, name: deferred?.name };
  const view = lastShown.current;
  if (!view) return reveal ? <div className="stats-reveal" /> : null;
  const { stats, bpmLabel } = view;
  const grid = (
    <>
      <Stat label="BPM" value={bpmLabel} />
      <Stat label={t("diffSidebar.notes")} value={<RollingNumber value={stats.notes} />} />
      <Stat
        label="LN"
        value={<RollingNumber value={Math.round(stats.lnRatio * 100)} format={percent} />}
      />
      <Stat
        label={t("diffSidebar.chords")}
        value={<RollingNumber value={Math.round(stats.chordRatio * 100)} format={percent} />}
      />
      <Stat
        label={t("diffSidebar.avgNps")}
        value={<RollingNumber value={stats.avgNps} format={oneDecimal} />}
      />
      <Stat label={t("diffSidebar.peakNps")} value={<RollingNumber value={stats.peakNps} />} />
      <Stat
        label="Rice/LN"
        value={
          <>
            <RollingNumber value={stats.rice} />/<RollingNumber value={stats.holds} />
          </>
        }
      />
    </>
  );
  const title = (
    <div className="mb-2 truncate text-xs font-semibold text-slate-300">
      {t("diffSidebar.stats", { name: view.name || t("diffSidebar.active") })}
    </div>
  );
  const body = orientation === "horizontal" ? (
      <div className={`flex items-start gap-6 bg-ink-900 px-4 pb-2.5 pt-2.5 ${className}`}>
        <div className="w-[17rem]">
          {title}
          <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-[11px]">{grid}</div>
        </div>
        <div className="w-44 [&>div]:mt-0">
          <ColumnHistogram
            counts={stats.columnCounts}
            handBalance={stats.handBalance}
            onFlashColumn={onFlashColumn}
          />
        </div>
      </div>
  ) : (
    <div className={`bg-ink-900 px-3.5 pb-3 pt-2.5 ${className}`}>
      {title}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">{grid}</div>
      <ColumnHistogram
        counts={stats.columnCounts}
        handBalance={stats.handBalance}
        onFlashColumn={onFlashColumn}
      />
    </div>
  );
  if (!reveal) return body;
  return (
    <div className="stats-reveal" data-open={live ? "true" : undefined}>
      <div className="stats-reveal-clip">{body}</div>
    </div>
  );
}

/** A gauge whose needle swings up the dial while the rate changer is open. */
function RateIcon({ open }: { open: boolean }) {
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
      <path
        d="M12 17.5 16 11"
        className="rate-icon-needle"
        data-open={open ? "true" : undefined}
      />
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
          L <RollingNumber value={leftPct} format={percent} /> · R{" "}
          <RollingNumber value={100 - leftPct} format={percent} />
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
              className="group/bar relative flex-1 rounded-t-sm bg-slate-500/55 transition-[height,background-color,filter] duration-300 ease-[var(--ease-emphasized)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:brightness-125 disabled:cursor-default"
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
            <RollingNumber value={count} />
          </span>
        ))}
      </div>
    </div>
  );
}

const percent = (value: number) => `${value}%`;
const oneDecimal = (value: number) => value.toFixed(1);
const twoDecimals = (value: number) => value.toFixed(2);

function Stat({ label, value }: { label: string; value: ReactNode }) {
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
      className={`hit-line-left group min-w-0 cursor-pointer rounded-md px-2.5 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${
        active ? "bg-white/[0.06]" : mobile ? "bg-white/[0.025]" : "hover:bg-white/[0.035]"
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
            onChange={(e) => setDraft(typedDifficultyName(e.target.value))}
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
            ★ <RollingNumber value={star} format={twoDecimals} />
          </span>
          {msdSupportsKeyCount(difficulty.keyCount) && msd && msd.overall > 0 && (
            <span
              className="shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums"
              style={{ color: msdColor(msd.overall) }}
              title={msdTooltip(msd, difficulty.keyCount)}
            >
              <RollingNumber value={msd.overall} format={twoDecimals} />
              <span className="ml-0.5 text-[9px] font-medium opacity-70">MSD</span>
            </span>
          )}
        </span>
        {!mobile && (
          <span className="truncate text-2xs text-slate-500">
            {starTier(star)}
          </span>
        )}
      </div>

      {/* Row actions stay out of the way until the row is pointed at,
          focused or open. Phones keep them in one bar under the grid. */}
      {!mobile && <div
        className={`flex items-center gap-0.5 pl-3 transition-[opacity,max-height,margin] duration-[var(--motion-quick)] ${
          active || selected
            ? "mt-1 max-h-6 opacity-100"
            : "max-h-0 overflow-hidden opacity-0 group-hover:mt-1 group-hover:max-h-6 group-hover:opacity-100 group-focus-within:mt-1 group-focus-within:max-h-6 group-focus-within:opacity-100"
        }`}
      >
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
      </div>}
    </div>
  );
}

const PHONE_ACTION_CLASS =
  "rounded-md bg-white/[0.04] px-1 text-xs text-slate-300 transition hover:bg-white/[0.08] hover:text-slate-100 disabled:opacity-40";

/** The row actions on phones, for the open difficulty or, while selecting,
 *  for the selected ones. */
function PhoneDiffActions({
  difficulty,
  selectionCount,
  canDelete,
  onRename,
  onCopy,
  onDuplicate,
  onDelete,
}: {
  difficulty: Difficulty;
  selectionCount: number;
  canDelete: boolean;
  onRename: (name: string) => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const name = draft?.trim();
    if (name && name !== difficulty.name) onRename(name);
    setDraft(null);
  };

  if (draft !== null) {
    return (
      <div className="flex shrink-0 gap-1.5 border-t border-white/[0.06] px-1.5 py-2">
        <input
          autoFocus
          value={draft}
          aria-label={t("common.rename")}
          onChange={(e) => setDraft(typedDifficultyName(e.target.value))}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") setDraft(null);
          }}
          className="min-w-0 flex-1 rounded-md bg-black/30 px-2 text-slate-100 outline-none ring-1 ring-accent/70"
        />
        <button type="button" onClick={commit} className={`${PHONE_ACTION_CLASS} px-3`}>
          {t("common.save")}
        </button>
      </div>
    );
  }

  return (
    <div className="grid shrink-0 grid-cols-4 gap-1 border-t border-white/[0.06] px-1.5 py-2">
      <button type="button" onClick={() => setDraft(difficulty.name)} className={PHONE_ACTION_CLASS}>
        {t("common.rename")}
      </button>
      <button type="button" onClick={onCopy} title={t("diffSidebar.copyTitle")} className={PHONE_ACTION_CLASS}>
        {t("common.copy")}
      </button>
      <button type="button" onClick={onDuplicate} className={PHONE_ACTION_CLASS}>
        {t("common.duplicate")}
      </button>
      <button
        type="button"
        disabled={!canDelete}
        onClick={onDelete}
        data-no-uisound=""
        className={`${PHONE_ACTION_CLASS} hover:bg-rose-500/10 hover:text-rose-300`}
      >
        {selectionCount
          ? t("diffSidebar.deleteMany", { count: selectionCount })
          : t("common.delete")}
      </button>
    </div>
  );
}
