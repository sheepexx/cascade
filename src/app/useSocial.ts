import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthUser } from "../lib/auth";
import type { InboxNotification } from "../lib/notifications";
import {
  DEFAULT_PRIVACY,
  getMyPrivacy,
  getSocialCounts,
  goOffline,
  heartbeat,
  onPrivacyChanged,
  type PrivacySettings,
  type SocialCounts,
} from "../lib/social";
import { parseSocialPath, sameRoute, socialPath, type SocialRoute } from "../lib/socialRoute";

const HEARTBEAT_MS = 2 * 60_000;
const NO_COUNTS: SocialCounts = { unread_messages: 0, pending_requests: 0 };

/**
 * Where the social overlay is, kept in the address bar. Opening it pushes a
 * history entry over the current page, so the browser's back button closes
 * it again; closing it returns to the path it was opened from.
 */
export function useSocialRoute(enabled: boolean) {
  const [route, setRoute] = useState<SocialRoute | null>(() =>
    typeof location === "undefined" ? null : parseSocialPath(location.pathname),
  );
  const basePath = useRef<string>(
    typeof location === "undefined" || parseSocialPath(location.pathname) ? "/" : location.pathname + location.search,
  );
  const pushedRef = useRef(0);
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    const onPop = () => {
      const next = parseSocialPath(location.pathname);
      if (!next) basePath.current = location.pathname + location.search;
      pushedRef.current = Math.max(0, pushedRef.current - 1);
      setRoute(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((next: SocialRoute, replace = false) => {
    const current = routeRef.current;
    if (sameRoute(current, next)) return;
    if (!current) basePath.current = location.pathname + location.search;
    const path = socialPath(next);
    if (replace && current) {
      window.history.replaceState(window.history.state, "", path);
    } else {
      window.history.pushState(window.history.state, "", path);
      pushedRef.current += 1;
    }
    routeRef.current = next;
    setRoute(next);
  }, []);

  const close = useCallback(() => {
    routeRef.current = null;
    setRoute(null);
    // Walk back over the entries the overlay pushed when there are any, so
    // closing and the back button agree; a page opened straight on a
    // profile link has none and is replaced with where the app lives.
    if (pushedRef.current > 0) {
      const steps = pushedRef.current;
      pushedRef.current = 0;
      window.history.go(-steps);
    } else {
      window.history.replaceState(window.history.state, "", basePath.current || "/");
    }
  }, []);

  return { route: enabled ? route : null, navigate, close };
}

/**
 * The header's badge counts (unread messages, friend requests waiting) and
 * a presence heartbeat while the app is visible. Counts follow the
 * notification inbox, which is already kept live over Realtime, so there is
 * no polling beyond the heartbeat.
 */
export function useSocialPresence({
  authUser,
  enabled,
  notifications,
  hideStatus,
  activity,
}: {
  authUser: AuthUser | null;
  enabled: boolean;
  notifications: InboxNotification[];
  hideStatus: boolean;
  /** What the user is doing, for friends allowed to see it (null when nothing). */
  activity: string | null;
}) {
  const [counts, setCounts] = useState<SocialCounts>(NO_COUNTS);
  const [refreshKey, setRefreshKey] = useState(0);
  const activityRef = useRef(activity);
  activityRef.current = activity;
  const active = enabled && !!authUser;
  const userId = authUser?.id ?? null;

  const refreshCounts = useCallback(() => {
    if (!active) return;
    void getSocialCounts()
      .then(setCounts)
      .catch(() => {});
  }, [active]);

  useEffect(() => {
    if (!active) {
      setCounts(NO_COUNTS);
      return;
    }
    refreshCounts();
  }, [active, userId, refreshCounts]);

  // A friend or message notice arriving (or being read) moves the counts and
  // whatever social view is open.
  const socialSignature = notifications
    .filter((n) => n.kind === "friend_request" || n.kind === "friend_accept" || n.kind === "message")
    .map((n) => `${n.id}:${n.created_at}:${n.read_at ?? ""}`)
    .join("|");
  const firstSignature = useRef(true);
  useEffect(() => {
    if (firstSignature.current) {
      firstSignature.current = false;
      return;
    }
    refreshCounts();
    setRefreshKey((k) => k + 1);
  }, [socialSignature, refreshCounts]);

  useEffect(() => {
    if (!active) return;
    if (hideStatus) {
      void goOffline().catch(() => {});
      return;
    }
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void heartbeat(activityRef.current).catch(() => {});
    };
    beat();
    const id = window.setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        beat();
        refreshCounts();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, userId, hideStatus, refreshCounts]);

  // Opening another map updates what friends see within a few seconds rather
  // than at the next heartbeat.
  const firstActivity = useRef(true);
  useEffect(() => {
    if (firstActivity.current) {
      firstActivity.current = false;
      return;
    }
    if (!active || hideStatus) return;
    const id = window.setTimeout(() => {
      if (document.visibilityState === "visible") void heartbeat(activityRef.current).catch(() => {});
    }, 3000);
    return () => window.clearTimeout(id);
  }, [activity, active, hideStatus]);

  return { counts, refreshCounts, refreshKey };
}

/**
 * The signed-in user's own privacy settings, for the parts of the app that
 * show presence outside the social overlay (the main menu's floating
 * players). Null when the social features are off. Until the settings have
 * loaded, `loaded` is false and callers should share nothing.
 */
export function useMyPrivacy(authUser: AuthUser | null, enabled: boolean) {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const userId = authUser?.id ?? null;

  useEffect(() => {
    setSettings(null);
    if (!enabled || !userId) return;
    let cancelled = false;
    getMyPrivacy()
      .then((loaded) => {
        if (!cancelled) setSettings({ ...DEFAULT_PRIVACY, ...loaded });
      })
      .catch(() => {
        if (!cancelled) setSettings(DEFAULT_PRIVACY);
      });
    const unsubscribe = onPrivacyChanged((next) => setSettings({ ...DEFAULT_PRIVACY, ...next }));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, userId]);

  return { privacy: enabled ? settings : null, loaded: !enabled || !userId || settings !== null };
}
