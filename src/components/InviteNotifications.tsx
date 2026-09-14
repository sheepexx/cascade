import { Button } from "./ui/Controls";
import { TimedNotification } from "./ui/TimedNotification";
import { MailIcon } from "./ui/Icons";

export type InviteNotice = {
  notificationId?: string;
  projectId: string;
  title: string;
  who: string | null;
  avatar: string | null;
};

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
        <TimedNotification
          key={n.projectId}
          durationMs={10000}
          placement="right"
          resetKey={n.projectId}
          onDismiss={() => onIgnore(n)}
          progressClassName="bg-accent"
          className="flex flex-col gap-3 rounded-xl border border-white/10 bg-ink-800/95 p-3 pb-4 shadow-2xl backdrop-blur-2xl"
        >
          {({ dismiss }) => (
            <>
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-ink-700 text-sm">
              {n.avatar ? (
                <img
                  src={n.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <MailIcon className="h-4 w-4 text-slate-300" />
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
            <Button variant="ghost" onClick={() => dismiss()}>
              Ignore
            </Button>
            <Button variant="accent" onClick={() => dismiss(() => onJoin(n))}>
              Join
            </Button>
          </div>
            </>
          )}
        </TimedNotification>
      ))}
    </div>
  );
}
