import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { activityLog, useActivityLog } from "../lib/activityLog";
import { groupInbox, mergeInbox, type InboxGroup, type InboxItem } from "../lib/inboxItems";
import type { InboxNotification } from "../lib/notifications";
import { SkeletonRows } from "./ui/Skeleton";
import { MailIcon } from "./ui/Icons";
import { ToneIcon } from "./ui/Toast";
import { useT, type MessageKey, type Translate } from "../lib/i18n";

const GROUP_LABELS: Record<InboxGroup, MessageKey> = {
  today: "inbox.groupToday",
  yesterday: "inbox.groupYesterday",
  week: "inbox.groupWeek",
  older: "inbox.groupOlder",
};

/**
 * The bell in the header and its panel. It lists what was sent to the account
 * (invites, update notes) when signed in, and this device's activity (failed
 * saves, import problems, export checks) either way, newest first and grouped
 * by day. Anything can be marked read or unread, and the list can be narrowed
 * to unread items.
 */
export function NotificationInbox({
  signedIn,
  notifications,
  loading,
  error,
  onRefresh,
  onOpen,
  onMarkRead,
  onMarkUnread,
  onMarkAllRead,
  onDismiss,
}: {
  signedIn: boolean;
  notifications: InboxNotification[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
  onOpen: (notification: InboxNotification) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 8 });
  const activity = useActivityLog();
  const accountNotifications = useMemo(
    () => (signedIn ? notifications : []),
    [signedIn, notifications],
  );
  const items = useMemo(
    () => mergeInbox(accountNotifications, activity),
    [accountNotifications, activity],
  );
  const accountUnread = accountNotifications.filter((item) => !item.read_at).length;
  const unread = items.filter((item) => !item.read).length;
  const shown = unreadOnly ? items.filter((item) => !item.read) : items;
  const groups = open ? groupInbox(shown, new Date()) : [];

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
    if (signedIn) void onRefresh();
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
  }, [open, onRefresh, signedIn]);

  const markAllRead = () => {
    if (accountUnread > 0) onMarkAllRead();
    activityLog().markAllRead();
  };

  const choose = (notification: InboxNotification) => {
    setOpen(false);
    onOpen(notification);
  };

  const setRead = (item: InboxItem, read: boolean) => {
    if (item.source === "account") {
      if (read) onMarkRead(item.id);
      else onMarkUnread(item.id);
    } else if (read) {
      activityLog().markRead(item.id);
    } else {
      activityLog().markUnread(item.id);
    }
  };

  const dismiss = (item: InboxItem) => {
    if (item.source === "account") onDismiss(item.id);
    else activityLog().dismiss(item.id);
  };

  const showAccountError = signedIn && !loading && !!error;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={
          unread > 0 ? t("inbox.labelUnread", { count: unread }) : t("inbox.title")
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t("inbox.title")}
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
            aria-label={t("inbox.label")}
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-[110] flex max-h-[min(36rem,calc(100vh-5rem))] w-96 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-ink-500/70 bg-ink-800/[0.98] shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-ink-600 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  {t("inbox.title")}
                </h2>
                <p className="text-[11px] text-slate-500">
                  {unread > 0
                    ? t("inbox.unread", { count: unread })
                    : t("inbox.caughtUp")}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  role="group"
                  aria-label={t("inbox.filterLabel")}
                  className="flex rounded-lg border border-white/10 p-0.5 text-[11px]"
                >
                  {([false, true] as const).map((only) => (
                    <button
                      key={String(only)}
                      type="button"
                      aria-pressed={unreadOnly === only}
                      onClick={() => setUnreadOnly(only)}
                      className={`rounded-md px-2 py-0.5 font-medium transition ${
                        unreadOnly === only
                          ? "bg-white/10 text-slate-100"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {only ? t("inbox.filterUnread") : t("inbox.filterAll")}
                    </button>
                  ))}
                </div>
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="rounded-md px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/10 hover:text-accent-soft"
                  >
                    {t("inbox.markAll")}
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {signedIn && loading && items.length === 0 && (
                <SkeletonRows
                  count={3}
                  avatar
                  action={false}
                  className="p-4"
                  label={t("inbox.loading")}
                />
              )}

              {showAccountError && (
                <div className="border-b border-ink-600/80 px-4 py-3 text-center">
                  <div className="text-sm font-medium text-rose-300">
                    {t("inbox.unavailable")}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{error}</p>
                  <button
                    type="button"
                    onClick={() => void onRefresh()}
                    className="mt-2 rounded-lg bg-ink-600 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-ink-500"
                  >
                    {t("audioSetup.tryAgain")}
                  </button>
                </div>
              )}

              {!(signedIn && loading && items.length === 0) && shown.length === 0 && (
                <div className="grid place-items-center px-6 py-10 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-ink-700 text-slate-400">
                    <BellIcon />
                  </span>
                  <div className="mt-3 text-sm font-medium text-slate-300">
                    {unreadOnly && items.length > 0 ? t("inbox.noUnread") : t("inbox.empty")}
                  </div>
                  {!(unreadOnly && items.length > 0) && (
                    <p className="mt-1 max-w-64 text-xs text-slate-500">
                      {signedIn ? t("inbox.emptyHint") : t("inbox.emptyHintSignedOut")}
                    </p>
                  )}
                </div>
              )}

              {groups.map(({ group, items: groupItems }) => (
                <section key={group} aria-label={t(GROUP_LABELS[group])}>
                  <h3 className="sticky top-0 z-[1] border-b border-ink-600/60 bg-ink-800/95 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
                    {t(GROUP_LABELS[group])}
                  </h3>
                  <ul className="divide-y divide-ink-600/80">
                    {groupItems.map((item) => (
                      <NotificationRow
                        key={item.key}
                        item={item}
                        onOpen={
                          item.source === "account"
                            ? () => choose(item.notification)
                            : undefined
                        }
                        onSetRead={(read) => setRead(item, read)}
                        onDismiss={() => dismiss(item)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            {!signedIn && items.length > 0 && (
              <p className="border-t border-ink-600 px-4 py-2 text-[11px] text-slate-500">
                {t("inbox.signedOutHint")}
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function NotificationRow({
  item,
  onOpen,
  onSetRead,
  onDismiss,
}: {
  item: InboxItem;
  onOpen?: () => void;
  onSetRead: (read: boolean) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const notification = item.source === "account" ? item.notification : null;
  const hasAction =
    !!notification &&
    ((notification.kind === "invite" && !!notification.project_id) ||
      !!notification.action_url);
  const actionLabel =
    notification?.kind === "invite" ? t("inbox.openMap") : t("inbox.viewUpdate");

  return (
    <li
      className={`relative flex gap-3 px-4 py-3 transition ${
        item.read ? "bg-transparent" : "bg-accent/[0.055]"
      }`}
    >
      {!item.read && (
        <span
          className="absolute left-1.5 top-5 h-1.5 w-1.5 rounded-full bg-accent"
          aria-label={t("inbox.unreadDot")}
        />
      )}
      {notification ? (
        <NotificationAvatar notification={notification} />
      ) : (
        item.source === "activity" && (
          <span className="mt-1.5 grid h-9 w-9 shrink-0 place-items-center">
            <ToneIcon tone={item.kind} className={ACTIVITY_ICON[item.kind]} />
          </span>
        )
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="break-words text-sm font-semibold text-slate-100">
              {item.title}
            </div>
            {item.body && (
              <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-4 text-slate-400">
                {item.body}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-base text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
            aria-label={t("inbox.dismissLabel", { title: item.title })}
            title={t("pack.dismiss")}
          >
            ×
          </button>
        </div>
        {item.details && expanded && (
          <div className="mt-2 flex flex-col gap-1.5">
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/30 p-2 font-mono text-[11px] leading-4 text-slate-300">
              {item.details}
            </pre>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(item.details ?? "")
                  .then(() => setCopied(true))
                  .catch(() => {})
              }
              className="self-start rounded-md border border-white/10 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-white/10"
            >
              {copied ? t("toast.copied") : t("crash.copyDetails")}
            </button>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            className="min-w-0 truncate text-[10px] text-slate-500"
            title={new Date(item.createdAt).toLocaleString()}
          >
            {formatRelativeTime(item.createdAt, t)}
            {notification && notification.kind !== "invite" && notification.actor_username && (
              <> · {t("inbox.from", { name: notification.actor_username })}</>
            )}
            {item.source === "activity" && <> · {t("inbox.thisDevice")}</>}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {item.details && (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
              >
                {expanded ? t("toast.hideDetails") : t("toast.showDetails")}
              </button>
            )}
            <button
              type="button"
              onClick={() => onSetRead(!item.read)}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
            >
              {item.read ? t("inbox.markUnread") : t("inbox.markRead")}
            </button>
            {hasAction && onOpen && (
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

const ACTIVITY_ICON = {
  info: "bg-cyan-400/10 text-cyan-300",
  success: "bg-emerald-400/15 text-emerald-300",
  warning: "bg-amber-400/15 text-amber-300",
  error: "bg-red-400/15 text-red-300",
} as const;

function NotificationAvatar({
  notification,
}: {
  notification: InboxNotification;
}) {
  // Invites and admin announcements both snapshot the sender, so either can
  // show a real avatar; system notices fall back to the glyph.
  if (notification.actor_avatar_url && notification.kind !== "system") {
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
      {notification.kind === "invite" ? (
        <MailIcon className="h-[18px] w-[18px]" />
      ) : (
        <BellIcon />
      )}
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

function formatRelativeTime(value: number, t: Translate): string {
  const elapsed = Math.max(0, Date.now() - value);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return t("inbox.justNow");
  if (minutes < 60) return t("menu.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("menu.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("menu.daysAgo", { n: days });
  return new Date(value).toLocaleDateString();
}
