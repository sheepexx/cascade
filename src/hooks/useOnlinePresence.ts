import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import {
  aggregatePresencePeers,
  type PresencePeer,
  type TrackedPresence,
} from "../lib/collabPresence";
import { colorForId } from "./useCollab";
import {
  fetchOnlineRoster,
  isDemoRoster,
  type OnlineRosterUser,
} from "../lib/online";

export type OnlinePlayer = {
  id: string;
  username: string;
  avatar: string | null;
  color: string;
  osuId: number | null;
  online: boolean;
  status: string | null;
  lastSeen: number | null;
};

const PRESENCE_CHANNEL = "cascade:online";
const PRESENCE_SEND_MS = 60_000;
const RECONNECT_MS = 3_000;

/**
 * Who is using the app right now. Every signed-in tab tracks itself on a
 * shared presence channel (avatar + username + what they are working on),
 * while everyone else simply reads the channel. The roster fetch fills in
 * "known but offline" players so the menu always has faces to float, even
 * when nobody else is online.
 */
export function useOnlinePresence(
  getStatus?: () => string | null,
  hideStatus?: boolean,
): OnlinePlayer[] {
  const { user } = useAuth();
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const [roster, setRoster] = useState<OnlineRosterUser[]>([]);
  const sessionIdRef = useRef(crypto.randomUUID());
  const lastTrackRef = useRef(0);
  const lastPayloadRef = useRef<TrackedPresence | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const statusRef = useRef(getStatus);
  statusRef.current = getStatus;
  const hiddenRef = useRef(hideStatus ?? false);
  hiddenRef.current = hideStatus ?? false;

  useEffect(() => {
    let cancelled = false;
    void fetchOnlineRoster().then((rows) => {
      if (!cancelled) setRoster(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL) return;
    let disposed = false;
    let currentChannel: RealtimeChannel | null = null;
    let reconnectTimer: number | undefined;

    const payload = (): TrackedPresence | null => {
      const me = userRef.current;
      if (!me || hiddenRef.current) return null;
      return {
        id: me.id,
        username: me.username,
        avatar: me.avatar_url,
        color: colorForId(me.id),
        osuId: me.osu_id,
        status: statusRef.current?.() ?? null,
        sessionId: sessionIdRef.current,
        updatedAt: Date.now(),
      };
    };

    const sync = (ch: RealtimeChannel) => {
      if (disposed || currentChannel !== ch) return;
      setPeers([
        ...aggregatePresencePeers(
          ch.presenceState<TrackedPresence>(),
          user?.id ?? "",
        ).values(),
      ]);
    };

    const track = (ch: RealtimeChannel, force = false) => {
      const now = Date.now();
      const p = payload();
      if (!p) return;
      const statusChanged = lastPayloadRef.current?.status !== p.status;
      if (!force && !statusChanged && now - lastTrackRef.current < PRESENCE_SEND_MS)
        return;
      lastTrackRef.current = now;
      lastPayloadRef.current = p;
      void ch.track(p);
    };

    const connect = () => {
      if (disposed) return;
      const ch = supabase.channel(PRESENCE_CHANNEL, {
        config: { presence: { key: sessionIdRef.current } },
      });
      currentChannel = ch;
      lastTrackRef.current = 0;
      ch.on("presence", { event: "sync" }, () => sync(ch));
      ch.subscribe((status) => {
        if (disposed || currentChannel !== ch) return;
        if (status === "SUBSCRIBED") {
          track(ch, true);
          sync(ch);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          if (currentChannel === ch) currentChannel = null;
          void supabase.removeChannel(ch);
          if (!disposed && reconnectTimer === undefined) {
            reconnectTimer = window.setTimeout(() => {
              reconnectTimer = undefined;
              connect();
            }, RECONNECT_MS);
          }
        }
      });
    };

    connect();

    const onVisibility = () => {
      const ch = currentChannel;
      if (!ch) return;
      if (document.visibilityState === "visible") track(ch, true);
      else void ch.untrack();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const heartbeat = window.setInterval(() => {
      const ch = currentChannel;
      if (ch) track(ch);
    }, PRESENCE_SEND_MS);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(heartbeat);
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      const ch = currentChannel;
      currentChannel = null;
      if (ch) {
        void ch.untrack();
        void supabase.removeChannel(ch);
      }
    };
  }, [user?.id, hideStatus]);

  return useMemo(() => {
    const selfId = user?.id;
    const onlineIds = new Set<string>();
    const out: OnlinePlayer[] = [];
    for (const p of peers) {
      if (p.id === selfId) continue;
      onlineIds.add(p.id);
      out.push({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        color: p.color,
        osuId: p.osuId ?? null,
        online: true,
        status: p.status ?? null,
        lastSeen: null,
      });
    }
    // In dev, when nobody is actually present and the roster is the demo set,
    // mark every third face "online" so both looks are visible at a glance.
    const demoPreview =
      import.meta.env.DEV && peers.length === 0 && isDemoRoster(roster);
    let rosterIndex = 0;
    for (const u of roster) {
      if (u.id === selfId || onlineIds.has(u.id)) continue;
      out.push({
        id: u.id,
        username: u.username,
        avatar: u.avatar_url,
        color: colorForId(u.id),
        osuId: u.osu_id,
        online: demoPreview && rosterIndex % 3 === 0,
        status: u.status ?? null,
        lastSeen: u.last_seen ?? null,
      });
      rosterIndex += 1;
    }
    return out;
  }, [peers, roster, user?.id]);
}
