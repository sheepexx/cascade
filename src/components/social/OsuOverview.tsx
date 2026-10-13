import { useLocale, useT } from "../../lib/i18n";
import { formatDuration } from "../../lib/mappingTracker";
import type { MappingStats } from "../../lib/mappingStats";
import type { OsuMode, OsuProfile } from "../../lib/osuProfile";
import type { Profile } from "../../lib/social";
import { SegmentedControl } from "../ui/Controls";
import { Skeleton } from "../ui/Skeleton";
import { Tooltip } from "../ui/Tooltip";
import {
  ErrorLine,
  SectionCard,
  StatTile,
} from "./socialUi";
import { formatCompact, useNumberFormat } from "./socialUtils";

const MODE_LABELS: Record<OsuMode, string> = {
  mania: "osu!mania",
  osu: "osu!",
  taiko: "osu!taiko",
  fruits: "osu!catch",
};

const GRADES = [
  { key: "ssh", label: "SS", className: "text-slate-200 bg-slate-300/10" },
  { key: "ss", label: "SS", className: "text-amber-200 bg-amber-300/10" },
  { key: "sh", label: "S", className: "text-slate-200 bg-slate-300/10" },
  { key: "s", label: "S", className: "text-amber-200 bg-amber-300/10" },
  { key: "a", label: "A", className: "text-emerald-200 bg-emerald-300/10" },
] as const;

/**
 * The first tab of a profile: osu! statistics for one mode (osu!mania first),
 * the official badges, what the account has mapped on osu!, and a summary of
 * what Cascade measured. osu! numbers and Cascade numbers sit in separate,
 * labelled cards so one is never read as the other.
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
}) {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useNumberFormat();
  const s = osu?.statistics ?? null;
  const unranked = s && s.global_rank === null && (s.play_count ?? 0) === 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="flex min-w-0 flex-col gap-4">
        <SectionCard
          title={t("social.osuStatistics")}
          aside={
            <SegmentedControl
              className="text-xs [&_button]:px-2 [&_button]:py-1 [&_button]:text-xs"
              value={mode}
              onChange={onMode}
              options={(Object.keys(MODE_LABELS) as OsuMode[]).map((value) => ({
                value,
                label: MODE_LABELS[value],
              }))}
            />
          }
        >
          {error && !osu ? (
            <ErrorLine message={error} onRetry={onRetry} />
          ) : !osu || (loading && osu.mode !== mode) ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} step={i} className="h-[66px] rounded-xl" />
              ))}
            </div>
          ) : unranked ? (
            <p className="py-6 text-center text-sm text-slate-500">
              {t("social.noPlaysInMode", { mode: MODE_LABELS[mode] })}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                <StatTile label={t("social.globalRank")} value={s?.global_rank ? `#${fmt(s.global_rank)}` : "–"} />
                <StatTile
                  label={t("social.countryRank")}
                  value={s?.country_rank ? `#${fmt(s.country_rank)}` : "–"}
                />
                <StatTile label={t("social.pp")} value={fmt(s?.pp)} />
                <StatTile label={t("social.accuracy")} value={s?.accuracy != null ? `${fmt(s.accuracy, 2)}%` : "–"} />
                <StatTile label={t("social.playCount")} value={fmt(s?.play_count)} />
                <StatTile
                  label={t("social.playTime")}
                  value={s?.play_time != null ? formatDuration(s.play_time) : "–"}
                />
                <StatTile
                  label={t("social.rankedScore")}
                  value={formatCompact(s?.ranked_score, locale)}
                  title={fmt(s?.ranked_score)}
                />
                <StatTile
                  label={t("social.totalScore")}
                  value={formatCompact(s?.total_score, locale)}
                  title={fmt(s?.total_score)}
                />
                <StatTile label={t("social.maxCombo")} value={fmt(s?.maximum_combo)} />
                <StatTile label={t("social.level")} value={s?.level != null ? fmt(s.level) : "–"} />
                {osu.rank_highest && (
                  <StatTile
                    label={t("social.peakRank")}
                    value={`#${fmt(osu.rank_highest.rank)}`}
                    hint={
                      osu.rank_highest.updated_at
                        ? new Date(osu.rank_highest.updated_at).toLocaleDateString(locale, {
                            year: "numeric",
                            month: "short",
                          })
                        : undefined
                    }
                  />
                )}
              </div>
              {s?.grade_counts && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {GRADES.map((grade) => (
                    <span
                      key={grade.key}
                      className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs ${grade.className}`}
                      title={t(`social.grade_${grade.key}`)}
                    >
                      <span className="font-bold tracking-wide">{grade.label}</span>
                      <span className="tabular-nums text-slate-300">{fmt(s.grade_counts![grade.key])}</span>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          <p className="mt-3 text-[11px] text-slate-500">{t("social.fromOsu")}</p>
        </SectionCard>

        <SectionCard title={t("social.badges")}>
          {!osu ? (
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} step={i} className="h-10 w-[86px] rounded-md" />
              ))}
            </div>
          ) : osu.badges.length === 0 ? (
            <p className="text-sm text-slate-500">{t("social.noBadges")}</p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(86px,1fr))] gap-2">
              {osu.badges.map((badge) => (
                <li key={`${badge.image_url}-${badge.awarded_at}`}>
                  <Tooltip
                    underline={false}
                    content={
                      <span className="block max-w-56">
                        <span className="block font-medium text-slate-100">{badge.description}</span>
                        {badge.awarded_at && (
                          <span className="mt-0.5 block text-[11px] text-slate-400">
                            {t("social.badgeAwarded", {
                              date: new Date(badge.awarded_at).toLocaleDateString(locale),
                            })}
                          </span>
                        )}
                      </span>
                    }
                  >
                    {badge.url ? (
                      <a href={badge.url} target="_blank" rel="noreferrer" className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                        <BadgeImage badge={badge} />
                      </a>
                    ) : (
                      <span tabIndex={0} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                        <BadgeImage badge={badge} />
                      </span>
                    )}
                  </Tooltip>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <SectionCard title={t("social.mappingOnOsu")}>
          {!osu ? (
            <Skeleton className="h-28 rounded-xl" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
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
              <p className="mt-3 text-[11px] leading-4 text-slate-500">{t("social.beatmapsetCountsHint")}</p>
            </>
          )}
        </SectionCard>

        <CascadeSummary stats={stats} isSelf={profile.is_self} onShowActivity={onShowActivity} />
      </div>
    </div>
  );
}

function BadgeImage({ badge }: { badge: OsuProfile["badges"][number] }) {
  return (
    <img
      src={badge.image_url}
      srcSet={badge.image_2x_url ? `${badge.image_url} 1x, ${badge.image_2x_url} 2x` : undefined}
      alt={badge.description}
      loading="lazy"
      draggable={false}
      className="aspect-[86/40] w-full rounded-md object-contain transition hover:brightness-110"
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
  return (
    <SectionCard
      title={t("social.inCascade")}
      aside={
        stats && !hidden ? (
          <button
            type="button"
            onClick={onShowActivity}
            className="rounded-md px-1.5 py-0.5 text-xs font-medium text-accent transition hover:bg-accent/10 hover:text-accent-soft"
          >
            {t("social.seeActivity")}
          </button>
        ) : null
      }
    >
      {!stats ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : hidden ? (
        <p className="text-sm text-slate-500">{isSelf ? t("social.statsPrivateSelf") : t("social.statsPrivate")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {stats.totals && <StatTile label={t("social.mappingTime")} value={formatDuration(stats.totals.edit)} />}
          {stats.counters && <StatTile label={t("social.mapsEdited")} value={fmt(stats.counters.maps_edited)} />}
          {stats.counters && <StatTile label={t("social.activeDays")} value={fmt(stats.counters.active_days)} />}
          {stats.counters && <StatTile label={t("social.notesPlaced")} value={fmt(stats.counters.notes_placed)} />}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-4 text-slate-500">{t("social.cascadeOnlyHint")}</p>
    </SectionCard>
  );
}
