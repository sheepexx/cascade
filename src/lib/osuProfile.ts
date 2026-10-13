import { sessionAuthHeaders } from "./auth";

/**
 * Public osu! data for profiles, through the Worker (worker/src/social.ts,
 * which defines the same shapes). The Worker caches osu!'s answers for ten
 * minutes; this keeps them for the life of the page as well, so moving
 * between profiles and tabs doesn't ask again.
 */

export const OSU_MODES = ["mania", "osu", "taiko", "fruits"] as const;
export type OsuMode = (typeof OSU_MODES)[number];

export const BEATMAPSET_TYPES = ["ranked", "loved", "pending", "graveyard", "guest", "nominated"] as const;
export type BeatmapsetType = (typeof BEATMAPSET_TYPES)[number];

export type OsuBadge = {
  awarded_at: string | null;
  description: string;
  image_url: string;
  image_2x_url: string | null;
  url: string | null;
};

export type OsuStatistics = {
  global_rank: number | null;
  country_rank: number | null;
  pp: number | null;
  accuracy: number | null;
  play_count: number | null;
  play_time: number | null;
  ranked_score: number | null;
  total_score: number | null;
  maximum_combo: number | null;
  level: number | null;
  level_progress: number | null;
  grade_counts: { ssh: number; ss: number; sh: number; s: number; a: number } | null;
};

export type OsuProfile = {
  id: number;
  username: string;
  avatar_url: string | null;
  cover_url: string | null;
  country: { code: string; name: string } | null;
  is_supporter: boolean;
  support_level: number;
  join_date: string | null;
  last_visit: string | null;
  is_online: boolean | null;
  title: string | null;
  profile_colour: string | null;
  playmode: string | null;
  mode: OsuMode;
  previous_usernames: string[];
  badges: OsuBadge[];
  kudosu: { total: number; available: number } | null;
  follower_count: number | null;
  mapping_follower_count: number | null;
  counts: Record<Exclude<BeatmapsetType, "nominated">, number> & { nominated: number };
  statistics: OsuStatistics | null;
  rank_highest: { rank: number; updated_at: string | null } | null;
};

export type OsuBeatmap = {
  id: number;
  mode: string;
  version: string;
  difficulty_rating: number;
  cs: number | null;
  total_length: number;
  bpm: number | null;
  playcount: number | null;
  user_id: number | null;
};

export type OsuBeatmapset = {
  id: number;
  title: string;
  artist: string;
  title_unicode: string | null;
  artist_unicode: string | null;
  creator: string;
  user_id: number;
  status: string;
  play_count: number;
  favourite_count: number;
  bpm: number | null;
  last_updated: string | null;
  ranked_date: string | null;
  submitted_date: string | null;
  covers: { card: string | null; card2x: string | null; cover: string | null; list: string | null };
  beatmaps: OsuBeatmap[];
};

const WORKER = import.meta.env.VITE_WORKER_URL ?? "";

const profiles = new Map<string, { at: number; value: { profile: OsuProfile; fetched_at: string } }>();
const pages = new Map<string, { at: number; value: { beatmapsets: OsuBeatmapset[]; has_more: boolean } }>();
const PAGE_CACHE_MS = 10 * 60_000;

export class OsuUnavailableError extends Error {}

async function get<T>(path: string): Promise<T> {
  if (!WORKER) throw new OsuUnavailableError("osu! data needs the Cascade backend.");
  let res: Response;
  try {
    res = await fetch(`${WORKER}${path}`, {
      credentials: "include",
      headers: sessionAuthHeaders(),
    });
  } catch {
    throw new OsuUnavailableError("Couldn't reach osu!.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new OsuUnavailableError(body?.error ?? `osu! answered ${res.status}.`);
  }
  return (await res.json()) as T;
}

export async function fetchOsuProfile(
  osuId: number,
  mode: OsuMode,
  refresh = false,
): Promise<{ profile: OsuProfile; fetched_at: string }> {
  const key = `${osuId}:${mode}`;
  const hit = profiles.get(key);
  if (hit && !refresh && Date.now() - hit.at < PAGE_CACHE_MS) return hit.value;
  const value = await get<{ profile: OsuProfile; fetched_at: string }>(
    `/osu/users/${osuId}?mode=${mode}${refresh ? "&refresh=1" : ""}`,
  );
  profiles.set(key, { at: Date.now(), value });
  return value;
}

export async function fetchBeatmapsets(
  osuId: number,
  type: BeatmapsetType,
  offset: number,
  limit: number,
): Promise<{ beatmapsets: OsuBeatmapset[]; has_more: boolean }> {
  const key = `${osuId}:${type}:${offset}:${limit}`;
  const hit = pages.get(key);
  if (hit && Date.now() - hit.at < PAGE_CACHE_MS) return hit.value;
  const value = await get<{ beatmapsets: OsuBeatmapset[]; has_more: boolean }>(
    `/osu/users/${osuId}/beatmapsets/${type}?offset=${offset}&limit=${limit}`,
  );
  pages.set(key, { at: Date.now(), value });
  return value;
}

/** Which Cascade account holds an osu! name now, for links to an old name. */
export async function lookupRenamedUser(name: string): Promise<string | null> {
  try {
    const result = await get<{ user: { username: string } | null }>(
      `/osu/lookup/${encodeURIComponent(name)}`,
    );
    return result.user?.username ?? null;
  } catch {
    return null;
  }
}

export function osuProfileUrl(osuId: number, mode?: OsuMode): string {
  return `https://osu.ppy.sh/users/${osuId}${mode ? `/${mode}` : ""}`;
}

export function beatmapsetUrl(id: number): string {
  return `https://osu.ppy.sh/beatmapsets/${id}`;
}
