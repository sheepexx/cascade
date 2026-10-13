import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { useLocale, useT } from "../../lib/i18n";
import {
  fetchOsuProfile,
  lookupRenamedUser,
  osuProfileUrl,
  type OsuMode,
  type OsuProfile,
} from "../../lib/osuProfile";
import { getProfile, openConversation, type Profile, type Relationship } from "../../lib/social";
import type { MappingStats } from "../../lib/mappingStats";
import { getMappingStats } from "../../lib/mappingStatsApi";
import type { ProfileTab, SocialRoute } from "../../lib/socialRoute";
import { SegmentedControl } from "../ui/Controls";
import { Menu, type MenuItem } from "../ui/Menu";
import { Skeleton } from "../ui/Skeleton";
import { OsuOverview } from "./OsuOverview";
import { MapLibrary } from "./MapLibrary";
import { MappingActivity } from "./MappingActivity";
import { ReportDialog } from "./ReportDialog";
import { useRelationship } from "./useRelationship";
import {
  Avatar,
  ChatIcon,
  DotsIcon,
  EmptyState,
  ErrorLine,
  ExternalIcon,
  Flag,
  HeartIcon,
  PeopleIcon,
  PresenceLine,
  SmallButton,
} from "./socialUi";
import { errorText, useNotice } from "./socialUtils";

const PROFILE_URL = (name: string) => `${window.location.origin}/user/${encodeURIComponent(name)}`;

export function ProfileView({
  name,
  tab,
  onNavigate,
  onOpenPrivacy,
  onOpenCloudProject,
  onOpenBeatmapset,
}: {
  name: string;
  tab: ProfileTab;
  onNavigate: (route: SocialRoute, replace?: boolean) => void;
  onOpenPrivacy: () => void;
  onOpenCloudProject: (id: string) => void;
  onOpenBeatmapset?: (setId: number) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { user: me, login } = useAuth();
  const notice = useNotice();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<OsuMode>("mania");
  const [osu, setOsu] = useState<OsuProfile | null>(null);
  const [osuError, setOsuError] = useState<string | null>(null);
  const [osuLoading, setOsuLoading] = useState(false);
  const [stats, setStats] = useState<MappingStats | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [coverLoaded, setCoverLoaded] = useState(false);

  // The profile itself, from Cascade. A name nobody holds may be an old one:
  // osu! knows who has it now.
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setError(null);
    getProfile(name)
      .then(async (found) => {
        if (cancelled) return;
        if (found) {
          setProfile(found);
          setState("ready");
          if (found.username !== name && found.username.toLowerCase() === name.toLowerCase()) {
            onNavigate({ view: "profile", name: found.username, tab }, true);
          }
          return;
        }
        const renamed = await lookupRenamedUser(name);
        if (cancelled) return;
        if (renamed && renamed.toLowerCase() !== name.toLowerCase()) {
          onNavigate({ view: "profile", name: renamed, tab }, true);
          return;
        }
        setProfile(null);
        setState("missing");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(errorText(e, t("social.profileFailed")));
        setState("error");
      });
    return () => {
      cancelled = true;
    };
    // tab and onNavigate only matter for the redirect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, reloadKey, me?.id, t]);

  const osuId = profile?.osu_id ?? null;
  const userId = profile?.id ?? null;

  const loadOsu = useCallback(
    (refresh: boolean) => {
      if (osuId === null) return () => {};
      let cancelled = false;
      setOsuLoading(true);
      setOsuError(null);
      fetchOsuProfile(osuId, mode, refresh)
        .then((result) => {
          if (!cancelled) setOsu(result.profile);
        })
        .catch((e: unknown) => {
          if (!cancelled) setOsuError(errorText(e, t("social.osuFailed")));
        })
        .finally(() => {
          if (!cancelled) setOsuLoading(false);
        });
      return () => {
        cancelled = true;
      };
    },
    [mode, osuId, t],
  );

  useEffect(() => loadOsu(false), [loadOsu]);

  useEffect(() => {
    setCoverLoaded(false);
  }, [osu?.cover_url]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setStats(null);
    getMappingStats(userId)
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey, profile?.relationship]);

  useEffect(() => {
    if (!profile) return;
    const previous = document.title;
    document.title = `${profile.username} | Cascade`;
    return () => {
      document.title = previous;
    };
  }, [profile]);

  const setRelationship = useCallback((relationship: Relationship) => {
    setProfile((current) =>
      current
        ? {
            ...current,
            relationship,
            can_friend_request: relationship === "none" ? current.can_friend_request : false,
          }
        : current,
    );
  }, []);

  if (state === "loading") return <ProfileSkeleton />;
  if (state === "error") return <ErrorLine message={error ?? t("social.profileFailed")} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (state === "missing" || !profile) {
    return (
      <EmptyState
        icon={<PeopleIcon />}
        title={t("social.noUser", { name })}
        body={t("social.noUserHint")}
        action={
          me ? (
            <SmallButton onClick={() => onNavigate({ view: "community" })}>{t("social.findMappers")}</SmallButton>
          ) : undefined
        }
      />
    );
  }

  const joined = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "long" }) : null;
  const cover = osu?.cover_url ?? null;

  return (
    <div className="flex flex-col">
      <div className="relative overflow-hidden rounded-2xl bg-ink-700">
        <div className="relative aspect-[3.2/1] max-h-[260px] min-h-[132px] w-full">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(232,104,104,0.28),transparent_55%),radial-gradient(120%_120%_at_100%_100%,rgba(54,127,142,0.24),transparent_55%)]"
          />
          {cover && (
            <img
              src={cover}
              alt=""
              aria-hidden
              draggable={false}
              onLoad={() => setCoverLoaded(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                coverLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-800 via-ink-800/35 to-ink-900/10" />
        </div>
      </div>

      <div className="relative -mt-14 flex flex-col gap-4 px-3 sm:-mt-16 sm:flex-row sm:items-end sm:px-6">
        <Avatar url={profile.avatar_url} name={profile.username} size="xl" ring presence={profile.presence} />
        <div className="min-w-0 flex-1 sm:pb-1.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="truncate text-2xl font-bold leading-tight text-slate-50">{profile.username}</h2>
            {(osu?.is_supporter ?? profile.osu?.is_supporter) && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-pink-500/15 px-2 py-0.5 text-[11px] font-semibold text-pink-300"
                title={t("social.supporter")}
              >
                <HeartIcon className="h-3 w-3" />
                {t("social.supporter")}
              </span>
            )}
            {osu?.title && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                {osu.title}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
            {(osu?.country ?? profile.country_code) && (
              <span className="flex items-center gap-1.5">
                <Flag code={osu?.country?.code ?? profile.country_code} name={osu?.country?.name} />
                <span>{osu?.country?.name ?? profile.country_code}</span>
              </span>
            )}
            <PresenceLine presence={profile.presence} className="text-slate-400" />
          </div>
        </div>
        <ProfileActions
          profile={profile}
          signedIn={!!me}
          onLogin={login}
          onRelationship={setRelationship}
          onMessage={async () => {
            try {
              const id = await openConversation(profile.id);
              onNavigate({ view: "messages", conversationId: id });
            } catch (e) {
              notice({ tone: "error", text: errorText(e, t("social.actionFailed")) });
            }
          }}
          onReport={() => setReporting(true)}
          onOpenPrivacy={onOpenPrivacy}
          onRefresh={() => {
            loadOsu(true);
            setReloadKey((k) => k + 1);
          }}
          refreshing={osuLoading}
        />
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 px-3 text-xs text-slate-500 sm:px-6">
        {osu?.join_date && (
          <div className="flex gap-1.5">
            <dt>{t("social.joinedOsu")}</dt>
            <dd className="font-medium text-slate-300">{joined(osu.join_date)}</dd>
          </div>
        )}
        <div className="flex gap-1.5">
          <dt>{t("social.joinedCascade")}</dt>
          <dd className="font-medium text-slate-300">{joined(profile.cascade_joined_at)}</dd>
        </div>
        {profile.friends_since && (
          <div className="flex gap-1.5">
            <dt>{t("social.friendsSince")}</dt>
            <dd className="font-medium text-slate-300">{joined(profile.friends_since)}</dd>
          </div>
        )}
        {osu && osu.previous_usernames.length > 0 && (
          <div className="flex min-w-0 gap-1.5">
            <dt>{t("social.previously")}</dt>
            <dd className="truncate font-medium text-slate-300">{osu.previous_usernames.join(", ")}</dd>
          </div>
        )}
      </dl>

      <div className="mt-5 px-0 sm:px-3">
        <SegmentedControl
          className="max-w-md"
          value={tab}
          onChange={(next) => onNavigate({ view: "profile", name: profile.username, tab: next }, true)}
          options={[
            { value: "overview", label: t("social.tabOverview") },
            { value: "maps", label: t("social.tabMaps") },
            { value: "activity", label: t("social.tabActivity") },
          ]}
        />
      </div>

      <div className="mt-4 sm:px-3">
        {tab === "overview" && (
          <OsuOverview
            profile={profile}
            osu={osu}
            loading={osuLoading}
            error={osuError}
            mode={mode}
            onMode={setMode}
            onRetry={() => loadOsu(true)}
            stats={stats}
            onShowActivity={() => onNavigate({ view: "profile", name: profile.username, tab: "activity" }, true)}
          />
        )}
        {tab === "maps" && (
          <MapLibrary
            key={profile.id}
            osuId={profile.osu_id}
            counts={osu?.counts ?? null}
            countsLoading={osuLoading && !osu}
            isSelf={profile.is_self}
            stats={stats}
            onOpenCloudProject={onOpenCloudProject}
            onOpenBeatmapset={onOpenBeatmapset}
          />
        )}
        {tab === "activity" && (
          <MappingActivity stats={stats} isSelf={profile.is_self} username={profile.username} onOpenPrivacy={onOpenPrivacy} />
        )}
      </div>

      <ReportDialog
        open={reporting}
        user={profile}
        onClose={() => setReporting(false)}
      />
    </div>
  );
}

function ProfileActions({
  profile,
  signedIn,
  onLogin,
  onRelationship,
  onMessage,
  onReport,
  onOpenPrivacy,
  onRefresh,
  refreshing,
}: {
  profile: Profile;
  signedIn: boolean;
  onLogin: () => void;
  onRelationship: (relationship: Relationship) => void;
  onMessage: () => void;
  onReport: () => void;
  onOpenPrivacy: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const t = useT();
  const notice = useNotice();
  const { busy, run } = useRelationship(profile.id, profile.relationship, onRelationship);

  const copyLink = () => {
    void navigator.clipboard
      ?.writeText(PROFILE_URL(profile.username))
      .then(() => notice({ tone: "success", text: t("social.linkCopied") }))
      .catch(() => notice({ tone: "error", text: t("social.copyFailed") }));
  };
  const openOsu = () => window.open(osuProfileUrl(profile.osu_id), "_blank", "noopener,noreferrer");

  if (profile.is_self) {
    return (
      <div className="flex flex-wrap items-center gap-2 sm:pb-1.5">
        <SmallButton onClick={onOpenPrivacy}>{t("social.privacySettings")}</SmallButton>
        <SmallButton onClick={onRefresh} disabled={refreshing}>
          {refreshing ? t("common.loading") : t("social.refreshOsu")}
        </SmallButton>
        <Menu
          label={<DotsIcon />}
          chevron={false}
          aria-label={t("social.moreActions")}
          className="!px-2"
          items={[
            { label: t("social.copyLink"), onClick: copyLink },
            { label: t("social.viewOnOsu"), onClick: openOsu },
          ]}
        />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="flex flex-wrap items-center gap-2 sm:pb-1.5">
        <SmallButton tone="accent" onClick={onLogin}>
          {t("social.signInToConnect")}
        </SmallButton>
        <SmallButton onClick={openOsu}>
          {t("social.viewOnOsu")} <ExternalIcon />
        </SmallButton>
      </div>
    );
  }

  const rel = profile.relationship;
  const more: MenuItem[] = [
    { label: t("social.copyLink"), onClick: copyLink },
    { label: t("social.viewOnOsu"), onClick: openOsu },
    { separator: true },
  ];
  if (rel === "friends") more.push({ label: t("social.removeFriend"), onClick: () => void run("remove") });
  more.push(
    rel === "blocked"
      ? { label: t("social.unblock"), onClick: () => void run("unblock") }
      : { label: t("social.block"), onClick: () => void run("block"), danger: true },
    { label: t("social.report"), onClick: onReport, danger: true },
  );

  return (
    <div className="flex flex-wrap items-center gap-2 sm:pb-1.5">
      {rel === "none" && (
        <SmallButton
          tone="accent"
          onClick={() => void run("add")}
          disabled={!profile.can_friend_request || busy !== null}
          title={profile.can_friend_request ? undefined : t("social.notAcceptingRequests")}
        >
          {t("social.addFriend")}
        </SmallButton>
      )}
      {rel === "outgoing" && (
        <SmallButton onClick={() => void run("cancel")} disabled={busy !== null} title={t("social.cancelRequest")}>
          {t("social.requested")}
        </SmallButton>
      )}
      {rel === "incoming" && (
        <>
          <SmallButton tone="accent" onClick={() => void run("accept")} disabled={busy !== null}>
            {t("social.accept")}
          </SmallButton>
          <SmallButton onClick={() => void run("decline")} disabled={busy !== null}>
            {t("social.decline")}
          </SmallButton>
        </>
      )}
      {rel === "friends" && (
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2.5 text-xs font-medium text-emerald-200">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          {t("social.friends")}
        </span>
      )}
      {rel === "blocked" && (
        <SmallButton onClick={() => void run("unblock")} disabled={busy !== null}>
          {t("social.unblock")}
        </SmallButton>
      )}
      {profile.can_message && rel !== "blocked" && (
        <SmallButton onClick={onMessage}>
          <ChatIcon className="h-3.5 w-3.5" />
          {t("social.message")}
        </SmallButton>
      )}
      <Menu
        label={<DotsIcon />}
        chevron={false}
        aria-label={t("social.moreActions")}
        className="!px-2"
        items={more}
      />
    </div>
  );
}

function ProfileSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-busy="true" aria-label={t("common.loading")} className="flex flex-col">
      <Skeleton className="aspect-[3.2/1] max-h-[260px] min-h-[132px] w-full rounded-2xl" />
      <div className="-mt-14 flex items-end gap-4 px-6">
        <Skeleton className="h-28 w-28 rounded-full ring-4 ring-ink-800" />
        <div className="flex flex-1 flex-col gap-2 pb-2">
          <Skeleton className="h-6 w-48 rounded" />
          <Skeleton className="h-3.5 w-32 rounded" />
        </div>
      </div>
      <div className="mt-8 grid gap-3 px-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} step={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
