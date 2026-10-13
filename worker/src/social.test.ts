import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleSocialRoute,
  normalizeBeatmapset,
  normalizeOsuUser,
  type SocialDeps,
} from "./social";
import type { WorkerEnv } from "./storage";

afterEach(() => {
  vi.unstubAllGlobals();
});

const env = {
  SUPABASE_URL: "https://db.example",
  SUPABASE_SERVICE_ROLE_KEY: "service",
} as unknown as WorkerEnv;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deps(overrides: Partial<SocialDeps> = {}): SocialDeps {
  return {
    appToken: async () => "app-token",
    callerOsuId: async () => null,
    json: (body, status) => json(body, status),
    ...overrides,
  };
}

const OSU_USER = {
  id: 2,
  username: "peppy",
  avatar_url: "https://a.ppy.sh/2",
  country: { code: "AU", name: "Australia" },
  cover: { custom_url: null, url: "https://assets.ppy.sh/cover.jpg" },
  is_supporter: true,
  join_date: "2007-08-28T03:09:12+00:00",
  last_visit: null,
  badges: [
    {
      awarded_at: "2020-01-01T00:00:00+00:00",
      description: "Mapping contest winner",
      image_url: "https://assets.ppy.sh/badge.png",
      "image@2x_url": "https://assets.ppy.sh/badge@2x.png",
      url: "",
    },
    { description: "no image" },
  ],
  kudosu: { total: 10, available: 4 },
  ranked_beatmapset_count: 3,
  loved_beatmapset_count: 1,
  pending_beatmapset_count: 2,
  graveyard_beatmapset_count: 5,
  guest_beatmapset_count: 7,
  nominated_beatmapset_count: 0,
  mapping_follower_count: 99,
  statistics: {
    global_rank: 1234,
    country_rank: 56,
    pp: 4321.5,
    hit_accuracy: 97.12,
    play_count: 1000,
    play_time: 36000,
    ranked_score: 1,
    total_score: 2,
    maximum_combo: 3000,
    level: { current: 100, progress: 50 },
    grade_counts: { ss: 1, ssh: 2, s: 3, sh: 4, a: 5 },
  },
  rank_highest: { rank: 900, updated_at: "2024-01-01T00:00:00Z" },
};

describe("normalizeOsuUser", () => {
  it("keeps what a profile shows and drops badges without an image", () => {
    const profile = normalizeOsuUser(OSU_USER, "mania")!;
    expect(profile).toMatchObject({
      id: 2,
      username: "peppy",
      cover_url: "https://assets.ppy.sh/cover.jpg",
      country: { code: "AU", name: "Australia" },
      is_supporter: true,
      last_visit: null,
      mode: "mania",
      kudosu: { total: 10, available: 4 },
      counts: { ranked: 3, loved: 1, pending: 2, graveyard: 5, guest: 7, nominated: 0 },
      mapping_follower_count: 99,
      rank_highest: { rank: 900 },
    });
    expect(profile.badges).toEqual([
      {
        awarded_at: "2020-01-01T00:00:00+00:00",
        description: "Mapping contest winner",
        image_url: "https://assets.ppy.sh/badge.png",
        image_2x_url: "https://assets.ppy.sh/badge@2x.png",
        url: null,
      },
    ]);
    expect(profile.statistics).toMatchObject({
      global_rank: 1234,
      accuracy: 97.12,
      level: 100,
      grade_counts: { ssh: 2, ss: 1, sh: 4, s: 3, a: 5 },
    });
  });

  it("leaves unavailable numbers empty instead of inventing them", () => {
    const profile = normalizeOsuUser({ id: 5, username: "new", statistics: { pp: 0 } }, "osu")!;
    expect(profile.statistics?.global_rank).toBeNull();
    expect(profile.rank_highest).toBeNull();
    expect(profile.cover_url).toBeNull();
    expect(profile.kudosu).toBeNull();
  });

  it("refuses non-https images and malformed users", () => {
    expect(normalizeOsuUser({ id: 1, username: "x", avatar_url: "javascript:alert(1)" }, "osu")?.avatar_url).toBeNull();
    expect(normalizeOsuUser({ username: "x" }, "osu")).toBeNull();
    expect(normalizeOsuUser("nope", "osu")).toBeNull();
  });
});

describe("normalizeBeatmapset", () => {
  it("keeps the set and its difficulties", () => {
    const set = normalizeBeatmapset({
      id: 10,
      title: "Song",
      artist: "Artist",
      creator: "peppy",
      user_id: 2,
      status: "qualified",
      play_count: 5,
      favourite_count: 6,
      bpm: 180,
      covers: { card: "https://assets.ppy.sh/card.jpg", "card@2x": "https://assets.ppy.sh/card@2x.jpg" },
      beatmaps: [{ id: 1, mode: "mania", version: "4K Hard", difficulty_rating: 3.5, cs: 4, total_length: 120 }],
    })!;
    expect(set).toMatchObject({ id: 10, status: "qualified", covers: { card2x: "https://assets.ppy.sh/card@2x.jpg" } });
    expect(set.beatmaps).toEqual([
      expect.objectContaining({ id: 1, mode: "mania", cs: 4, difficulty_rating: 3.5 }),
    ]);
  });
});

describe("handleSocialRoute", () => {
  it("leaves other paths alone", async () => {
    expect(await handleSocialRoute(new Request("https://w/x"), new URL("https://w/x"), env, deps())).toBeNull();
  });

  it("only serves osu! accounts that use Cascade", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.startsWith("https://db.example/rest/v1/users")) return json([]);
      throw new Error(`unexpected fetch ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const url = new URL("https://w/osu/users/2");
    const res = await handleSocialRoute(new Request(url), url, env, deps());
    expect(res?.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown modes and beatmapset types before asking anyone", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const mode = new URL("https://w/osu/users/2?mode=catch");
    expect((await handleSocialRoute(new Request(mode), mode, env, deps()))?.status).toBe(400);
    const type = new URL("https://w/osu/users/2/beatmapsets/favourite");
    expect((await handleSocialRoute(new Request(type), type, env, deps()))?.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches a profile with the app token and stores the summary", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const href = String(input);
        calls.push(`${init?.method ?? "GET"} ${href}`);
        if (href.startsWith("https://db.example/rest/v1/users?osu_id")) {
          return json([{ id: "u1", username: "peppy" }]);
        }
        if (href === "https://osu.ppy.sh/api/v2/users/2/mania") {
          expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer app-token");
          return json(OSU_USER);
        }
        return json(null, 201);
      }),
    );
    const url = new URL("https://w/osu/users/2?mode=mania");
    const res = await handleSocialRoute(new Request(url), url, env, deps());
    expect(res?.status).toBe(200);
    const body = (await res!.json()) as { profile: { username: string } };
    expect(body.profile.username).toBe("peppy");
    expect(calls).toContain("POST https://db.example/rest/v1/osu_profile_cache?on_conflict=user_id");
    expect(calls).toContain("PATCH https://db.example/rest/v1/users?id=eq.u1");
  });

  it("pages beatmapsets with a capped limit", async () => {
    let osuUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const href = String(input);
        if (href.startsWith("https://db.example")) return json([{ id: "u1", username: "peppy" }]);
        osuUrl = href;
        return json([{ id: 1, title: "A", beatmaps: [] }]);
      }),
    );
    const url = new URL("https://w/osu/users/2/beatmapsets/ranked?limit=500&offset=24");
    const res = await handleSocialRoute(new Request(url), url, env, deps());
    expect(osuUrl).toBe("https://osu.ppy.sh/api/v2/users/2/beatmapsets/ranked?limit=50&offset=24");
    expect(await res!.json()).toMatchObject({ beatmapsets: [{ id: 1, title: "A" }], has_more: false });
  });

  it("reports osu! being down rather than an empty profile", async () => {
    const url = new URL("https://w/osu/users/2");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("https://db.example") ? json([{ id: "u1", username: "peppy" }]) : json({}, 503),
      ),
    );
    expect((await handleSocialRoute(new Request(url), url, env, deps()))?.status).toBe(502);
    expect(
      (await handleSocialRoute(new Request(url), url, env, deps({ appToken: async () => null })))?.status,
    ).toBe(502);
  });
});
