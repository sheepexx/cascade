import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, getSupabaseToken } from "../lib/supabase";
import type { CollabOp } from "../lib/ops";

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

export type Peer = {
  id: string;
  username: string;
  avatar: string | null;
  color: string;
  activeDiffId?: string;
  playheadMs?: number;
  cursorTimeMs?: number;
  cursorColumn?: number;
};

export type CollabStatus = "idle" | "connecting" | "connected" | "error";

type PresenceFields = {
  activeDiffId?: string;
  playheadMs?: number;
  cursorTimeMs?: number;
  cursorColumn?: number;
};

type Me = { id: string; username: string; avatar: string | null };

const HEARTBEAT_MS = 3000;
const PEER_TTL_MS = 9000;

export function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 60%)`;
}

export function useCollab(opts: {
  projectId: string | null;
  enabled: boolean;
  me: Me | null;
  onRemoteOp: (op: CollabOp) => void;
  onRefresh: () => void;
  onSyncRequest: () => void;
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
  const onSyncRequestRef = useRef(opts.onSyncRequest);
  onSyncRequestRef.current = opts.onSyncRequest;
  const onPeerJoinRef = useRef(opts.onPeerJoin);
  onPeerJoinRef.current = opts.onPeerJoin;
  const onPeerLeaveRef = useRef(opts.onPeerLeave);
  onPeerLeaveRef.current = opts.onPeerLeave;
  const onNoticeRef = useRef(opts.onNotice);
  onNoticeRef.current = opts.onNotice;

  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceRef = useRef<PresenceFields>({});
  const meRef = useRef<Me | null>(me);
  meRef.current = me;
  const peersRef = useRef<Map<string, Peer & { lastSeen: number }>>(new Map());
  const readyAtRef = useRef(0);
  const lastPresenceSendRef = useRef(0);

  useEffect(() => {
    if (!enabled || !projectId || !me) {
      setStatus("idle");
      setPeers([]);
      peersRef.current.clear();
      return;
    }
    setStatus("connecting");
    peersRef.current.clear();
    setPeers([]);
    const myColor = colorForId(me.id);

    let disposed = false;
    let channel: RealtimeChannel | null = null;
    let reconnectTimer: number | undefined;
    let attempt = 0;
    let gotJoinDoc = false;
    const joinSyncTimers: number[] = [];

    const publishPeers = () => setPeers([...peersRef.current.values()]);

    const broadcastPresence = () => {
      const m = meRef.current;
      if (!m) return;
      lastPresenceSendRef.current = Date.now();
      restBroadcast(projectId, "presence", {
        id: m.id,
        username: m.username,
        avatar: m.avatar,
        color: myColor,
        ...presenceRef.current,
      });
    };

    const requestSync = () => {
      if (disposed || gotJoinDoc) return;
      restBroadcast(projectId, "sync.request", { _from: me.id });
    };
    const startJoinSync = () => {
      gotJoinDoc = false;
      joinSyncTimers.forEach((t) => window.clearTimeout(t));
      joinSyncTimers.length = 0;
      requestSync();
      for (const delay of [1000, 2500, 5000]) {
        joinSyncTimers.push(window.setTimeout(requestSync, delay));
      }
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== undefined) return;
      const delay = Math.min(1000 * 2 ** attempt, 15000);
      attempt += 1;
      setStatus(attempt >= 5 ? "error" : "connecting");
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      setStatus("connecting");
      const ch = supabase.channel(`project:${projectId}`, {
        config: { private: true, broadcast: { self: false } },
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
        gotJoinDoc = true;
        onRefreshRef.current();
      });
      ch.on("broadcast", { event: "sync.request" }, ({ payload }) => {
        if ((payload as { _from?: string })?._from === meRef.current?.id) return;
        onSyncRequestRef.current();
      });
      ch.on("broadcast", { event: "presence" }, ({ payload }) => {
        const p = payload as Peer;
        if (!p?.id || p.id === meRef.current?.id) return;
        const map = peersRef.current;
        const isNew = !map.has(p.id);
        map.set(p.id, { ...p, lastSeen: Date.now() });
        publishPeers();
        if (isNew) {
          broadcastPresence();
          requestSync();
          if (Date.now() >= readyAtRef.current) onPeerJoinRef.current?.(p);
        }
      });
      ch.on("broadcast", { event: "presence.leave" }, ({ payload }) => {
        const id = (payload as { id?: string })?.id;
        if (!id) return;
        const peer = peersRef.current.get(id);
        if (peer && peersRef.current.delete(id)) {
          publishPeers();
          onPeerLeaveRef.current?.(peer);
        }
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

      ch.subscribe((s, err) => {
        if (disposed || channel !== ch) return;
        if (s === "SUBSCRIBED") {
          attempt = 0;
          setStatus("connected");
          readyAtRef.current = Date.now() + 1500;
          broadcastPresence();
          startJoinSync();
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          console.warn(
            `[collab] channel ${s} for project:${projectId} — reconnecting`,
            err ?? "",
          );
          void supabase.removeChannel(ch);
          scheduleReconnect();
        }
      });
    };

    connect();

    const heartbeat = window.setInterval(broadcastPresence, HEARTBEAT_MS);
    const pruner = window.setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, peer] of peersRef.current) {
        if (now - peer.lastSeen > PEER_TTL_MS) {
          peersRef.current.delete(id);
          onPeerLeaveRef.current?.(peer);
          changed = true;
        }
      }
      if (changed) publishPeers();
    }, HEARTBEAT_MS);

    return () => {
      disposed = true;
      restBroadcast(projectId, "presence.leave", { id: me.id });
      window.clearInterval(heartbeat);
      window.clearInterval(pruner);
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      joinSyncTimers.forEach((t) => window.clearTimeout(t));
      channelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
      peersRef.current.clear();
      setStatus("idle");
      setPeers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, enabled, me?.id]);

  const sendOp = (op: CollabOp) => {
    if (!projectId) return;
    restBroadcast(projectId, "op", { ...op, _from: meRef.current?.id });
  };
  const sendRefresh = () => {
    if (!projectId) return;
    restBroadcast(projectId, "doc.bump", { _from: meRef.current?.id });
  };
  const sendNotice = (text: string) => {
    const m = meRef.current;
    if (!projectId || !m) return;
    restBroadcast(projectId, "notice", { text, avatar: m.avatar, _from: m.id });
  };
  const updatePresence = (fields: PresenceFields) => {
    const prev = presenceRef.current;
    const diffChanged =
      fields.activeDiffId !== undefined && fields.activeDiffId !== prev.activeDiffId;
    presenceRef.current = { ...prev, ...fields };
    const m = meRef.current;
    if (!projectId || !m) return;
    if (diffChanged || Date.now() - lastPresenceSendRef.current > 900) {
      lastPresenceSendRef.current = Date.now();
      restBroadcast(projectId, "presence", {
        id: m.id,
        username: m.username,
        avatar: m.avatar,
        color: colorForId(m.id),
        ...presenceRef.current,
      });
    }
  };

  return { status, peers, sendOp, sendRefresh, updatePresence, sendNotice };
}
