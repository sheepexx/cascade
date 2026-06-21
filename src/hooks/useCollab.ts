import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, getSupabaseToken } from "../lib/supabase";
import type { DocState, NoteOp } from "../lib/ops";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Send a broadcast over the Realtime REST endpoint (not the WebSocket).
 *
 * In the browser the WS `channel.send()` / `track()` intermittently can't push
 * (the channel leaves the `joined` state) and silently fails, so note ops and
 * presence never reach peers. Posting here with the signed-in user's token is
 * reliable (202) and the message is still delivered to every WS subscriber of
 * the topic — so we SEND over REST and RECEIVE over the WebSocket.
 */
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

/**
 * Realtime co-op session for one cloud project.
 *
 * Joins a private `project:<id>` channel and provides:
 *  - granular note-op broadcast (`sendOp`) + receive (`onRemoteOp`),
 *  - whole-document sync (`sendDoc`) for structural changes + the join handoff,
 *  - presence (who's online + where they're working).
 *
 * Presence is implemented as periodic `presence` broadcasts (a heartbeat) plus a
 * prune timer, rather than Supabase Presence, because Presence rides the same
 * unreliable WS push. On join it asks peers for the freshest in-memory document
 * (`sync.request`); a present peer answers with a `doc` broadcast.
 */

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

/** How often we re-announce our presence (keep-alive). */
const HEARTBEAT_MS = 3000;
/** Drop a peer we haven't heard from in this long (≈3 missed heartbeats). */
const PEER_TTL_MS = 9000;

/** Deterministic, readable color per user id. */
export function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 60%)`;
}

export function useCollab(opts: {
  projectId: string | null;
  enabled: boolean;
  me: Me | null;
  onRemoteOp: (op: NoteOp) => void;
  onRemoteDoc: (doc: DocState) => void;
  getDoc: () => DocState;
  /** A collaborator appeared (after we joined) — for join notifications. */
  onPeerJoin?: (peer: Peer) => void;
  /** A collaborator left. */
  onPeerLeave?: (peer: Peer) => void;
  /** A collaborator announced something (e.g. changed the audio/background). */
  onNotice?: (notice: { text: string; avatar: string | null }) => void;
}) {
  const { projectId, enabled, me } = opts;
  const [status, setStatus] = useState<CollabStatus>("idle");
  const [peers, setPeers] = useState<Peer[]>([]);

  // Keep callbacks/state on refs so the channel effect runs once per project.
  const onRemoteOpRef = useRef(opts.onRemoteOp);
  onRemoteOpRef.current = opts.onRemoteOp;
  const onRemoteDocRef = useRef(opts.onRemoteDoc);
  onRemoteDocRef.current = opts.onRemoteDoc;
  const getDocRef = useRef(opts.getDoc);
  getDocRef.current = opts.getDoc;
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
  // id -> peer + last-seen timestamp (for prune-based leave detection).
  const peersRef = useRef<Map<string, Peer & { lastSeen: number }>>(new Map());
  // Suppress join toasts for peers discovered in the first moment after we join
  // (they were already here, answering our arrival — not genuinely joining).
  const readyAtRef = useRef(0);
  // Throttle outgoing presence broadcasts (playhead updates fire often).
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

    // Lifecycle for this effect run. The channel is rebuilt on transient errors
    // (a just-invited collaborator can hit a Realtime RLS race, or the socket
    // can blip), so a failed join self-heals instead of needing a page reload.
    let disposed = false;
    let channel: RealtimeChannel | null = null;
    let reconnectTimer: number | undefined;
    let attempt = 0;
    // Join handoff: pull the freshest in-memory doc from a present peer. The very
    // first request can race a peer that hasn't subscribed yet, so retry it (on a
    // timer and whenever a peer first appears) until a doc actually arrives.
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
      // Keep the optimistic "Connecting…" for the first few tries (covers the
      // common transient race); surface a hard failure after that, but keep
      // retrying so it still self-heals once Realtime/connectivity recovers.
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
        const p = payload as NoteOp & { _from?: string };
        if (p?._from && p._from === meRef.current?.id) return; // ignore own echo
        onRemoteOpRef.current(p as NoteOp);
      });
      ch.on("broadcast", { event: "doc" }, ({ payload }) => {
        const p = payload as DocState & { _from?: string };
        if (p?._from && p._from === meRef.current?.id) return;
        gotJoinDoc = true; // handoff satisfied (or a live structural update)
        onRemoteDocRef.current(p as DocState);
      });
      ch.on("broadcast", { event: "sync.request" }, ({ payload }) => {
        if ((payload as { _from?: string })?._from === meRef.current?.id) return;
        restBroadcast(projectId, "doc", {
          ...getDocRef.current(),
          _from: meRef.current?.id,
        });
      });
      // Presence over broadcast: a peer announced itself (or its position moved).
      ch.on("broadcast", { event: "presence" }, ({ payload }) => {
        const p = payload as Peer;
        if (!p?.id || p.id === meRef.current?.id) return;
        const map = peersRef.current;
        const isNew = !map.has(p.id);
        map.set(p.id, { ...p, lastSeen: Date.now() });
        publishPeers();
        if (isNew) {
          // Let the newcomer learn about us too, and (re)pull the doc — this peer
          // may hold edits our initial sync.request raced ahead of.
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
      // A peer announced an action (e.g. changed the audio/background).
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
        if (disposed || channel !== ch) return; // ignore stale-channel callbacks
        if (s === "SUBSCRIBED") {
          attempt = 0;
          setStatus("connected");
          readyAtRef.current = Date.now() + 1500;
          broadcastPresence(); // announce our arrival
          startJoinSync(); // pull freshest doc, with retries
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          // Rebuild the channel rather than giving up (scheduleReconnect owns the
          // status + backoff).
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

    // Heartbeat: keep peers aware we're still here.
    const heartbeat = window.setInterval(broadcastPresence, HEARTBEAT_MS);
    // Prune: drop peers we haven't heard from (ungraceful leave / closed tab).
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
      restBroadcast(projectId, "presence.leave", { id: me.id }); // best-effort
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
    // Re-subscribe only when the project, enabled flag, or user identity changes
    // (not on every render — `me` is recreated each render by the parent).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, enabled, me?.id]);

  const sendOp = (op: NoteOp) => {
    if (!projectId) return;
    restBroadcast(projectId, "op", { ...op, _from: meRef.current?.id });
  };
  const sendDoc = (doc: DocState) => {
    if (!projectId) return;
    restBroadcast(projectId, "doc", { ...doc, _from: meRef.current?.id });
  };
  /** Announce an action to peers (shown as a transient toast on their side). */
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
    // Broadcast immediately on a difficulty switch; otherwise throttle (playhead
    // moves fire ~2×/s) and let the heartbeat carry the latest position.
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

  return { status, peers, sendOp, sendDoc, updatePresence, sendNotice };
}
