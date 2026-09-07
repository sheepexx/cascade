import { useEffect, useMemo, useState } from "react";
import { Button, Toggle } from "./ui/Controls";
import { HoldConfirmDialog } from "./ui/HoldConfirmDialog";
import { SkeletonRows } from "./ui/Skeleton";
import { CloseIcon } from "./ui/Icons";
import {
  listComments,
  addComment,
  resolveComment,
  updateComment,
  deleteComment,
  subscribeComments,
  type Comment,
} from "../lib/comments";

function fmt(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const t = Math.abs(Math.round(ms));
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const milli = t % 1000;
  return `${sign}${m}:${String(s).padStart(2, "0")}:${String(milli).padStart(3, "0")}`;
}

function readLocal(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeLocal(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Comments still work when private-mode storage is unavailable.
  }
}

export function CommentsSidebar({
  open,
  onClose,
  projectId,
  me,
  currentTimeMs,
  activeDiffId,
  difficulties,
  onSeek,
  canModerate,
  ownerId,
  onCommentsChange,
  onUnreadCountChange,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  me: { id: string; username: string; osu_id: number };
  currentTimeMs: number;
  activeDiffId: string;
  difficulties: { id: string; name: string }[];
  onSeek: (ms: number) => void;
  canModerate: boolean;
  ownerId: string | null;
  onCommentsChange?: (comments: Comment[]) => void;
  onUnreadCountChange?: (count: number) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [hideResolved, setHideResolved] = useState(false);
  const [scope, setScope] = useState<"active" | "all">("active");
  const [seenAt, setSeenAt] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seenKey = `cascade:comments-seen:${projectId}`;
  const draftKey = `cascade:comment-draft:${projectId}:${activeDiffId}`;

  useEffect(() => {
    setSeenAt(readLocal(seenKey));
  }, [seenKey]);

  useEffect(() => {
    setBody(readLocal(draftKey));
  }, [draftKey]);

  const reload = () =>
    listComments(projectId)
      .then((c) => {
        setComments(c);
        onCommentsChange?.(c);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load comments."),
      )
      .finally(() => setLoaded(true));

  useEffect(() => {
    if (!projectId) return;
    setLoaded(false);
    reload();
    const unsub = subscribeComments(projectId, reload);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const threads = useMemo(() => {
    const roots = comments.filter((c) => !c.parent_id);
    const repliesByParent = new Map<string, Comment[]>();
    for (const c of comments) {
      if (!c.parent_id) continue;
      const arr = repliesByParent.get(c.parent_id) ?? [];
      arr.push(c);
      repliesByParent.set(c.parent_id, arr);
    }
    return roots
      .filter((r) => scope === "all" || r.difficulty_id === activeDiffId)
      .filter((r) => !hideResolved || !r.resolved)
      .map((root) => ({
        root,
        replies: repliesByParent.get(root.id) ?? [],
      }));
  }, [comments, hideResolved, scope, activeDiffId]);

  const unreadIds = useMemo(
    () =>
      new Set(
        comments
          .filter((c) => c.author !== me.id && (!seenAt || c.created_at > seenAt))
          .map((c) => c.id),
      ),
    [comments, me.id, seenAt],
  );

  useEffect(() => {
    onUnreadCountChange?.(unreadIds.size);
  }, [onUnreadCountChange, unreadIds]);

  useEffect(() => {
    if (!open || !unreadIds.size || !comments.length) return;
    const id = window.setTimeout(() => {
      const latest = comments.reduce(
        (value, c) => (c.created_at > value ? c.created_at : value),
        "",
      );
      if (!latest) return;
      writeLocal(seenKey, latest);
      setSeenAt(latest);
    }, 1200);
    return () => window.clearTimeout(id);
  }, [open, unreadIds, comments, seenKey]);

  const post = async (
    text: string,
    parentId: string | null,
    timeMs: number,
  ): Promise<boolean> => {
    if (!text.trim()) return false;
    setError(null);
    try {
      await addComment({
        projectId,
        authorId: me.id,
        authorUsername: me.username,
        authorOsuId: me.osu_id,
        timeMs,
        body: text.trim(),
        difficultyId: activeDiffId,
        parentId,
      });
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post.");
      return false;
    }
  };

  const edit = async (id: string, text: string): Promise<boolean> => {
    try {
      setError(null);
      await updateComment(id, text);
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to edit.");
      return false;
    }
  };

  const canModify = (c: Comment) => canModerate || c.author === me.id;
  const canEditComment = (c: Comment) => c.author === me.id;

  return (
    <div
      className={`absolute right-0 top-0 z-40 flex h-full w-80 flex-col border-l border-ink-600 bg-ink-800/95 backdrop-blur ${
        open ? "" : "hidden"
      }`}
    >
      <header className="border-b border-ink-600 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            Comments
            {unreadIds.size > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-ink-900">
                {unreadIds.size}
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded text-slate-400 transition hover:bg-ink-600 hover:text-slate-200"
            aria-label="Close comments"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex rounded-md border border-ink-600 bg-ink-700/60 p-0.5 text-[10px]">
            {(["active", "all"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setScope(value)}
                className={`rounded px-2 py-1 transition ${
                  scope === value
                    ? "bg-accent text-ink-900"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {value === "active" ? "This difficulty" : "All"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Toggle
              size="sm"
              checked={hideResolved}
              onChange={setHideResolved}
              aria-label="Hide resolved comments"
            />
            Hide resolved
          </div>
        </div>
      </header>

      <div className="border-b border-ink-600 p-3">
        <textarea
          value={body}
          onChange={(e) => {
            const value = e.target.value;
            setBody(value);
            writeLocal(draftKey, value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void post(body, null, currentTimeMs).then((posted) => {
                if (posted) {
                  writeLocal(draftKey, "");
                  setBody("");
                }
              });
            }
          }}
          placeholder="Add a comment…"
          rows={2}
          className="w-full resize-none rounded-lg border border-ink-500/60 bg-ink-700 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-accent/70"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            at {fmt(currentTimeMs)} · Ctrl+Enter
          </span>
          <Button
            variant="accent"
            onClick={() =>
              void post(body, null, currentTimeMs).then((posted) => {
                if (posted) {
                  writeLocal(draftKey, "");
                  setBody("");
                }
              })
            }
            disabled={!body.trim()}
          >
            Comment
          </Button>
        </div>
      </div>

      {error && <p className="px-3 pt-2 text-xs text-rose-400">{error}</p>}

      <div className="flex-1 overflow-y-auto p-3">
        {!loaded && !error && (
          <SkeletonRows
            count={3}
            lines={3}
            action={false}
            label="Loading comments"
          />
        )}
        {loaded && threads.length === 0 && (
          <p className="text-sm text-slate-500">
            {scope === "active"
              ? "No comments on this difficulty."
              : "No comments yet."}
          </p>
        )}
        <div className="flex flex-col gap-3">
          {threads.map(({ root, replies }) => (
            <CommentThread
              key={root.id}
              root={root}
              replies={replies}
              ownerId={ownerId}
              difficultyName={
                difficulties.find((d) => d.id === root.difficulty_id)?.name ??
                "Project"
              }
              showDifficulty={scope === "all"}
              unread={
                unreadIds.has(root.id) || replies.some((r) => unreadIds.has(r.id))
              }
              onSeek={onSeek}
              onReply={(text) => post(text, root.id, root.time_ms)}
              onEdit={edit}
              onResolve={(v) =>
                void resolveComment(root.id, v)
                  .then(reload)
                  .catch(() => setError("Couldn't update."))
              }
              onDelete={(id) =>
                void deleteComment(id)
                  .then(reload)
                  .catch(() => setError("Couldn't delete."))
              }
              canModify={canModify}
              canEditComment={canEditComment}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CommentThread({
  root,
  replies,
  ownerId,
  difficultyName,
  showDifficulty,
  unread,
  onSeek,
  onReply,
  onEdit,
  onResolve,
  onDelete,
  canModify,
  canEditComment,
}: {
  root: Comment;
  replies: Comment[];
  ownerId: string | null;
  difficultyName: string;
  showDifficulty: boolean;
  unread: boolean;
  onSeek: (ms: number) => void;
  onReply: (text: string) => Promise<boolean>;
  onEdit: (id: string, text: string) => Promise<boolean>;
  onResolve: (resolved: boolean) => void;
  onDelete: (id: string) => void;
  canModify: (c: Comment) => boolean;
  canEditComment: (c: Comment) => boolean;
}) {
  const [reply, setReply] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    isReply: boolean;
  } | null>(null);
  return (
    <div
      className={`relative rounded-lg border p-2 ${
        root.resolved
          ? "border-ink-700 bg-ink-800/40 opacity-70"
          : unread
            ? "border-accent/60 bg-accent/[0.06]"
            : "border-ink-600 bg-ink-700/40"
      }`}
    >
      {unread && (
        <span
          className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-ink-800 bg-accent"
          title="Unread activity"
        />
      )}
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            onClick={() => onSeek(root.time_ms)}
            className="shrink-0 font-mono text-[11px] text-accent hover:underline"
          >
            {fmt(root.time_ms)}
          </button>
          {showDifficulty && (
            <span
              className="truncate rounded bg-ink-600/80 px-1.5 py-0.5 text-[9px] text-slate-300"
              title={difficultyName}
            >
              {difficultyName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {canModify(root) && (
            <button
              onClick={() => onResolve(!root.resolved)}
              className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 transition duration-150 hover:bg-ink-600 hover:text-slate-200"
            >
              {root.resolved ? "Reopen" : "Resolve"}
            </button>
          )}
          {canModify(root) && (
            <button
              onClick={() => setPendingDelete({ id: root.id, isReply: false })}
              className="rounded px-1.5 py-0.5 text-[10px] text-rose-300 transition duration-150 hover:bg-ink-600"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      <CommentBody
        c={root}
        ownerId={ownerId}
        canEdit={canEditComment(root)}
        onEdit={onEdit}
      />
      {replies.map((r) => (
        <div key={r.id} className="mt-1.5 border-l-2 border-ink-600 pl-2">
          <CommentBody
            c={r}
            ownerId={ownerId}
            canEdit={canEditComment(r)}
            onEdit={onEdit}
          />
          {canModify(r) && (
            <button
              onClick={() => setPendingDelete({ id: r.id, isReply: true })}
              className="rounded px-1 text-[10px] text-rose-300/80 hover:underline"
            >
              delete
            </button>
          )}
        </div>
      ))}
      <div className="mt-2 flex gap-1">
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && reply.trim()) {
              void onReply(reply).then((posted) => {
                if (posted) setReply("");
              });
            }
          }}
          placeholder="Reply…"
          className="flex-1 rounded border border-ink-500/60 bg-ink-700 px-2 py-1 text-xs text-slate-100 outline-none focus:border-accent/70"
        />
      </div>

      <HoldConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.isReply ? "Delete reply?" : "Delete comment?"}
        message={
          pendingDelete?.isReply
            ? "This reply will be permanently deleted."
            : "This comment and its replies will be permanently deleted."
        }
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function CommentBody({
  c,
  ownerId,
  canEdit,
  onEdit,
}: {
  c: Comment;
  ownerId: string | null;
  canEdit: boolean;
  onEdit: (id: string, text: string) => Promise<boolean>;
}) {
  const isHost = !!ownerId && c.author === ownerId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);

  useEffect(() => {
    if (!editing) setDraft(c.body);
  }, [c.body, editing]);

  const save = () => {
    if (!draft.trim()) return;
    void onEdit(c.id, draft).then((saved) => {
      if (saved) setEditing(false);
    });
  };

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
        {c.author_osu_id ? (
          <a
            href={`https://osu.ppy.sh/users/${c.author_osu_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {c.author_username ?? "unknown"}
          </a>
        ) : (
          (c.author_username ?? "unknown")
        )}
        {isHost && (
          <span className="rounded bg-accent/20 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
            Host
          </span>
        )}
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="ml-auto text-[9px] font-normal text-slate-500 transition duration-150 hover:text-slate-300"
          >
            edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                setDraft(c.body);
                setEditing(false);
              }
            }}
            rows={2}
            className="w-full resize-none rounded border border-ink-500/60 bg-ink-700 px-2 py-1 text-xs text-slate-100 outline-none focus:border-accent/70"
          />
          <div className="mt-1 flex justify-end gap-1">
            <button
              onClick={() => {
                setDraft(c.body);
                setEditing(false);
              }}
              className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 transition duration-150 hover:bg-ink-600"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!draft.trim()}
              className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-ink-900 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="whitespace-pre-wrap break-words text-sm text-slate-200">
          {c.body}
        </div>
      )}
    </div>
  );
}
