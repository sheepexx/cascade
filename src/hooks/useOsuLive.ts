import { useEffect, useRef, useState } from "react";
import { OSU_OFFLINE, watchOsuLive, type OsuLive } from "../lib/osuDesktop";
import { markOsuLinkAnnounced, osuLinkAnnounced } from "../lib/persistence";

export type OsuLiveState = {
  live: OsuLive;
  /**
   * Set the first time this install sees osu!, so the UI can introduce the
   * integration. Stays null on every launch after that — the connection is
   * ordinary by then, and the offer to open the selected map already says osu!
   * is being watched.
   */
  connectedAt: number | null;
  /** Clears the announcement without waiting for osu! to disconnect. */
  acknowledge: () => void;
};

/**
 * Tracks the native osu! watcher. Costs nothing on the web build, where the
 * subscription is a no-op and the state stays offline.
 */
export function useOsuLive(): OsuLiveState {
  const [live, setLive] = useState<OsuLive>(OSU_OFFLINE);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const wasConnected = useRef(false);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;

    void watchOsuLive((next) => {
      setLive(next);
      if (next.connected && !wasConnected.current) {
        if (!osuLinkAnnounced()) {
          markOsuLinkAnnounced();
          setConnectedAt(Date.now());
        }
      } else if (!next.connected && wasConnected.current) {
        // Drop a notice still on screen rather than leaving it pointing at an
        // osu! that has since closed.
        setConnectedAt(null);
      }
      wasConnected.current = next.connected;
    }).then((unwatch) => {
      if (cancelled) unwatch();
      else stop = unwatch;
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return {
    live,
    connectedAt,
    acknowledge: () => setConnectedAt(null),
  };
}
