import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/Controls";
import { PatternPreview } from "../ui/PatternPreview";
import { useAuth } from "../../lib/auth";
import {
  listPresetsByStatus,
  setPresetStatus,
  deletePreset,
  type Preset,
  type PresetStatus,
} from "../../lib/presets";
import {
  listAllUsers,
  setUserAdmin,
  listAllProjects,
  deleteProjectAdmin,
  type AdminUser,
  type AdminProject,
} from "../../lib/admin";

type Tab = "presets" | "users" | "projects";

/**
 * Full-screen admin overlay. Only rendered for admins; every action is
 * additionally enforced by RLS server-side. No router is used in this app, so
 * this opens over the editor rather than at a /admin route.
 */
export function AdminPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("presets");

  if (!open || !isAdmin) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink-900">
      <header className="flex items-center justify-between border-b border-ink-600 bg-ink-800 px-5 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-slate-100">Admin</h1>
          <nav className="flex items-center gap-1">
            {(["presets", "users", "projects"] as Tab[]).map((t) => (
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
        {tab === "presets" && <PresetsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "projects" && <ProjectsTab />}
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

// ---- Presets moderation ----------------------------------------------------

function PresetsTab() {
  const [status, setStatus] = useState<PresetStatus>("pending");
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const { error, setError, wrap } = useAsyncError();

  const load = useCallback(() => {
    setPresets(null);
    setError(null);
    listPresetsByStatus(status)
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
        {(["pending", "approved", "rejected"] as PresetStatus[]).map((s) => (
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
                </div>
                {p.description && (
                  <p className="mt-1 text-xs text-slate-400">{p.description}</p>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  {status !== "approved" && (
                    <Button
                      variant="accent"
                      onClick={() => moderate(p.id, "approved")}
                    >
                      Approve
                    </Button>
                  )}
                  {status !== "rejected" && (
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

// ---- Users -----------------------------------------------------------------

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
              <th className="py-2">Admin</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-ink-700">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    {u.avatar_url && (
                      <img
                        src={u.avatar_url}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    )}
                    <span className="text-slate-200">{u.username}</span>
                  </div>
                </td>
                <td className="py-2 text-slate-400">{u.osu_id}</td>
                <td className="py-2 text-slate-500">
                  {new Date(u.created_at).toLocaleDateString()}
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

// ---- Projects --------------------------------------------------------------

function ProjectsTab() {
  const [projects, setProjects] = useState<AdminProject[] | null>(null);
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

  return (
    <div>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!projects && <p className="text-sm text-slate-400">Loading…</p>}
      {projects && projects.length === 0 && (
        <p className="text-sm text-slate-400">No projects.</p>
      )}
      {projects && projects.length > 0 && (
        <ul className="flex flex-col gap-2">
          {projects.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-800 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-200">
                  {p.title || "Untitled"}
                  <span className="text-slate-500"> — {p.artist}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  owner {p.owner.slice(0, 8)}… · saved{" "}
                  {new Date(p.updated_at).toLocaleString()}
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
