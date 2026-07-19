import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, getSupabaseToken } from "../lib/supabase";
import type { CollabOp } from "../lib/ops";
import {
  aggregatePresencePeers,
  type PresencePeer,
  type TrackedPresence,
} from "../lib/collabPresence";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

function restBroadcast(projectId: string, event: string, payload: unknown): void {
  if (!SUPABASE_URL || !projectId) return;
  const token = getSupabaseToken() ?? SUPABASE_ANON;
  void fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ topic: `project:${projectId}`, event, payload, private: true }],
    }),
  }).catch(() => {});
}

export type Peer = PresencePeer;

export type CollabStatus = "idle" | "connecting" | "connected" | "error";

type PresenceFields = {
  activeDiffId?: string;
  playheadMs?: number;
  cursorTimeMs?: number;
  cursorColumn?: number;
};

export type AssetChange = {
  event: "INSERT" | "UPDATE" | "DELETE";
  filename: string | null;
  kind: "audio" | "bg" | null;
  sha256: string | null;
};

type Me = { id: string; username: string; avatar: string | null };

const PRESENCE_SEND_MS = 800;
const LEAVE_GRACE_MS = 12_000;

export function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 60%)`;
}

export function useCollab(opts: {
  projectId: string | null;
  enabled: boolean;
  invisible?: boolean;
  me: Me | null;
  onRemoteOp: (op: CollabOp) => void;
  onRefresh: () => void;
  onAssetChange?: (change: AssetChange) => void;
  onPeerJoin?: (peer: Peer) => void;
  onPeerLeave?: (peer: Peer) => void;
  onNotice?: (notice: { text: string; avatar: string | null }) => void;
}) {
  const { projectId, enabled, me } = opts;
  const [status, setStatus] = useState<CollabStatus>("idle");
  const [peers, setPeers] = useState<Peer[]>([]);

  const onRemoteOpRef = useRef(opts.onRemoteOp);
  onRemoteOpRef.current = opts.onRemoteOp;
  const onRefreshRef = useRef(opts.onRefresh);
  onRefreshRef.current = opts.onRefresh;
  const onAssetChangeRef = useRef(opts.onAssetChange);
  onAssetChangeRef.current = opts.onAssetChange;
  const onPeerJoinRef = useRef(opts.onPeerJoin);
  onPeerJoinRef.current = opts.onPeerJoin;
  const onPeerLeaveRef = useRef(opts.onPeerLeave);
  onPeerLeaveRef.current = opts.onPeerLeave;
  const onNoticeRef = useRef(opts.onNotice);
  onNoticeRef.current = opts.onNotice;

  const channelRef = useRef<RealtimeChannel | null>(null);
  const statusRef = useRef<CollabStatus>("idle");
  const sessionIdRef = useRef(crypto.randomUUID());
  const invisibleRef = useRef(!!opts.invisible);
  const presenceRef = useRef<PresenceFields>({});
  const meRef = useRef<Me | null>(me);
  meRef.current = me;
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const lastPresenceSendRef = useRef(0);

  const updateStatus = (next: CollabStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  useEffect(() => {
    if (!enabled || !projectId || !me) {
      updateStatus("idle");
      setPeers([]);
      peersRef.current.clear();
      return;
    }

    updateStatus("connecting");
    peersRef.current.clear();
    setPeers([]);
    const myColor = colorForId(me.id);

    let disposed = false;
    let channel: RealtimeChannel | null = null;
    let syncChannel: RealtimeChannel | null = null;
    let reconnectTimer: number | undefined;
    let attempt = 0;
    let presenceInitialized = false;
    const leaveTimers = new Map<string, number>();

    const publishPeers = () => setPeers([...peersRef.current.values()]);
    const clearLeaveTimer = (id: string) => {
      const timer = leaveTimers.get(id);
      if (timer !== undefined) window.clearTimeout(timer);
      leaveTimers.delete(id);
    };
    const scheduleLeave = (peer: Peer) => {
      if (leaveTimers.has(peer.id)) return;
      leaveTimers.set(
        peer.id,
        window.setTimeout(() => {
          leaveTimers.delete(peer.id);
          const current = peersRef.current.get(peer.id);
          if (!current || current !== peer) return;
          peersRef.current.delete(peer.id);
          publishPeers();
          onPeerLeaveRef.current?.(peer);
        }, LEAVE_GRACE_MS),
      );
    };

    const presencePayload = (): TrackedPresence | null => {
      const currentMe = meRef.current;
      if (!currentMe) return null;
      return {
        id: currentMe.id,
        username: currentMe.username,
        avatar: currentMe.avatar,
        color: myColor,
        sessionId: sessionIdRef.current,
        updatedAt: Date.now(),
        ...presenceRef.current,
      };
    };
    const shouldTrack = () =>
      !disposed &&
      !invisibleRef.current &&
      document.visibilityState === "visible" &&
      statusRef.current === "connected";
    const trackPresence = (force = false) => {
      const activeChannel = channelRef.current;
      const payload = presencePayload();
      if (!activeChannel || !payload || !shouldTrack()) return;
      if (!force && Date.now() - lastPresenceSendRef.current < PRESENCE_SEND_MS) return;
      lastPresenceSendRef.current = Date.now();
      void activeChannel.track(payload);
    };
    const syncPresence = (ch: RealtimeChannel) => {
      const next = aggregatePresencePeers(ch.presenceState<TrackedPresence>(), me.id);
      const current = peersRef.current;

      for (const [id, peer] of next) {
        clearLeaveTimer(id);
        const isNew = !current.has(id);
        current.set(id, peer);
        if (presenceInitialized && isNew) onPeerJoinRef.current?.(peer);
      }
      for (const [id, peer] of current) {
        if (!next.has(id)) scheduleLeave(peer);
      }

      presenceInitialized = true;
      publishPeers();
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== undefined) return;
      const delay = Math.min(1000 * 2 ** attempt, 15_000);
      attempt += 1;
      updateStatus(attempt >= 5 ? "error" : "connecting");
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      updateStatus("connecting");
      const ch = supabase.channel(`project:${projectId}`, {
        config: {
          private: true,
          broadcast: { self: false, ack: true },
          presence: { key: sessionIdRef.current },
        },
      });
      channel = ch;
      channelRef.current = ch;

      ch.on("broadcast", { event: "op" }, ({ payload }) => {
        const p = payload as CollabOp & { _from?: string };
        if (p?._from && p._from === meRef.current?.id) return;
        onRemoteOpRef.current(p as CollabOp);
      });
      ch.on("broadcast", { event: "doc.bump" }, ({ payload }) => {
        if ((payload as { _from?: string })?._from === meRef.current?.id) return;
        onRefreshRef.current();
      });
      ch.on("broadcast", { event: "notice" }, ({ payload }) => {
        const p = payload as {
          text?: string;
          avatar?: string | null;
          _from?: string;
        };
        if (!p?.text || p._from === meRef.current?.id) return;
        onNoticeRef.current?.({ text: p.text, avatar: p.avatar ?? null });
      });
      ch.on("presence", { event: "sync" }, () => syncPresence(ch));
      ch.subscribe((nextStatus, err) => {
        if (disposed || channel !== ch) return;
        if (nextStatus === "SUBSCRIBED") {
          attempt = 0;
          updateStatus("connected");
          trackPresence(true);
          onRefreshRef.current();
        } else if (
          nextStatus === "CHANNEL_ERROR" ||
          nextStatus === "TIMED_OUT" ||
          nextStatus === "CLOSED"
        ) {
          console.warn(
            `[collab] channel ${nextStatus} for project:${projectId} - reconnecting`,
            err ?? "",
          );
          channel = null;
          if (channelRef.current === ch) channelRef.current = null;
          void supabase.removeChannel(ch);
          scheduleReconnect();
        }
      });
    };

    const connectDurableSync = () => {
      const ch = supabase
        .channel(`project-sync:${projectId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "projects",
            filter: `id=eq.${projectId}`,
          },
          () => onRefreshRef.current(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "project_assets",
            filter: `project_id=eq.${projectId}`,
          },
          (payload) => {
            const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Record<
              string,
              unknown
            >;
            const kind = row.kind === "audio" || row.kind === "bg" ? row.kind : null;
            onAssetChangeRef.current?.({
              event: payload.eventType,
              filename: typeof row.filename === "string" ? row.filename : null,
              kind,
              sha256: typeof row.sha256 === "string" ? row.sha256 : null,
            });
          },
        );
      syncChannel = ch;
      ch.subscribe((nextStatus, err) => {
        if (disposed || syncChannel !== ch) return;
        if (
          nextStatus === "CHANNEL_ERROR" ||
          nextStatus === "TIMED_OUT"
        ) {
          console.warn(
            `[collab] durable sync ${nextStatus} for project:${projectId}`,
            err ?? "",
          );
        }
      });
    };

    const onVisibilityChange = () => {
      const activeChannel = channelRef.current;
      if (!activeChannel || statusRef.current !== "connected") return;
      if (document.visibilityState === "visible" && !invisibleRef.current) {
        trackPresence(true);
      } else {
        void activeChannel.untrack();
      }
    };

    connect();
    connectDurableSync();
    document.addEventListener("visibilitychange", onVisibilityChange);
    const activePeers = peersRef.current;

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      for (const timer of leaveTimers.values()) window.clearTimeout(timer);
      leaveTimers.clear();
      const activeChannel = channel;
      const activeSyncChannel = syncChannel;
      channel = null;
      syncChannel = null;
      channelRef.current = null;
      if (activeChannel) {
        void activeChannel.untrack();
        void supabase.removeChannel(activeChannel);
      }
      if (activeSyncChannel) void supabase.removeChannel(activeSyncChannel);
      activePeers.clear();
      updateStatus("idle");
      setPeers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, enabled, me?.id]);

  useEffect(() => {
    const wasInvisible = invisibleRef.current;
    invisibleRef.current = !!opts.invisible;
    const activeChannel = channelRef.current;
    if (!activeChannel || statusRef.current !== "connected") return;
    if (opts.invisible && !wasInvisible) {
      void activeChannel.untrack();
    } else if (!opts.invisible && wasInvisible && document.visibilityState === "visible") {
      const currentMe = meRef.current;
      if (!currentMe) return;
      lastPresenceSendRef.current = Date.now();
      void activeChannel.track({
        id: currentMe.id,
        username: currentMe.username,
        avatar: currentMe.avatar,
        color: colorForId(currentMe.id),
        sessionId: sessionIdRef.current,
        updatedAt: Date.now(),
        ...presenceRef.current,
      } satisfies TrackedPresence);
    }
  }, [opts.invisible, projectId]);

  const sendBroadcast = (event: string, payload: unknown) => {
    if (!projectId) return;
    const activeChannel = channelRef.current;
    if (!activeChannel || statusRef.current !== "connected") {
      restBroadcast(projectId, event, payload);
      return;
    }
    void activeChannel
      .send({ type: "broadcast", event, payload })
      .then((result) => {
        if (result !== "ok") restBroadcast(projectId, event, payload);
      })
      .catch(() => restBroadcast(projectId, event, payload));
  };
  const sendOp = (op: CollabOp) => {
    sendBroadcast("op", { ...op, _from: meRef.current?.id });
  };
  const sendRefresh = () => {
    sendBroadcast("doc.bump", { _from: meRef.current?.id });
  };
  const sendNotice = (text: string) => {
    const currentMe = meRef.current;
    if (!currentMe) return;
    sendBroadcast("notice", {
      text,
      avatar: currentMe.avatar,
      _from: currentMe.id,
    });
  };
  const updatePresence = (fields: PresenceFields) => {
    const previous = presenceRef.current;
    const diffChanged =
      fields.activeDiffId !== undefined && fields.activeDiffId !== previous.activeDiffId;
    presenceRef.current = { ...previous, ...fields };
    const activeChannel = channelRef.current;
    const currentMe = meRef.current;
    if (
      !activeChannel ||
      !currentMe ||
      invisibleRef.current ||
      document.visibilityState !== "visible" ||
      statusRef.current !== "connected"
    ) {
      return;
    }
    if (diffChanged || Date.now() - lastPresenceSendRef.current >= PRESENCE_SEND_MS) {
      lastPresenceSendRef.current = Date.now();
      void activeChannel.track({
        id: currentMe.id,
        username: currentMe.username,
        avatar: currentMe.avatar,
        color: colorForId(currentMe.id),
        sessionId: sessionIdRef.current,
        updatedAt: Date.now(),
        ...presenceRef.current,
      } satisfies TrackedPresence);
    }
  };

  return { status, peers, sendOp, sendRefresh, updatePresence, sendNotice };
}
