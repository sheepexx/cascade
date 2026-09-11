import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { HoldConfirmDialog } from "../ui/HoldConfirmDialog";
import {
  AsyncImage,
  SkeletonBanners,
  SkeletonCards,
} from "../ui/Skeleton";
import { starColor, starTextOn } from "../../lib/starRating";
import { useAuth } from "../../lib/auth";
import { useLocale, useT } from "../../lib/i18n";
import {
  listMyProjectsRich,
  signedThumbUrls,
  deleteProjectCloud,
  setProjectArchived,
  type CloudProjectRich,
  type ProjectParticipant,
} from "../../lib/cloud";
import {
  listLocalProjects,
  clearProject,
  type LocalProjectSummary,
} from "../../lib/persistence";
import { formatBytes } from "../../lib/progress";
import {
  BROWSE_SORTS,
  browse,
  type BrowseEntry,
  type BrowseSort,
} from "../../lib/projectSearch";
import { siteAsset, siteUrl } from "../../lib/siteAssets";
import { MENU_ACCENTS } from "../../lib/menuTheme";
import {
  ArchiveIcon,
  NewMapIcon,
  PackCreatorIcon,
  SampleMapsIcon,
  SmPackIcon,
  TrashIcon,
} from "../ui/StartIcons";

export type SampleDifficulty = {
  name: string;
  keyCount: number;
  stars: number;
};

export type SampleMap = {
  id: string;
  title: string;
  artist: string;
  creator: string;
  osz: string;
  banner: string | null;
  difficulties: SampleDifficulty[];
};

const asset = siteAsset;

type CloudBrowseRow = CloudProjectRich & BrowseEntry;

function cloudEntry(row: CloudProjectRich): CloudBrowseRow {
  return {
    ...row,
    updatedAt: Date.parse(row.updated_at) || 0,
    tags: row.tags ?? null,
    difficulties: row.difficulties ?? null,
  };
}

const MAX_CARDS = 9;
const PAGE_SIZE = 9;
const CARD_COUNT_KEY = "mania:card-counts";

type BrowseScope = "local" | "cloud" | "invited" | "archived";

const EMPTY_PAGES: Record<BrowseScope, number> = {
  local: PAGE_SIZE,
  cloud: PAGE_SIZE,
  invited: PAGE_SIZE,
  archived: PAGE_SIZE,
};
const DEFAULT_SKELETON_CARDS = 3;

type CardCounts = { local: number; cloud: number };

function clampCardCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return DEFAULT_SKELETON_CARDS;
  return Math.min(MAX_CARDS, Math.round(value));
}

function readCardCounts(): CardCounts {
  const fallback = {
    local: DEFAULT_SKELETON_CARDS,
    cloud: DEFAULT_SKELETON_CARDS,
  };
  try {
    const raw = localStorage.getItem(CARD_COUNT_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<CardCounts>;
    return {
      local: clampCardCount(parsed.local),
      cloud: clampCardCount(parsed.cloud),
    };
  } catch {
    return fallback;
  }
}

function rememberCardCounts(counts: Partial<CardCounts>) {
  try {
    const raw = localStorage.getItem(CARD_COUNT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<CardCounts>) : {};
    localStorage.setItem(
      CARD_COUNT_KEY,
      JSON.stringify({ ...parsed, ...counts }),
    );
  } catch {
    return;
  }
}

export function WelcomeModal({
  open,
  onClose,
  onNewMap,
  onTryMaps,
  onImportSmPack,
  onPackCreator,
  onOpenCloudProject,
  onOpenLocalProject,
  accountsEnabled = true,
  onImportFromOsu,
  projectsOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  onNewMap: () => void;
  onTryMaps: () => void;
  onImportSmPack?: () => void;
  onPackCreator?: () => void;
  onOpenCloudProject: (id: string) => void;
  onOpenLocalProject: (id: string) => void;
  /** Feature flag: hides the osu! login prompt when accounts are killed. */
  accountsEnabled?: boolean;
  /** Present when beatmap import is enabled and a worker is configured. */
  onImportFromOsu?: (input: string) => Promise<void>;
  /** Drops the action cards so the modal is purely a project browser. */
  projectsOnly?: boolean;
}) {
  const { user, login } = useAuth();
  const { locale, t } = useLocale();
  const [osuLink, setOsuLink] = useState("");
  const [osuImporting, setOsuImporting] = useState(false);
  const [osuImportError, setOsuImportError] = useState<string | null>(null);

  const runOsuImport = async () => {
    if (!onImportFromOsu || osuImporting || !osuLink.trim()) return;
    setOsuImporting(true);
    setOsuImportError(null);
    try {
      await onImportFromOsu(osuLink);
      setOsuLink("");
    } catch (e) {
      setOsuImportError(
        e instanceof Error ? e.message : "Import failed - try again.",
      );
    } finally {
      setOsuImporting(false);
    }
  };
  const [projects, setProjects] = useState<CloudProjectRich[] | null>(null);
  const [localProjects, setLocalProjects] = useState<
    LocalProjectSummary[] | null
  >(null);
  const [cloudThumbs, setCloudThumbs] = useState<Record<string, string>>({});
  const [localThumbs, setLocalThumbs] = useState<Record<string, string>>({});
  const [cardCounts, setCardCounts] = useState<CardCounts>(readCardCounts);
  const [error, setError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<BrowseSort>("date");
  const [pages, setPages] = useState<Record<BrowseScope, number>>(EMPTY_PAGES);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{
    scope: "local" | "cloud";
    ids: string[];
  } | null>(null);
  const [firstRun, setFirstRun] = useState(false);

  useEffect(() => {
    if (!open) return;
    try {
      if (!localStorage.getItem("mania:onboarded")) {
        setFirstRun(true);
        localStorage.setItem("mania:onboarded", "1");
      }
    } catch {
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setSelectMode(false);
      setConfirm(null);
      setShowArchived(false);
      return;
    }
    let cancelled = false;
    setLocalError(null);
    listLocalProjects()
      .then((rows) => {
        if (!cancelled) setLocalProjects(rows);
      })
      .catch((e) => {
        if (!cancelled)
          setLocalError(
            e instanceof Error ? e.message : "Couldn't load local projects.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!localProjects) return;
    const made: Record<string, string> = {};
    for (const p of localProjects) {
      if (p.backgroundBlob) made[p.id] = URL.createObjectURL(p.backgroundBlob);
    }
    setLocalThumbs(made);
    return () => {
      Object.values(made).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [localProjects]);

  useEffect(() => {
    if (!open || !user) {
      setProjects(null);
      setCloudThumbs({});
      return;
    }
    let cancelled = false;
    setError(null);
    listMyProjectsRich()
      .then(async (rows) => {
        if (cancelled) return;
        setProjects(rows);
        const paths = rows
          .map((r) => r.bg_path)
          .filter((p): p is string => !!p);
        try {
          const urls = await signedThumbUrls(paths);
          if (!cancelled) setCloudThumbs(urls);
        } catch {
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't load your maps.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const owned = user
    ? browse(
        (projects ?? []).filter((p) => p.owner === user.id).map(cloudEntry),
        query,
        sort,
      )
    : [];
  const ownedCount = owned.length;
  const shared = user
    ? browse(
        (projects ?? []).filter((p) => p.owner !== user.id).map(cloudEntry),
        query,
        sort,
      )
    : [];
  const invited = shared.filter((p) => !p.archived);
  const archivedShared = shared.filter((p) => p.archived);
  const sortedLocal = browse(localProjects ?? [], query, sort);

  useEffect(() => {
    setPages(EMPTY_PAGES);
  }, [query, sort, open]);

  useEffect(() => {
    if (!localProjects) return;
    const local = Math.min(MAX_CARDS, localProjects.length);
    setCardCounts((prev) => (prev.local === local ? prev : { ...prev, local }));
    rememberCardCounts({ local });
  }, [localProjects]);

  useEffect(() => {
    if (!projects) return;
    const cloud = Math.min(MAX_CARDS, ownedCount);
    setCardCounts((prev) => (prev.cloud === cloud ? prev : { ...prev, cloud }));
    rememberCardCounts({ cloud });
  }, [projects, ownedCount]);

  const visibleLocal = sortedLocal.slice(0, pages.local);
  const visibleCloud = owned.slice(0, pages.cloud);
  const visibleInvited = invited.slice(0, pages.invited);
  const visibleArchived = archivedShared.slice(0, pages.archived);
  const loadMore = (scope: BrowseScope) =>
    setPages((prev) => ({ ...prev, [scope]: prev[scope] + PAGE_SIZE }));
  const localBytes = (localProjects ?? []).reduce(
    (sum, p) => sum + p.sizeBytes,
    0,
  );

  const keyOf = (scope: "local" | "cloud", id: string) => `${scope}:${id}`;

  const toggleSelect = (scope: "local" | "cloud", id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyOf(scope, id);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const toggleSelectAll = (scope: "local" | "cloud", ids: string[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const all = ids.every((id) => next.has(keyOf(scope, id)));
      for (const id of ids) {
        if (all) next.delete(keyOf(scope, id));
        else next.add(keyOf(scope, id));
      }
      return next;
    });

  const idsForScope = (scope: "local" | "cloud") =>
    [...selected]
      .filter((k) => k.startsWith(`${scope}:`))
      .map((k) => k.slice(scope.length + 1));

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const selectControls = (scope: "local" | "cloud", ids: string[]) => {
    const inScope = idsForScope(scope);
    return (
      <SelectControls
        active={selectMode}
        disabled={busyId !== null}
        allSelected={ids.length > 0 && ids.every((id) => selected.has(keyOf(scope, id)))}
        selectedCount={inScope.length}
        onEnter={() => setSelectMode(true)}
        onExit={exitSelectMode}
        onToggleAll={() => toggleSelectAll(scope, ids)}
        onDelete={() => setConfirm({ scope, ids: inScope })}
      />
    );
  };

  const deleteTargets = (scope: "local" | "cloud", id: string) => {
    const inScope = idsForScope(scope);
    return inScope.includes(id) && inScope.length > 1 ? inScope : [id];
  };

  const deleteProjects = async (scope: "local" | "cloud", ids: string[]) => {
    setError(null);
    for (const id of ids) {
      setBusyId(id);
      try {
        if (scope === "local") {
          await clearProject(id);
          setLocalProjects((prev) => prev?.filter((p) => p.id !== id) ?? null);
        } else {
          await deleteProjectCloud(id);
          setProjects((prev) => prev?.filter((p) => p.id !== id) ?? null);
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Couldn't delete that project.",
        );
      }
    }
    setBusyId(null);
    setSelected(new Set());
  };

  const archive = (id: string, archived: boolean) =>
    void (async () => {
      setBusyId(id);
      setError(null);
      try {
        await setProjectArchived(id, archived);
        setProjects(
          (prev) =>
            prev?.map((p) => (p.id === id ? { ...p, archived } : p)) ?? null,
        );
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Couldn't update that project.",
        );
      } finally {
        setBusyId(null);
      }
    })();

  return (
    <>
      <Modal
        open={open}
        title={projectsOnly ? t("startModal.myMaps") : t("startModal.title")}
        onClose={onClose}
        accent={projectsOnly ? MENU_ACCENTS.myMaps : MENU_ACCENTS.newMap}
        width="max-w-3xl"
        slideUp={projectsOnly}
      >
      {firstRun && !projectsOnly && (
        <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 p-4">
          <p className="text-sm font-semibold text-slate-100">
            {t("startModal.welcome")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            {t("startModal.welcomeBody")}
          </p>
          <div className="mt-3">
            <Button variant="accent" onClick={onTryMaps}>
              {t("startModal.trySample")}
            </Button>
          </div>
        </div>
      )}
      <div className={`grid gap-3 sm:grid-cols-2 ${projectsOnly ? "hidden" : ""}`}>
        <button
          type="button"
          onClick={onNewMap}
          className="group flex flex-col items-start gap-2 rounded-xl border border-ink-500/60 bg-ink-700/40 p-5 text-left transition hover:border-accent/70 hover:bg-ink-700"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-600 text-slate-200 transition group-hover:bg-accent/20 group-hover:text-accent">
            <NewMapIcon className="h-6 w-6" />
          </span>
          <span className="text-sm font-semibold text-slate-100">
            {t("startModal.newMap")}
          </span>
          <span className="text-xs text-slate-400">
            {t("startModal.newMapDesc")}
          </span>
        </button>
        <button
          type="button"
          onClick={onTryMaps}
          className="group flex flex-col items-start gap-2 rounded-xl border border-ink-500/60 bg-ink-700/40 p-5 text-left transition hover:border-accent/70 hover:bg-ink-700"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-600 text-slate-200 transition group-hover:bg-accent/20 group-hover:text-accent">
            <SampleMapsIcon className="h-6 w-6" />
          </span>
          <span className="text-sm font-semibold text-slate-100">
            {t("startModal.tryMaps")}
          </span>
          <span className="text-xs text-slate-400">
            {t("startModal.tryMapsDesc")}
          </span>
        </button>
        {onImportSmPack && (
          <button
            type="button"
            onClick={onImportSmPack}
            className="group flex flex-col items-start gap-2 rounded-xl border border-ink-500/60 bg-ink-700/40 p-5 text-left transition hover:border-accent/70 hover:bg-ink-700"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-600 text-slate-200 transition group-hover:bg-accent/20 group-hover:text-accent">
              <SmPackIcon className="h-6 w-6" />
            </span>
            <span className="text-sm font-semibold text-slate-100">
              {t("startModal.importSmPack")}
            </span>
            <span className="text-xs text-slate-400">
              {t("startModal.importSmPackDesc")}
            </span>
          </button>
        )}
        {onPackCreator && (
          <button
            type="button"
            onClick={onPackCreator}
            className="group flex flex-col items-start gap-2 rounded-xl border border-ink-500/60 bg-ink-700/40 p-5 text-left transition hover:border-accent/70 hover:bg-ink-700"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-600 text-slate-200 transition group-hover:bg-accent/20 group-hover:text-accent">
              <PackCreatorIcon className="h-6 w-6" />
            </span>
            <span className="text-sm font-semibold text-slate-100">
              {t("startModal.packCreator")}
            </span>
            <span className="text-xs text-slate-400">
              {t("startModal.packCreatorDesc")}
            </span>
          </button>
        )}
      </div>

      {onImportFromOsu && !projectsOnly && (
        <div className="mt-3 rounded-xl border border-ink-500/60 bg-ink-700/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={osuLink}
              onChange={(e) => {
                setOsuLink(e.target.value);
                setOsuImportError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runOsuImport();
              }}
              placeholder={t("startModal.osuLinkPlaceholder")}
              disabled={osuImporting}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-accent/70 focus:ring-1 focus:ring-accent/40 disabled:opacity-50"
            />
            <Button
              variant="accent"
              disabled={osuImporting || !osuLink.trim()}
              onClick={() => void runOsuImport()}
              className="whitespace-nowrap"
            >
              {osuImporting
                ? t("startModal.downloading")
                : t("startModal.importFromOsu")}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {t("startModal.osuImportHint")}
          </p>
          {osuImportError && (
            <p className="mt-1 text-xs text-rose-400">{osuImportError}</p>
          )}
        </div>
      )}

      {!projectsOnly && (
        <a
          href="https://discord.gg/aY2UckUxYd"
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-ink-500/60 bg-ink-700/40 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-[#5865F2]/70 hover:bg-ink-700 hover:text-white"
        >
          <DiscordIcon className="h-5 w-5 text-[#5865F2]" />
          {t("startModal.joinDiscord")}
        </a>
      )}

      {!user && accountsEnabled && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-700/30 px-4 py-3">
          <span className="text-sm text-slate-400">
            {t("startModal.loginPrompt")}{" "}
            <a
              href={siteUrl("terms")}
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap text-slate-500 underline decoration-ink-500 underline-offset-2 transition hover:text-slate-300"
            >
              {t("settings.terms")}
            </a>{" "}
            <a
              href={siteUrl("privacy")}
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap text-slate-500 underline decoration-ink-500 underline-offset-2 transition hover:text-slate-300"
            >
              {t("startModal.privacyPolicy")}
            </a>
          </span>
          <Button variant="accent" onClick={login} className="whitespace-nowrap">
            {t("startModal.loginWithOsu")}
          </Button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}
      {localError && <p className="mt-4 text-sm text-rose-400">{localError}</p>}

      <BrowseToolbar
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
      />

      <Section
        title={t("startModal.localProjects")}
        hint={
          localBytes > 0
            ? t("startModal.localProjectsUsage", {
                size: formatBytes(localBytes),
              })
            : t("startModal.localProjectsHint")
        }
        count={localProjects === null ? undefined : sortedLocal.length}
        actions={
          visibleLocal.length > 0
            ? selectControls(
                "local",
                visibleLocal.map((p) => p.id),
              )
            : undefined
        }
      >
        {localProjects === null ? (
          <SkeletonCards count={cardCounts.local} label={t("common.loading")} />
        ) : sortedLocal.length === 0 ? (
          <SectionMessage>
            {localProjects.length === 0
              ? t("startModal.noLocalSaves")
              : t("startModal.noSearchMatches")}
          </SectionMessage>
        ) : (
          <CardGrid>
            {visibleLocal.map((p) => (
              <ProjectCard
                key={p.id}
                title={p.title || t("common.untitled")}
                subtitle={subtitleOf(p.artist, p.creator)}
                note={t("startModal.projectNote", {
                  count: p.difficultyCount,
                  date: new Date(p.updatedAt).toLocaleDateString(locale),
                })}
                sourceFormat={p.sourceFormat}
                thumbUrl={localThumbs[p.id]}
                thumbPending={!!p.backgroundBlob && !localThumbs[p.id]}
                selected={selected.has(keyOf("local", p.id))}
                onOpen={(additive) =>
                  additive || selectMode
                    ? toggleSelect("local", p.id)
                    : onOpenLocalProject(p.id)
                }
                actions={
                  selectMode ? (
                    <SelectCheck checked={selected.has(keyOf("local", p.id))} />
                  ) : (
                    <DeleteAction
                      count={
                        selected.has(keyOf("local", p.id))
                          ? deleteTargets("local", p.id).length
                          : 1
                      }
                      busy={busyId === p.id}
                      disabled={busyId !== null}
                      onClick={() =>
                        setConfirm({
                          scope: "local",
                          ids: deleteTargets("local", p.id),
                        })
                      }
                    />
                  )
                }
              />
            ))}
          </CardGrid>
        )}
        <LoadMore
          shown={visibleLocal.length}
          total={sortedLocal.length}
          onClick={() => loadMore("local")}
        />
      </Section>

      {user && (
        <Section
          title={t("startModal.cloudProjects")}
          hint={t("startModal.cloudProjectsHint")}
          count={projects === null ? undefined : owned.length}
          actions={
            visibleCloud.length > 0
              ? selectControls(
                  "cloud",
                  visibleCloud.map((p) => p.id),
                )
              : undefined
          }
        >
          {projects === null ? (
            <SkeletonCards count={cardCounts.cloud} label={t("common.loading")} />
          ) : owned.length === 0 ? (
            <SectionMessage>
              {query.trim()
                ? t("startModal.noSearchMatches")
                : t("startModal.noCloudSaves")}
            </SectionMessage>
          ) : (
            <CardGrid>
              {visibleCloud.map((p) => (
                <ProjectCard
                  key={p.id}
                  title={p.title || t("common.untitled")}
                  subtitle={subtitleOf(p.artist, p.creator)}
                  note={t("startModal.savedOn", {
                    date: new Date(p.updated_at).toLocaleDateString(locale),
                  })}
                  thumbUrl={p.bg_path ? cloudThumbs[p.bg_path] : undefined}
                  thumbPending={!!p.bg_path && !cloudThumbs[p.bg_path]}
                  participants={othersOf(p.participants, user.id)}
                  selected={selected.has(keyOf("cloud", p.id))}
                  onOpen={(additive) =>
                    additive || selectMode
                      ? toggleSelect("cloud", p.id)
                      : onOpenCloudProject(p.id)
                  }
                  actions={
                    selectMode ? (
                      <SelectCheck
                        checked={selected.has(keyOf("cloud", p.id))}
                      />
                    ) : (
                      <DeleteAction
                        count={
                          selected.has(keyOf("cloud", p.id))
                            ? deleteTargets("cloud", p.id).length
                            : 1
                        }
                        busy={busyId === p.id}
                        disabled={busyId !== null}
                        onClick={() =>
                          setConfirm({
                            scope: "cloud",
                            ids: deleteTargets("cloud", p.id),
                          })
                        }
                      />
                    )
                  }
                />
              ))}
            </CardGrid>
          )}
          <LoadMore
            shown={visibleCloud.length}
            total={owned.length}
            onClick={() => loadMore("cloud")}
          />
        </Section>
      )}

      {user && invited.length > 0 && (
        <Section
          title={t("startModal.invitations")}
          hint={t("startModal.invitationsHint")}
          count={invited.length}
        >
          <CardGrid>
            {visibleInvited.map((p) => {
              const ownerName = p.participants.find(
                (x) => x.role === "owner",
              )?.username;
              return (
                <ProjectCard
                  key={p.id}
                  badge={t("startModal.badgeInvited")}
                  title={p.title || t("common.untitled")}
                  subtitle={subtitleOf(p.artist, p.creator)}
                  note={
                    ownerName
                      ? t("startModal.sharedBy", { name: ownerName })
                      : undefined
                  }
                  thumbUrl={p.bg_path ? cloudThumbs[p.bg_path] : undefined}
                  thumbPending={!!p.bg_path && !cloudThumbs[p.bg_path]}
                  participants={othersOf(p.participants, user.id)}
                  onOpen={() => onOpenCloudProject(p.id)}
                  actions={
                    <CardActionButton
                      label={t("startModal.archive")}
                      icon={<ArchiveIcon className="h-3.5 w-3.5" />}
                      busy={busyId === p.id}
                      onClick={() => archive(p.id, true)}
                    />
                  }
                />
              );
            })}
          </CardGrid>
          <LoadMore
            shown={visibleInvited.length}
            total={invited.length}
            onClick={() => loadMore("invited")}
          />
        </Section>
      )}

      {user && archivedShared.length > 0 && (
        <section className="mt-6">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mb-3 flex w-full items-baseline gap-2 border-b border-white/10 pb-1.5 text-left"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              {t("startModal.archived")}
            </span>
            <span className="grid min-w-[1.25rem] place-items-center rounded-full bg-ink-600 px-1.5 text-[10px] font-semibold text-slate-300">
              {archivedShared.length}
            </span>
            <span className="ml-auto text-[11px] text-slate-500">
              {showArchived ? t("startModal.hide") : t("startModal.show")}
            </span>
          </button>
          {showArchived && (
            <CardGrid>
              {visibleArchived.map((p) => (
                <ProjectCard
                  key={p.id}
                  badge={t("startModal.archived")}
                  title={p.title || t("common.untitled")}
                  subtitle={subtitleOf(p.artist, p.creator)}
                  thumbUrl={p.bg_path ? cloudThumbs[p.bg_path] : undefined}
                  thumbPending={!!p.bg_path && !cloudThumbs[p.bg_path]}
                  participants={othersOf(p.participants, user.id)}
                  onOpen={() => onOpenCloudProject(p.id)}
                  actions={
                    <CardActionButton
                      label={t("startModal.unarchive")}
                      icon="↩"
                      busy={busyId === p.id}
                      onClick={() => archive(p.id, false)}
                    />
                  }
                />
              ))}
            </CardGrid>
          )}
          {showArchived && (
            <LoadMore
              shown={visibleArchived.length}
              total={archivedShared.length}
              onClick={() => loadMore("archived")}
            />
          )}
        </section>
      )}
      </Modal>

      <HoldConfirmDialog
        open={confirm !== null}
        title={
          confirm && confirm.ids.length > 1
            ? t("startModal.deleteProjectsTitle")
            : t("startModal.deleteProjectTitle")
        }
        message={
          confirm
            ? t("startModal.deleteCount", { count: confirm.ids.length }) +
              " " +
              (confirm.scope === "local"
                ? t("startModal.deleteLocalNote", {
                    count: confirm.ids.length,
                  })
                : t("startModal.deleteCloudNote"))
            : ""
        }
        onConfirm={() => {
          if (confirm) void deleteProjects(confirm.scope, confirm.ids);
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M18.59 5.88997C17.36 5.31997 16.05 4.89997 14.67 4.65997C14.5 4.95997 14.3 5.36997 14.17 5.69997C12.71 5.47997 11.26 5.47997 9.83001 5.69997C9.69001 5.36997 9.49001 4.95997 9.32001 4.65997C7.94001 4.89997 6.63001 5.31997 5.40001 5.88997C2.92001 9.62997 2.25001 13.28 2.58001 16.87C4.23001 18.1 5.82001 18.84 7.39001 19.33C7.78001 18.8 8.12001 18.23 8.42001 17.64C7.85001 17.43 7.31001 17.16 6.80001 16.85C6.94001 16.75 7.07001 16.64 7.20001 16.54C10.33 18 13.72 18 16.81 16.54C16.94 16.65 17.07 16.75 17.21 16.85C16.7 17.16 16.15 17.42 15.59 17.64C15.89 18.23 16.23 18.8 16.62 19.33C18.19 18.84 19.79 18.1 21.43 16.87C21.82 12.7 20.76 9.08997 18.61 5.88997H18.59ZM8.84001 14.67C7.90001 14.67 7.13001 13.8 7.13001 12.73C7.13001 11.66 7.88001 10.79 8.84001 10.79C9.80001 10.79 10.56 11.66 10.55 12.73C10.55 13.79 9.80001 14.67 8.84001 14.67ZM15.15 14.67C14.21 14.67 13.44 13.8 13.44 12.73C13.44 11.66 14.19 10.79 15.15 10.79C16.11 10.79 16.87 11.66 16.86 12.73C16.86 13.79 16.11 14.67 15.15 14.67Z" />
    </svg>
  );
}

function subtitleOf(artist: string, creator: string): string {
  return [artist, creator].filter(Boolean).join(" · ");
}

function othersOf(
  participants: ProjectParticipant[],
  selfId: string,
): ProjectParticipant[] {
  return participants.filter((p) => p.user_id !== selfId);
}

function BrowseToolbar({
  query,
  onQuery,
  sort,
  onSort,
}: {
  query: string;
  onQuery: (value: string) => void;
  sort: BrowseSort;
  onSort: (value: BrowseSort) => void;
}) {
  const { t } = useLocale();
  const labels: Record<BrowseSort, string> = {
    date: t("startModal.sortDate"),
    name: t("startModal.sortName"),
    difficulty: t("startModal.sortDifficulty"),
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[12rem] flex-1">
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("startModal.searchPlaceholder")}
          aria-label={t("startModal.searchLabel")}
          className="w-full rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-accent/70 focus:ring-1 focus:ring-accent/40"
        />
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-ink-700/45 p-1">
        {BROWSE_SORTS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSort(option)}
            aria-pressed={sort === option}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              sort === option
                ? "bg-accent/85 text-white"
                : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
            }`}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

function LoadMore({
  shown,
  total,
  onClick,
}: {
  shown: number;
  total: number;
  onClick: () => void;
}) {
  const { t } = useLocale();
  if (shown >= total) return null;
  return (
    <div className="mt-3 flex justify-center">
      <SectionButton onClick={onClick}>
        {t("startModal.loadMore", { count: total - shown })}
      </SectionButton>
    </div>
  );
}

function Section({
  title,
  hint,
  count,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  count?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/10 pb-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          {title}
        </h3>
        {count != null && (
          <span className="grid min-w-[1.25rem] place-items-center rounded-full bg-ink-600 px-1.5 text-[10px] font-semibold text-slate-300">
            {count}
          </span>
        )}
        {hint && (
          <span className="ml-auto text-[11px] text-slate-500">{hint}</span>
        )}
        {actions && (
          <div className={`flex items-center gap-1 ${hint ? "" : "ml-auto"}`}>
            {actions}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function SectionButton({
  onClick,
  danger,
  disabled,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "border-rose-500/50 bg-rose-600/20 text-rose-300 hover:bg-rose-600/40 hover:text-white"
          : "border-white/10 bg-ink-600/60 text-slate-300 hover:bg-ink-500/70 hover:text-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function SelectControls({
  active,
  allSelected,
  selectedCount,
  disabled,
  onEnter,
  onExit,
  onToggleAll,
  onDelete,
}: {
  active: boolean;
  allSelected: boolean;
  selectedCount: number;
  disabled?: boolean;
  onEnter: () => void;
  onExit: () => void;
  onToggleAll: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  if (!active)
    return (
      <SectionButton onClick={onEnter}>{t("startModal.select")}</SectionButton>
    );
  return (
    <>
      <SectionButton onClick={onToggleAll} disabled={disabled}>
        {allSelected ? t("startModal.deselectAll") : t("startModal.selectAll")}
      </SectionButton>
      {selectedCount > 0 && (
        <SectionButton danger onClick={onDelete} disabled={disabled}>
          {t("startModal.deleteSelected", { count: selectedCount })}
        </SectionButton>
      )}
      <SectionButton onClick={onExit} disabled={disabled}>
        {t("common.done")}
      </SectionButton>
    </>
  );
}

function SelectCheck({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none grid h-7 w-7 place-items-center rounded-lg border text-sm shadow backdrop-blur transition ${
        checked
          ? "border-sky-300/80 bg-sky-500/90 text-white"
          : "border-white/25 bg-ink-900/70 text-transparent"
      }`}
    >
      <CheckIcon className="h-4 w-4" />
    </span>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M5 12.5L10 17.5L19 7"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function SectionMessage({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="skeleton-swap-in grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

function ProjectCard({
  title,
  subtitle,
  note,
  thumbUrl,
  thumbPending,
  badge,
  sourceFormat,
  participants,
  actions,
  selected,
  onOpen,
}: {
  title: string;
  subtitle?: string;
  note?: string;
  thumbUrl?: string;
  thumbPending?: boolean;
  badge?: string;
  sourceFormat?: "osu" | "sm" | "qua";
  participants?: ProjectParticipant[];
  actions?: React.ReactNode;
  selected?: boolean;
  onOpen: (additive: boolean) => void;
}) {
  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-ink-700/40 transition hover:bg-ink-700 ${
        selected
          ? "border-sky-400/80 ring-2 ring-sky-400/60"
          : "border-ink-500/60 hover:border-accent/70"
      }`}
    >
      <button
        type="button"
        onClick={(e) => onOpen(e.ctrlKey || e.metaKey)}
        className="flex flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-ink-600">
          <AsyncImage
            src={thumbUrl}
            pending={thumbPending}
            className="h-full w-full object-cover"
            fallback={
              <div className="grid h-full w-full place-items-center text-slate-600">
                <SampleMapsIcon className="h-8 w-8" />
              </div>
            }
          />
          {sourceFormat === "qua" ? (
            <span className="absolute left-2 top-2 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow">
              qua
            </span>
          ) : sourceFormat ? (
            <img
              src={asset(`${sourceFormat === "sm" ? "etterna-logo" : "osu-logo"}.png`)}
              alt={sourceFormat === "sm" ? "Etterna Map" : "osu! Map"}
              className="absolute left-2 top-2 h-5 w-5 object-contain drop-shadow-md opacity-90"
            />
          ) : null}
          {badge && (
            <span className={`absolute ${sourceFormat ? "left-8" : "left-2"} top-2 rounded-md bg-accent/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow`}>
              {badge}
            </span>
          )}
          {participants && participants.length > 0 && (
            <div className="absolute bottom-2 right-2">
              <AvatarStack participants={participants} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-0.5 p-3">
          <div className="truncate text-sm font-semibold text-slate-100">
            {title}
          </div>
          {subtitle && (
            <div className="truncate text-xs text-slate-400">{subtitle}</div>
          )}
          {note && (
            <div className="truncate text-[11px] text-slate-500">{note}</div>
          )}
        </div>
      </button>
      {actions && (
        <div className="absolute right-2 top-2 z-10 flex gap-1">{actions}</div>
      )}
    </div>
  );
}

function CardActionButton({
  label,
  icon,
  danger,
  busy,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={busy}
      data-no-uisound=""
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`grid h-7 w-7 place-items-center rounded-lg bg-ink-900/75 text-sm text-slate-200 shadow backdrop-blur transition disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "hover:bg-rose-600/85 hover:text-white"
          : "hover:bg-accent/85 hover:text-white"
      }`}
    >
      {busy ? "…" : icon}
    </button>
  );
}

function AvatarStack({
  participants,
  max = 4,
}: {
  participants: ProjectParticipant[];
  max?: number;
}) {
  const shown = participants.slice(0, max);
  const extra = participants.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.user_id} participant={p} />
      ))}
      {extra > 0 && (
        <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-ink-800 bg-ink-600 text-[9px] font-semibold text-slate-200 shadow">
          +{extra}
        </span>
      )}
    </div>
  );
}

function Avatar({ participant }: { participant: ProjectParticipant }) {
  const name = participant.username ?? "?";
  const title =
    participant.role === "owner" ? `${name} (owner)` : name;
  return participant.avatar_url ? (
    <img
      src={participant.avatar_url}
      alt={name}
      title={title}
      className="h-6 w-6 rounded-full border-2 border-ink-800 object-cover shadow"
    />
  ) : (
    <span
      title={title}
      className="grid h-6 w-6 place-items-center rounded-full border-2 border-ink-800 bg-ink-500 text-[9px] font-semibold text-slate-100 shadow"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function DeleteAction({
  count,
  busy,
  disabled,
  onClick,
}: {
  count: number;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={count > 1 ? `Delete ${count} projects` : "Delete"}
      aria-label={count > 1 ? `Delete ${count} projects` : "Delete"}
      disabled={disabled}
      data-no-uisound=""
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="grid h-7 w-7 place-items-center rounded-lg bg-ink-900/75 text-sm text-slate-200 shadow backdrop-blur transition hover:bg-rose-600/85 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? (
        "…"
      ) : count > 1 ? (
        <span className="text-[11px] font-semibold tabular-nums">{count}</span>
      ) : (
        <TrashIcon className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

export function SampleMapsModal({
  open,
  onClose,
  onBack,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onBack: () => void;
  onSelect: (map: SampleMap) => void;
}) {
  const [maps, setMaps] = useState<SampleMap[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  useEffect(() => {
    if (!open || maps) return;
    let cancelled = false;
    fetch(asset("maps/manifest.json"))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: SampleMap[]) => {
        if (!cancelled) setMaps(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "");
      });
    return () => {
      cancelled = true;
    };
  }, [open, maps]);

  return (
    <Modal
      open={open}
      title={t("sampleMaps.title")}
      onClose={onClose}
      accent={MENU_ACCENTS.sampleMaps}
      width="max-w-3xl"
      footer={
        <Button variant="ghost" onClick={onBack}>
          {t("common.back")}
        </Button>
      }
    >
      {error !== null && (
        <p className="text-sm text-rose-400">
          {error
            ? t("sampleMaps.loadError", { error })
            : t("sampleMaps.loadFailed")}
        </p>
      )}
      {!maps && error === null && (
        <SkeletonBanners count={4} label={t("sampleMaps.loading")} />
      )}
      {maps && (
        <div className="skeleton-swap-in grid gap-3 sm:grid-cols-2">
          {maps.map((map) => {
            const stars = map.difficulties.map((d) => d.stars);
            const maxStars = stars.length ? Math.max(...stars) : 0;
            return (
              <button
                key={map.id}
                type="button"
                onClick={() => onSelect(map)}
                className="group flex flex-col overflow-hidden rounded-xl border border-ink-500/60 bg-ink-700/40 text-left transition hover:border-accent/70 hover:bg-ink-700"
              >
                <div className="relative aspect-[3.5/1] w-full overflow-hidden bg-ink-600">
                  <AsyncImage
                    src={map.banner ? asset(map.banner) : undefined}
                    className="h-full w-full object-cover"
                    fallback={
                      <div className="grid h-full w-full place-items-center text-slate-500">
                        <SampleMapsIcon className="h-7 w-7" />
                      </div>
                    }
                  />
                  <img
                    src={asset(`${map.osz.endsWith(".sm") || map.osz.endsWith(".zip") ? "etterna-logo" : "osu-logo"}.png`)}
                    alt={map.osz.endsWith(".sm") || map.osz.endsWith(".zip") ? t("sampleMaps.etternaMap") : t("sampleMaps.osuMap")}
                    className="absolute left-2 top-2 h-5 w-5 object-contain drop-shadow-md opacity-90"
                  />
                  <span
                    className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold shadow"
                    style={{
                      backgroundColor: starColor(maxStars),
                      color: starTextOn(maxStars),
                    }}
                  >
                    ★ {maxStars.toFixed(2)}
                  </span>
                </div>
                <div className="flex flex-col gap-2 p-3">
                  <div>
                    <div className="truncate text-sm font-semibold text-slate-100">
                      {map.title}
                    </div>
                    <div className="truncate text-xs text-slate-400">
                      {map.artist}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">
                      {t("sampleMaps.mappedBy", { name: map.creator })}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {map.difficulties.map((d, i) => (
                      <span
                        key={i}
                        title={`${d.name} · ${d.keyCount}K · ${d.stars.toFixed(2)}★`}
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: starColor(d.stars),
                          color: starTextOn(d.stars),
                        }}
                      >
                        {d.keyCount}K {d.stars.toFixed(1)}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
