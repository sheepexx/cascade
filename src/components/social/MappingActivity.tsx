import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale, useT } from "../../lib/i18n";
import { formatDuration, localDay } from "../../lib/mappingTracker";
import {
  calendarGrid,
  currentStreak,
  periodTotals,
  weeklyTotals,
  type MappingStats,
} from "../../lib/mappingStats";
import { Skeleton } from "../ui/Skeleton";
import {
  EmptyState,
  SectionCard,
  SmallButton,
  StatTile, AdminViewNote } from "./socialUi";
import { relativeTime, useNumberFormat } from "./socialUtils";

// One hue, light end clearing the dark surface (checked with the dataviz
// ordinal validator against ink-700): more activity reads brighter.
const LEVEL_COLORS = ["rgba(255,255,255,0.06)", "#7d3d46", "#a64c52", "#cf6262", "#f7a0a0"];

/**
 * The Activity tab: time and work recorded in Cascade's editor, as far as
 * the mapper shares it. Everything here is Cascade's own measurement; the
 * page says so, and says that time in osu!'s editor isn't part of it.
 */
export function MappingActivity({
  stats,
  isSelf,
  username,
  onOpenPrivacy,
}: {
  stats: MappingStats | null;
  isSelf: boolean;
  username: string;
  onOpenPrivacy: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useNumberFormat();
  const today = localDay(Date.now());

  if (!stats) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  const { visible } = stats;
  if (!visible.mapping_stats && !visible.mapping_time && !visible.projects && !visible.project_time) {
    return (
      <EmptyState
        title={isSelf ? t("social.statsPrivateSelf") : t("social.statsPrivate")}
        body={isSelf ? t("social.statsPrivateSelfHint") : t("social.statsPrivateHint", { name: username })}
        action={isSelf ? <SmallButton onClick={onOpenPrivacy}>{t("social.privacySettings")}</SmallButton> : undefined}
      />
    );
  }

  const nothingYet =
    (stats.counters?.active_days ?? 0) === 0 &&
    (stats.totals?.edit ?? 0) === 0 &&
    (stats.projects?.length ?? 0) === 0;
  if (nothingYet) {
    return (
      <EmptyState
        title={isSelf ? t("social.noActivitySelf") : t("social.noActivity", { name: username })}
        body={t("social.cascadeOnlyHint")}
      />
    );
  }

  const periods = periodTotals(stats.calendar, today);
  const streak = currentStreak(stats.calendar, today);
  const mostActive = (stats.projects ?? [])
    .filter((p) => p.edit !== null)
    .sort((a, b) => (b.edit ?? 0) - (a.edit ?? 0))
    .slice(0, 5);
  const since = stats.counters?.first_day
    ? new Date(`${stats.counters.first_day}T12:00:00`).toLocaleDateString(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="flex flex-col gap-4">
      {stats.admin_override && <AdminViewNote />}
      {stats.totals && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label={t("social.mappingTime")} value={formatDuration(stats.totals.edit)} hint={t("social.allTime")} />
          {periods && (
            <>
              <StatTile label={t("social.today")} value={formatDuration(periods.today)} />
              <StatTile label={t("social.last7Days")} value={formatDuration(periods.week)} />
              <StatTile label={t("social.thisMonth")} value={formatDuration(periods.month)} />
            </>
          )}
          <StatTile label={t("social.playtesting")} value={formatDuration(stats.totals.playtest)} />
          <StatTile label={t("social.reviewing")} value={formatDuration(stats.totals.review)} hint={t("social.reviewingHint")} />
          <StatTile label={t("social.longestSession")} value={formatDuration(stats.totals.longest_session)} />
          {stats.counters && (
            <StatTile label={t("social.activeDays")} value={fmt(stats.counters.active_days)} hint={streak > 1 ? t("social.streak", { count: streak }) : undefined} />
          )}
        </div>
      )}

      {stats.calendar && (
        <SectionCard title={t("social.activityCalendar")}>
          <ActivityCalendar calendar={stats.calendar} today={today} />
        </SectionCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {stats.totals && stats.calendar && (
          <SectionCard title={t("social.weeklyMappingTime")}>
            <WeeklyBars calendar={stats.calendar} today={today} />
          </SectionCard>
        )}
        {stats.counters && (
          <SectionCard title={t("social.whatGotDone")}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatTile label={t("social.notesPlaced")} value={fmt(stats.counters.notes_placed)} />
              <StatTile label={t("social.notesDeleted")} value={fmt(stats.counters.notes_deleted)} />
              <StatTile label={t("social.timingChanges")} value={fmt(stats.counters.timing_changes)} />
              <StatTile label={t("social.svChanges")} value={fmt(stats.counters.sv_changes)} />
              <StatTile label={t("social.playtests")} value={fmt(stats.counters.playtests)} />
              <StatTile label={t("social.exports")} value={fmt(stats.counters.exports)} />
              <StatTile label={t("social.mapsCreated")} value={fmt(stats.counters.maps_created)} />
              <StatTile label={t("social.mapsEdited")} value={fmt(stats.counters.maps_edited)} />
              <StatTile label={t("social.difficultiesCreated")} value={fmt(stats.counters.difficulties_created)} />
            </div>
          </SectionCard>
        )}
      </div>

      {mostActive.length > 0 && (
        <SectionCard title={t("social.mostActiveProjects")}>
          <ol className="flex flex-col gap-2.5">
            {mostActive.map((project) => {
              const max = mostActive[0].edit || 1;
              return (
                <li key={project.project_key} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-slate-200">
                      {project.title || t("common.untitled")}
                      {project.artist && <span className="text-slate-500"> · {project.artist}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-300">{formatDuration(project.edit)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-accent/80"
                      style={{ width: `${Math.max(3, ((project.edit ?? 0) / max) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {t("social.lastEdited", { when: relativeTime(project.last_active_at, t) })}
                  </span>
                </li>
              );
            })}
          </ol>
        </SectionCard>
      )}

      <p className="px-1 text-[11px] leading-4 text-slate-500">
        {t("social.cascadeOnlyHint")} {since && t("social.recordedSince", { date: since })}
        {isSelf && (
          <>
            {" "}
            <button type="button" onClick={onOpenPrivacy} className="font-medium text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline">
              {t("social.whoCanSee")}
            </button>
          </>
        )}
      </p>
    </div>
  );
}

export function ActivityCalendar({ calendar, today }: { calendar: NonNullable<MappingStats["calendar"]>; today: string }) {
  const t = useT();
  const { locale } = useLocale();
  const grid = useMemo(() => calendarGrid(calendar, today, 53), [calendar, today]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Starts on the latest weeks when the year doesn't fit, like GitHub's.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [grid]);
  const [hover, setHover] = useState<{ day: string; seconds: number | null; level: number } | null>(null);
  const monthLabels = useMemo(() => {
    const labels: { index: number; label: string }[] = [];
    let last = "";
    grid.forEach((column, index) => {
      const month = column[0].day.slice(0, 7);
      if (month !== last) {
        last = month;
        if (index > 0 || column[0].day.endsWith("-01")) {
          labels.push({
            index,
            label: new Date(`${column[0].day}T12:00:00`).toLocaleDateString(locale, { month: "short" }),
          });
        }
      }
    });
    return labels;
  }, [grid, locale]);

  const describe = (cell: { day: string; seconds: number | null; level: number }) => {
    const date = new Date(`${cell.day}T12:00:00`).toLocaleDateString(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    if (cell.seconds !== null) {
      return cell.seconds > 0 ? `${date}: ${formatDuration(cell.seconds)}` : `${date}: ${t("social.noActivityDay")}`;
    }
    return `${date}: ${cell.level > 0 ? t("social.activeDay") : t("social.noActivityDay")}`;
  };

  return (
    <div className="flex flex-col gap-2">
      <div ref={scrollerRef} className="no-scrollbar overflow-x-auto" dir="ltr">
        <div className="inline-flex min-w-full flex-col gap-1.5 pr-1">
          <div className="relative h-3.5 text-[10px] text-slate-500">
            {monthLabels.map((m) => (
              <span key={m.index} className="absolute" style={{ left: `${m.index * 13}px` }}>
                {m.label}
              </span>
            ))}
          </div>
          <div
            role="grid"
            aria-label={t("social.activityCalendar")}
            className="flex gap-[3px]"
            onMouseLeave={() => setHover(null)}
          >
            {grid.map((column) => (
              <div key={column[0].day} role="row" className="flex flex-col gap-[3px]">
                {column.map((cell) => (
                  <span
                    key={cell.day}
                    role="gridcell"
                    aria-label={cell.future ? undefined : describe(cell)}
                    onMouseEnter={() => !cell.future && setHover(cell)}
                    className={`h-2.5 w-2.5 rounded-[3px] ${cell.future ? "opacity-0" : ""} ${
                      cell.day === today ? "ring-1 ring-slate-400/60" : ""
                    }`}
                    style={{ background: LEVEL_COLORS[Math.max(0, Math.min(4, cell.level))] }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span aria-live="polite" className="min-h-4 tabular-nums text-slate-400">
          {hover ? describe(hover) : ""}
        </span>
        <span className="flex items-center gap-1">
          {t("social.less")}
          {LEVEL_COLORS.map((color) => (
            <span key={color} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
          ))}
          {t("social.more")}
        </span>
      </div>
    </div>
  );
}

function WeeklyBars({ calendar, today }: { calendar: NonNullable<MappingStats["calendar"]>; today: string }) {
  const t = useT();
  const { locale } = useLocale();
  const weeks = useMemo(() => weeklyTotals(calendar, today, 12) ?? [], [calendar, today]);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.seconds));
  const label = (start: string) =>
    new Date(`${start}T12:00:00`).toLocaleDateString(locale, { month: "short", day: "numeric" });
  const shown = hover !== null ? weeks[hover] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-5 items-baseline justify-between text-xs">
        <span className="text-slate-400">
          {shown ? t("social.weekOf", { date: label(shown.start) }) : t("social.last12Weeks")}
        </span>
        <span className="font-semibold tabular-nums text-slate-200">
          {formatDuration(shown ? shown.seconds : weeks.reduce((sum, w) => sum + w.seconds, 0))}
        </span>
      </div>
      <div className="relative h-28 border-b border-white/10" onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {weeks.map((week, index) => (
            <button
              key={week.start}
              type="button"
              aria-label={`${t("social.weekOf", { date: label(week.start) })}: ${formatDuration(week.seconds)}`}
              onMouseEnter={() => setHover(index)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
              className="group flex h-full flex-1 items-end focus-visible:outline-none"
            >
              <span
                className={`block w-full rounded-t-[4px] transition-colors ${
                  hover === index ? "bg-accent-soft" : "bg-accent/75 group-focus-visible:bg-accent-soft"
                }`}
                style={{ height: week.seconds > 0 ? `${Math.max(3, (week.seconds / max) * 100)}%` : "0%" }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{weeks[0] ? label(weeks[0].start) : ""}</span>
        <span>{t("social.thisWeek")}</span>
      </div>
      <table className="sr-only">
        <caption>{t("social.weeklyMappingTime")}</caption>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.start}>
              <th scope="row">{label(week.start)}</th>
              <td>{formatDuration(week.seconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
