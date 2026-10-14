import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button, INPUT_CLASS } from "../ui/Controls";
import { buttonClass } from "../ui/buttonStyles";
import { HoldConfirmDialog } from "../ui/HoldConfirmDialog";
import { DiscordIcon } from "../ui/Icons";
import {
  AsyncImage,
  SkeletonListRows,
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
import { displayArtist, displayTitle } from "../../lib/metadataDisplay";
import {
  BROWSE_SORTS,
  browse,
  type BrowseEntry,
  type BrowseSort,
} from "../../lib/projectSearch";
import { DISCORD_INVITE, siteAsset, siteUrl } from "../../lib/siteAssets";
import { trackDiscord } from "../../lib/discordLink";
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
  preferOriginalMetadata = false,
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
  preferOriginalMetadata?: boolean;
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
          setError(e instanceof Error ? e.message : t("start.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, user, t]);

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
          e instanceof Error ? e.message : t("start.deleteFailed"),
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
          e instanceof Error ? e.message : t("start.updateFailed"),
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
        <div className="mb-4 flex items-center gap-4 border-b border-white/[0.06] pb-4">
          <div className="min-w-0 flex-1">
            <p className="font-display text-[0.9375rem] font-semibold text-slate-50">
              {t("startModal.welcome")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {t("startModal.welcomeBody")}
            </p>
          </div>
          <Button variant="accent" onClick={onTryMaps} className="shrink-0">
            {t("startModal.trySample")}
          </Button>
        </div>
      )}
      <div className={`-mx-1.5 grid gap-x-2 gap-y-0.5 sm:grid-cols-2 ${projectsOnly ? "hidden" : ""}`}>
        <ActionTile
          onClick={onNewMap}
          icon={<NewMapIcon className="h-[18px] w-[18px]" />}
          title={t("startModal.newMap")}
          description={t("startModal.newMapDesc")}
        />
        <ActionTile
          onClick={onTryMaps}
          icon={<SampleMapsIcon className="h-[18px] w-[18px]" />}
          title={t("startModal.tryMaps")}
          description={t("startModal.tryMapsDesc")}
        />
        {onImportSmPack && (
          <ActionTile
            onClick={onImportSmPack}
            icon={<SmPackIcon className="h-[18px] w-[18px]" />}
            title={t("startModal.importSmPack")}
            description={t("startModal.importSmPackDesc")}
          />
        )}
        {onPackCreator && (
          <ActionTile
            onClick={onPackCreator}
            icon={<PackCreatorIcon className="h-[18px] w-[18px]" />}
            title={t("startModal.packCreator")}
            description={t("startModal.packCreatorDesc")}
          />
        )}
      </div>

      {onImportFromOsu && !projectsOnly && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
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
              className={`${INPUT_CLASS} min-w-0 flex-1`}
            />
            <Button
              variant="primary"
              disabled={osuImporting || !osuLink.trim()}
              onClick={() => void runOsuImport()}
              className="whitespace-nowrap"
            >
              {osuImporting
                ? t("startModal.downloading")
                : t("startModal.importFromOsu")}
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {t("startModal.osuImportHint")}
          </p>
          {osuImportError && (
            <p className="mt-1 text-xs text-rose-400">{osuImportError}</p>
          )}
        </div>
      )}

      {!projectsOnly && (
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackDiscord("start_modal")}
          className="mt-3 inline-flex h-8 items-center gap-2 rounded-md px-2 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-slate-50"
        >
          <DiscordIcon className="h-4 w-4 text-[#5865F2]" />
          {t("startModal.joinDiscord")}
        </a>
      )}

      {!user && accountsEnabled && (
        <div
          className={`flex items-center justify-between gap-3 ${
            projectsOnly ? "" : "mt-4 border-t border-white/[0.06] pt-4"
          }`}
        >
          <span className="text-xs leading-relaxed text-slate-400">
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
          <Button variant="accent" size="sm" onClick={login} className="whitespace-nowrap">
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
          <SkeletonListRows count={cardCounts.local} columns label={t("common.loading")} />
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
                title={displayTitle(p, preferOriginalMetadata) || t("common.untitled")}
                subtitle={subtitleOf(displayArtist(p, preferOriginalMetadata), p.creator)}
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
            <SkeletonListRows count={cardCounts.cloud} columns label={t("common.loading")} />
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
            <span className="text-xs font-semibold text-slate-300">
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
        <svg viewBox="0 0 16 16" aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <path d="m13.5 13.5-3-3m1.5-3.5a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("startModal.searchPlaceholder")}
          aria-label={t("startModal.searchLabel")}
          className={`${INPUT_CLASS} w-full pl-8`}
        />
      </div>
      <div className="flex items-center gap-0.5 rounded-lg bg-black/25 p-0.5 ring-1 ring-inset ring-white/[0.06]">
        {BROWSE_SORTS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSort(option)}
            aria-pressed={sort === option}
            className={`h-7 rounded-md px-2.5 text-xs font-medium transition ${
              sort === option
                ? "bg-ink-500 text-slate-50 shadow-[0_1px_2px_rgb(0_0_0/0.4)]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One way to start: an icon, a name and a line saying what it does. */
function ActionTile({
  onClick,
  icon,
  title,
  description,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-start gap-3 rounded-lg p-2.5 text-left transition hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/[0.05] text-slate-300 ring-1 ring-inset ring-white/[0.06] transition group-hover:bg-accent/15 group-hover:text-accent-soft">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[0.875rem] font-semibold text-slate-100">{title}</span>
        <span className="block text-xs leading-snug text-slate-400">{description}</span>
      </span>
    </button>
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
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="font-display text-[0.875rem] font-semibold text-slate-100">
          {title}
        </h3>
        {count != null && (
          <span className="text-xs font-medium tabular-nums text-slate-500">
            {count}
          </span>
        )}
        {hint && (
          <span className="ml-auto text-xs text-slate-500">{hint}</span>
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
      className={buttonClass(danger ? "danger" : "ghost", "sm", "h-6")}
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
      className={`pointer-events-none grid h-4 w-4 place-items-center rounded-sm text-sm ring-1 ring-inset transition ${
        checked
          ? "bg-sky-500 text-white ring-sky-400"
          : "bg-black/30 text-transparent ring-white/25"
      }`}
    >
      <CheckIcon className="h-3 w-3" />
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
  return <p className="py-2 text-sm text-slate-500">{children}</p>;
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="skeleton-swap-in grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
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
  sourceFormat?: "osu" | "sm" | "qua" | "mc";
  participants?: ProjectParticipant[];
  actions?: React.ReactNode;
  selected?: boolean;
  onOpen: (additive: boolean) => void;
}) {
  const t = useT();
  // A row, not a card: the artwork identifies the map at a glance, the text
  // beside it is what the eye reads down a list.
  return (
    <div
      className={`group relative flex items-center rounded-lg transition ${
        selected
          ? "bg-sky-400/[0.08] ring-1 ring-inset ring-sky-400/50"
          : "hover:bg-white/[0.045]"
      }`}
    >
      <button
        type="button"
        onClick={(e) => onOpen(e.ctrlKey || e.metaKey)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 pr-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
      >
        <div className="relative aspect-[16/9] w-[5.5rem] shrink-0 overflow-hidden rounded-md bg-ink-600 ring-1 ring-inset ring-white/[0.06]">
          <AsyncImage
            src={thumbUrl}
            pending={thumbPending}
            className="h-full w-full object-cover"
            fallback={
              <div className="grid h-full w-full place-items-center text-slate-600">
                <SampleMapsIcon className="h-5 w-5" />
              </div>
            }
          />
          {participants && participants.length > 0 && (
            <div className="absolute bottom-0.5 right-0.5">
              <AvatarStack participants={participants} max={3} />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-display text-[0.875rem] font-semibold text-slate-100">
              {title}
            </span>
            {badge && (
              <span className="shrink-0 rounded-sm bg-accent/15 px-1 text-[10px] font-semibold text-accent-soft">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="truncate text-xs text-slate-400">{subtitle}</div>
          )}
          {note && (
            <div className="flex min-w-0 items-center gap-1.5 text-2xs text-slate-500">
              {sourceFormat === "qua" || sourceFormat === "mc" ? (
                <span className="shrink-0 rounded-sm bg-emerald-500/15 px-1 text-[9px] font-semibold uppercase text-emerald-300">
                  {sourceFormat}
                </span>
              ) : sourceFormat ? (
                <img
                  src={asset(`${sourceFormat === "sm" ? "etterna-logo" : "osu-logo"}.png`)}
                  alt={sourceFormat === "sm" ? t("start.etternaMap") : t("start.osuMap")}
                  className="h-3 w-3 shrink-0 object-contain opacity-70"
                />
              ) : null}
              <span className="truncate">{note}</span>
            </div>
          )}
        </div>
      </button>
      {actions && (
        <div className="flex shrink-0 items-center gap-0.5 pr-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          {actions}
        </div>
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
      className={`grid h-7 w-7 place-items-center rounded-md text-sm text-slate-400 transition disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "hover:bg-rose-500/15 hover:text-rose-300"
          : "hover:bg-white/[0.08] hover:text-slate-100"
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
        <span className="grid h-5 w-5 place-items-center rounded-full border-2 border-ink-800 bg-ink-600 text-[8px] font-semibold text-slate-200">
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
      className="h-5 w-5 rounded-full border-2 border-ink-800 object-cover"
    />
  ) : (
    <span
      title={title}
      className="grid h-5 w-5 place-items-center rounded-full border-2 border-ink-800 bg-ink-500 text-[8px] font-semibold text-slate-100"
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
  const t = useT();
  return (
    <button
      type="button"
      title={count > 1 ? t("start.deleteProjects", { count }) : t("common.delete")}
      aria-label={count > 1 ? t("start.deleteProjects", { count }) : t("common.delete")}
      disabled={disabled}
      data-no-uisound=""
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="grid h-7 w-7 place-items-center rounded-md text-sm text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
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
        <SkeletonListRows count={5} thumb="banner" label={t("sampleMaps.loading")} />
      )}
      {maps && (
        <ul className="skeleton-swap-in -mx-2 flex flex-col">
          {maps.map((map) => {
            const stars = map.difficulties.map((d) => d.stars);
            const maxStars = stars.length ? Math.max(...stars) : 0;
            const minStars = stars.length ? Math.min(...stars) : 0;
            const keyCounts = [...new Set(map.difficulties.map((d) => d.keyCount))].sort((a, b) => a - b);
            const etterna = map.osz.endsWith(".sm") || map.osz.endsWith(".zip");
            return (
              <li key={map.id}>
                <button
                  type="button"
                  onClick={() => onSelect(map)}
                  className="group flex w-full items-center gap-3.5 rounded-lg p-2 text-left transition hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
                >
                  <div className="relative aspect-[3.5/1] w-40 shrink-0 overflow-hidden rounded-md bg-ink-600 ring-1 ring-inset ring-white/[0.06] max-sm:w-28">
                    <AsyncImage
                      src={map.banner ? asset(map.banner) : undefined}
                      className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-emphasized)] group-hover:scale-[1.04]"
                      fallback={
                        <div className="grid h-full w-full place-items-center text-slate-500">
                          <SampleMapsIcon className="h-5 w-5" />
                        </div>
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[0.9375rem] font-semibold leading-5 text-slate-50">
                      {map.title}
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-400">
                      <span className="truncate">{map.artist}</span>
                      <span className="shrink-0 text-slate-600">·</span>
                      <img
                        src={asset(`${etterna ? "etterna-logo" : "osu-logo"}.png`)}
                        alt={etterna ? t("sampleMaps.etternaMap") : t("sampleMaps.osuMap")}
                        title={etterna ? t("sampleMaps.etternaMap") : t("sampleMaps.osuMap")}
                        className="h-3 w-3 shrink-0 object-contain opacity-70"
                      />
                      <span className="truncate text-slate-500">
                        {t("sampleMaps.mappedBy", { name: map.creator })}
                      </span>
                    </div>
                    <DifficultySpread difficulties={map.difficulties} />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className="rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums"
                      style={{
                        backgroundColor: starColor(maxStars),
                        color: starTextOn(maxStars),
                      }}
                    >
                      ★ {maxStars.toFixed(2)}
                    </span>
                    <span className="text-2xs tabular-nums text-slate-500">
                      {keyCounts.map((k) => `${k}K`).join(" ")}
                      {map.difficulties.length > 1 && ` · ${minStars.toFixed(1)}–${maxStars.toFixed(1)}`}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

/**
 * Every difficulty of a set as one tick in its star colour, easiest first: a
 * spread reads at a glance whether a set has two difficulties or twelve.
 */
function DifficultySpread({
  difficulties,
}: {
  difficulties: { name: string; keyCount: number; stars: number }[];
}) {
  const sorted = [...difficulties].sort((a, b) => a.stars - b.stars);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-[3px]">
      {sorted.map((d, i) => (
        <span
          key={i}
          title={`${d.name} · ${d.keyCount}K · ${d.stars.toFixed(2)}★`}
          className="h-1.5 w-4 rounded-full ring-1 ring-inset ring-white/15"
          style={{ backgroundColor: starColor(d.stars) }}
        />
      ))}
    </div>
  );
}
