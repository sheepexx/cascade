import { SignJWT, jwtVerify } from "jose";

interface Env {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  FRONTEND_URL: string;
  OSU_REDIRECT_URI: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  COOKIE_SECRET: string;
}

type DbUser = {
  id: string;
  osu_id: number;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  last_signed_in_at?: string | null;
};

const SESSION_COOKIE = "me_session";
const STATE_COOKIE = "me_oauth_state";
const SESSION_TTL_DAYS = 30;
const SUPABASE_TOKEN_TTL_SECONDS = 60 * 60;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    try {
      // Parameterized mirror routes can't be switch cases.
      const download = url.pathname.match(/^\/mirror\/(\d{1,10})$/);
      if (download && req.method === "GET") {
        return await handleMirrorDownload(download[1], env);
      }
      const lookup = url.pathname.match(/^\/mirror\/beatmap\/(\d{1,10})$/);
      if (lookup && req.method === "GET") {
        return await handleBeatmapLookup(lookup[1], env);
      }

      switch (url.pathname) {
        case "/auth/osu/login":
          return await handleLogin(env);
        case "/auth/osu/callback":
          return await handleCallback(req, url, env);
        case "/auth/session":
          return await handleSession(req, env);
        case "/auth/osu/cover":
          return await handleCover(req, env);
        case "/auth/logout":
          return handleLogout(env);
        default:
          return json({ error: "not found" }, 404, env);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      return json({ error: message }, 500, env);
    }
  },
};

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
  env: Env,
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
  env: Env,
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

async function handleLogin(env: Env): Promise<Response> {
  const state = crypto.randomUUID();
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
  env: Env,
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
  return redirect(
    `${env.FRONTEND_URL}/?auth=ok#session=${encodeURIComponent(session)}`,
    env,
    [
      cookie(STATE_COOKIE, "", { maxAge: 0 }),
      cookie(SESSION_COOKIE, session, { maxAge: SESSION_TTL_DAYS * 86400 }),
    ],
  );
}

async function handleSession(req: Request, env: Env): Promise<Response> {
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

// osu! profile covers are only reachable through the API, and the session
// payload predates them, so the SPA asks for one on demand. Client-credentials
// tokens last a day; keeping the last one avoids a token round-trip per open.
let appToken: { value: string; expiresAt: number } | null = null;

async function appAccessToken(env: Env): Promise<string | null> {
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

async function handleCover(req: Request, env: Env): Promise<Response> {
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

function handleLogout(env: Env): Response {
  return json({ ok: true }, 200, env, [
    cookie(SESSION_COOKIE, "", { maxAge: 0 }),
  ]);
}

async function upsertUser(
  env: Env,
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

async function fetchUser(env: Env, id: string): Promise<DbUser | null> {
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

async function mintSupabaseToken(env: Env, user: DbUser): Promise<string> {
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

async function signSession(env: Env, uid: string): Promise<string> {
  const secret = new TextEncoder().encode(env.COOKIE_SECRET);
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(secret);
}

async function verifySession(env: Env, token: string): Promise<string | null> {
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

function cors(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.FRONTEND_URL,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function json(
  body: unknown,
  status: number,
  env: Env,
  setCookies: string[] = [],
): Response {
  const headers = new Headers(cors(env));
  headers.set("Content-Type", "application/json");
  for (const c of setCookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
}

function redirect(location: string, env: Env, setCookies: string[]): Response {
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
