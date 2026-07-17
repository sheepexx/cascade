import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Controls";
import { PatternPreview } from "../ui/PatternPreview";
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
  getAdminStats,
  listAllUsers,
  setUserAdmin,
  listAllProjects,
  deleteProjectAdmin,
  type AdminStats,
  type AdminUser,
  type AdminProject,
} from "../../lib/admin";
import {
  listFeedback,
  setFeedbackStatus,
  type Feedback,
  type FeedbackStatus,
} from "../../lib/feedback";

type Tab = "stats" | "presets" | "users" | "projects" | "feedback" | "invisible";

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
      <header className="flex items-center justify-between border-b border-ink-600 bg-ink-800 px-5 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-slate-100">Admin</h1>
          <nav className="flex items-center gap-1">
            {(["stats", "presets", "users", "projects", "feedback", "invisible"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-sm capitalize transition ${
                  tab === t
                    ? "bg-ink-600 text-slate-100"
                    : "text-slate-300 hover:bg-ink-700"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
        <Button onClick={onClose}>Close</Button>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "stats" && <StatsTab />}
        {tab === "presets" && <PresetsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "projects" && <ProjectsTab />}
        {tab === "feedback" && <FeedbackTab />}
        {tab === "invisible" && (
          <InvisibleTab invisible={invisible} onToggle={onToggleInvisible} />
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
  const { error, setError } = useAsyncError();

  useEffect(() => {
    setStats(null);
    setError(null);
    getAdminStats()
      .then(setStats)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load stats."),
      );
  }, [setError]);

  return (
    <div>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!stats && !error && (
        <p className="text-sm text-slate-400">Loading...</p>
      )}
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
      {!presets && <p className="text-sm text-slate-400">Loading…</p>}
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

function UsersTab() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const { error, setError, wrap } = useAsyncError();

  useEffect(() => {
    listAllUsers()
      .then(setUsers)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load."),
      );
  }, [setError]);

  const toggle = (u: AdminUser) =>
    void wrap(async () => {
      await setUserAdmin(u.id, !u.is_admin);
      setUsers(
        (prev) =>
          prev?.map((x) =>
            x.id === u.id ? { ...x, is_admin: !u.is_admin } : x,
          ) ?? null,
      );
    });

  return (
    <div>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!users && <p className="text-sm text-slate-400">Loading…</p>}
      {users && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2">User</th>
              <th className="py-2">osu! id</th>
              <th className="py-2">Joined</th>
              <th className="py-2">Last signed in</th>
              <th className="py-2">Admin</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-ink-700">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://osu.ppy.sh/users/${u.osu_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 items-center gap-2 text-slate-200 transition hover:text-accent"
                    >
                      {u.avatar_url && (
                        <img
                          src={u.avatar_url}
                          alt=""
                          className="h-6 w-6 rounded-full object-cover"
                        />
                      )}
                      <span className="truncate font-medium">{u.username}</span>
                    </a>
                  </div>
                </td>
                <td className="py-2 text-slate-400">{u.osu_id}</td>
                <td className="py-2 text-slate-500">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="py-2 text-slate-500">
                  {formatLastSignedIn(u.last_signed_in_at)}
                </td>
                <td className="py-2">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatLastSignedIn(value: string | null): string {
  if (!value) return "Not tracked yet";
  return new Date(value).toLocaleString();
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
      if (!window.confirm("Delete this project permanently?")) return;
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
      {!projects && <p className="text-sm text-slate-400">Loading…</p>}
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

function InvisibleTab({
  invisible,
  onToggle,
}: {
  invisible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="max-w-xl">
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
        <p className="text-sm text-slate-400">Loading...</p>
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
