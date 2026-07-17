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
      switch (url.pathname) {
        case "/auth/osu/login":
          return await handleLogin(env);
        case "/auth/osu/callback":
          return await handleCallback(req, url, env);
        case "/auth/session":
          return await handleSession(req, env);
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
