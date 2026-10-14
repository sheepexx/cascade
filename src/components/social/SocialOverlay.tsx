import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useDialog } from "../../hooks/useDialog";
import { useAuth } from "../../lib/auth";
import { useT, type MessageKey } from "../../lib/i18n";
import { MOTION } from "../../lib/motion";
import type { SocialCounts } from "../../lib/social";
import type { SocialRoute } from "../../lib/socialRoute";
import { playUiSound } from "../../lib/uiSounds";
import { CloseIcon } from "../ui/Icons";
import { Toast } from "../ui/Toast";
import { Button } from "../ui/Controls";
import { CommunityView } from "./CommunityView";
import { FriendsView } from "./FriendsView";
import { MessagesView } from "./MessagesView";
import { ProfileView } from "./ProfileView";
import {
  Avatar,
  ChatIcon,
  CompassIcon,
  EmptyState,
  PeopleIcon,
} from "./socialUi";
import { NoticeProvider, type Notice } from "./socialUtils";

type NavKey = "profile" | "friends" | "messages" | "community";

const TITLES: Record<NavKey, MessageKey> = {
  profile: "social.profile",
  friends: "social.friendsTitle",
  messages: "social.messagesTitle",
  community: "social.communityTitle",
};

/**
 * Profiles, friends, messages and the community page, in one surface that
 * opens over whatever else is on screen (the editor keeps its state under
 * it) and closes back to it. Each view has its own URL (lib/socialRoute).
 */
export function SocialOverlay({
  open,
  route,
  counts,
  refreshKey,
  onNavigate,
  onClose,
  onCountsChanged,
  onOpenPrivacy,
  onOpenCloudProject,
  onOpenBeatmapset,
}: {
  open: boolean;
  route: SocialRoute;
  counts: SocialCounts;
  refreshKey: number;
  onNavigate: (route: SocialRoute, replace?: boolean) => void;
  onClose: () => void;
  onCountsChanged: () => void;
  onOpenPrivacy: () => void;
  onOpenCloudProject: (id: string) => void;
  onOpenBeatmapset?: (setId: number) => void;
}) {
  const t = useT();
  const { user, login } = useAuth();
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<(Notice & { id: number }) | null>(null);
  const panelRef = useDialog(open && mounted);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      playUiSound("open");
      return;
    }
    if (!mounted) return;
    playUiSound("close");
    setClosing(true);
    const id = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, MOTION.exit);
    return () => window.clearTimeout(id);
    // mounted stays out on purpose: one sound and one exit per close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // A menu, list or dialog opened inside the overlay closes first.
      const nested = [...document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"]')].some(
        (el) => el !== panelRef.current,
      );
      if (nested) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, panelRef]);

  const showNotice = useCallback((next: Notice) => setNotice({ ...next, id: Date.now() }), []);

  if (!mounted) return null;

  const active: NavKey = route.view;
  const ownProfile = route.view === "profile" && !!user && route.name.toLowerCase() === user.username.toLowerCase();
  const nav: { key: NavKey; label: string; icon: ReactNode; badge: number; go: () => void; current: boolean }[] = [
    ...(user
      ? [
          {
            key: "profile" as const,
            label: t("social.myProfile"),
            icon: <Avatar url={user.avatar_url} name={user.username} size="sm" />,
            badge: 0,
            go: () => onNavigate({ view: "profile", name: user.username, tab: "overview" }),
            current: ownProfile,
          },
        ]
      : []),
    {
      key: "friends",
      label: t("social.friendsTitle"),
      icon: <PeopleIcon />,
      badge: counts.pending_requests,
      go: () => onNavigate({ view: "friends", tab: counts.pending_requests ? "pending" : "all" }),
      current: active === "friends",
    },
    {
      key: "messages",
      label: t("social.messagesTitle"),
      icon: <ChatIcon />,
      badge: counts.unread_messages,
      go: () => onNavigate({ view: "messages", conversationId: null }),
      current: active === "messages",
    },
    {
      key: "community",
      label: t("social.communityTitle"),
      icon: <CompassIcon />,
      badge: 0,
      go: () => onNavigate({ view: "community" }),
      current: active === "community",
    },
  ];

  const needsAccount = !user && route.view !== "profile";

  return (
    <div
      // A view of its own rather than a window over the editor: profiles,
      // friends and messages get the whole screen, and Back returns to the
      // map exactly as it was left (the editor stays mounted underneath).
      className={`fixed inset-0 z-[60] flex items-stretch bg-ink-900 ${
        closing ? "pointer-events-none modal-backdrop-out" : "modal-backdrop-in"
      }`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t(TITLES[active])}
        tabIndex={-1}
        className={`relative flex h-full w-full flex-col overflow-hidden outline-none ${
          closing ? "modal-panel-out" : "modal-panel-in"
        }`}
      >
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.06] px-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 items-center gap-2 rounded-md pl-1.5 pr-2.5 text-sm text-slate-300 transition hover:bg-white/[0.07] hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label={t("common.close")}
          >
            <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3.5 5.5 8l4.5 4.5" />
            </svg>
            <img src={`${import.meta.env.BASE_URL}favicon.png?v=3`} alt="" aria-hidden className="h-5 w-5 rounded-full" />
            <span className="font-display font-bold text-slate-100">Cascade</span>
          </button>
          <span className="h-4 w-px bg-white/[0.08]" />
          <h2 className="truncate px-1.5 font-display text-[0.9375rem] font-semibold text-slate-50">{t(TITLES[active])}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label={t("social.navigation")}
            className="no-scrollbar flex shrink-0 gap-px overflow-x-auto border-b border-white/[0.06] px-2 py-1.5 md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-2"
          >
            {nav.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.go}
                aria-current={item.current ? "page" : undefined}
                className={`hit-line-left relative flex h-9 shrink-0 items-center gap-2.5 rounded-md px-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 md:w-full ${
                  item.current ? "bg-white/[0.07] font-medium text-slate-50" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                }`}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center [&_svg]:h-4 [&_svg]:w-4 [&>span]:!h-6 [&>span]:!w-6">{item.icon}</span>
                <span className="truncate">{item.label}</span>
                {item.badge > 0 && (
                  <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold tabular-nums text-white">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <NoticeProvider value={showNotice}>
            <main
              className={`min-h-0 flex-1 ${
                route.view === "messages"
                  ? "flex flex-col"
                  : // The gutter stays reserved, so the page doesn't shift as tabs
                    // come and go with and without a scrollbar.
                    "overflow-y-auto [scrollbar-gutter:stable]"
              }`}
            >
              {route.view === "messages" && !needsAccount ? (
                <MessagesView
                  conversationId={route.conversationId}
                  refreshKey={refreshKey}
                  onNavigate={onNavigate}
                  onChanged={onCountsChanged}
                />
              ) : (
                // Pages read at a comfortable measure, centred in the view.
                <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-8 sm:py-7">
                  {needsAccount ? (
                    <EmptyState
                      icon={<PeopleIcon />}
                      title={t("social.signInTitle")}
                      body={t("social.signInBody")}
                      action={<Button variant="accent" onClick={login}>{t("startModal.loginWithOsu")}</Button>}
                    />
                  ) : route.view === "profile" ? (
                    <ProfileView
                      key={route.name.toLowerCase()}
                      name={route.name}
                      tab={route.tab}
                      onNavigate={onNavigate}
                      onOpenPrivacy={onOpenPrivacy}
                      onOpenCloudProject={onOpenCloudProject}
                      onOpenBeatmapset={onOpenBeatmapset}
                    />
                  ) : route.view === "friends" ? (
                    <FriendsView tab={route.tab} refreshKey={refreshKey} onNavigate={onNavigate} onChanged={onCountsChanged} />
                  ) : (
                    <CommunityView onNavigate={onNavigate} onChanged={onCountsChanged} />
                  )}
                </div>
              )}
            </main>
          </NoticeProvider>
        </div>

        {notice && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
            <div className="pointer-events-auto w-full max-w-sm">
              <Toast
                key={notice.id}
                tone={notice.tone}
                message={notice.text}
                onDismiss={() => setNotice((current) => (current?.id === notice.id ? null : current))}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
