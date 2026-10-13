import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useT, type MessageKey } from "../../lib/i18n";
import {
  applyLibraryFilter,
  availableCategories,
  categoryCount,
  keyCounts,
  libraryKeyCounts,
  maniaDifficulties,
  setDate,
  setLength,
  sourcesFor,
  starRange,
  type LibraryCategory,
  type LibrarySort,
} from "../../lib/mapLibrary";
import { formatDuration } from "../../lib/mappingTracker";
import type { MappingProject, MappingStats } from "../../lib/mappingStats";
import {
  beatmapsetUrl,
  fetchBeatmapsets,
  type BeatmapsetType,
  type OsuBeatmapset,
  type OsuProfile,
} from "../../lib/osuProfile";
import { sharedMapUrl } from "../../lib/sharedMap";
import { formatLength } from "../../lib/shareCard";
import { starColor, starTextOn } from "../../lib/starRating";
import { Dropdown } from "../ui/Dropdown";
import { SkeletonCards } from "../ui/Skeleton";
import {
  EmptyState,
  ErrorLine,
  ExternalIcon,
  SearchIcon,
  SmallButton,
} from "./socialUi";
import { errorText, relativeTime, useNumberFormat } from "./socialUtils";

const PAGE = 24;

type SourceState = {
  sets: OsuBeatmapset[];
  offset: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
};

const CATEGORY_LABELS: Record<LibraryCategory, MessageKey> = {
  all: "social.mapsAll",
  ranked: "social.statusRanked",
  qualified: "social.statusQualified",
  loved: "social.statusLoved",
  pending: "social.statusPending",
  graveyard: "social.statusGraveyard",
  guest: "social.mapsCollabs",
  cascade: "social.mapsCascade",
};

const STATUS_STYLES: Record<string, string> = {
  ranked: "bg-sky-400/90 text-ink-900",
  approved: "bg-sky-400/90 text-ink-900",
  qualified: "bg-cyan-300/90 text-ink-900",
  loved: "bg-pink-400/90 text-ink-900",
  pending: "bg-amber-300/90 text-ink-900",
  wip: "bg-orange-300/90 text-ink-900",
  graveyard: "bg-slate-800/90 text-slate-300",
};

const STATUS_LABELS: Record<string, MessageKey> = {
  ranked: "social.statusRanked",
  approved: "social.statusApproved",
  qualified: "social.statusQualified",
  loved: "social.statusLoved",
  pending: "social.statusPending",
  wip: "social.statusWip",
  graveyard: "social.statusGraveyard",
};

/**
 * The Maps tab: the account's beatmapsets on osu!, a page at a time, plus
 * the Cascade projects the owner chooses to show. Search, the key filter and
 * sorting work on what has been loaded; loading more pulls the next page of
 * every section the category is made of.
 */
export function MapLibrary({
  osuId,
  counts,
  countsLoading,
  isSelf,
  stats,
  onOpenCloudProject,
  onOpenBeatmapset,
}: {
  osuId: number;
  counts: OsuProfile["counts"] | null;
  countsLoading: boolean;
  isSelf: boolean;
  stats: MappingStats | null;
  onOpenCloudProject: (id: string) => void;
  onOpenBeatmapset?: (setId: number) => void;
}) {
  const t = useT();
  const projects = useMemo(() => stats?.projects ?? [], [stats]);
  const categories = availableCategories(counts, projects.length);
  const [category, setCategory] = useState<LibraryCategory | null>(null);
  const [query, setQuery] = useState("");
  const [keys, setKeys] = useState<number | null>(null);
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [sources, setSources] = useState<Partial<Record<BeatmapsetType, SourceState>>>({});
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const active: LibraryCategory | null =
    category && categories.includes(category) ? category : categories[0] ?? null;

  const mapTimes = useMemo(() => {
    const out = new Map<number, number>();
    for (const m of stats?.map_times ?? []) out.set(m.beatmapset_id, m.edit);
    return out;
  }, [stats]);

  const loadSource = useCallback(
    (type: BeatmapsetType, retry = false) => {
      const current = retry ? undefined : sourcesRef.current[type];
      if (current?.loading || (current && !current.hasMore)) return;
      const offset = current?.offset ?? 0;
      const base: SourceState = current ?? { sets: [], offset: 0, hasMore: true, loading: false, error: null };
      setSources((prev) => ({ ...prev, [type]: { ...base, loading: true, error: null } }));
      fetchBeatmapsets(osuId, type, offset, PAGE)
        .then((page) => {
          setSources((prev) => {
            const now = prev[type] ?? base;
            return {
              ...prev,
              [type]: {
                sets: [...now.sets, ...page.beatmapsets],
                offset: offset + page.beatmapsets.length,
                hasMore: page.has_more,
                loading: false,
                error: null,
              },
            };
          });
        })
        .catch((e: unknown) => {
          setSources((prev) => ({
            ...prev,
            [type]: { ...(prev[type] ?? base), loading: false, error: errorText(e, t("social.osuFailed")) },
          }));
        });
    },
    [osuId, t],
  );

  useEffect(() => {
    if (!active) return;
    for (const type of sourcesFor(active)) {
      if (!sourcesRef.current[type]) loadSource(type);
    }
  }, [active, loadSource]);

  const types = active ? sourcesFor(active) : [];
  const loadedSets = types.flatMap((type) => sources[type]?.sets ?? []);
  const loading = types.some((type) => sources[type]?.loading || !sources[type]);
  const sourceError = types.map((type) => sources[type]?.error).find(Boolean) ?? null;
  const hasMore = types.some((type) => sources[type]?.hasMore && !sources[type]?.error);
  const keyOptions = libraryKeyCounts(loadedSets);
  const visible = active ? applyLibraryFilter(loadedSets, active, { query, keys, sort }) : [];
  const filtering = query.trim() !== "" || keys !== null;
  const total = active ? categoryCount(counts, active) : null;

  if (countsLoading) return <SkeletonCards count={6} columns="sm:grid-cols-2 xl:grid-cols-3" />;
  if (!active) {
    return (
      <EmptyState
        title={isSelf ? t("social.noMapsSelf") : t("social.noMaps")}
        body={t("social.noMapsHint")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={t("social.mapCategories")} className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {categories.map((value) => {
          const count = categoryCount(counts, value) ?? (value === "cascade" ? projects.length : null);
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active === value}
              onClick={() => setCategory(value)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                active === value
                  ? "border-accent/50 bg-accent/15 text-slate-50"
                  : "border-white/10 bg-ink-700/40 text-slate-300 hover:bg-ink-700 hover:text-slate-100"
              }`}
            >
              {t(CATEGORY_LABELS[value])}
              {count !== null && <span className="tabular-nums text-slate-500">{count}</span>}
            </button>
          );
        })}
      </div>

      {active === "cascade" ? (
        <CascadeProjects projects={projects} isSelf={isSelf} onOpenCloudProject={onOpenCloudProject} />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">{t("social.searchMaps")}</span>
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("social.searchMapsPlaceholder")}
                className="w-full rounded-lg border border-white/10 bg-ink-700/65 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-accent/70 focus:ring-1 focus:ring-accent/40"
              />
            </label>
            <div className="flex gap-2">
              <Dropdown<string>
                size="sm"
                className="w-28"
                aria-label={t("social.keyFilter")}
                value={keys === null ? "any" : String(keys)}
                onChange={(value) => setKeys(value === "any" ? null : Number(value))}
                options={[
                  { value: "any", label: t("social.anyKeys") },
                  ...keyOptions.map((k) => ({ value: String(k), label: `${k}K` })),
                ]}
              />
              <Dropdown<LibrarySort>
                size="sm"
                className="w-36"
                aria-label={t("social.sortMaps")}
                value={sort}
                onChange={setSort}
                options={[
                  { value: "newest", label: t("social.sortNewest") },
                  { value: "oldest", label: t("social.sortOldest") },
                  { value: "difficulty", label: t("social.sortDifficulty") },
                  { value: "popularity", label: t("social.sortPopularity") },
                ]}
              />
            </div>
          </div>

          {sourceError && loadedSets.length === 0 ? (
            <ErrorLine message={sourceError} onRetry={() => types.forEach((type) => loadSource(type, true))} />
          ) : loading && loadedSets.length === 0 ? (
            <SkeletonCards count={6} columns="sm:grid-cols-2 xl:grid-cols-3" />
          ) : visible.length === 0 ? (
            <EmptyState
              title={filtering ? t("social.noMatchingMaps") : t("social.noMapsInCategory")}
              body={filtering && hasMore ? t("social.searchLoadedOnly") : undefined}
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((set) => (
                <li key={set.id}>
                  <BeatmapsetCard
                    set={set}
                    owner={osuId}
                    cascadeSeconds={mapTimes.get(set.id) ?? null}
                    onOpenInCascade={onOpenBeatmapset}
                  />
                </li>
              ))}
            </ul>
          )}

          {(hasMore || (filtering && loadedSets.length > 0)) && (
            <div className="flex flex-col items-center gap-1.5 pb-2">
              {filtering && hasMore && visible.length > 0 && (
                <p className="text-xs text-slate-500">{t("social.searchLoadedOnly")}</p>
              )}
              {hasMore && (
                <SmallButton onClick={() => types.forEach((type) => loadSource(type))} disabled={loading}>
                  {loading
                    ? t("common.loading")
                    : total !== null
                      ? t("social.loadMoreOf", { shown: loadedSets.length, total })
                      : t("social.loadMore")}
                </SmallButton>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BeatmapsetCard({
  set,
  owner,
  cascadeSeconds,
  onOpenInCascade,
}: {
  set: OsuBeatmapset;
  owner: number;
  cascadeSeconds: number | null;
  onOpenInCascade?: (setId: number) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useNumberFormat();
  const stars = starRange(set);
  const keys = keyCounts(set);
  const length = formatLength(setLength(set) * 1000);
  const mania = maniaDifficulties(set).length;
  const date = setDate(set);
  const cover = set.covers.card2x ?? set.covers.card ?? set.covers.cover;
  const guest = set.user_id !== owner;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-ink-700/40 transition duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:bg-ink-700/70 hover:shadow-[0_14px_36px_rgba(0,0,0,0.35)] motion-reduce:hover:translate-y-0">
      <div className="relative aspect-[2.86/1] overflow-hidden bg-ink-600">
        {cover && (
          <img
            src={cover}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
          />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-900/90 via-ink-900/25 to-transparent" />
        <span
          className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            STATUS_STYLES[set.status] ?? STATUS_STYLES.pending
          }`}
        >
          {t(STATUS_LABELS[set.status] ?? "social.statusPending")}
        </span>
        {stars && (
          <span
            className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
            style={{ background: starColor(stars.max), color: starTextOn(stars.max) }}
            title={t("social.starRange", { min: stars.min.toFixed(2), max: stars.max.toFixed(2) })}
          >
            ★ {stars.min === stars.max ? stars.max.toFixed(2) : `${stars.min.toFixed(1)}–${stars.max.toFixed(1)}`}
          </span>
        )}
        <div className="absolute inset-x-3 bottom-2 min-w-0">
          <a
            href={beatmapsetUrl(set.id)}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm font-semibold text-white drop-shadow after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            title={set.title}
          >
            {set.title}
          </a>
          <p className="truncate text-xs text-slate-300 drop-shadow">{set.artist}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="truncate text-[11px] text-slate-400">
          {guest ? t("social.guestOn", { name: set.creator }) : t("social.mappedBy", { name: set.creator })}
        </p>
        <div className="flex flex-wrap gap-1">
          {keys.map((k) => (
            <Chip key={k}>{k}K</Chip>
          ))}
          {set.bpm ? <Chip>{Math.round(set.bpm)} BPM</Chip> : null}
          {length && <Chip>{length}</Chip>}
          <Chip title={t("social.difficultyCountHint")}>
            {t("social.difficulties", { count: set.beatmaps.length })}
            {mania > 0 && mania !== set.beatmaps.length ? ` · ${mania} mania` : ""}
          </Chip>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
          <span className="flex min-w-0 items-center gap-2.5 tabular-nums">
            <span title={t("social.playCount")}>▶ {fmt(set.play_count)}</span>
            <span title={t("social.favourites")}>♥ {fmt(set.favourite_count)}</span>
          </span>
          {date > 0 && (
            <span className="truncate" title={new Date(date).toLocaleString(locale)}>
              {set.ranked_date ? t("social.rankedWhen", { when: relativeTime(set.ranked_date, t) }) : t("social.updatedWhen", { when: relativeTime(new Date(date).toISOString(), t) })}
            </span>
          )}
        </div>
        {(cascadeSeconds !== null || onOpenInCascade) && (
          <div className="relative z-[1] flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
            {cascadeSeconds !== null ? (
              <span className="truncate text-[11px] font-medium text-accent-soft" title={t("social.cascadeTimeHint")}>
                {t("social.timeInCascade", { time: formatDuration(cascadeSeconds) })}
              </span>
            ) : (
              <span />
            )}
            {onOpenInCascade && (
              <button
                type="button"
                onClick={() => onOpenInCascade(set.id)}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-slate-100"
              >
                {t("social.openInCascade")}
              </button>
            )}
          </div>
        )}
      </div>
      <ExternalIcon className="pointer-events-none absolute right-2 top-9 hidden h-3.5 w-3.5 text-white/70 group-hover:block" />
    </article>
  );
}

function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[11px] tabular-nums text-slate-300">
      {children}
    </span>
  );
}

function CascadeProjects({
  projects,
  isSelf,
  onOpenCloudProject,
}: {
  projects: MappingProject[];
  isSelf: boolean;
  onOpenCloudProject: (id: string) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">{t("social.cascadeProjectsHint")}</p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => {
          const open =
            isSelf && project.project_id
              ? () => onOpenCloudProject(project.project_id!)
              : project.shared_slug
                ? () => window.open(sharedMapUrl(project.shared_slug!), "_blank", "noopener,noreferrer")
                : null;
          const time = project.edit;
          return (
            <li key={project.project_key}>
              <div className="flex h-full flex-col gap-2 rounded-xl border border-white/[0.07] bg-ink-700/40 p-3.5 transition hover:border-white/15 hover:bg-ink-700/70">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {project.title || t("common.untitled")}
                    </p>
                    {project.artist && <p className="truncate text-xs text-slate-400">{project.artist}</p>}
                  </div>
                  <span className="shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-soft">
                    {project.created_in_cascade ? t("social.createdInCascade") : t("social.editedInCascade")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  {time !== null && (
                    <span>
                      {t("social.mappingTime")}:{" "}
                      <span className="font-medium text-slate-300">{formatDuration(time)}</span>
                    </span>
                  )}
                  <span>{t("social.lastEdited", { when: relativeTime(project.last_active_at, t) })}</span>
                </div>
                {project.difficulties && project.difficulties.length > 0 && (
                  <ul className="flex flex-col gap-1 border-t border-white/[0.06] pt-2">
                    {project.difficulties.slice(0, 4).map((d) => (
                      <li key={d.key} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate text-slate-400">{d.name || t("common.untitled")}</span>
                        <span className="shrink-0 tabular-nums text-slate-300">{formatDuration(d.edit)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {open && (
                  <div className="mt-auto pt-1">
                    <SmallButton onClick={open}>
                      {isSelf && project.project_id ? t("social.openProject") : t("social.viewSharedMap")}
                    </SmallButton>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
