import type { OsuStatistics } from "./osuProfile";

/**
 * The colours osu!'s website gives a profile's global rank
 * (ppy/osu-web, resources/js/profile-page/rank.tsx and the --level-tier-*
 * gradients in resources/css/layout.less): the top 100 are lustrous, and
 * everyone else is tiered by the share of the mode's ranked players at or
 * above them.
 */
export type RankTier =
  | "lustrous"
  | "radiant"
  | "rhodium"
  | "platinum"
  | "gold"
  | "silver"
  | "bronze"
  | "iron";

/** Top and bottom colours of the text gradient. */
export const RANK_TIER_GRADIENT: Record<RankTier, readonly [string, string]> = {
  lustrous: ["#ffe600", "#ed82ff"],
  radiant: ["#97dcff", "#ed82ff"],
  rhodium: ["#d9f8d3", "#a0cf96"],
  platinum: ["#a8f0ef", "#52e0df"],
  gold: ["#f0e4a8", "#e0c952"],
  silver: ["#e0e0eb", "#a3a3c2"],
  bronze: ["#b88f7a", "#855c47"],
  iron: ["#bab3ab", "#bab3ab"],
};

const LUSTROUS_RANKS = 100;

function tierByShare(percent: number): RankTier | null {
  if (percent < 0.0005) return "radiant";
  if (percent < 0.0015) return "rhodium";
  if (percent < 0.005) return "platinum";
  if (percent < 0.015) return "gold";
  if (percent < 0.05) return "silver";
  if (percent < 0.15) return "bronze";
  if (percent < 0.5) return "iron";
  return null;
}

type RankStats = Pick<
  OsuStatistics,
  "global_rank" | "global_rank_percent" | "country_rank" | "country_rank_percent"
>;

export function globalRankTier(stats: RankStats): RankTier | null {
  const rank = stats.global_rank;
  const percent = stats.global_rank_percent ?? null;
  if (rank == null || percent == null) return null;
  if (rank <= LUSTROUS_RANKS) return "lustrous";
  return tierByShare(percent);
}

/**
 * osu!'s website leaves the country rank plain. Here it gets the same tiers
 * by its share of the country's ranked players, and lustrous goes to the
 * same share of the country that the top 100 are of the whole mode.
 */
export function countryRankTier(stats: RankStats): RankTier | null {
  const rank = stats.country_rank;
  const percent = stats.country_rank_percent ?? null;
  if (rank == null || percent == null) return null;
  const global = stats.global_rank;
  const globalPercent = stats.global_rank_percent ?? null;
  // The mode's ranked players, from the global rank and its share.
  const players = global != null && globalPercent ? global / globalPercent : null;
  if (players !== null && percent <= LUSTROUS_RANKS / players) return "lustrous";
  return tierByShare(percent);
}
