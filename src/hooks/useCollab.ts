import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { DocState, NoteOp } from "../lib/ops";

/**
 * Realtime co-op session for one cloud project.
 *
 * Joins a private `project:<id>` channel and provides:
 *  - granular note-op broadcast (`sendOp`) + receive (`onRemoteOp`),
 *  - whole-document sync (`sendDoc`) for structural changes + the join handoff,
 *  - presence (who's online + where they're working).
 *
 * On join it asks peers for the freshest in-memory document (`sync.request`);
 * a present peer answers with a `doc` broadcast, so a late joiner sees changes
 * made while they were away even if the saved snapshot is stale.
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

  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceRef = useRef<PresenceFields>({});
  const meRef = useRef<Me | null>(me);
  meRef.current = me;

  useEffect(() => {
    if (!enabled || !projectId || !me) {
      setStatus("idle");
      setPeers([]);
      return;
    }
    setStatus("connecting");
    const color = colorForId(me.id);
    const channel = supabase.channel(`project:${projectId}`, {
      config: {
        private: true,
        broadcast: { self: false },
        presence: { key: me.id },
      },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "op" }, ({ payload }) =>
      onRemoteOpRef.current(payload as NoteOp),
    );
    channel.on("broadcast", { event: "doc" }, ({ payload }) =>
      onRemoteDocRef.current(payload as DocState),
    );
    channel.on("broadcast", { event: "sync.request" }, () => {
      channel.send({
        type: "broadcast",
        event: "doc",
        payload: getDocRef.current(),
      });
    });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<
        string,
        Array<Peer & { presence_ref: string }>
      >;
      const list: Peer[] = [];
      for (const [key, metas] of Object.entries(state)) {
        if (key === meRef.current?.id) continue;
        const m = metas[0];
        if (m) list.push(m);
      }
      setPeers(list);
    });

    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        setStatus("connected");
        void channel.track({
          id: me.id,
          username: me.username,
          avatar: me.avatar,
          color,
          ...presenceRef.current,
        });
        // Ask any present peer for the freshest document.
        channel.send({ type: "broadcast", event: "sync.request", payload: {} });
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        setStatus("error");
      }
    });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setStatus("idle");
      setPeers([]);
    };
    // Re-subscribe only when the project, enabled flag, or user identity changes
    // (not on every render — `me` is recreated each render by the parent).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, enabled, me?.id]);

  const sendOp = (op: NoteOp) => {
    channelRef.current?.send({ type: "broadcast", event: "op", payload: op });
  };
  const sendDoc = (doc: DocState) => {
    channelRef.current?.send({ type: "broadcast", event: "doc", payload: doc });
  };
  const updatePresence = (fields: PresenceFields) => {
    presenceRef.current = { ...presenceRef.current, ...fields };
    const ch = channelRef.current;
    const m = meRef.current;
    if (!ch || !m) return;
    void ch.track({
      id: m.id,
      username: m.username,
      avatar: m.avatar,
      color: colorForId(m.id),
      ...presenceRef.current,
    });
  };

  return { status, peers, sendOp, sendDoc, updatePresence };
}
