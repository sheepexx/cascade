import { SignJWT, jwtVerify } from "jose";
import {
  handleDesktopRoute,
  handleStorageRoute,
  type StorageAuthContext,
  type WorkerEnv,
} from "./storage";

type DbUser = {
  id: string;
  osu_id: number;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  last_signed_in_at?: string | null;
};

// The desktop build runs the same SPA inside a Tauri webview, whose origin is
// not the site. It authenticates with a bearer token rather than the session
// cookie, so echoing these back is enough to let it reach the API.
export const DESKTOP_ORIGINS = [
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
];

// The desktop app listens on an ephemeral loopback port and passes it here.
// Only the port survives the round trip - it is carried inside the signed
// state that is also held in an HttpOnly cookie, and the redirect is rebuilt
// from scratch, so this can never be steered at an arbitrary host.
const MIN_LOOPBACK_PORT = 1024;
const MAX_LOOPBACK_PORT = 65535;

export function parseLoopbackPort(raw: string | null): number | null {
  if (!raw || !/^\d{4,5}$/.test(raw)) return null;
  const port = Number(raw);
  if (port < MIN_LOOPBACK_PORT || port > MAX_LOOPBACK_PORT) return null;
  return port;
}

export function loopbackRedirect(port: number, session: string): string {
  return `http://127.0.0.1:${port}/callback?session=${encodeURIComponent(session)}`;
}

export function resolveAllowedOrigin(
  requestOrigin: string | null,
  env: WorkerEnv,
): string {
  if (!requestOrigin) return env.FRONTEND_URL;
  if (requestOrigin === env.FRONTEND_URL) return requestOrigin;
  if (DESKTOP_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return env.FRONTEND_URL;
}

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

const SESSION_COOKIE = "me_session";
const STATE_COOKIE = "me_oauth_state";
const SESSION_TTL_DAYS = 30;
const SUPABASE_TOKEN_TTL_SECONDS = 60 * 60;

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    return applyAllowedOrigin(await route(req, env), req, env);
  },
} satisfies ExportedHandler<WorkerEnv>;

async function route(req: Request, env: WorkerEnv): Promise<Response> {
  {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    try {
      const storageResponse = await handleStorageRoute(req, url, env, () =>
        storageAuthContext(req, env),
      );
      if (storageResponse) return storageResponse;
      const desktopResponse = await handleDesktopRoute(req, url, env);
      if (desktopResponse) return desktopResponse;
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
        case "/auth/osu/login":
          return await handleLogin(url, env);
        case "/auth/osu/callback":
          return await handleCallback(req, url, env);
        case "/auth/session":
          return await handleSession(req, env);
        case "/auth/osu/cover":
          return await handleCover(req, env);
        case "/auth/logout":
          return handleLogout(env);
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

export function desktopState(port: number): string {
  return `${crypto.randomUUID()}.desktop.${port}`;
}

export function desktopPortFromState(state: string): number | null {
  const match = /\.desktop\.(\d{4,5})$/.exec(state);
  return match ? parseLoopbackPort(match[1]) : null;
}

async function handleLogin(url: URL, env: WorkerEnv): Promise<Response> {
  const port =
    url.searchParams.get("client") === "desktop"
      ? parseLoopbackPort(url.searchParams.get("port"))
      : null;
  const state = port === null ? crypto.randomUUID() : desktopState(port);
  const authorize = new URL("https://osu.ppy.sh/oauth/authorize");
  authorize.searchParams.set("client_id", env.CLIENT_ID);
  authorize.searchParams.set("redirect_uri", env.OSU_REDIRECT_URI);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("state", state);

  const headers = new Headers(cors(env));
  headers.append(
    "Set-Cookie",
    cookie(STATE_COOKIE, state, { maxAge: 600 }),
  );
  headers.set("Location", authorize.toString());
  return new Response(null, { status: 302, headers });
}

async function handleCallback(
  req: Request,
  url: URL,
  env: WorkerEnv,
): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(req, STATE_COOKIE);

  if (!code || !state || !savedState || state !== savedState) {
    return redirect(`${env.FRONTEND_URL}/?auth=error`, env, [
      cookie(STATE_COOKIE, "", { maxAge: 0 }),
    ]);
  }

  const tokenRes = await fetch("https://osu.ppy.sh/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: env.OSU_REDIRECT_URI,
    }),
  });
  if (!tokenRes.ok) {
    return redirect(`${env.FRONTEND_URL}/?auth=error`, env, [
      cookie(STATE_COOKIE, "", { maxAge: 0 }),
    ]);
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch("https://osu.ppy.sh/api/v2/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!meRes.ok) {
    return redirect(`${env.FRONTEND_URL}/?auth=error`, env, [
      cookie(STATE_COOKIE, "", { maxAge: 0 }),
    ]);
  }
  const me = (await meRes.json()) as {
    id: number;
    username: string;
    avatar_url?: string;
  };

  const user = await upsertUser(env, {
    osu_id: me.id,
    username: me.username,
    avatar_url: me.avatar_url ?? null,
  });

  const session = await signSession(env, user.id);
  const desktopPort = desktopPortFromState(state);
  if (desktopPort !== null) {
    return redirect(loopbackRedirect(desktopPort, session), env, [
      cookie(STATE_COOKIE, "", { maxAge: 0 }),
    ]);
  }
  return redirect(
    `${env.FRONTEND_URL}/?auth=ok#session=${encodeURIComponent(session)}`,
    env,
    [
      cookie(STATE_COOKIE, "", { maxAge: 0 }),
      cookie(SESSION_COOKIE, session, { maxAge: SESSION_TTL_DAYS * 86400 }),
    ],
  );
}

async function handleSession(req: Request, env: WorkerEnv): Promise<Response> {
  const cookieToken = getCookie(req, SESSION_COOKIE);
  const headerToken = bearerToken(req);
  const uid =
    (cookieToken && (await verifySession(env, cookieToken))) ||
    (headerToken && (await verifySession(env, headerToken))) ||
    null;

  const clearCookies = cookieToken
    ? [cookie(SESSION_COOKIE, "", { maxAge: 0 })]
    : [];
  if (!uid) return json({ user: null }, 200, env, clearCookies);

  const user = await fetchUser(env, uid);
  if (!user) return json({ user: null }, 200, env, clearCookies);

  const supabaseToken = await mintSupabaseToken(env, user);
  const sessionToken = await signSession(env, user.id);
  return json({ user, supabaseToken, sessionToken }, 200, env);
}

async function storageAuthContext(
  req: Request,
  env: WorkerEnv,
): Promise<StorageAuthContext | null> {
  const cookieToken = getCookie(req, SESSION_COOKIE);
  const headerToken = bearerToken(req);
  const uid =
    (cookieToken && (await verifySession(env, cookieToken))) ||
    (headerToken && (await verifySession(env, headerToken))) ||
    null;
  if (!uid) return null;
  const user = await fetchUser(env, uid);
  if (!user) return null;
  return {
    uid,
    isAdmin: user.is_admin,
    supabaseToken: await mintSupabaseToken(env, user),
  };
}

// osu! profile covers are only reachable through the API, and the session
// payload predates them, so the SPA asks for one on demand. Client-credentials
// tokens last a day; keeping the last one avoids a token round-trip per open.
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

async function handleCover(req: Request, env: WorkerEnv): Promise<Response> {
  const cookieToken = getCookie(req, SESSION_COOKIE);
  const headerToken = bearerToken(req);
  const uid =
    (cookieToken && (await verifySession(env, cookieToken))) ||
    (headerToken && (await verifySession(env, headerToken))) ||
    null;
  if (!uid) return json({ cover_url: null }, 401, env);

  const user = await fetchUser(env, uid);
  if (!user) return json({ cover_url: null }, 404, env);

  const token = await appAccessToken(env);
  if (!token) return json({ cover_url: null }, 200, env);

  const res = await fetch(
    `https://osu.ppy.sh/api/v2/users/${user.osu_id}?key=id`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return json({ cover_url: null }, 200, env);
  const profile = (await res.json()) as {
    cover_url?: string;
    cover?: { url?: string; custom_url?: string | null };
  };
  const cover =
    profile.cover?.custom_url ?? profile.cover?.url ?? profile.cover_url ?? null;
  return json({ cover_url: cover }, 200, env);
}

// A random sample of registered users for the menu's floating avatar layer.
// Presence (who is online right now) lives in Supabase Realtime on the client,
// so this endpoint only supplies a pool of "known players"; the SPA marks each
// roster entry as online/offline by merging Realtime presence.
const ROSTER_POOL = 40;
const ROSTER_LIMIT = 10;

type RosterUser = {
  id: string;
  osu_id: number;
  username: string;
  avatar_url: string | null;
  last_signed_in_at: string | null;
};

async function handleOnlineRoster(env: WorkerEnv): Promise<Response> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/users?select=id,osu_id,username,avatar_url,last_signed_in_at` +
      `&order=last_signed_in_at.desc.nullslast&limit=${ROSTER_POOL}`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!res.ok) return json({ users: [] }, 200, env);
  const rows = (await res.json()) as RosterUser[];
  const pool = rows.filter(
    (u) =>
      typeof u.username === "string" &&
      typeof u.avatar_url === "string" &&
      u.avatar_url,
  );
  const users = shuffle(pool).slice(0, ROSTER_LIMIT).map((u) => ({
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

function handleLogout(env: WorkerEnv): Response {
  return json({ ok: true }, 200, env, [
    cookie(SESSION_COOKIE, "", { maxAge: 0 }),
  ]);
}

async function upsertUser(
  env: WorkerEnv,
  fields: { osu_id: number; username: string; avatar_url: string | null },
): Promise<DbUser> {
  const body = {
    ...fields,
    last_signed_in_at: new Date().toISOString(),
  };
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/users?on_conflict=osu_id`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`user upsert failed: ${await res.text()}`);
  const rows = (await res.json()) as DbUser[];
  if (!rows.length) throw new Error("user upsert returned no row");
  return rows[0];
}

async function fetchUser(env: WorkerEnv, id: string): Promise<DbUser | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/users?id=eq.${id}&select=id,osu_id,username,avatar_url,is_admin,last_signed_in_at`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as DbUser[];
  return rows[0] ?? null;
}

async function mintSupabaseToken(env: WorkerEnv, user: DbUser): Promise<string> {
  const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
  return new SignJWT({
    role: "authenticated",
    is_admin: user.is_admin,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(`${SUPABASE_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

async function signSession(env: WorkerEnv, uid: string): Promise<string> {
  const secret = new TextEncoder().encode(env.COOKIE_SECRET);
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(secret);
}

async function verifySession(env: WorkerEnv, token: string): Promise<string | null> {
  try {
    const secret = new TextEncoder().encode(env.COOKIE_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function cors(env: WorkerEnv): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.FRONTEND_URL,
    "Access-Control-Allow-Methods": "GET,HEAD,PUT,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Range, If-None-Match",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, ETag, Accept-Ranges",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
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

function json(
  body: unknown,
  status: number,
  env: WorkerEnv,
  setCookies: string[] = [],
): Response {
  const headers = new Headers(cors(env));
  headers.set("Content-Type", "application/json");
  for (const c of setCookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
}

function redirect(location: string, env: WorkerEnv, setCookies: string[]): Response {
  const headers = new Headers(cors(env));
  headers.set("Location", location);
  for (const c of setCookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

function cookie(
  name: string,
  value: string,
  opts: { maxAge: number },
): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    `Max-Age=${opts.maxAge}`,
  ].join("; ");
}

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}
