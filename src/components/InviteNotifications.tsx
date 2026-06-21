import { Button } from "./ui/Controls";

/** A pending "you've been invited to a map" notification. */
export type InviteNotice = {
  /** The invited project's id (also used as the notice key). */
  projectId: string;
  /** Map title. */
  title: string;
  /** Who invited you (the map owner), if known. */
  who: string | null;
  /** Inviter avatar URL, if known. */
  avatar: string | null;
};

/**
 * Global, always-on-top stack of mapping-invitation notifications. Rendered at
 * the app root so it shows wherever the user is. Each card animates in and
 * offers Join (open the map) or Ignore (dismiss).
 */
export function InviteNotifications({
  notices,
  onJoin,
  onIgnore,
}: {
  notices: InviteNotice[];
  onJoin: (n: InviteNotice) => void;
  onIgnore: (n: InviteNotice) => void;
}) {
  if (!notices.length) return null;
  return (
    <div className="fixed right-4 top-4 z-[70] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {notices.map((n) => (
        <div
          key={n.projectId}
          className="notif-in flex flex-col gap-3 rounded-xl border border-white/10 bg-ink-800/95 p-3 shadow-2xl backdrop-blur-2xl"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-ink-700 text-sm">
              {n.avatar ? (
                <img
                  src={n.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                "✉"
              )}
            </span>
            <div className="min-w-0 text-sm">
              <div className="font-semibold text-slate-100">
                Mapping invitation
              </div>
              <div className="truncate text-xs text-slate-400">
                {n.who ? `${n.who} invited you to ` : "You were invited to "}
                <span className="text-slate-200">{n.title}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onIgnore(n)}>
              Ignore
            </Button>
            <Button variant="accent" onClick={() => onJoin(n)}>
              Join
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
