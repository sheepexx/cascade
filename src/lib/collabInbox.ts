import { isCollabOp, type CollabOp } from "./ops";

/** The envelope every broadcast carries next to its own fields. */
export type CollabEnvelope = {
  /** The sender's account. Two windows on one account share it. */
  _from?: string;
  /** The sending window: one per page load, so it tells same-account windows apart. */
  _clientId?: string;
  _opId?: string;
  _seq?: number;
};

const SEEN_OP_LIMIT = 10_000;

function envelope(payload: unknown): CollabEnvelope {
  return typeof payload === "object" && payload !== null
    ? (payload as CollabEnvelope)
    : {};
}

/**
 * Whether a broadcast came from this window. Messages name the window that
 * sent them, so another tab or device on the same account is a collaborator
 * like anyone else. A message without a window id comes from a build older
 * than that; it is treated as this window's own only when it carries this
 * account's id, which is what those builds did, so a legacy echo is still
 * ignored and legacy edits from other accounts still arrive.
 */
export function isOwnMessage(
  payload: unknown,
  me: { clientId: string; userId: string | null },
): boolean {
  const { _clientId, _from } = envelope(payload);
  if (typeof _clientId === "string") return _clientId === me.clientId;
  return typeof _from === "string" && _from === me.userId;
}

/**
 * Filters incoming edit broadcasts: drops this window's own echoes, anything
 * that is not a well-formed op, a message seen before (Realtime and the REST
 * fallback can both deliver one), and an op that arrives after a later op
 * from the same window, which would otherwise undo it.
 */
export class CollabInbox {
  private seenOpIds = new Set<string>();
  private lastSeq = new Map<string, number>();

  constructor(private readonly clientId: string) {}

  reset(): void {
    this.seenOpIds.clear();
    this.lastSeq.clear();
  }

  accept(payload: unknown, userId: string | null): CollabOp | null {
    if (!isCollabOp(payload)) return null;
    if (isOwnMessage(payload, { clientId: this.clientId, userId })) return null;
    const { _opId, _clientId, _seq } = envelope(payload);
    if (typeof _opId === "string") {
      if (this.seenOpIds.has(_opId)) return null;
      this.seenOpIds.add(_opId);
      if (this.seenOpIds.size > SEEN_OP_LIMIT) {
        const oldest = this.seenOpIds.values().next().value;
        if (oldest !== undefined) this.seenOpIds.delete(oldest);
      }
    }
    if (typeof _clientId === "string" && typeof _seq === "number" && Number.isFinite(_seq)) {
      const last = this.lastSeq.get(_clientId);
      if (last !== undefined && _seq <= last) return null;
      this.lastSeq.set(_clientId, _seq);
    }
    return payload;
  }
}
