import { describe, expect, it } from "vitest";
import { aggregatePresencePeers, type TrackedPresence } from "./collabPresence";

function presence(
  id: string,
  sessionId: string,
  updatedAt: number,
  playheadMs: number,
): TrackedPresence {
  return {
    id,
    sessionId,
    updatedAt,
    playheadMs,
    username: `user-${id}`,
    avatar: null,
    color: "red",
  };
}

describe("aggregatePresencePeers", () => {
  it("collapses multiple tabs and keeps the newest position", () => {
    const peers = aggregatePresencePeers(
      {
        first: [presence("alice", "tab-a", 10, 100)],
        second: [presence("alice", "tab-b", 20, 250)],
      },
      "me",
    );

    expect([...peers]).toHaveLength(1);
    expect(peers.get("alice")?.playheadMs).toBe(250);
  });

  it("omits the current user's own sessions", () => {
    const peers = aggregatePresencePeers(
      { mine: [presence("me", "tab-a", 10, 100)] },
      "me",
    );

    expect(peers.size).toBe(0);
  });
});
