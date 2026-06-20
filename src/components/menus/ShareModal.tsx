import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button, TextInput } from "../ui/Controls";
import {
  listCollaborators,
  addCollaborator,
  setCollaboratorRole,
  removeCollaborator,
  type Collaborator,
  type CollabRole,
} from "../../lib/collab";

/**
 * Owner-only sharing panel: invite osu! users by username, grant Editor/Viewer,
 * change roles, or remove collaborators. Role changes propagate live to active
 * sessions via the project_collaborators Realtime subscription (see useCollab).
 */
export function ShareModal({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
}) {
  const [list, setList] = useState<Collaborator[] | null>(null);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<CollabRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    if (!projectId) return;
    listCollaborators(projectId)
      .then(setList)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load."),
      );
  };

  useEffect(() => {
    if (!open || !projectId) return;
    setList(null);
    setError(null);
    setUsername("");
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const invite = async () => {
    if (!projectId || !username.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addCollaborator(projectId, username.trim(), role);
      setUsername("");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to invite.");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = (c: Collaborator, next: CollabRole) =>
    void (async () => {
      if (!projectId) return;
      try {
        await setCollaboratorRole(projectId, c.user_id, next);
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update role.");
      }
    })();

  const remove = (c: Collaborator) =>
    void (async () => {
      if (!projectId) return;
      if (!window.confirm(`Remove ${c.username ?? "this user"}?`)) return;
      try {
        await removeCollaborator(projectId, c.user_id);
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove.");
      }
    })();

  return (
    <Modal open={open} title="Share & collaborate" onClose={onClose} width="max-w-lg">
      {!projectId ? (
        <p className="text-sm text-slate-400">
          Save this map to your account first (“Save to cloud”), then you can
          invite collaborators.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Invite by osu! username
              </span>
              <TextInput
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void invite()}
                placeholder="osu! username"
              />
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as CollabRole)}
              className="rounded-lg border border-ink-500/60 bg-ink-700 px-2 py-2 text-sm text-slate-100"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button variant="accent" onClick={() => void invite()} disabled={busy}>
              {busy ? "…" : "Invite"}
            </Button>
          </div>

          <p className="text-[11px] text-slate-500">
            The person must have signed in to the editor at least once before they
            can be invited.
          </p>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Collaborators
            </div>
            {!list && <p className="text-sm text-slate-400">Loading…</p>}
            {list && list.length === 0 && (
              <p className="text-sm text-slate-400">No collaborators yet.</p>
            )}
            {list && list.length > 0 && (
              <ul className="flex flex-col gap-2">
                {list.map((c) => (
                  <li
                    key={c.user_id}
                    className="flex items-center gap-3 rounded-lg border border-ink-600 bg-ink-700/40 p-2"
                  >
                    {c.avatar_url && (
                      <img
                        src={c.avatar_url}
                        alt=""
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                      {c.username ?? c.user_id.slice(0, 8)}
                    </span>
                    <select
                      value={c.role}
                      onChange={(e) =>
                        changeRole(c, e.target.value as CollabRole)
                      }
                      className="rounded-md border border-ink-500/60 bg-ink-700 px-2 py-1 text-xs text-slate-100"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <Button onClick={() => remove(c)}>Remove</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
