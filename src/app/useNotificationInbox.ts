import type { AuthUser } from "../lib/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { InviteNotice } from "../components/InviteNotifications";
import { listMyProjectsRich } from "../lib/cloud";
import type { InboxNotification } from "../lib/notifications";
import {
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../lib/notifications";
import { subscribeSupabase } from "../lib/supabase";
import { playUiSound } from "../lib/uiSounds";

/**
 * The signed-in user's notification inbox and the invite toasts that pop up
 * when someone shares a map with them, both kept live over Realtime.
 */
export function useNotificationInbox({
  authUser,
  authUserRef,
  cloudProjectIdRef,
  loadCloudProject,
}: {
  authUser: AuthUser | null;
  authUserRef: MutableRefObject<AuthUser | null>;
  cloudProjectIdRef: MutableRefObject<string | null>;
  loadCloudProject: (id: string) => Promise<void>;
}) {
  const [invites, setInvites] = useState<InviteNotice[]>([]);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(
    null,
  );
  const inviteNoticeProjectsRef = useRef<Set<string>>(new Set());

  const addInviteNotice = useCallback(async (
    projectId: string,
    notificationId?: string,
  ) => {
    if (projectId === cloudProjectIdRef.current) return;
    if (inviteNoticeProjectsRef.current.has(projectId)) {
      if (notificationId) {
        setInvites((prev) =>
          prev.map((notice) =>
            notice.projectId === projectId && !notice.notificationId
              ? { ...notice, notificationId }
              : notice,
          ),
        );
      }
      return;
    }
    inviteNoticeProjectsRef.current.add(projectId);
    try {
      const rows = await listMyProjectsRich();
      const proj = rows.find((r) => r.id === projectId);
      if (!proj) {
        inviteNoticeProjectsRef.current.delete(projectId);
        return;
      }
      const owner = proj.participants.find((x) => x.role === "owner");
      setInvites((prev) =>
        prev.some((n) => n.projectId === projectId)
          ? prev.map((notice) =>
              notice.projectId === projectId && !notice.notificationId
                ? { ...notice, notificationId }
                : notice,
            )
          : [
              ...prev,
              {
                notificationId,
                projectId,
                title: proj.title || "Untitled",
                who: owner?.username ?? null,
                avatar: owner?.avatar_url ?? null,
              },
            ],
      );
      playUiSound("invite");
    } catch {
      inviteNoticeProjectsRef.current.delete(projectId);
    }
  }, [cloudProjectIdRef]);

  const refreshNotifications = useCallback(async () => {
    const userId = authUserRef.current?.id;
    if (!userId) {
      setNotifications([]);
      setNotificationsLoading(false);
      setNotificationsError(null);
      return;
    }
    setNotificationsLoading(true);
    try {
      const rows = await listNotifications();
      if (authUserRef.current?.id !== userId) return;
      setNotifications(rows);
      setNotificationsError(null);
    } catch (error) {
      setNotificationsError(
        error instanceof Error ? error.message : "Couldn't load notifications.",
      );
    } finally {
      setNotificationsLoading(false);
    }
  }, [authUserRef]);

  useEffect(() => {
    if (!authUser) {
      setInvites([]);
      inviteNoticeProjectsRef.current.clear();
      return;
    }
    return subscribeSupabase((supabase) =>
      supabase
        .channel(`invites:${authUser.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "project_collaborators",
            filter: `user_id=eq.${authUser.id}`,
          },
          (payload) => {
            const pid = (payload.new as { project_id?: string })?.project_id;
            if (pid) void addInviteNotice(pid);
          },
        )
        .subscribe(),
    );
  }, [authUser, addInviteNotice]);

  useEffect(() => {
    if (!authUser) {
      setNotifications([]);
      setNotificationsError(null);
      setNotificationsLoading(false);
      return;
    }

    void refreshNotifications();
    const unsubscribe = subscribeSupabase((supabase) =>
      supabase
        .channel(`notification-inbox:${authUser.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `recipient=eq.${authUser.id}`,
          },
          (payload) => {
            void refreshNotifications();
            if (payload.eventType !== "INSERT") return;
            const notification = payload.new as Partial<InboxNotification>;
            if (
              notification.kind === "invite" &&
              notification.project_id &&
              notification.id
            ) {
              void addInviteNotice(notification.project_id, notification.id);
            }
          },
        )
        .subscribe(),
    );

    const refreshOnFocus = () => void refreshNotifications();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshNotifications();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      unsubscribe();
    };
  }, [authUser, addInviteNotice, refreshNotifications]);

  const markInboxNotificationRead = useCallback(
    (id: string) => {
      const readAt = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, read_at: item.read_at ?? readAt } : item,
        ),
      );
      void markNotificationRead(id).catch(() => refreshNotifications());
    },
    [refreshNotifications],
  );

  const markInboxAllRead = useCallback(() => {
    const readAt = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, read_at: item.read_at ?? readAt })),
    );
    void markAllNotificationsRead().catch(() => refreshNotifications());
  }, [refreshNotifications]);

  const dismissInboxNotification = useCallback(
    (id: string) => {
      const notification = notifications.find((item) => item.id === id);
      setNotifications((prev) => prev.filter((item) => item.id !== id));
      if (notification?.project_id) {
        inviteNoticeProjectsRef.current.delete(notification.project_id);
        setInvites((prev) =>
          prev.filter((item) => item.projectId !== notification.project_id),
        );
      }
      void dismissNotification(id).catch(() => refreshNotifications());
    },
    [notifications, refreshNotifications],
  );

  const joinInvite = useCallback(
    (n: InviteNotice) => {
      setInvites((prev) => prev.filter((x) => x.projectId !== n.projectId));
      inviteNoticeProjectsRef.current.delete(n.projectId);
      const notificationId =
        n.notificationId ??
        notifications.find(
          (item) =>
            item.kind === "invite" && item.project_id === n.projectId,
        )?.id;
      if (notificationId) markInboxNotificationRead(notificationId);
      void loadCloudProject(n.projectId);
    },
    [loadCloudProject, markInboxNotificationRead, notifications],
  );
  const ignoreInvite = useCallback((n: InviteNotice) => {
    setInvites((prev) => prev.filter((x) => x.projectId !== n.projectId));
    inviteNoticeProjectsRef.current.delete(n.projectId);
  }, []);

  const openInboxNotification = useCallback(
    (notification: InboxNotification) => {
      markInboxNotificationRead(notification.id);
      if (notification.kind === "invite" && notification.project_id) {
        inviteNoticeProjectsRef.current.delete(notification.project_id);
        setInvites((prev) =>
          prev.filter((item) => item.projectId !== notification.project_id),
        );
        void loadCloudProject(notification.project_id);
        return;
      }
      if (notification.action_url) {
        window.open(notification.action_url, "_blank", "noopener,noreferrer");
      }
    },
    [loadCloudProject, markInboxNotificationRead],
  );

  return {
    dismissInboxNotification,
    ignoreInvite,
    invites,
    joinInvite,
    markInboxAllRead,
    markInboxNotificationRead,
    notifications,
    notificationsError,
    notificationsLoading,
    openInboxNotification,
    refreshNotifications,
  };
}
