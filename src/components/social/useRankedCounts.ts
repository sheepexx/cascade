import { useEffect, useState } from "react";
import { fetchOsuProfile } from "../../lib/osuProfile";
import type { ProfileCard } from "../../lib/social";

/**
 * Ranked map counts for every card shown, including people whose osu!
 * summary Cascade hasn't stored yet. Those are fetched through the Worker a
 * few at a time; the Worker stores the summary as it goes, so the next
 * visitor reads it straight from the database.
 */
const known = new Map<string, number>();
const pending = new Set<string>();
const CONCURRENCY = 3;

export function rankedCountOf(card: ProfileCard, counts: ReadonlyMap<string, number>): number | null {
  return card.osu?.ranked_count ?? counts.get(card.id) ?? null;
}

export function useRankedCounts(cards: readonly ProfileCard[] | null): ReadonlyMap<string, number> {
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(() => new Map(known));

  useEffect(() => {
    if (!cards) return;
    let cancelled = false;
    const missing = cards.filter((c) => !c.osu && !known.has(c.id) && !pending.has(c.id));
    if (!missing.length) return;
    const queue = [...missing];
    const work = async () => {
      for (let card = queue.shift(); card; card = queue.shift()) {
        pending.add(card.id);
        try {
          const { profile } = await fetchOsuProfile(card.osu_id, "mania");
          known.set(card.id, profile.counts.ranked);
          if (!cancelled) setCounts(new Map(known));
        } catch {
          // Shown without a count; another visit tries again.
        } finally {
          pending.delete(card.id);
        }
      }
    };
    for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) void work();
    return () => {
      cancelled = true;
    };
  }, [cards]);

  return counts;
}
