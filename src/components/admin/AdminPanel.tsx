import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, TextInput } from "../ui/Controls";
import { PatternPreview } from "../ui/PatternPreview";
import {
  SkeletonMediaCards,
  SkeletonRows,
  SkeletonStats,
  SkeletonTable,
} from "../ui/Skeleton";
import { useAuth } from "../../lib/auth";
import {
  listPresetsByStatus,
  listPrivatePresets,
  setPresetStatus,
  deletePreset,
  type Preset,
  type PresetStatus,
} from "../../lib/presets";
import {
  adminEventStats,
  adminUserEvents,
  adminUserProjects,
  deleteSharedMapAdmin,
  getAdminStats,
  getStorageStats,
  listAdminSharedMaps,
  listUserSummaries,
  setUserAdmin,
  listAllProjects,
  deleteProjectAdmin,
  type AdminEventStat,
  type AdminStats,
  type AdminStorageStats,
  type AdminUserEvent,
  type AdminUserProject,
  type AdminUserSummary,
  type AdminProject,
  type AdminSharedMap,
} from "../../lib/admin";
import { sharedMapUrl } from "../../lib/sharedMap";
import {
  listFeedback,
  setFeedbackStatus,
  type Feedback,
  type FeedbackStatus,
} from "../../lib/feedback";
import { publishAppUpdate } from "../../lib/notifications";
import {
  FEATURE_FLAG_INFO,
  listFeatureFlags,
  setFeatureFlag,
  type FeatureFlagRow,
} from "../../lib/featureFlags";

type Tab =
  | "stats"
  | "presets"
  | "users"
  | "projects"
  | "previews"
  | "feedback"
  | "notifications"
  | "settings";

export function AdminPanel({
  open,
  onClose,
  invisible,
  onToggleInvisible,
}: {
  open: boolean;
  onClose: () => void;
  invisible: boolean;
  onToggleInvisible: () => void;
}) {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("stats");

  if (!open || !isAdmin) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink-900">
      {/* Eight tabs never fit a phone. Below `sm` the title and Close take the
          first row and the tab strip gets a full-width row of its own that
          scrolls sideways; from `sm` up the three sit on one line as before. */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-600 bg-ink-800 px-3 py-3 sm:flex-nowrap sm:px-5">
        <h1 className="shrink-0 text-sm font-semibold text-slate-100">Admin</h1>
        <Button
          onClick={onClose}
          className="order-1 ml-auto shrink-0 sm:order-3"
        >
          Close
        </Button>
        <nav className="order-2 -mx-3 flex w-full items-center gap-1 overflow-x-auto px-3 sm:mx-0 sm:w-auto sm:min-w-0 sm:flex-1 sm:px-0">
          {([
            "stats",
            "presets",
            "users",
            "projects",
            "previews",
            "feedback",
            "notifications",
            "settings",
          ] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm capitalize transition ${
                tab === t
                  ? "bg-ink-600 text-slate-100"
                  : "text-slate-300 hover:bg-ink-700"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>
      <div className="flex-1 overflow-y-auto p-3 sm:p-5">
        {tab === "stats" && <StatsTab />}
        {tab === "presets" && <PresetsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "projects" && <ProjectsTab />}
        {tab === "previews" && <PreviewsTab />}
        {tab === "feedback" && <FeedbackTab />}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "settings" && (
          <SettingsTab invisible={invisible} onToggle={onToggleInvisible} />
        )}
      </div>
    </div>
  );
}

function useAsyncError() {
  const [error, setError] = useState<string | null>(null);
  const wrap = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    }
  }, []);
  return { error, setError, wrap };
}

function StatsTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [storage, setStorage] = useState<AdminStorageStats | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [events, setEvents] = useState<AdminEventStat[] | null>(null);
  const { error, setError } = useAsyncError();

  useEffect(() => {
    setStats(null);
    setStorage(null);
    setStorageError(null);
    setEvents(null);
    setError(null);
    getAdminStats()
      .then(setStats)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load stats."),
      );
    // Requires migration 0014; fail quietly so the rest of the tab loads.
    adminEventStats()
      .then(setEvents)
      .catch(() => setEvents([]));
    getStorageStats()
      .then(setStorage)
      .catch((e) =>
        setStorageError(
          e instanceof Error ? e.message : "Failed to load storage stats.",
        ),
      );
  }, [setError]);

  return (
    <div>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!stats && !error && <SkeletonStats count={4} label="Loading stats" />}
      {stats && (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Users" value={stats.users} />
            <StatCard label=".osu exports" value={stats.exportOsu} />
            <StatCard label=".osz exports" value={stats.exportOsz} />
            <StatCard
              label="Local projects created"
              value={stats.localProjectsCreated}
            />
          </div>
          <StorageStatsSection stats={storage} error={storageError} />
          <section className="mt-6 rounded-xl border border-ink-600 bg-ink-800 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Feature usage
            </h2>
            {!events && (
              <SkeletonTable rows={5} columns={4} label="Loading feature usage" />
            )}
            {events && events.length === 0 && (
              <p className="text-sm text-slate-500">
                No events yet (or migration 0014 isn't applied).
              </p>
            )}
            {events && events.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="pb-2 font-medium">Event</th>
                      <th className="pb-2 text-right font-medium">7 days</th>
                      <th className="pb-2 text-right font-medium">30 days</th>
                      <th className="pb-2 text-right font-medium">All time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((row) => (
                      <tr
                        key={row.event_type}
                        className="border-t border-ink-600/60"
                      >
                        <td className="py-1.5 font-mono text-xs text-slate-200">
                          {row.event_type}
                        </td>
                        <td className="py-1.5 text-right font-mono text-xs text-slate-400">
                          {row.last_7d}
                        </td>
                        <td className="py-1.5 text-right font-mono text-xs text-slate-400">
                          {row.last_30d}
                        </td>
                        <td className="py-1.5 text-right font-mono text-xs text-slate-300">
                          {row.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="mt-6 rounded-xl border border-ink-600 bg-ink-800 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Browser
            </h2>
            {stats.browsers.length === 0 ? (
              <p className="text-sm text-slate-500">No browser data yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {stats.browsers.map((row) => (
                  <div
                    key={row.browser}
                    className="flex items-center justify-between rounded-lg bg-ink-700/50 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-200">{row.browser}</span>
                    <span className="font-mono text-xs text-slate-400">
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-ink-600 bg-ink-800 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  );
}

type PresetAdminFilter = PresetStatus | "private";

function PresetsTab() {
  const [status, setStatus] = useState<PresetAdminFilter>("pending");
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const { error, setError, wrap } = useAsyncError();

  const load = useCallback(() => {
    setPresets(null);
    setError(null);
    const request =
      status === "private" ? listPrivatePresets() : listPresetsByStatus(status);
    request
      .then(setPresets)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load."),
      );
  }, [status, setError]);

  useEffect(load, [load]);

  const moderate = (id: string, next: PresetStatus) =>
    void wrap(async () => {
      await setPresetStatus(id, next);
      setPresets((prev) => prev?.filter((p) => p.id !== id) ?? null);
    });

  const remove = (id: string) =>
    void wrap(async () => {
      if (!window.confirm("Delete this preset permanently?")) return;
      await deletePreset(id);
      setPresets((prev) => prev?.filter((p) => p.id !== id) ?? null);
    });

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {(["pending", "approved", "rejected", "private"] as PresetAdminFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-md px-3 py-1.5 text-xs capitalize transition ${
              status === s
                ? "bg-accent text-white"
                : "bg-ink-700 text-slate-300 hover:bg-ink-600"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!presets && (
        <SkeletonMediaCards
          count={4}
          columns="lg:grid-cols-2"
          label="Loading presets"
        />
      )}
      {presets && presets.length === 0 && (
        <p className="text-sm text-slate-400">No {status} presets.</p>
      )}
      {presets && presets.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {presets.map((p) => (
            <div
              key={p.id}
              className="flex gap-3 rounded-xl border border-ink-500/60 bg-ink-800 p-3"
            >
              <PatternPreview
                pattern={p.pattern}
                keyCount={p.key_count}
                size="large"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="truncate text-sm font-semibold text-slate-100">
                  {p.name}
                </div>
                <div className="text-[11px] text-slate-500">
                  {p.key_count}K · {p.pattern.length} notes · by{" "}
                  {p.author_osu_id ? (
                    <a
                      href={`https://osu.ppy.sh/users/${p.author_osu_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {p.author_username ?? "unknown"}
                    </a>
                  ) : (
                    (p.author_username ?? "unknown")
                  )}
                  {!p.is_public && (
                    <span className="ml-1 rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold text-accent">
                      private
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="mt-1 text-xs text-slate-400">{p.description}</p>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  {status !== "private" && status !== "approved" && (
                    <Button
                      variant="accent"
                      onClick={() => moderate(p.id, "approved")}
                    >
                      Approve
                    </Button>
                  )}
                  {status !== "private" && status !== "rejected" && (
                    <Button onClick={() => moderate(p.id, "rejected")}>
                      Reject
                    </Button>
                  )}
                  <Button onClick={() => remove(p.id)}>Delete</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type UserSortKey =
  | "username"
  | "osu_id"
  | "created_at"
  | "last_seen"
  | "events_30d"
  | "event_count"
  | "export_count"
  | "project_count"
  | "storage_bytes"
  | "preset_count";

const USER_COLUMNS: { key: UserSortKey; label: string; right?: boolean }[] = [
  { key: "username", label: "User" },
  { key: "osu_id", label: "osu! id", right: true },
  { key: "created_at", label: "Joined", right: true },
  { key: "last_seen", label: "Last seen", right: true },
  { key: "events_30d", label: "30d", right: true },
  { key: "event_count", label: "Events", right: true },
  { key: "export_count", label: "Exports", right: true },
  { key: "project_count", label: "Maps", right: true },
  { key: "storage_bytes", label: "Storage", right: true },
  { key: "preset_count", label: "Presets", right: true },
];

function lastSeenAt(u: AdminUserSummary): number {
  const signedIn = u.last_signed_in_at
    ? new Date(u.last_signed_in_at).getTime()
    : 0;
  const event = u.last_event_at ? new Date(u.last_event_at).getTime() : 0;
  return Math.max(signedIn, event);
}

function userSortValue(
  u: AdminUserSummary,
  key: UserSortKey,
): number | string {
  if (key === "username") return u.username.toLowerCase();
  if (key === "created_at") return new Date(u.created_at).getTime();
  if (key === "last_seen") return lastSeenAt(u);
  return Number(u[key] ?? 0);
}

function UsersTab() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [sort, setSort] = useState<UserSortKey>("last_seen");
  const [descending, setDescending] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { error, setError, wrap } = useAsyncError();

  useEffect(() => {
    listUserSummaries()
      .then(setUsers)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load."),
      );
  }, [setError]);

  const toggle = (u: AdminUserSummary) =>
    void wrap(async () => {
      await setUserAdmin(u.id, !u.is_admin);
      setUsers(
        (prev) =>
          prev?.map((x) =>
            x.id === u.id ? { ...x, is_admin: !u.is_admin } : x,
          ) ?? null,
      );
    });

  const changeSort = (key: UserSortKey) => {
    if (key === sort) {
      setDescending((prev) => !prev);
      return;
    }
    setSort(key);
    setDescending(key !== "username");
  };

  const rows = useMemo(() => {
    if (!users) return null;
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? users.filter(
          (u) =>
            u.username.toLowerCase().includes(needle) ||
            String(u.osu_id).includes(needle),
        )
      : users;
    return [...filtered].sort((a, b) => {
      const av = userSortValue(a, sort);
      const bv = userSortValue(b, sort);
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : Number(av) - Number(bv);
      return descending ? -cmp : cmp;
    });
  }, [users, query, sort, descending]);

  const selected = users?.find((u) => u.id === selectedId) ?? null;

  if (selected) {
    return (
      <UserDetail
        user={selected}
        isSelf={selected.id === user?.id}
        onBack={() => setSelectedId(null)}
        onToggleAdmin={() => toggle(selected)}
        onPreviewDeleted={(bytes) =>
          setUsers(
            (prev) =>
              prev?.map((item) =>
                item.id === selected.id
                  ? {
                      ...item,
                      storage_bytes: Math.max(
                        0,
                        Number(item.storage_bytes) - bytes,
                      ),
                    }
                  : item,
              ) ?? null,
          )
        }
      />
    );
  }

  return (
    <div>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {users && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-400">
            <span className="font-semibold text-slate-200">{users.length}</span>{" "}
            accounts
            {rows && rows.length !== users.length && (
              <span className="text-slate-500"> · {rows.length} shown</span>
            )}
          </div>
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or osu! id"
            className="w-56"
          />
        </div>
      )}
      {!users && <SkeletonTable rows={8} columns={6} label="Loading users" />}
      {rows && rows.length === 0 && (
        <p className="text-sm text-slate-400">No matching users.</p>
      )}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {USER_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={col.right ? "text-right" : "text-left"}
                  >
                    <button
                      onClick={() => changeSort(col.key)}
                      className={`whitespace-nowrap rounded px-1.5 py-2 transition hover:text-slate-200 ${
                        sort === col.key ? "text-accent" : ""
                      }`}
                    >
                      {col.label}
                      {sort === col.key && (descending ? " ↓" : " ↑")}
                    </button>
                  </th>
                ))}
                <th className="py-2 text-right text-xs font-medium">Admin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSelectedId(u.id)}
                  className="cursor-pointer border-t border-ink-700 transition hover:bg-ink-800"
                >
                  <td className="py-2 pr-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {u.avatar_url && (
                        <img
                          src={u.avatar_url}
                          alt=""
                          className="h-6 w-6 shrink-0 rounded-full object-cover"
                        />
                      )}
                      <span className="truncate font-medium text-slate-200">
                        {u.username}
                      </span>
                      {u.is_admin && (
                        <span className="shrink-0 rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold uppercase text-accent">
                          admin
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-1.5 py-2 text-right font-mono text-xs text-slate-500">
                    {u.osu_id}
                  </td>
                  <td className="px-1.5 py-2 text-right text-xs text-slate-500">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-1.5 py-2 text-right text-xs text-slate-500">
                    {formatLastSeen(u)}
                  </td>
                  <NumberCell value={u.events_30d} />
                  <NumberCell value={u.event_count} />
                  <NumberCell value={u.export_count} />
                  <NumberCell value={u.project_count} />
                  <td className="px-1.5 py-2 text-right font-mono text-xs text-slate-400">
                    {formatBytes(Number(u.storage_bytes))}
                  </td>
                  <NumberCell value={u.preset_count} />
                  <td className="py-2 pl-3 text-right">
                    <span onClick={(e) => e.stopPropagation()}>
                      <Button
                        onClick={() => toggle(u)}
                        disabled={u.id === user?.id}
                        title={
                          u.id === user?.id
                            ? "You can't change your own admin status"
                            : ""
                        }
                      >
                        {u.is_admin ? "Revoke" : "Make admin"}
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NumberCell({ value }: { value: number }) {
  return (
    <td
      className={`px-1.5 py-2 text-right font-mono text-xs ${
        Number(value) > 0 ? "text-slate-300" : "text-slate-600"
      }`}
    >
      {Number(value)}
    </td>
  );
}

function formatLastSeen(u: AdminUserSummary): string {
  const at = lastSeenAt(u);
  return at ? new Date(at).toLocaleDateString() : "never";
}

function formatMoment(value: string | null): string {
  if (!value) return "never";
  return new Date(value).toLocaleString();
}

function UserDetail({
  user,
  isSelf,
  onBack,
  onToggleAdmin,
  onPreviewDeleted,
}: {
  user: AdminUserSummary;
  isSelf: boolean;
  onBack: () => void;
  onToggleAdmin: () => void;
  onPreviewDeleted: (bytes: number) => void;
}) {
  const [events, setEvents] = useState<AdminUserEvent[] | null>(null);
  const [projects, setProjects] = useState<AdminUserProject[] | null>(null);
  const [previews, setPreviews] = useState<AdminSharedMap[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [deletingPreviewId, setDeletingPreviewId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setEvents(null);
    setProjects(null);
    setPreviews(null);
    setError(null);
    setPreviewError(null);
    adminUserEvents(user.id)
      .then(setEvents)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load activity."),
      );
    adminUserProjects(user.id)
      .then(setProjects)
      .catch(() => setProjects([]));
    listAdminSharedMaps(user.id)
      .then(setPreviews)
      .catch((e) =>
        setPreviewError(
          e instanceof Error ? e.message : "Failed to load previews.",
        ),
      );
  }, [user.id]);

  const removePreview = async (preview: AdminSharedMap) => {
    if (!window.confirm("Delete this public preview and all of its files?")) {
      return;
    }
    setDeletingPreviewId(preview.id);
    setPreviewError(null);
    try {
      await deleteSharedMapAdmin(preview);
      setPreviews((previous) =>
        previous?.filter((item) => item.id !== preview.id) ?? null,
      );
      onPreviewDeleted(Number(preview.asset_bytes || 0));
    } catch (e) {
      setPreviewError(
        e instanceof Error ? e.message : "Failed to delete preview.",
      );
    } finally {
      setDeletingPreviewId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={onBack}>← All users</Button>
        {user.avatar_url && (
          <img
            src={user.avatar_url}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        )}
        <div className="min-w-0">
          <a
            href={`https://osu.ppy.sh/users/${user.osu_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-base font-semibold text-slate-100 transition hover:text-accent"
          >
            {user.username}
          </a>
          <div className="text-[11px] text-slate-500">
            osu! id {user.osu_id} · joined{" "}
            {new Date(user.created_at).toLocaleDateString()} · last signed in{" "}
            {formatMoment(user.last_signed_in_at)}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {user.is_admin && (
            <span className="rounded bg-accent/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
              admin
            </span>
          )}
          <Button
            onClick={onToggleAdmin}
            disabled={isSelf}
            title={isSelf ? "You can't change your own admin status" : ""}
          >
            {user.is_admin ? "Revoke admin" : "Make admin"}
          </Button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Events (all time)" value={Number(user.event_count)} />
        <StatCard label="Events (7 days)" value={Number(user.events_7d)} />
        <StatCard label="Events (30 days)" value={Number(user.events_30d)} />
        <StatCard label="Exports" value={Number(user.export_count)} />
        <StatCard label="Cloud maps" value={Number(user.project_count)} />
        <StatCard label="Presets" value={Number(user.preset_count)} />
        <StatCard label="Comments" value={Number(user.comment_count)} />
        <StatCard label="Collaborations" value={Number(user.collab_count)} />
        {previews && (
          <StatCard label="Public previews" value={previews.length} />
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 text-[11px] text-slate-500">
        <span>storage {formatBytes(Number(user.storage_bytes))}</span>
        <span>last event {formatMoment(user.last_event_at)}</span>
        <span>browser {user.last_browser ?? "unknown"}</span>
        <span>os {user.last_os ?? "unknown"}</span>
        <span>feedback {Number(user.feedback_count)}</span>
      </div>

      <section className="mt-6 rounded-xl border border-ink-600 bg-ink-800 p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Feature usage
        </h2>
        {!events && !error && (
          <SkeletonTable rows={5} columns={5} label="Loading activity" />
        )}
        {events && events.length === 0 && (
          <p className="text-sm text-slate-500">
            No events recorded for this account. Events logged while signed out
            aren't attributed to anyone.
          </p>
        )}
        {events && events.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 font-medium">Event</th>
                  <th className="pb-2 text-right font-medium">7 days</th>
                  <th className="pb-2 text-right font-medium">30 days</th>
                  <th className="pb-2 text-right font-medium">All time</th>
                  <th className="pb-2 text-right font-medium">Last</th>
                </tr>
              </thead>
              <tbody>
                {events.map((row) => (
                  <tr key={row.event_type} className="border-t border-ink-600/60">
                    <td className="py-1.5 font-mono text-xs text-slate-200">
                      {row.event_type}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs text-slate-400">
                      {row.last_7d}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs text-slate-400">
                      {row.last_30d}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs text-slate-300">
                      {row.total}
                    </td>
                    <td className="py-1.5 text-right text-xs text-slate-500">
                      {formatMoment(row.last_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-ink-600 bg-ink-800 p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Maps
        </h2>
        {!projects && (
          <SkeletonRows count={3} lines={2} action={false} label="Loading maps" />
        )}
        {projects && projects.length === 0 && (
          <p className="text-sm text-slate-500">No cloud maps.</p>
        )}
        {projects && projects.length > 0 && (
          <ul className="flex flex-col gap-2">
            {projects.map((p) => (
              <li
                key={`${p.role}-${p.id}`}
                className="rounded-lg border border-ink-600/70 bg-ink-700/30 p-3"
              >
                <div className="truncate text-sm text-slate-200">
                  {p.title || "Untitled"}
                  <span className="text-slate-500"> - {p.artist}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span className="text-accent">{p.role}</span>
                  <span>saved {new Date(p.updated_at).toLocaleString()}</span>
                  <span>{formatBytes(Number(p.asset_bytes))}</span>
                  <span>{Number(p.asset_count)} assets</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-ink-600 bg-ink-800 p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Public previews
        </h2>
        {previewError && (
          <p className="text-sm text-rose-400">{previewError}</p>
        )}
        {!previews && !previewError && (
          <SkeletonRows
            count={2}
            lines={2}
            action={false}
            label="Loading previews"
          />
        )}
        {previews && previews.length === 0 && (
          <p className="text-sm text-slate-500">No public previews.</p>
        )}
        {previews && previews.length > 0 && (
          <SharedMapList
            previews={previews}
            showOwner={false}
            deletingId={deletingPreviewId}
            onDelete={removePreview}
          />
        )}
      </section>
    </div>
  );
}

function StorageStatsSection({
  stats,
  error,
}: {
  stats: AdminStorageStats | null;
  error: string | null;
}) {
  return (
    <section className="mt-6 rounded-xl border border-ink-600 bg-ink-800 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Physical storage
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Actual files stored in each provider's buckets.
          </p>
        </div>
        {stats && (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Total used
            </div>
            <div className="font-mono text-sm font-semibold text-slate-200">
              {formatBytes(stats.totalBytes)}
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {!stats && !error && (
        <div className="grid gap-3 lg:grid-cols-2" aria-label="Loading storage stats">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="h-36 animate-pulse rounded-lg bg-ink-700/60"
            />
          ))}
        </div>
      )}
      {stats && (
        <div className="grid gap-3 lg:grid-cols-2">
          <StorageMeter
            name="Supabase Storage"
            bytes={stats.supabase.bytes}
            objects={stats.supabase.objects}
            allowanceBytes={stats.supabase.allowanceBytes}
            buckets={[
              ["maps", stats.supabase.buckets.maps],
              ["shared", stats.supabase.buckets.shared],
            ]}
          />
          <StorageMeter
            name="Cloudflare R2"
            bytes={stats.cloudflare.bytes}
            objects={stats.cloudflare.objects}
            allowanceBytes={stats.cloudflare.allowanceBytes}
            buckets={[
              ["projects", stats.cloudflare.buckets.projects],
              ["shared", stats.cloudflare.buckets.shared],
            ]}
          />
        </div>
      )}
    </section>
  );
}

function StorageMeter({
  name,
  bytes,
  objects,
  allowanceBytes,
  buckets,
}: {
  name: string;
  bytes: number;
  objects: number;
  allowanceBytes: number;
  buckets: [string, { bytes: number; objects: number }][];
}) {
  const percent = allowanceBytes > 0 ? (bytes / allowanceBytes) * 100 : null;
  const barPercent = percent === null ? 0 : Math.min(100, Math.max(0, percent));
  const percentLabel =
    percent === null
      ? null
      : percent > 0 && percent < 0.1
        ? "<0.1%"
        : `${percent.toFixed(1)}%`;
  return (
    <div className="rounded-lg border border-ink-600/80 bg-ink-700/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{name}</h3>
          <p className="mt-1 font-mono text-base text-slate-200">
            {formatBytes(bytes)}
            {allowanceBytes > 0 && (
              <span className="text-slate-500">
                {" "}/ {formatBytes(allowanceBytes)} included
              </span>
            )}
          </p>
        </div>
        {percentLabel && (
          <span className="font-mono text-xs text-slate-400">{percentLabel}</span>
        )}
      </div>
      {allowanceBytes > 0 && (
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-ink-600"
          role="progressbar"
          aria-label={`${name} storage used`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(barPercent)}
        >
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${barPercent}%` }}
          />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>{objects.toLocaleString()} objects</span>
        {buckets.map(([label, usage]) => (
          <span key={label}>
            {label} {formatBytes(usage.bytes)}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProjectsTab() {
  const [projects, setProjects] = useState<AdminProject[] | null>(null);
  const [sort, setSort] = useState<ProjectSort>("last_activity");
  const { error, setError, wrap } = useAsyncError();

  useEffect(() => {
    listAllProjects()
      .then(setProjects)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load."),
      );
  }, [setError]);

  const remove = (id: string) =>
    void wrap(async () => {
      if (
        !window.confirm(
          "Delete this project permanently? Its database record and all files in Cloudflare R2 and Supabase Storage will be removed.",
        )
      )
        return;
      await deleteProjectAdmin(id);
      setProjects((prev) => prev?.filter((p) => p.id !== id) ?? null);
    });

  const sorted = useMemo(() => {
    if (!projects) return null;
    return [...projects].sort((a, b) => compareProjects(a, b, sort));
  }, [projects, sort]);

  const totalBytes =
    projects?.reduce((sum, p) => sum + Number(p.asset_bytes || 0), 0) ?? 0;

  return (
    <div>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!projects && (
        <SkeletonTable rows={8} columns={5} label="Loading projects" />
      )}
      {projects && projects.length === 0 && (
        <p className="text-sm text-slate-400">No projects.</p>
      )}
      {projects && projects.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-400">
            Total storage:{" "}
            <span className="font-semibold text-slate-200">
              {formatBytes(totalBytes)}
            </span>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as ProjectSort)}
              className="rounded-lg border border-white/10 bg-ink-700 px-2 py-1.5 text-sm text-slate-100 outline-none"
            >
              <option value="last_activity">Last activity</option>
              <option value="updated">Last saved</option>
              <option value="storage">Storage</option>
              <option value="participants">People</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>
      )}
      {sorted && sorted.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sorted.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-800 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-200">
                  {p.title || "Untitled"}
                  <span className="text-slate-500"> - {p.artist}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  owner{" "}
                  {p.owner_osu_id ? (
                    <a
                      href={`https://osu.ppy.sh/users/${p.owner_osu_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {p.owner_username ?? p.owner.slice(0, 8)}
                    </a>
                  ) : (
                    p.owner.slice(0, 8)
                  )}{" "}
                  · saved {new Date(p.updated_at).toLocaleString()}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span>
                    activity {new Date(p.last_activity_at).toLocaleString()}
                  </span>
                  <span>{p.participant_count} people</span>
                  <span>{formatBytes(p.asset_bytes)}</span>
                  <span>{p.asset_count} assets</span>
                </div>
              </div>
              <Button onClick={() => remove(p.id)}>Delete</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type PreviewSort =
  | "last_view"
  | "created"
  | "storage"
  | "views"
  | "title";

function PreviewsTab() {
  const [previews, setPreviews] = useState<AdminSharedMap[] | null>(null);
  const [sort, setSort] = useState<PreviewSort>("last_view");
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { error, setError } = useAsyncError();

  useEffect(() => {
    listAdminSharedMaps()
      .then(setPreviews)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load previews."),
      );
  }, [setError]);

  const rows = useMemo(() => {
    if (!previews) return null;
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? previews.filter((preview) =>
          [
            preview.title,
            preview.artist,
            preview.owner_username,
            preview.slug,
          ].some((value) => value?.toLowerCase().includes(needle)),
        )
      : previews;
    return [...filtered].sort((a, b) => {
      if (sort === "title") {
        return (a.title || "Untitled").localeCompare(b.title || "Untitled");
      }
      if (sort === "storage") {
        return Number(b.asset_bytes) - Number(a.asset_bytes);
      }
      if (sort === "views") return Number(b.views) - Number(a.views);
      if (sort === "last_view") {
        return (
          new Date(b.last_viewed_at ?? 0).getTime() -
          new Date(a.last_viewed_at ?? 0).getTime()
        );
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [previews, query, sort]);

  const remove = async (preview: AdminSharedMap) => {
    if (!window.confirm("Delete this public preview and all of its files?")) {
      return;
    }
    setDeletingId(preview.id);
    setError(null);
    try {
      await deleteSharedMapAdmin(preview);
      setPreviews((previous) =>
        previous?.filter((item) => item.id !== preview.id) ?? null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete preview.");
    } finally {
      setDeletingId(null);
    }
  };

  const totalBytes =
    previews?.reduce(
      (sum, preview) => sum + Number(preview.asset_bytes || 0),
      0,
    ) ?? 0;

  return (
    <div>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!previews && !error && (
        <SkeletonRows count={8} lines={3} label="Loading previews" />
      )}
      {previews && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-400">
            <span className="font-semibold text-slate-200">
              {previews.length}
            </span>{" "}
            public previews · total storage{" "}
            <span className="font-semibold text-slate-200">
              {formatBytes(totalBytes)}
            </span>
            {rows && rows.length !== previews.length && (
              <span className="text-slate-500"> · {rows.length} shown</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search map, owner, or slug"
              className="w-64"
            />
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Sort
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as PreviewSort)}
                className="rounded-lg border border-white/10 bg-ink-700 px-2 py-1.5 text-sm text-slate-100 outline-none"
              >
                <option value="last_view">Latest view</option>
                <option value="created">Published</option>
                <option value="storage">Storage</option>
                <option value="views">Views</option>
                <option value="title">Title</option>
              </select>
            </label>
          </div>
        </div>
      )}
      {rows && rows.length === 0 && (
        <p className="text-sm text-slate-400">
          {previews?.length ? "No matching previews." : "No public previews."}
        </p>
      )}
      {rows && rows.length > 0 && (
        <SharedMapList
          previews={rows}
          showOwner
          deletingId={deletingId}
          onDelete={remove}
        />
      )}
    </div>
  );
}

function SharedMapList({
  previews,
  showOwner,
  deletingId,
  onDelete,
}: {
  previews: AdminSharedMap[];
  showOwner: boolean;
  deletingId: string | null;
  onDelete: (preview: AdminSharedMap) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {previews.map((preview) => {
        const url = sharedMapUrl(preview.slug);
        return (
          <li
            key={preview.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-700 bg-ink-800 p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-slate-200">
                {preview.title || "Untitled"}
                {preview.artist && (
                  <span className="text-slate-500"> - {preview.artist}</span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {showOwner && (
                  <>
                    owner{" "}
                    {preview.owner_osu_id ? (
                      <a
                        href={`https://osu.ppy.sh/users/${preview.owner_osu_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        {preview.owner_username ?? preview.owner.slice(0, 8)}
                      </a>
                    ) : (
                      (preview.owner_username ?? preview.owner.slice(0, 8))
                    )}
                    {" · "}
                  </>
                )}
                published {new Date(preview.created_at).toLocaleString()}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-accent hover:underline"
                >
                  /m/{preview.slug}
                </a>
                <span>last view {formatMoment(preview.last_viewed_at)}</span>
                <span>{Number(preview.views).toLocaleString()} views</span>
                <span>{formatBytes(Number(preview.asset_bytes))}</span>
                <span>
                  {Number(preview.asset_count)}{" "}
                  {Number(preview.asset_count) === 1 ? "file" : "files"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-white/10 bg-ink-700 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
              >
                Open
              </a>
              <Button
                disabled={deletingId !== null}
                onClick={() => onDelete(preview)}
              >
                {deletingId === preview.id ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type ProjectSort =
  | "last_activity"
  | "updated"
  | "storage"
  | "participants"
  | "title";

function compareProjects(
  a: AdminProject,
  b: AdminProject,
  sort: ProjectSort,
): number {
  if (sort === "title") {
    return (a.title || "Untitled").localeCompare(b.title || "Untitled");
  }
  if (sort === "storage") return Number(b.asset_bytes) - Number(a.asset_bytes);
  if (sort === "participants") {
    return Number(b.participant_count) - Number(a.participant_count);
  }
  if (sort === "updated") {
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  }
  return (
    new Date(b.last_activity_at).getTime() -
    new Date(a.last_activity_at).getTime()
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function FeatureFlagsSection() {
  const [rows, setRows] = useState<FeatureFlagRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async () => {
    try {
      setRows(await listFeatureFlags());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load feature flags.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggle = async (row: FeatureFlagRow) => {
    if (busyKey) return;
    if (
      row.enabled &&
      !window.confirm(
        `Disable "${row.key}" for every user right now? Open editors react within seconds.`,
      )
    ) {
      return;
    }
    setBusyKey(row.key);
    try {
      await setFeatureFlag(row.key, !row.enabled);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the flag.");
    } finally {
      setBusyKey(null);
    }
  };

  const labelFor = (key: string) =>
    FEATURE_FLAG_INFO.find((f) => f.key === key)?.label ?? key;

  return (
    <section className="rounded-xl border border-ink-600 bg-ink-800 p-5">
      <h2 className="text-sm font-semibold text-slate-100">Feature flags</h2>
      <p className="mt-1 text-sm text-slate-400">
        Kill switches for every user, no redeploy needed. Clients fail open: if
        this table is unreachable, everything stays enabled.
      </p>
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      {!rows && !error && (
        <SkeletonRows
          count={4}
          className="mt-4"
          label="Loading feature flags"
        />
      )}
      <div className="mt-4 flex flex-col gap-3">
        {rows?.map((row) => (
          <div
            key={row.key}
            className="flex items-start justify-between gap-4 rounded-lg border border-ink-600/70 bg-ink-700/30 p-3"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-100">
                  {labelFor(row.key)}
                </span>
                <code className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                  {row.key}
                </code>
              </div>
              {row.description && (
                <p className="mt-0.5 text-xs text-slate-400">
                  {row.description}
                </p>
              )}
            </div>
            <button
              role="switch"
              aria-checked={row.enabled}
              disabled={busyKey === row.key}
              onClick={() => void toggle(row)}
              className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${
                row.enabled ? "bg-accent" : "bg-ink-600"
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                  row.enabled ? "left-6" : "left-1"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsTab({
  invisible,
  onToggle,
}: {
  invisible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex max-w-xl flex-col gap-5">
      <FeatureFlagsSection />
      <section className="rounded-xl border border-ink-600 bg-ink-800 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Invisible mode
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Join live sessions without broadcasting your presence. Other people
              in the map won't see your avatar, cursor or playhead, and you won't
              show up in the peer list or trigger a “joined the session” notice.
              You can still see everyone else and edit as normal.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={invisible}
            onClick={onToggle}
            className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition ${
              invisible ? "bg-accent" : "bg-ink-600"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                invisible ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              invisible ? "bg-emerald-400" : "bg-slate-500"
            }`}
          />
          <span className="text-slate-400">
            {invisible
              ? "You are currently invisible in live sessions."
              : "You are visible in live sessions."}
          </span>
        </div>
      </section>
    </div>
  );
}

function FeedbackTab() {
  const [items, setItems] = useState<Feedback[] | null>(null);
  const { error, setError, wrap } = useAsyncError();

  const load = useCallback(() => {
    setItems(null);
    setError(null);
    listFeedback()
      .then(setItems)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load feedback."),
      );
  }, [setError]);

  useEffect(load, [load]);

  const updateStatus = (item: Feedback, status: FeedbackStatus) =>
    void wrap(async () => {
      await setFeedbackStatus(item.id, status);
      setItems(
        (prev) =>
          prev?.map((x) => (x.id === item.id ? { ...x, status } : x)) ?? null,
      );
    });

  return (
    <div>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!items && !error && (
        <SkeletonRows
          count={3}
          lines={3}
          action={false}
          label="Loading feedback"
        />
      )}
      {items && items.length === 0 && (
        <p className="text-sm text-slate-400">No feedback yet.</p>
      )}
      {items && items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-ink-600 bg-ink-800 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {item.author_osu_id ? (
                  <a
                    href={`https://osu.ppy.sh/users/${item.author_osu_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-accent hover:underline"
                  >
                    {item.author_username ?? "unknown"}
                  </a>
                ) : (
                  <span>{item.author_username ?? "unknown"}</span>
                )}
                <span>{new Date(item.created_at).toLocaleString()}</span>
                <span className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                  {item.status}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-200">
                {item.body}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["open", "reviewed", "closed"] as FeedbackStatus[]).map(
                  (status) => (
                    <Button
                      key={status}
                      variant={item.status === status ? "accent" : "ghost"}
                      onClick={() => updateStatus(item, status)}
                      disabled={item.status === status}
                    >
                      {status}
                    </Button>
                  ),
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationsTab() {
  const [title, setTitle] = useState(`Cascade v${__APP_VERSION__}`);
  const [body, setBody] = useState("");
  const [version, setVersion] = useState(__APP_VERSION__);
  const [actionUrl, setActionUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const publish = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("A title is required.");
      return;
    }
    if (
      !window.confirm(
        "Send this update to every Cascade account? It will appear as unread in each notification inbox.",
      )
    ) {
      return;
    }
    setPublishing(true);
    setError(null);
    setResult(null);
    try {
      const recipients = await publishAppUpdate({
        title: trimmedTitle,
        body,
        version,
        actionUrl,
      });
      setResult(
        `Published to ${recipients} ${recipients === 1 ? "account" : "accounts"}.`,
      );
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Couldn't publish the update.",
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <section className="rounded-xl border border-ink-600 bg-ink-800 p-5">
        <h2 className="text-sm font-semibold text-slate-100">
          Publish app update
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Sends a durable inbox notice to every account, shown as coming from
          you. Reusing a version updates that version's existing notice instead
          of creating duplicates.
        </p>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Title
            </span>
            <TextInput
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Cascade update"
              maxLength={120}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Message
            </span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What's new?"
              rows={5}
              maxLength={2000}
              className="resize-y rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 outline-none shadow-inner shadow-black/10 transition placeholder:text-slate-600 focus:border-accent/70 focus:ring-1 focus:ring-accent/40"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Version / unique key
              </span>
              <TextInput
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="1.2.123"
                maxLength={80}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Optional link
              </span>
              <TextInput
                type="url"
                value={actionUrl}
                onChange={(event) => setActionUrl(event.target.value)}
                placeholder="https://..."
              />
            </label>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
        {result && <p className="mt-4 text-sm text-emerald-300">{result}</p>}

        <div className="mt-5 flex justify-end">
          <Button
            variant="accent"
            disabled={publishing || !title.trim()}
            onClick={() => void publish()}
          >
            {publishing ? "Publishing…" : "Publish update"}
          </Button>
        </div>
      </section>
    </div>
  );
}
