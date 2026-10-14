import { useLocale, useT } from "../../lib/i18n";
import { formatDuration, localDay } from "../../lib/mappingTracker";
import { periodTotals, type MappingStats } from "../../lib/mappingStats";
import type { OsuMode, OsuProfile } from "../../lib/osuProfile";
import type { Profile } from "../../lib/social";
import { SegmentedControl } from "../ui/Controls";
import { Skeleton } from "../ui/Skeleton";
import { Tooltip } from "../ui/Tooltip";
import { ActivityCalendar } from "./MappingActivity";
import { AdminViewNote, ErrorLine, SectionCard, StatTile } from "./socialUi";
import { useNumberFormat } from "./socialUtils";

const MODE_LABELS: Record<OsuMode, string> = {
  mania: "mania",
  osu: "osu!",
  taiko: "taiko",
  fruits: "catch",
};

/**
 * The first tab of a profile. Mapping comes first: what the account has
 * mapped on osu! and what Cascade measured, with the activity calendar. The
 * player side is kept to rank, performance and play time. osu! numbers and
 * Cascade numbers sit in separate, labelled cards so one is never read as
 * the other.
 */
export function OsuOverview({
  profile,
  osu,
  loading,
  error,
  mode,
  onMode,
  onRetry,
  stats,
  onShowActivity,
  onShowMaps,
}: {
  profile: Profile;
  osu: OsuProfile | null;
  loading: boolean;
  error: string | null;
  mode: OsuMode;
  onMode: (mode: OsuMode) => void;
  onRetry: () => void;
  stats: MappingStats | null;
  onShowActivity: () => void;
  onShowMaps: () => void;
}) {
  const t = useT();
  const fmt = useNumberFormat();

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
      <div className="flex min-w-0 flex-col gap-8">
        <SectionCard
          title={t("social.mappingOnOsu")}
          aside={
            osu ? (
              <button
                type="button"
                onClick={onShowMaps}
                className="rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-50"
              >
                {t("social.seeMaps")} <span aria-hidden>→</span>
              </button>
            ) : null
          }
        >
          {error && !osu ? (
            <ErrorLine message={error} onRetry={onRetry} />
          ) : !osu ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} step={i} className="h-[52px] rounded-md" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <StatTile label={t("social.statusRanked")} value={fmt(osu.counts.ranked)} />
                <StatTile label={t("social.statusLoved")} value={fmt(osu.counts.loved)} />
                <StatTile label={t("social.statusPending")} value={fmt(osu.counts.pending)} />
                <StatTile label={t("social.statusGraveyard")} value={fmt(osu.counts.graveyard)} />
                <StatTile label={t("social.statusGuest")} value={fmt(osu.counts.guest)} />
                <StatTile label={t("social.nominated")} value={fmt(osu.counts.nominated)} />
                {osu.kudosu && (
                  <StatTile
                    label={t("social.kudosu")}
                    value={fmt(osu.kudosu.total)}
                    hint={t("social.kudosuAvailable", { count: osu.kudosu.available })}
                  />
                )}
                {osu.mapping_follower_count !== null && (
                  <StatTile label={t("social.mappingFollowers")} value={fmt(osu.mapping_follower_count)} />
                )}
              </div>
            </>
          )}
        </SectionCard>

        <CascadeSummary stats={stats} isSelf={profile.is_self} onShowActivity={onShowActivity} />
      </div>

      <div className="flex min-w-0 flex-col gap-8">
        <SectionCard title={t("social.osuPlayer")}>
          <SegmentedControl
            size="sm"
            className="mb-4"
            value={mode}
            onChange={onMode}
            options={(Object.keys(MODE_LABELS) as OsuMode[]).map((value) => ({
              value,
              label: MODE_LABELS[value],
            }))}
          />
          <PlayerStats osu={osu} loading={loading} mode={mode} />
        </SectionCard>
      </div>
    </div>
  );
}

function PlayerStats({ osu, loading, mode }: { osu: OsuProfile | null; loading: boolean; mode: OsuMode }) {
  const t = useT();
  const fmt = useNumberFormat();
  if (!osu || (loading && osu.mode !== mode)) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} step={i} className="h-[52px] rounded-md" />
        ))}
      </div>
    );
  }
  const s = osu.statistics;
  if (!s || (s.global_rank === null && (s.play_count ?? 0) === 0)) {
    return <p className="py-3 text-sm text-slate-500">{t("social.noPlaysInMode")}</p>;
  }
  return (
    <div className="grid gap-y-4">
      <StatTile
        label={t("social.globalRank")}
        value={s.global_rank ? `#${fmt(s.global_rank)}` : "–"}
        hint={s.country_rank ? t("social.countryRankHint", { rank: fmt(s.country_rank) }) : undefined}
      />
      <StatTile label={t("social.pp")} value={s.pp !== null ? `${fmt(s.pp)}pp` : "–"} />
      <StatTile label={t("social.playTime")} value={s.play_time != null ? formatDuration(s.play_time) : "–"} />
    </div>
  );
}

/** The account's official osu! badges, for the profile header. */
export function BadgeRow({ badges }: { badges: OsuProfile["badges"] }) {
  const t = useT();
  const { locale } = useLocale();
  if (!badges.length) return null;
  return (
    <ul aria-label={t("social.badges")} className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <li key={`${badge.image_url}-${badge.awarded_at}`}>
          <Tooltip
            underline={false}
            content={
              <span className="block max-w-56">
                <span className="block font-medium text-slate-100">{badge.description}</span>
                {badge.awarded_at && (
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {t("social.badgeAwarded", { date: new Date(badge.awarded_at).toLocaleDateString(locale) })}
                  </span>
                )}
              </span>
            }
          >
            {badge.url ? (
              <a
                href={badge.url}
                target="_blank"
                rel="noreferrer"
                aria-label={badge.description}
                className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <BadgeImage badge={badge} />
              </a>
            ) : (
              <span
                tabIndex={0}
                aria-label={badge.description}
                className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <BadgeImage badge={badge} />
              </span>
            )}
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

function BadgeImage({ badge }: { badge: OsuProfile["badges"][number] }) {
  return (
    <img
      src={badge.image_url}
      srcSet={badge.image_2x_url ? `${badge.image_url} 1x, ${badge.image_2x_url} 2x` : undefined}
      alt=""
      loading="lazy"
      draggable={false}
      className="h-[30px] w-[64.5px] rounded object-contain transition hover:brightness-110"
    />
  );
}

function CascadeSummary({
  stats,
  isSelf,
  onShowActivity,
}: {
  stats: MappingStats | null;
  isSelf: boolean;
  onShowActivity: () => void;
}) {
  const t = useT();
  const fmt = useNumberFormat();
  const hidden = stats && !stats.visible.mapping_stats && !stats.visible.mapping_time;
  const today = localDay(Date.now());
  const periods = stats ? periodTotals(stats.calendar, today) : null;
  return (
    <SectionCard
      title={t("social.inCascade")}
      aside={
        stats && !hidden ? (
          <button
            type="button"
            onClick={onShowActivity}
            className="rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-50"
          >
            {t("social.seeActivity")} <span aria-hidden>→</span>
          </button>
        ) : null
      }
    >
      {!stats ? (
        <Skeleton className="h-32 rounded-md" />
      ) : hidden ? (
        <p className="text-sm text-slate-500">{isSelf ? t("social.statsPrivateSelf") : t("social.statsPrivate")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {stats.admin_override && <AdminViewNote />}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {stats.totals && <StatTile label={t("social.mappingTime")} value={formatDuration(stats.totals.edit)} />}
            {periods && <StatTile label={t("social.last7Days")} value={formatDuration(periods.week)} />}
            {stats.counters && <StatTile label={t("social.mapsEdited")} value={fmt(stats.counters.maps_edited)} />}
            {stats.counters && <StatTile label={t("social.activeDays")} value={fmt(stats.counters.active_days)} />}
            {stats.counters && !periods && (
              <StatTile label={t("social.notesPlaced")} value={fmt(stats.counters.notes_placed)} />
            )}
          </div>
          {stats.calendar && stats.calendar.length > 0 && <ActivityCalendar calendar={stats.calendar} today={today} />}
        </div>
      )}
      <p className="mt-4 text-xs leading-relaxed text-slate-500">{t("social.cascadeOnlyHint")}</p>
    </SectionCard>
  );
}
