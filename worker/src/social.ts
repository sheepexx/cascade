import type { WorkerEnv } from "./storage";

/**
 * Public osu! data for Cascade profiles: the profile itself (per game mode)
 * and the beatmapsets in each section of it. Requests go out with the app's
 * client-credentials token, never a user's, and only for osu! accounts that
 * have signed in to Cascade, so this can't be used as an open osu! API proxy.
 *
 * osu! asks API users to stay around one request a second. Profiles and
 * beatmapset pages are kept in the edge cache for ten minutes, and the
 * numbers search results need (country, mapping counts) are written to
 * osu_profile_cache so lists never ask osu! at all.
 */

export const OSU_MODES = ["mania", "osu", "taiko", "fruits"] as const;
export type OsuMode = (typeof OSU_MODES)[number];

export const BEATMAPSET_TYPES = [
  "ranked",
  "loved",
  "pending",
  "graveyard",
  "guest",
  "nominated",
] as const;
export type BeatmapsetType = (typeof BEATMAPSET_TYPES)[number];

const CACHE_SECONDS = 600;
const MAX_PAGE = 50;

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
  counts: {
    ranked: number;
    loved: number;
    pending: number;
    graveyard: number;
    guest: number;
    nominated: number;
  };
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

type Raw = Record<string, unknown>;

function obj(value: unknown): Raw | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function https(value: unknown): string | null {
  const text = str(value);
  return text && /^https:\/\//i.test(text) ? text : null;
}

/** The parts of an osu! /users response a Cascade profile shows. */
export function normalizeOsuUser(raw: unknown, mode: OsuMode): OsuProfile | null {
  const user = obj(raw);
  const id = num(user?.id);
  const username = str(user?.username);
  if (!user || id === null || !username) return null;

  const country = obj(user.country);
  const cover = obj(user.cover);
  const kudosu = obj(user.kudosu);
  const stats = obj(user.statistics);
  const grades = obj(stats?.grade_counts);
  const level = obj(stats?.level);
  const highest = obj(user.rank_highest);

  return {
    id,
    username,
    avatar_url: https(user.avatar_url),
    cover_url: https(cover?.custom_url) ?? https(cover?.url) ?? https(user.cover_url),
    country:
      country && str(country.code)
        ? { code: String(country.code).toUpperCase(), name: str(country.name) ?? String(country.code) }
        : str(user.country_code)
          ? { code: String(user.country_code).toUpperCase(), name: String(user.country_code) }
          : null,
    is_supporter: user.is_supporter === true,
    support_level: num(user.support_level) ?? 0,
    join_date: str(user.join_date),
    last_visit: str(user.last_visit),
    is_online: typeof user.is_online === "boolean" ? user.is_online : null,
    title: str(user.title),
    profile_colour: str(user.profile_colour),
    playmode: str(user.playmode),
    mode,
    previous_usernames: Array.isArray(user.previous_usernames)
      ? user.previous_usernames.filter((n): n is string => typeof n === "string").slice(0, 20)
      : [],
    badges: Array.isArray(user.badges)
      ? user.badges.flatMap((b): OsuBadge[] => {
          const badge = obj(b);
          const image = https(badge?.image_url);
          if (!badge || !image) return [];
          return [
            {
              awarded_at: str(badge.awarded_at),
              description: str(badge.description) ?? "",
              image_url: image,
              image_2x_url: https(badge["image@2x_url"]),
              url: https(badge.url),
            },
          ];
        })
      : [],
    kudosu: kudosu
      ? { total: num(kudosu.total) ?? 0, available: num(kudosu.available) ?? 0 }
      : null,
    follower_count: num(user.follower_count),
    mapping_follower_count: num(user.mapping_follower_count),
    counts: {
      ranked: num(user.ranked_beatmapset_count) ?? num(user.ranked_and_approved_beatmapset_count) ?? 0,
      loved: num(user.loved_beatmapset_count) ?? 0,
      pending: num(user.pending_beatmapset_count) ?? num(user.unranked_beatmapset_count) ?? 0,
      graveyard: num(user.graveyard_beatmapset_count) ?? 0,
      guest: num(user.guest_beatmapset_count) ?? 0,
      nominated: num(user.nominated_beatmapset_count) ?? 0,
    },
    statistics: stats
      ? {
          global_rank: num(stats.global_rank),
          country_rank: num(stats.country_rank),
          pp: num(stats.pp),
          accuracy: num(stats.hit_accuracy) ?? num(stats.accuracy),
          play_count: num(stats.play_count),
          play_time: num(stats.play_time),
          ranked_score: num(stats.ranked_score),
          total_score: num(stats.total_score),
          maximum_combo: num(stats.maximum_combo),
          level: num(level?.current),
          level_progress: num(level?.progress),
          grade_counts: grades
            ? {
                ssh: num(grades.ssh) ?? 0,
                ss: num(grades.ss) ?? 0,
                sh: num(grades.sh) ?? 0,
                s: num(grades.s) ?? 0,
                a: num(grades.a) ?? 0,
              }
            : null,
        }
      : null,
    rank_highest:
      highest && num(highest.rank) !== null
        ? { rank: num(highest.rank)!, updated_at: str(highest.updated_at) }
        : null,
  };
}

export function normalizeBeatmapset(raw: unknown): OsuBeatmapset | null {
  const set = obj(raw);
  const id = num(set?.id);
  if (!set || id === null) return null;
  const covers = obj(set.covers);
  return {
    id,
    title: str(set.title) ?? "",
    artist: str(set.artist) ?? "",
    title_unicode: str(set.title_unicode),
    artist_unicode: str(set.artist_unicode),
    creator: str(set.creator) ?? "",
    user_id: num(set.user_id) ?? 0,
    status: str(set.status) ?? "pending",
    play_count: num(set.play_count) ?? 0,
    favourite_count: num(set.favourite_count) ?? 0,
    bpm: num(set.bpm),
    last_updated: str(set.last_updated),
    ranked_date: str(set.ranked_date),
    submitted_date: str(set.submitted_date),
    covers: {
      card: https(covers?.card),
      card2x: https(covers?.["card@2x"]),
      cover: https(covers?.cover),
      list: https(covers?.list),
    },
    beatmaps: Array.isArray(set.beatmaps)
      ? set.beatmaps.flatMap((b): OsuBeatmap[] => {
          const map = obj(b);
          const mapId = num(map?.id);
          if (!map || mapId === null) return [];
          return [
            {
              id: mapId,
              mode: str(map.mode) ?? "osu",
              version: str(map.version) ?? "",
              difficulty_rating: num(map.difficulty_rating) ?? 0,
              cs: num(map.cs),
              total_length: num(map.total_length) ?? 0,
              bpm: num(map.bpm),
              playcount: num(map.playcount),
              user_id: num(map.user_id),
            },
          ];
        })
      : [],
  };
}

export type SocialDeps = {
  /** The app's osu! client-credentials token, or null when osu! refused one. */
  appToken: () => Promise<string | null>;
  /** The osu! id of the signed-in caller, if any. */
  callerOsuId: () => Promise<number | null>;
  json: (body: unknown, status: number) => Response;
  ctx?: ExecutionContext;
};

type CascadeUser = { id: string; username: string };

async function cascadeUserByOsuId(env: WorkerEnv, osuId: number): Promise<CascadeUser | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/users?osu_id=eq.${osuId}&select=id,username&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as CascadeUser[];
  return rows[0] ?? null;
}

function edgeCache(): Cache | null {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

async function cached(
  key: string,
  bypass: boolean,
  load: () => Promise<{ body: unknown; status: number } | null>,
  deps: SocialDeps,
): Promise<Response> {
  const cache = edgeCache();
  const request = new Request(`https://cascade-social.cache/${key}`);
  if (cache && !bypass) {
    const hit = await cache.match(request);
    if (hit) return deps.json(await hit.json(), 200);
  }
  const loaded = await load();
  if (!loaded) return deps.json({ error: "osu! is not answering right now" }, 502);
  if (cache && loaded.status === 200) {
    const store = new Response(JSON.stringify(loaded.body), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
      },
    });
    const put = cache.put(request, store);
    if (deps.ctx) deps.ctx.waitUntil(put);
    else await put;
  }
  return deps.json(loaded.body, loaded.status);
}

async function osuGet(path: string, deps: SocialDeps): Promise<Response | null> {
  const token = await deps.appToken();
  if (!token) return null;
  try {
    return await fetch(`https://osu.ppy.sh/api/v2${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }
}

async function storeProfileSummary(env: WorkerEnv, userId: string, profile: OsuProfile): Promise<void> {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  };
  const country = profile.country?.code && /^[A-Z]{2}$/.test(profile.country.code) ? profile.country.code : null;
  await Promise.all([
    fetch(`${env.SUPABASE_URL}/rest/v1/osu_profile_cache?on_conflict=user_id`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_id: userId,
        osu_id: profile.id,
        country_code: country,
        country_name: profile.country?.name ?? null,
        cover_url: profile.cover_url,
        is_supporter: profile.is_supporter,
        ranked_count: profile.counts.ranked,
        loved_count: profile.counts.loved,
        pending_count: profile.counts.pending,
        graveyard_count: profile.counts.graveyard,
        guest_count: profile.counts.guest,
        nominated_count: profile.counts.nominated,
        fetched_at: new Date().toISOString(),
      }),
    }),
    country
      ? fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ country_code: country }),
        })
      : Promise.resolve(null),
  ]).catch(() => {});
}

export async function handleSocialRoute(
  req: Request,
  url: URL,
  env: WorkerEnv,
  deps: SocialDeps,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/osu/")) return null;
  if (req.method !== "GET") return deps.json({ error: "method not allowed" }, 405);

  const profileMatch = /^\/osu\/users\/(\d{1,12})$/.exec(url.pathname);
  if (profileMatch) {
    const osuId = Number(profileMatch[1]);
    const modeParam = url.searchParams.get("mode") ?? "mania";
    if (!(OSU_MODES as readonly string[]).includes(modeParam)) {
      return deps.json({ error: "unknown mode" }, 400);
    }
    const mode = modeParam as OsuMode;
    const user = await cascadeUserByOsuId(env, osuId);
    if (!user) return deps.json({ error: "not a Cascade user" }, 404);
    // Only the account itself may skip the cache, to see a change it just
    // made on osu! without waiting.
    const bypass =
      url.searchParams.get("refresh") === "1" && (await deps.callerOsuId()) === osuId;
    return cached(
      `users/${osuId}/${mode}`,
      bypass,
      async () => {
        const res = await osuGet(`/users/${osuId}/${mode}`, deps);
        if (!res) return null;
        if (res.status === 404) return { body: { error: "osu! account not found" }, status: 404 };
        if (!res.ok) return null;
        const profile = normalizeOsuUser(await res.json(), mode);
        if (!profile) return null;
        const store = storeProfileSummary(env, user.id, profile);
        if (deps.ctx) deps.ctx.waitUntil(store);
        else await store;
        return { body: { profile, fetched_at: new Date().toISOString() }, status: 200 };
      },
      deps,
    );
  }

  const setsMatch = /^\/osu\/users\/(\d{1,12})\/beatmapsets\/([a-z]+)$/.exec(url.pathname);
  if (setsMatch) {
    const osuId = Number(setsMatch[1]);
    const type = setsMatch[2];
    if (!(BEATMAPSET_TYPES as readonly string[]).includes(type)) {
      return deps.json({ error: "unknown beatmapset type" }, 400);
    }
    const limit = Math.max(1, Math.min(MAX_PAGE, Number(url.searchParams.get("limit")) || 24));
    const offset = Math.max(0, Math.min(5000, Number(url.searchParams.get("offset")) || 0));
    if (!(await cascadeUserByOsuId(env, osuId))) {
      return deps.json({ error: "not a Cascade user" }, 404);
    }
    return cached(
      `users/${osuId}/beatmapsets/${type}/${offset}/${limit}`,
      false,
      async () => {
        const res = await osuGet(
          `/users/${osuId}/beatmapsets/${type}?limit=${limit}&offset=${offset}`,
          deps,
        );
        if (!res) return null;
        if (res.status === 404) return { body: { beatmapsets: [], has_more: false }, status: 200 };
        if (!res.ok) return null;
        const raw = (await res.json()) as unknown;
        const sets = Array.isArray(raw)
          ? raw.map(normalizeBeatmapset).filter((s): s is OsuBeatmapset => s !== null)
          : [];
        return { body: { beatmapsets: sets, has_more: sets.length === limit }, status: 200 };
      },
      deps,
    );
  }

  // Someone renamed on osu!: find which Cascade account holds that osu!
  // account now, from any of its names.
  const lookupMatch = /^\/osu\/lookup\/([A-Za-z0-9_\-[\] ]{1,32})$/.exec(
    decodeURIComponent(url.pathname),
  );
  if (lookupMatch) {
    const name = lookupMatch[1].trim();
    return cached(
      `lookup/${name.toLowerCase()}`,
      false,
      async () => {
        const res = await osuGet(`/users/${encodeURIComponent(`@${name}`)}/mania`, deps);
        if (!res) return null;
        if (!res.ok) return { body: { user: null }, status: 200 };
        const profile = normalizeOsuUser(await res.json(), "mania");
        if (!profile) return { body: { user: null }, status: 200 };
        const user = await cascadeUserByOsuId(env, profile.id);
        return {
          body: { user: user ? { username: user.username, osu_id: profile.id } : null },
          status: 200,
        };
      },
      deps,
    );
  }

  return deps.json({ error: "not found" }, 404);
}
