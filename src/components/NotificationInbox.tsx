import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InboxNotification } from "../lib/notifications";

export function NotificationInbox({
  notifications,
  loading,
  error,
  onRefresh,
  onOpen,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
}: {
  notifications: InboxNotification[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
  onOpen: (notification: InboxNotification) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 8 });
  const unread = notifications.filter((item) => !item.read_at).length;

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    onRefresh();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open, onRefresh]);

  const choose = (notification: InboxNotification) => {
    setOpen(false);
    onOpen(notification);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
        onClick={() => setOpen((value) => !value)}
        className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition ${
          open
            ? "border-accent/70 bg-ink-700 text-slate-100"
            : "border-ink-500/60 bg-ink-700/60 text-slate-300 hover:border-accent/60 hover:bg-ink-700 hover:text-slate-100"
        }`}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold leading-4 text-white shadow-lg shadow-black/30">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notification inbox"
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-[110] flex max-h-[min(36rem,calc(100vh-5rem))] w-96 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-ink-500/70 bg-ink-800/[0.98] shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-ink-600 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Notifications
                </h2>
                <p className="text-[11px] text-slate-500">
                  {unread > 0
                    ? `${unread} unread`
                    : "You're all caught up"}
                </p>
              </div>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="rounded-md px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/10 hover:text-accent-soft"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading && notifications.length === 0 && (
                <div className="space-y-3 p-4" aria-label="Loading notifications">
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="h-16 animate-pulse rounded-lg bg-ink-700/70"
                    />
                  ))}
                </div>
              )}

              {!loading && error && (
                <div className="p-6 text-center">
                  <div className="text-sm font-medium text-rose-300">
                    Inbox unavailable
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{error}</p>
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="mt-3 rounded-lg bg-ink-600 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-ink-500"
                  >
                    Try again
                  </button>
                </div>
              )}

              {!loading && !error && notifications.length === 0 && (
                <div className="grid place-items-center px-6 py-10 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-ink-700 text-slate-400">
                    <BellIcon />
                  </span>
                  <div className="mt-3 text-sm font-medium text-slate-300">
                    Nothing here yet
                  </div>
                  <p className="mt-1 max-w-60 text-xs text-slate-500">
                    Project invitations and Cascade updates will stay here until
                    you read them.
                  </p>
                </div>
              )}

              {!error && notifications.length > 0 && (
                <ul className="divide-y divide-ink-600/80">
                  {notifications.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      onOpen={() => choose(notification)}
                      onMarkRead={() => onMarkRead(notification.id)}
                      onDismiss={() => onDismiss(notification.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function NotificationRow({
  notification,
  onOpen,
  onMarkRead,
  onDismiss,
}: {
  notification: InboxNotification;
  onOpen: () => void;
  onMarkRead: () => void;
  onDismiss: () => void;
}) {
  const hasAction =
    (notification.kind === "invite" && notification.project_id) ||
    notification.action_url;
  const actionLabel =
    notification.kind === "invite" ? "Open map" : "View update";

  return (
    <li
      className={`relative flex gap-3 px-4 py-3 transition ${
        notification.read_at ? "bg-transparent" : "bg-accent/[0.055]"
      }`}
    >
      {!notification.read_at && (
        <span
          className="absolute left-1.5 top-5 h-1.5 w-1.5 rounded-full bg-accent"
          aria-label="Unread"
        />
      )}
      <NotificationAvatar notification={notification} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-100">
              {notification.title}
            </div>
            {notification.body && (
              <p className="mt-0.5 line-clamp-3 text-xs leading-4 text-slate-400">
                {notification.body}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-base text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
            aria-label={`Dismiss ${notification.title}`}
            title="Dismiss"
          >
            ×
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            className="text-[10px] text-slate-500"
            title={new Date(notification.created_at).toLocaleString()}
          >
            {formatRelativeTime(notification.created_at)}
          </span>
          <div className="flex items-center gap-1">
            {!notification.read_at && (
              <button
                type="button"
                onClick={onMarkRead}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
              >
                Mark read
              </button>
            )}
            {hasAction && (
              <button
                type="button"
                onClick={onOpen}
                className="rounded-md bg-accent/90 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-accent-soft"
              >
                {actionLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function NotificationAvatar({
  notification,
}: {
  notification: InboxNotification;
}) {
  if (notification.kind === "invite" && notification.actor_avatar_url) {
    return (
      <img
        src={notification.actor_avatar_url}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-base ${
        notification.kind === "invite"
          ? "bg-accent/15 text-accent"
          : "bg-cyan-400/10 text-cyan-300"
      }`}
    >
      {notification.kind === "invite" ? "✉" : "✦"}
    </span>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-[18px] w-[18px]"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17H9m9-2.5V11a6 6 0 0 0-12 0v3.5L4.5 17h15L18 14.5ZM10 20h4"
      />
    </svg>
  );
}

function formatRelativeTime(value: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}
