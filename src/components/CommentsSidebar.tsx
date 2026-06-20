import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/Controls";
import {
  listComments,
  addComment,
  resolveComment,
  deleteComment,
  subscribeComments,
  type Comment,
} from "../lib/comments";

/** Format ms as m:ss:mmm (osu! timestamp style). */
function fmt(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const t = Math.abs(Math.round(ms));
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const milli = t % 1000;
  return `${sign}${m}:${String(s).padStart(2, "0")}:${String(milli).padStart(3, "0")}`;
}

/**
 * Google-Docs-style threaded, resolvable comments anchored to song timestamps.
 * Lives as a right-side drawer; markers also show on the bottom timeline.
 */
export function CommentsSidebar({
  open,
  onClose,
  projectId,
  me,
  currentTimeMs,
  activeDiffId,
  onSeek,
  canModerate,
  onCommentsChange,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  me: { id: string; username: string; osu_id: number };
  currentTimeMs: number;
  activeDiffId: string;
  onSeek: (ms: number) => void;
  canModerate: boolean;
  /** Notifies the parent of the latest comments (for timeline markers). */
  onCommentsChange?: (comments: Comment[]) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [hideResolved, setHideResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    listComments(projectId)
      .then((c) => {
        setComments(c);
        onCommentsChange?.(c);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load comments."),
      );

  useEffect(() => {
    if (!projectId) return;
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
      .filter((r) => !hideResolved || !r.resolved)
      .map((root) => ({ root, replies: repliesByParent.get(root.id) ?? [] }));
  }, [comments, hideResolved]);

  const post = async (text: string, parentId: string | null, timeMs: number) => {
    if (!text.trim()) return;
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
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post.");
    }
  };

  const canModify = (c: Comment) => canModerate || c.author === me.id;

  // Stays mounted (hidden when closed) so its subscription keeps the timeline
  // comment markers up to date even while the panel isn't shown.
  return (
    <div
      className={`absolute right-0 top-0 z-40 flex h-full w-80 flex-col border-l border-ink-600 bg-ink-800/95 backdrop-blur ${
        open ? "" : "hidden"
      }`}
    >
      <header className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">Comments</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={hideResolved}
              onChange={(e) => setHideResolved(e.target.checked)}
            />
            Hide resolved
          </label>
          <button
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-ink-600 hover:text-slate-200"
          >
            ✕
          </button>
        </div>
      </header>

      {/* New comment at playhead */}
      <div className="border-b border-ink-600 p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          rows={2}
          className="w-full resize-none rounded-lg border border-ink-500/60 bg-ink-700 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-accent/70"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            at {fmt(currentTimeMs)}
          </span>
          <Button
            variant="accent"
            onClick={() =>
              void post(body, null, currentTimeMs).then(() => setBody(""))
            }
            disabled={!body.trim()}
          >
            Comment
          </Button>
        </div>
      </div>

      {error && <p className="px-3 pt-2 text-xs text-rose-400">{error}</p>}

      <div className="flex-1 overflow-y-auto p-3">
        {threads.length === 0 && (
          <p className="text-sm text-slate-500">No comments yet.</p>
        )}
        <div className="flex flex-col gap-3">
          {threads.map(({ root, replies }) => (
            <CommentThread
              key={root.id}
              root={root}
              replies={replies}
              onSeek={onSeek}
              onReply={(text) => post(text, root.id, root.time_ms)}
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
  onSeek,
  onReply,
  onResolve,
  onDelete,
  canModify,
}: {
  root: Comment;
  replies: Comment[];
  onSeek: (ms: number) => void;
  onReply: (text: string) => Promise<void> | void;
  onResolve: (resolved: boolean) => void;
  onDelete: (id: string) => void;
  canModify: (c: Comment) => boolean;
}) {
  const [reply, setReply] = useState("");
  return (
    <div
      className={`rounded-lg border p-2 ${
        root.resolved
          ? "border-ink-700 bg-ink-800/40 opacity-70"
          : "border-ink-600 bg-ink-700/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <button
          onClick={() => onSeek(root.time_ms)}
          className="font-mono text-[11px] text-accent hover:underline"
        >
          {fmt(root.time_ms)}
        </button>
        <div className="flex items-center gap-1">
          {canModify(root) && (
            <button
              onClick={() => onResolve(!root.resolved)}
              className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-ink-600 hover:text-slate-200"
            >
              {root.resolved ? "Reopen" : "Resolve"}
            </button>
          )}
          {canModify(root) && (
            <button
              onClick={() => onDelete(root.id)}
              className="rounded px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-ink-600"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      <CommentBody c={root} />
      {replies.map((r) => (
        <div key={r.id} className="mt-1.5 border-l-2 border-ink-600 pl-2">
          <CommentBody c={r} />
          {canModify(r) && (
            <button
              onClick={() => onDelete(r.id)}
              className="text-[10px] text-rose-300/80 hover:underline"
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
              void Promise.resolve(onReply(reply)).then(() => setReply(""));
            }
          }}
          placeholder="Reply…"
          className="flex-1 rounded border border-ink-500/60 bg-ink-700 px-2 py-1 text-xs text-slate-100 outline-none focus:border-accent/70"
        />
      </div>
    </div>
  );
}

function CommentBody({ c }: { c: Comment }) {
  return (
    <div className="mt-1">
      <div className="text-[11px] font-medium text-slate-300">
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
      </div>
      <div className="whitespace-pre-wrap break-words text-sm text-slate-200">
        {c.body}
      </div>
    </div>
  );
}
