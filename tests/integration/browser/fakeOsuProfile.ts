/**
 * Replaces src/lib/osuProfile.ts in the harness with fixed osu! data, so
 * profile pages render without the Worker or osu! itself.
 */
export * from "../../../src/lib/osuProfile";
import type { BeatmapsetType, OsuBeatmapset, OsuMode, OsuProfile } from "../../../src/lib/osuProfile";

function profile(osuId: number, mode: OsuMode): OsuProfile {
  return {
    id: osuId,
    username: "fixture",
    avatar_url: null,
    cover_url: null,
    country: { code: "NL", name: "Netherlands" },
    is_supporter: true,
    support_level: 1,
    join_date: "2016-03-01T00:00:00Z",
    last_visit: null,
    is_online: null,
    title: null,
    profile_colour: null,
    playmode: "mania",
    mode,
    previous_usernames: [],
    badges: [],
    kudosu: { total: 42, available: 12 },
    follower_count: 120,
    mapping_follower_count: 35,
    counts: { ranked: 2, loved: 1, pending: 1, graveyard: 3, guest: 1, nominated: 0 },
    statistics: {
      global_rank: 12345,
      country_rank: 321,
      pp: 4567.8,
      accuracy: 97.45,
      play_count: 23456,
      play_time: 987654,
      ranked_score: 123456789,
      total_score: 987654321,
      maximum_combo: 3210,
      level: 100,
      level_progress: 40,
      grade_counts: { ssh: 3, ss: 40, sh: 25, s: 300, a: 800 },
    },
    rank_highest: { rank: 9876, updated_at: "2024-05-01T00:00:00Z" },
  };
}

function set(id: number, status: string, title: string, keys: number[]): OsuBeatmapset {
  return {
    id,
    title,
    artist: "Fixture Artist",
    title_unicode: null,
    artist_unicode: null,
    creator: "fixture",
    user_id: 1,
    status,
    play_count: id * 100,
    favourite_count: id * 3,
    bpm: 180,
    last_updated: `2025-0${(id % 9) + 1}-01T00:00:00Z`,
    ranked_date: status === "ranked" ? `2025-0${(id % 9) + 1}-02T00:00:00Z` : null,
    submitted_date: null,
    covers: { card: null, card2x: null, cover: null, list: null },
    beatmaps: keys.map((k, i) => ({
      id: id * 10 + i,
      mode: "mania",
      version: `${k}K Hard`,
      difficulty_rating: 2 + i * 1.5,
      cs: k,
      total_length: 150,
      bpm: 180,
      playcount: 10,
      user_id: 1,
    })),
  };
}

const SETS: Record<BeatmapsetType, OsuBeatmapset[]> = {
  ranked: [set(1, "ranked", "Ranked Song", [4, 7]), set(2, "qualified", "Qualified Song", [4])],
  loved: [set(3, "loved", "Loved Song", [7])],
  pending: [set(4, "wip", "Work In Progress", [4])],
  graveyard: [set(5, "graveyard", "Old One", [4]), set(6, "graveyard", "Older One", [6]), set(7, "graveyard", "Oldest", [4])],
  guest: [{ ...set(8, "ranked", "Guest Set", [4]), creator: "someone", user_id: 99 }],
  nominated: [],
};

export async function fetchOsuProfile(osuId: number, mode: OsuMode) {
  return { profile: profile(osuId, mode), fetched_at: new Date().toISOString() };
}

export async function fetchBeatmapsets(osuId: number, type: BeatmapsetType, offset: number, limit: number) {
  // The mapper's own sets carry their osu! id; guest sets someone else's.
  const all = SETS[type].map((s) => (s.user_id === 1 ? { ...s, user_id: osuId, creator: "bob" } : s));
  return { beatmapsets: all.slice(offset, offset + limit), has_more: offset + limit < all.length };
}

export async function lookupRenamedUser(): Promise<string | null> {
  return null;
}
