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

    const channel = supabase.channel(`project:${projectId}`, {
      config: { private: true, broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "op" }, ({ payload }) => {
      const p = payload as NoteOp & { _from?: string };
      if (p?._from && p._from === meRef.current?.id) return; // ignore own echo
      onRemoteOpRef.current(p as NoteOp);
    });
    channel.on("broadcast", { event: "doc" }, ({ payload }) => {
      const p = payload as DocState & { _from?: string };
      if (p?._from && p._from === meRef.current?.id) return;
      onRemoteDocRef.current(p as DocState);
    });
    channel.on("broadcast", { event: "sync.request" }, ({ payload }) => {
      if ((payload as { _from?: string })?._from === meRef.current?.id) return;
      restBroadcast(projectId, "doc", {
        ...getDocRef.current(),
        _from: meRef.current?.id,
      });
    });
    // Presence over broadcast: a peer announced itself (or its position moved).
    channel.on("broadcast", { event: "presence" }, ({ payload }) => {
      const p = payload as Peer;
      if (!p?.id || p.id === meRef.current?.id) return;
      const map = peersRef.current;
      const isNew = !map.has(p.id);
      map.set(p.id, { ...p, lastSeen: Date.now() });
      publishPeers();
      if (isNew) {
        // Let the newcomer learn about us too.
        broadcastPresence();
        if (Date.now() >= readyAtRef.current) onPeerJoinRef.current?.(p);
      }
    });
    channel.on("broadcast", { event: "presence.leave" }, ({ payload }) => {
      const id = (payload as { id?: string })?.id;
      if (!id) return;
      const peer = peersRef.current.get(id);
      if (peer && peersRef.current.delete(id)) {
        publishPeers();
        onPeerLeaveRef.current?.(peer);
      }
    });

    channel.subscribe((s, err) => {
      if (s === "SUBSCRIBED") {
        setStatus("connected");
        readyAtRef.current = Date.now() + 1500;
        broadcastPresence(); // announce our arrival
        restBroadcast(projectId, "sync.request", { _from: me.id }); // pull freshest doc
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        setStatus("error");
        console.error(
          `[collab] channel ${s} for project:${projectId}`,
          err ?? "(no error detail — likely Realtime RLS/auth rejection)",
        );
      }
    });

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
      restBroadcast(projectId, "presence.leave", { id: me.id }); // best-effort
      window.clearInterval(heartbeat);
      window.clearInterval(pruner);
      channelRef.current = null;
      void supabase.removeChannel(channel);
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

  return { status, peers, sendOp, sendDoc, updatePresence };
}
