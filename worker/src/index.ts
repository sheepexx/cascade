import {
  handleDesktopRoute,
  handleMapCardRoute,
  handleStorageRoute,
  type StorageAuthContext,
  type WorkerEnv,
} from "./storage";
import { handleSocialRoute } from "./social";
import { fetchSessionUser, handleAuthRoute, mintSupabaseToken, sessionUid } from "./auth";
import { cors, json, resolveAllowedOrigin } from "./http";
import { handleDiscordRoute, syncContributorRole } from "./discord/interactions";

export { DESKTOP_ORIGINS, resolveAllowedOrigin } from "./http";
export { loopbackRedirect, parseLoopbackPort } from "./auth";

function applyAllowedOrigin(
  res: Response,
  req: Request,
  env: WorkerEnv,
): Response {
  const allowed = resolveAllowedOrigin(req.headers.get("Origin"), env);
  if (res.headers.get("Access-Control-Allow-Origin") === allowed) return res;
  const out = new Response(res.body, res);
  out.headers.set("Access-Control-Allow-Origin", allowed);
  out.headers.set("Vary", "Origin");
  return out;
}

export default {
  async fetch(
    req: Request,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return applyAllowedOrigin(await route(req, env, ctx), req, env);
  },
} satisfies ExportedHandler<WorkerEnv>;

async function route(
  req: Request,
  env: WorkerEnv,
  ctx?: ExecutionContext,
): Promise<Response> {
  {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    try {
      // Discord calls the bot directly, signed with its own key; it never
      // carries a Cascade session.
      const discordResponse = await handleDiscordRoute(req, url, env, ctx);
      if (discordResponse) return discordResponse;
      const authResponse = await handleAuthRoute(req, url, env, {
        ctx,
        appToken: () => appAccessToken(env),
        hooks: {
          onDiscordAccount: async (discordId) => {
            await syncContributorRole(env, discordId);
          },
        },
      });
      if (authResponse) return authResponse;
      const storageResponse = await handleStorageRoute(req, url, env, () =>
        storageAuthContext(req, env),
      );
      if (storageResponse) return storageResponse;
      const desktopResponse = await handleDesktopRoute(req, url, env, ctx);
      if (desktopResponse) return desktopResponse;
      const cardResponse = await handleMapCardRoute(req, url, env);
      if (cardResponse) return cardResponse;
      const socialResponse = await handleSocialRoute(req, url, env, {
        appToken: () => appAccessToken(env),
        callerOsuId: async () => {
          const uid = await sessionUid(req, env);
          return uid ? ((await fetchSessionUser(env, uid).catch(() => null))?.osu_id ?? null) : null;
        },
        json: (body, status) => json(body, status, env),
        ctx,
      });
      if (socialResponse) return socialResponse;
      // Parameterized mirror routes can't be switch cases.
      const download = url.pathname.match(/^\/mirror\/(\d{1,10})$/);
      if (download && req.method === "GET") {
        return await handleMirrorDownload(download[1], env);
      }
      const lookup = url.pathname.match(/^\/mirror\/beatmap\/(\d{1,10})$/);
      if (lookup && req.method === "GET") {
        return await handleBeatmapLookup(lookup[1], env);
      }
      const shared = url.pathname.match(/^\/m\/([a-z0-9]{4,32})\/?$/i);
      if (shared && req.method === "GET") {
        return await handleSharedMapPage(shared[1], url.origin, env);
      }

      switch (url.pathname) {
        case "/presence/roster":
          if (req.method !== "GET")
            return json({ error: "method not allowed" }, 405, env);
          return await handleOnlineRoster(env);
        default:
          return json({ error: "not found" }, 404, env);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      return json({ error: message }, 500, env);
    }
  }
}

// Beatmap mirror proxy. The mirrors have inconsistent CORS, so the SPA
// fetches through here; the worker tries each in order. A single mirror's 404
// is not authoritative (they each miss some sets), so the chain always runs
// to the end before reporting not-found.
const OSZ_MIRRORS = [
  (id: string) => `https://catboy.best/d/${id}`,
  (id: string) => `https://api.nerinyan.moe/d/${id}`,
  (id: string) => `https://osu.direct/api/d/${id}`,
];

const BEATMAP_LOOKUPS = [
  (id: string) => `https://catboy.best/api/v2/b/${id}`,
  (id: string) => `https://osu.direct/api/v2/b/${id}`,
];

async function handleMirrorDownload(
  setId: string,
  env: WorkerEnv,
): Promise<Response> {
  let sawNotFound = false;
  for (const mirrorUrl of OSZ_MIRRORS) {
    try {
      const res = await fetch(mirrorUrl(setId), {
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok && res.body) {
        const headers = new Headers(cors(env));
        headers.set("Content-Type", "application/octet-stream");
        headers.set(
          "Content-Disposition",
          `attachment; filename="${setId}.osz"`,
        );
        const length = res.headers.get("content-length");
        if (length) headers.set("Content-Length", length);
        headers.set("Cache-Control", "public, max-age=3600");
        return new Response(res.body, { status: 200, headers });
      }
      if (res.status === 404) sawNotFound = true;
    } catch {
      // Timeout or network failure - try the next mirror.
    }
  }
  return json(
    { error: sawNotFound ? "beatmapset not found" : "all mirrors failed" },
    sawNotFound ? 404 : 502,
    env,
  );
}

async function handleBeatmapLookup(
  beatmapId: string,
  env: WorkerEnv,
): Promise<Response> {
  for (const lookupUrl of BEATMAP_LOOKUPS) {
    try {
      const res = await fetch(lookupUrl(beatmapId), {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        beatmapset_id?: unknown;
        set?: { id?: unknown };
      };
      const setId = data.beatmapset_id ?? data.set?.id;
      if (typeof setId === "number" && Number.isFinite(setId)) {
        return json({ setId, beatmapId: Number(beatmapId) }, 200, env);
      }
    } catch {
      // Try the next lookup source.
    }
  }
  return json({ error: "beatmap not found" }, 404, env);
}

async function storageAuthContext(
  req: Request,
  env: WorkerEnv,
): Promise<StorageAuthContext | null> {
  const uid = await sessionUid(req, env);
  if (!uid) return null;
  const user = await fetchSessionUser(env, uid);
  if (!user) return null;
  return {
    uid,
    isAdmin: user.is_admin,
    supabaseToken: await mintSupabaseToken(env, user),
  };
}

// osu! profile data is only reachable through the API with the app's own
// token. Client-credentials tokens last a day; keeping the last one avoids a
// token round-trip per request.
let appToken: { value: string; expiresAt: number } | null = null;

async function appAccessToken(env: WorkerEnv): Promise<string | null> {
  if (appToken && appToken.expiresAt > Date.now() + 60_000)
    return appToken.value;
  const res = await fetch("https://osu.ppy.sh/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: "public",
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return null;
  appToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return appToken.value;
}

// A random sample of registered users for the menu's floating avatar layer.
// Presence (who is online right now) lives in Supabase Realtime on the client,
// so this endpoint only supplies a pool of "known players"; the SPA marks each
// roster entry as online/offline by merging Realtime presence.
const ROSTER_POOL = 40;
const ROSTER_LIMIT = 10;

type RosterUser = {
  id: string;
  osu_id: number | null;
  username: string;
  avatar_url: string | null;
  last_signed_in_at: string | null;
};

async function handleOnlineRoster(env: WorkerEnv): Promise<Response> {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  // roster_pool (migration 0041) leaves out "last seen" for people who only
  // show their online status to friends. Before it exists, fall back to the
  // table, which predates that setting.
  let rows: RosterUser[] = [];
  const pool = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/roster_pool`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ p_limit: ROSTER_POOL }),
  });
  if (pool.ok) {
    rows = ((await pool.json()) as (Omit<RosterUser, "last_signed_in_at"> & {
      last_seen_at: string | null;
    })[]).map((u) => ({ ...u, last_signed_in_at: u.last_seen_at }));
  } else {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/users?select=id,osu_id,username,avatar_url,last_signed_in_at` +
        `&order=last_signed_in_at.desc.nullslast&limit=${ROSTER_POOL}`,
      { headers },
    );
    if (!res.ok) return json({ users: [] }, 200, env);
    rows = (await res.json()) as RosterUser[];
  }
  const candidates = rows.filter(
    (u) =>
      typeof u.username === "string" &&
      typeof u.avatar_url === "string" &&
      u.avatar_url,
  );
  const users = shuffle(candidates).slice(0, ROSTER_LIMIT).map((u) => ({
    id: u.id,
    osu_id: u.osu_id,
    username: u.username,
    avatar_url: u.avatar_url,
    last_seen: u.last_signed_in_at
      ? Date.parse(u.last_signed_in_at) || null
      : null,
  }));
  const response = json({ users }, 200, env);
  response.headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
  return response;
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

type SharedMapRow = {
  slug: string;
  title: string;
  artist: string;
  creator: string;
  card_path: string | null;
  key_counts: number[] | null;
  star_rating: number | string | null;
  length_ms: number | null;
  bpm: number | string | null;
};

async function handleSharedMapPage(
  slug: string,
  assetOrigin: string,
  env: WorkerEnv,
): Promise<Response> {
  const shell = await fetch(`${env.FRONTEND_URL}/index.html`, {
    cf: { cacheTtl: 300 },
  });
  if (!shell.ok) return Response.redirect(`${env.FRONTEND_URL}/`, 302);
  const html = await shell.text();

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/shared_maps?slug=eq.${encodeURIComponent(slug)}` +
      "&select=slug,title,artist,creator,card_path,key_counts,star_rating,length_ms,bpm",
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  const rows = res.ok ? ((await res.json()) as SharedMapRow[]) : [];
  const map = rows[0];

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=60, s-maxage=300",
  });
  if (!map) return new Response(html, { status: 404, headers });

  const url = `${env.FRONTEND_URL}/m/${map.slug}`;
  const title = `${map.artist ? `${map.artist} - ` : ""}${map.title}`;
  const image = map.card_path
    ? `${assetOrigin}/storage/shared/${encodeObjectPath(map.card_path)}`
    : `${env.FRONTEND_URL}/og.png?v=2`;
  const bits: string[] = [];
  if (map.key_counts?.length) bits.push(map.key_counts.map((k) => `${k}K`).join(" · "));
  const star = map.star_rating == null ? null : Number(map.star_rating);
  if (star != null && Number.isFinite(star) && star > 0) bits.push(`★ ${star.toFixed(2)}`);
  const bpm = map.bpm == null ? null : Number(map.bpm);
  if (bpm != null && Number.isFinite(bpm) && bpm > 0) bits.push(`${Math.round(bpm)} BPM`);
  if (map.length_ms) {
    const total = Math.round(map.length_ms / 1000);
    bits.push(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`);
  }
  const description = `${map.creator ? `Mapped by ${map.creator}. ` : ""}${bits.join(
    " · ",
  )}${bits.length ? ". " : ""}Play it or download the .osz in your browser with Cascade.`;

  return new Response(rewriteHead(html, { url, title, description, image }), {
    status: 200,
    headers,
  });
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encodeObjectPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function rewriteHead(
  html: string,
  meta: { url: string; title: string; description: string; image: string },
): string {
  const title = escapeAttr(`${meta.title} | Cascade`);
  const description = escapeAttr(meta.description);
  const image = escapeAttr(meta.image);
  const url = escapeAttr(meta.url);

  let out = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${description}" />`,
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:title" content="${title}" />`,
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:description" content="${description}" />`,
    )
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/,
      `<meta property="og:url" content="${url}" />`,
    )
    .replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/,
      `<meta name="twitter:title" content="${title}" />`,
    )
    .replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/,
      `<meta name="twitter:description" content="${description}" />`,
    );

  out = out
    .replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/>/, `<meta property="og:image" content="${image}" />`)
    .replace(/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/>/, `<meta name="twitter:image" content="${image}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`);

  return out;
}

