export type PresencePeer = {
  id: string;
  username: string;
  avatar: string | null;
  color: string;
  osuId?: number | null;
  status?: string | null;
  activeDiffId?: string;
  playheadMs?: number;
  cursorTimeMs?: number;
  cursorColumn?: number;
};

export type TrackedPresence = PresencePeer & {
  sessionId: string;
  updatedAt: number;
};

type PresenceState = Record<string, TrackedPresence[]>;

/**
 * Supabase Presence is session-based, while the editor UI is user-based. A
 * mapper can have multiple tabs open, so collapse those sessions and keep the
 * most recently updated cursor/playhead for each account.
 */
export function aggregatePresencePeers(
  state: PresenceState,
  myUserId: string,
): Map<string, PresencePeer> {
  const peers = new Map<string, PresencePeer>();
  const newest = new Map<string, number>();

  for (const sessions of Object.values(state)) {
    for (const session of sessions) {
      if (!session?.id || session.id === myUserId || !session.username) continue;
      const updatedAt = Number.isFinite(session.updatedAt) ? session.updatedAt : 0;
      if (peers.has(session.id) && updatedAt < (newest.get(session.id) ?? 0)) continue;
      newest.set(session.id, updatedAt);
      peers.set(session.id, {
        id: session.id,
        username: session.username,
        avatar: session.avatar ?? null,
        color: session.color,
        osuId: session.osuId ?? null,
        status: session.status ?? null,
        activeDiffId: session.activeDiffId,
        playheadMs: session.playheadMs,
        cursorTimeMs: session.cursorTimeMs,
        cursorColumn: session.cursorColumn,
      });
    }
  }

  return peers;
}
