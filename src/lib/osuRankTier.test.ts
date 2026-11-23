import { describe, expect, it } from "vitest";
import { countryRankTier, globalRankTier } from "./osuRankTier";

const stats = (over: Partial<Parameters<typeof globalRankTier>[0]>) => ({
  global_rank: null,
  global_rank_percent: null,
  country_rank: null,
  country_rank_percent: null,
  ...over,
});

describe("globalRankTier", () => {
  it("gives the top 100 lustrous whatever their share", () => {
    expect(globalRankTier(stats({ global_rank: 30, global_rank_percent: 0.00005 }))).toBe("lustrous");
    expect(globalRankTier(stats({ global_rank: 100, global_rank_percent: 0.9 }))).toBe("lustrous");
  });

  it("tiers everyone else by their share, as osu!'s website does", () => {
    const tier = (percent: number) => globalRankTier(stats({ global_rank: 5000, global_rank_percent: percent }));
    expect(tier(0.0004)).toBe("radiant");
    expect(tier(0.001)).toBe("rhodium");
    expect(tier(0.004)).toBe("platinum");
    expect(tier(0.0122)).toBe("gold");
    expect(tier(0.03)).toBe("silver");
    expect(tier(0.1)).toBe("bronze");
    expect(tier(0.3)).toBe("iron");
    expect(tier(0.5)).toBeNull();
  });

  it("stays plain without a rank or a share", () => {
    expect(globalRankTier(stats({ global_rank: 5000 }))).toBeNull();
    expect(globalRankTier(stats({ global_rank_percent: 0.001 }))).toBeNull();
  });
});

describe("countryRankTier", () => {
  // 1,000,000 ranked players, so the top 100 are the top 0.01%.
  const global = { global_rank: 12_206, global_rank_percent: 0.012206 };

  it("uses the same share tiers within the country", () => {
    expect(countryRankTier(stats({ ...global, country_rank: 18, country_rank_percent: 18 / 40_000 }))).toBe("radiant");
    expect(countryRankTier(stats({ ...global, country_rank: 18, country_rank_percent: 18 / 1_500 }))).toBe("gold");
  });

  it("gives lustrous to the country's share of the global top 100", () => {
    expect(countryRankTier(stats({ ...global, country_rank: 3, country_rank_percent: 3 / 40_000 }))).toBe("lustrous");
    expect(countryRankTier(stats({ ...global, country_rank: 5, country_rank_percent: 5 / 40_000 }))).toBe("radiant");
  });

  it("stays plain without the country's player count", () => {
    expect(countryRankTier(stats({ ...global, country_rank: 18 }))).toBeNull();
  });
});
