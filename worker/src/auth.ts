import { SignJWT, jwtVerify } from "jose";
import type { WorkerEnv } from "./storage";
import { bearerToken, clientIp, cookie, getCookie, json, originAllowed, redirect } from "./http";
import { normalizeOsuUser, storeProfileSummary } from "./social";

/**
 * Signing in, and the ways an account signs in.
 *
 * A Cascade account (public.users.id) can be reached through osu!, Discord or
 * both. Each is an identity in account_identities (migration 0047), keyed by
 * the provider's stable id. Three flows share one callback per provider:
 *
 * - login: a known identity signs in to its account and an unknown one gets
 *   a new account. It never attaches anything to whoever is signed in.
 * - link: started from Connected accounts with a ticket that only a signed-in
 *   session verified in the last few minutes can get. The callback only
 *   proves who owns the provider account and hands back a link token; the app
 *   then completes the link with its own session, which must be the account
 *   the ticket was made for. A link URL someone else sends you does nothing.
 * - reauth: signing in again with a provider the account already has, which
 *   must lead back to the same account, before a sensitive change.
 *
 * Each flow's state (the CSRF state, the PKCE verifier, the intent and the
 * desktop loopback) lives in a signed HttpOnly cookie, never in the URL.
 * Tokens from the providers are used once, inside the callback, and are never
 * stored, logged or sent to the app.
 */

export type Provider = "osu" | "discord";
export const PROVIDERS: readonly Provider[] = ["osu", "discord"];
export type Intent = "login" | "link" | "reauth";

export type SessionUser = {
  id: string;
  osu_id: number | null;
  username: string;
  /** What a profile link uses: the name, or the id when another account shares it. */
  handle?: string;
  avatar_url: string | null;
  is_admin: boolean;
  last_signed_in_at?: string | null;
  profile_provider?: Provider;
  providers: Provider[];
};

export type Session = {
  uid: string;
  /** When the person last proved who they are (seconds), or null for old sessions. */
  at: number | null;
};

export type Identity = {
  provider: Provider;
  provider_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_used_at: string | null;
};

/** What the provider says about the account that just signed in. */
export type ProviderAccount = {
  id: string;
  name: string;
  avatarUrl: string | null;
  countryCode: string | null;
  /** The provider's own answer, for anything else it already carries. */
  raw: unknown;
};

export type AuthErrorCode =
  | "cancelled"
  | "state"
  | "expired"
  | "exchange"
  | "profile"
  | "unavailable"
  | "reauth_mismatch"
  | "busy";

export type AuthHooks = {
  /** A Discord account signed in or was linked to `userId`. */
  onDiscordAccount?: (discordId: string, userId: string) => Promise<void>;
};

const SESSION_COOKIE = "me_session";
export const SESSION_TTL_DAYS = 30;
const SUPABASE_TOKEN_TTL_SECONDS = 60 * 60;
const FLOW_TTL_SECONDS = 10 * 60;
/** How recently someone must have signed in to add or remove a way of signing in. */
export const REAUTH_WINDOW_SECONDS = 15 * 60;
const ISSUER = "cascade-auth";
const PROVIDER_ID = /^[1-9][0-9]{0,19}$/;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE_COOKIES: Record<Provider, string> = {
  osu: "me_oauth_state",
  discord: "me_oauth_state_discord",
};
const PROVIDER_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 8 * 1024;

// The desktop app listens on an ephemeral loopback port and passes it here.
// Only the port survives the round trip - it is carried inside the signed
// flow cookie, and the redirect is rebuilt from scratch, so this can never be
// steered at an arbitrary host.
const MIN_LOOPBACK_PORT = 1024;
const MAX_LOOPBACK_PORT = 65535;

export function parseLoopbackPort(raw: string | null): number | null {
  if (!raw || !/^\d{4,5}$/.test(raw)) return null;
  const port = Number(raw);
  if (port < MIN_LOOPBACK_PORT || port > MAX_LOOPBACK_PORT) return null;
  return port;
}

export function loopbackRedirect(port: number, session: string, nonce: string): string {
  return `http://127.0.0.1:${port}/callback?session=${encodeURIComponent(session)}&nonce=${encodeURIComponent(nonce)}`;
}

/** A plain-text variable from wrangler.jsonc, or "" when it is unset. */
export function setting(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function key(env: WorkerEnv): Uint8Array {
  return new TextEncoder().encode(env.COOKIE_SECRET);
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function base64url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** RFC 7636 S256: the challenge a PKCE verifier is checked against. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isProvider(value: unknown): value is Provider {
  return value === "osu" || value === "discord";
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function signSession(env: WorkerEnv, uid: string, at: number | null): Promise<string> {
  const claims: Record<string, unknown> = { uid };
  if (at !== null) claims.at = at;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(key(env));
}

export async function verifySession(env: WorkerEnv, token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, key(env), { algorithms: ["HS256"] });
    // Tickets, link tokens and storage tokens share the key; none is a session.
    if (payload.iss !== undefined || payload.purpose !== undefined) return null;
    if (typeof payload.uid !== "string" || !UUID.test(payload.uid)) return null;
    const at = typeof payload.at === "number" && Number.isFinite(payload.at) ? payload.at : null;
    return { uid: payload.uid, at };
  } catch {
    return null;
  }
}

/** The session in the cookie or the bearer header. */
export async function requestSession(req: Request, env: WorkerEnv): Promise<Session | null> {
  const cookieToken = getCookie(req, SESSION_COOKIE);
  const headerToken = bearerToken(req);
  return (
    (cookieToken && (await verifySession(env, cookieToken))) ||
    (headerToken && (await verifySession(env, headerToken))) ||
    null
  );
}

export async function sessionUid(req: Request, env: WorkerEnv): Promise<string | null> {
  return (await requestSession(req, env))?.uid ?? null;
}

/**
 * Only the bearer header, for requests that change how an account signs in:
 * the session cookie is sent cross-site, a header never is.
 */
async function bearerSession(req: Request, env: WorkerEnv): Promise<Session | null> {
  const token = bearerToken(req);
  return token ? verifySession(env, token) : null;
}

export function isFresh(session: Session, at = now()): boolean {
  return session.at !== null && session.at <= at + 60 && at - session.at <= REAUTH_WINDOW_SECONDS;
}

export async function mintSupabaseToken(env: WorkerEnv, user: Pick<SessionUser, "id" | "is_admin">): Promise<string> {
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

// ---------------------------------------------------------------------------
// Flow cookies, tickets and link tokens
// ---------------------------------------------------------------------------

type Flow = {
  provider: Provider;
  state: string;
  verifier: string | null;
  intent: Intent;
  uid: string | null;
  ticket: string | null;
  ticketExp: number | null;
  port: number | null;
  nonce: string | null;
};

export async function signFlow(env: WorkerEnv, flow: Flow): Promise<string> {
  return new SignJWT({ purpose: "oauth-state", ...flow })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${FLOW_TTL_SECONDS}s`)
    .sign(key(env));
}

export async function readFlow(env: WorkerEnv, token: string | null, provider: Provider): Promise<Flow | null> {
  if (!token) return null;
  try {
    const { payload: p } = await jwtVerify(token, key(env), { algorithms: ["HS256"], issuer: ISSUER });
    if (p.purpose !== "oauth-state" || p.provider !== provider) return null;
    if (typeof p.state !== "string" || p.state.length < 16) return null;
    if (p.intent !== "login" && p.intent !== "link" && p.intent !== "reauth") return null;
    const uid = typeof p.uid === "string" && UUID.test(p.uid) ? p.uid : null;
    if (p.intent !== "login" && (!uid || typeof p.ticket !== "string")) return null;
    const port = typeof p.port === "number" ? parseLoopbackPort(String(p.port)) : null;
    const nonce = typeof p.nonce === "string" && NONCE.test(p.nonce) ? p.nonce : null;
    return {
      provider,
      state: p.state,
      verifier: typeof p.verifier === "string" ? p.verifier : null,
      intent: p.intent,
      uid,
      ticket: typeof p.ticket === "string" && UUID.test(p.ticket) ? p.ticket : null,
      ticketExp: typeof p.ticketExp === "number" ? p.ticketExp : null,
      port: port !== null && nonce !== null ? port : null,
      nonce: port !== null && nonce !== null ? nonce : null,
    };
  } catch {
    return null;
  }
}

type Ticket = { uid: string; provider: Provider; intent: "link" | "reauth"; jti: string; exp: number };

export async function signTicket(
  env: WorkerEnv,
  ticket: { uid: string; provider: Provider; intent: "link" | "reauth" },
): Promise<string> {
  return new SignJWT({ purpose: "oauth-ticket", provider: ticket.provider, intent: ticket.intent })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setSubject(ticket.uid)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${FLOW_TTL_SECONDS}s`)
    .sign(key(env));
}

export async function readTicket(env: WorkerEnv, token: string, provider: Provider): Promise<Ticket | null> {
  try {
    const { payload: p } = await jwtVerify(token, key(env), { algorithms: ["HS256"], issuer: ISSUER });
    if (p.purpose !== "oauth-ticket" || p.provider !== provider) return null;
    if (p.intent !== "link" && p.intent !== "reauth") return null;
    if (typeof p.sub !== "string" || !UUID.test(p.sub)) return null;
    if (typeof p.jti !== "string" || !UUID.test(p.jti) || typeof p.exp !== "number") return null;
    return { uid: p.sub, provider, intent: p.intent, jti: p.jti, exp: p.exp };
  } catch {
    return null;
  }
}

export type LinkToken = {
  uid: string;
  provider: Provider;
  providerUserId: string;
  name: string | null;
  avatarUrl: string | null;
  jti: string;
  exp: number;
};

export async function signLinkToken(
  env: WorkerEnv,
  uid: string,
  provider: Provider,
  account: ProviderAccount,
): Promise<string> {
  return new SignJWT({
    purpose: "link",
    provider,
    pid: account.id,
    name: account.name || null,
    avatar: account.avatarUrl,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setSubject(uid)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${FLOW_TTL_SECONDS}s`)
    .sign(key(env));
}

export async function readLinkToken(env: WorkerEnv, token: string): Promise<LinkToken | null> {
  try {
    const { payload: p } = await jwtVerify(token, key(env), { algorithms: ["HS256"], issuer: ISSUER });
    if (p.purpose !== "link" || !isProvider(p.provider)) return null;
    if (typeof p.sub !== "string" || !UUID.test(p.sub)) return null;
    if (typeof p.pid !== "string" || !PROVIDER_ID.test(p.pid)) return null;
    if (typeof p.jti !== "string" || !UUID.test(p.jti) || typeof p.exp !== "number") return null;
    return {
      uid: p.sub,
      provider: p.provider,
      providerUserId: p.pid,
      name: typeof p.name === "string" ? p.name : null,
      avatarUrl: typeof p.avatar === "string" ? p.avatar : null,
      jti: p.jti,
      exp: p.exp,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

type ProviderConfig = {
  ready: (env: WorkerEnv) => boolean;
  pkce: boolean;
  authorizeUrl: (env: WorkerEnv, state: string, challenge: string | null) => string;
  exchange: (env: WorkerEnv, code: string, verifier: string | null) => Promise<string | null>;
  account: (accessToken: string) => Promise<ProviderAccount | null>;
};

type Raw = Record<string, unknown>;

function obj(value: unknown): Raw | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;
}

function https(value: unknown): string | null {
  return typeof value === "string" && /^https:\/\//i.test(value) && value.length <= 512 ? value : null;
}

async function accessToken(res: Response): Promise<string | null> {
  if (!res.ok) return null;
  const data = obj(await res.json().catch(() => null));
  return typeof data?.access_token === "string" && data.access_token ? data.access_token : null;
}

const OSU: ProviderConfig = {
  ready: (env) => Boolean(setting(env.CLIENT_ID) && env.CLIENT_SECRET && setting(env.OSU_REDIRECT_URI)),
  // osu! doesn't document PKCE, so its exchange stays the confidential one
  // it has always been: the client secret plus the state cookie.
  pkce: false,
  authorizeUrl(env, state) {
    const url = new URL("https://osu.ppy.sh/oauth/authorize");
    url.searchParams.set("client_id", setting(env.CLIENT_ID));
    url.searchParams.set("redirect_uri", setting(env.OSU_REDIRECT_URI));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify");
    url.searchParams.set("state", state);
    return url.toString();
  },
  async exchange(env, code) {
    const res = await fetch("https://osu.ppy.sh/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: setting(env.CLIENT_ID),
        client_secret: env.CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: setting(env.OSU_REDIRECT_URI),
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    return accessToken(res);
  },
  async account(token) {
    const res = await fetch("https://osu.ppy.sh/api/v2/me", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const raw = (await res.json().catch(() => null)) as unknown;
    const me = obj(raw);
    const id = me?.id;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
    if (typeof me?.username !== "string" || !me.username) return null;
    return {
      id: String(id),
      name: me.username,
      avatarUrl: https(me.avatar_url),
      countryCode:
        typeof me.country_code === "string" && /^[A-Z]{2}$/.test(me.country_code) ? me.country_code : null,
      raw,
    };
  },
};

const DISCORD_API = "https://discord.com/api/v10";

/** A Discord account's avatar, or the default one Discord shows for it. */
export function discordAvatarUrl(id: string, hash: unknown): string {
  if (typeof hash === "string" && /^(a_)?[0-9a-f]{32}$/.test(hash)) {
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=256`;
  }
  const index = Number((BigInt(id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export function discordReady(env: WorkerEnv): boolean {
  return Boolean(
    setting(env.DISCORD_APPLICATION_ID) && env.DISCORD_CLIENT_SECRET && setting(env.DISCORD_REDIRECT_URI),
  );
}

const DISCORD: ProviderConfig = {
  ready: discordReady,
  pkce: true,
  authorizeUrl(env, state, challenge) {
    const url = new URL("https://discord.com/oauth2/authorize");
    url.searchParams.set("client_id", setting(env.DISCORD_APPLICATION_ID));
    url.searchParams.set("redirect_uri", setting(env.DISCORD_REDIRECT_URI));
    url.searchParams.set("response_type", "code");
    // identify is the stable id, username and avatar; nothing else is asked for.
    url.searchParams.set("scope", "identify");
    url.searchParams.set("state", state);
    if (challenge) {
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
    }
    return url.toString();
  },
  async exchange(env, code, verifier) {
    const body = new URLSearchParams({
      client_id: setting(env.DISCORD_APPLICATION_ID),
      client_secret: env.DISCORD_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
      code,
      redirect_uri: setting(env.DISCORD_REDIRECT_URI),
    });
    if (verifier) body.set("code_verifier", verifier);
    const res = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    return accessToken(res);
  },
  async account(token) {
    const res = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const raw = (await res.json().catch(() => null)) as unknown;
    const me = obj(raw);
    // The id is the identity; names change and are only for display.
    if (typeof me?.id !== "string" || !PROVIDER_ID.test(me.id)) return null;
    const name =
      (typeof me.global_name === "string" && me.global_name.trim()) ||
      (typeof me.username === "string" && me.username.trim()) ||
      "";
    return {
      id: me.id,
      name: name.slice(0, 64),
      avatarUrl: discordAvatarUrl(me.id, me.avatar),
      countryCode: null,
      raw,
    };
  },
};

const CONFIG: Record<Provider, ProviderConfig> = { osu: OSU, discord: DISCORD };

/** The providers this deployment can sign in with right now. */
export function availableProviders(env: WorkerEnv): Provider[] {
  return PROVIDERS.filter((provider) => CONFIG[provider].ready(env));
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

type RpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; missing: boolean };

export async function rpc<T>(env: WorkerEnv, fn: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (res.ok) return { ok: true, data: (await res.json()) as T };
  const error = obj(await res.json().catch(() => null));
  // PostgREST answers PGRST202 for a function the database doesn't have yet,
  // which is how a Worker deployed before its migration notices.
  return { ok: false, status: res.status, missing: res.status === 404 && error?.code === "PGRST202" };
}

function sessionUser(raw: unknown): SessionUser | null {
  const row = obj(raw);
  if (!row || typeof row.id !== "string" || typeof row.username !== "string") return null;
  const providers = Array.isArray(row.providers) ? row.providers.filter(isProvider) : [];
  return {
    id: row.id,
    osu_id: typeof row.osu_id === "number" ? row.osu_id : null,
    username: row.username,
    handle: typeof row.handle === "string" ? row.handle : undefined,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    is_admin: row.is_admin === true,
    last_signed_in_at: typeof row.last_signed_in_at === "string" ? row.last_signed_in_at : null,
    profile_provider: isProvider(row.profile_provider) ? row.profile_provider : "osu",
    providers: providers.length || typeof row.osu_id !== "number" ? providers : ["osu"],
  };
}

function serviceHeaders(env: WorkerEnv): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

/**
 * The signed-in account, or null when it no longer exists. Throws when the
 * database can't answer, so a hiccup is never mistaken for a sign-out.
 */
export async function fetchSessionUser(env: WorkerEnv, uid: string): Promise<SessionUser | null> {
  if (!UUID.test(uid)) return null;
  const result = await rpc<unknown>(env, "auth_session_user", { p_user: uid });
  if (result.ok) return result.data ? sessionUser(result.data) : null;
  if (!result.missing) throw new Error("account lookup failed");
  // Before migration 0047: every account is an osu! account.
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/users?id=eq.${uid}&select=id,osu_id,username,avatar_url,is_admin,last_signed_in_at`,
    { headers: serviceHeaders(env) },
  );
  if (!res.ok) throw new Error("account lookup failed");
  const rows = (await res.json()) as unknown[];
  return rows[0] ? sessionUser(rows[0]) : null;
}

async function signIn(env: WorkerEnv, provider: Provider, account: ProviderAccount): Promise<SessionUser | null> {
  const result = await rpc<unknown>(env, "auth_sign_in", {
    p_provider: provider,
    p_provider_user_id: account.id,
    p_username: account.name,
    p_avatar_url: account.avatarUrl,
    p_country_code: account.countryCode,
  });
  if (result.ok) return sessionUser(result.data);
  if (result.missing && provider === "osu") return legacyOsuSignIn(env, account);
  return null;
}

/** osu! sign-in as it was before migration 0047, for a database without it. */
async function legacyOsuSignIn(env: WorkerEnv, account: ProviderAccount): Promise<SessionUser | null> {
  const post = (body: Record<string, unknown>) =>
    fetch(`${env.SUPABASE_URL}/rest/v1/users?on_conflict=osu_id`, {
      method: "POST",
      headers: {
        ...serviceHeaders(env),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(body),
    });
  const body = {
    osu_id: Number(account.id),
    username: account.name,
    avatar_url: account.avatarUrl,
    country_code: account.countryCode,
    last_signed_in_at: new Date().toISOString(),
  };
  let res = await post(body);
  // A database without migration 0041 has no country column yet.
  if (!res.ok && res.status === 400) {
    const { country_code: _country, ...rest } = body;
    res = await post(rest);
  }
  if (!res.ok) return null;
  const rows = (await res.json()) as unknown[];
  return rows[0] ? sessionUser(rows[0]) : null;
}

async function identityOwner(env: WorkerEnv, provider: Provider, providerUserId: string): Promise<string | null | undefined> {
  const result = await rpc<string | null>(env, "identity_owner", {
    p_provider: provider,
    p_provider_user_id: providerUserId,
  });
  return result.ok ? result.data : undefined;
}

async function identitiesOf(env: WorkerEnv, uid: string): Promise<Identity[] | null> {
  const result = await rpc<Identity[]>(env, "account_identities_of", { p_user: uid });
  return result.ok && Array.isArray(result.data) ? result.data.filter((i) => isProvider(i.provider)) : null;
}

/** True the first time, false for a replay, null when the database can't say. */
async function consumeOnce(env: WorkerEnv, jti: string, purpose: "oauth-ticket" | "link", exp: number): Promise<boolean | null> {
  const result = await rpc<boolean>(env, "auth_consume_token", {
    p_jti: jti,
    p_purpose: purpose,
    p_expires_at: new Date(exp * 1000).toISOString(),
  });
  return result.ok ? result.data === true : null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function allowed(env: WorkerEnv, req: Request, bucket: string): Promise<boolean> {
  const limiter = env.AUTH_LIMITER as RateLimit | undefined;
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key: `${bucket}:${clientIp(req)}` })).success;
  } catch {
    return true;
  }
}

type Outcome = { session: string } | { link: string } | { error: AuthErrorCode };

function finish(
  env: WorkerEnv,
  provider: Provider,
  flow: Pick<Flow, "port" | "nonce"> | null,
  outcome: Outcome,
  cookies: string[],
): Response {
  if (flow?.port != null && flow.nonce) {
    const payload =
      "session" in outcome ? outcome.session : "link" in outcome ? `link:${outcome.link}` : `error:${outcome.error}`;
    return redirect(loopbackRedirect(flow.port, payload, flow.nonce), env, cookies);
  }
  if ("session" in outcome) {
    return redirect(`${env.FRONTEND_URL}/?auth=ok#session=${encodeURIComponent(outcome.session)}`, env, [
      ...cookies,
      cookie(SESSION_COOKIE, outcome.session, { maxAge: SESSION_TTL_DAYS * 86400 }),
    ]);
  }
  if ("link" in outcome) {
    return redirect(`${env.FRONTEND_URL}/?auth=link#link=${encodeURIComponent(outcome.link)}`, env, cookies);
  }
  return redirect(
    `${env.FRONTEND_URL}/?auth=error&reason=${outcome.error}&provider=${provider}`,
    env,
    cookies,
  );
}

async function handleLogin(req: Request, url: URL, env: WorkerEnv, provider: Provider): Promise<Response> {
  const config = CONFIG[provider];
  const desktop = url.searchParams.get("client") === "desktop";
  const port = desktop ? parseLoopbackPort(url.searchParams.get("port")) : null;
  const nonce = desktop ? url.searchParams.get("nonce") : null;
  if (desktop && (port === null || !nonce || !NONCE.test(nonce))) {
    return json({ error: "invalid desktop callback" }, 400, env);
  }
  const target = port !== null && nonce ? { port, nonce } : null;
  if (!(await allowed(env, req, "oauth"))) return finish(env, provider, target, { error: "busy" }, []);
  if (!config.ready(env)) return finish(env, provider, target, { error: "unavailable" }, []);

  let intent: Intent = "login";
  let uid: string | null = null;
  let ticketId: string | null = null;
  let ticketExp: number | null = null;
  const rawTicket = url.searchParams.get("ticket");
  if (rawTicket) {
    const ticket = rawTicket.length <= 2048 ? await readTicket(env, rawTicket, provider) : null;
    if (!ticket) return finish(env, provider, target, { error: "expired" }, []);
    intent = ticket.intent;
    uid = ticket.uid;
    ticketId = ticket.jti;
    ticketExp = ticket.exp;
  }

  const state = randomToken(32);
  const verifier = config.pkce ? randomToken(48) : null;
  const flow = await signFlow(env, {
    provider,
    state,
    verifier,
    intent,
    uid,
    ticket: ticketId,
    ticketExp,
    port,
    nonce,
  });
  return redirect(
    config.authorizeUrl(env, state, verifier ? await pkceChallenge(verifier) : null),
    env,
    [cookie(STATE_COOKIES[provider], flow, { maxAge: FLOW_TTL_SECONDS, sameSite: "Lax" })],
  );
}

async function handleCallback(
  req: Request,
  url: URL,
  env: WorkerEnv,
  provider: Provider,
  ctx: ExecutionContext | undefined,
  hooks: AuthHooks,
): Promise<Response> {
  const config = CONFIG[provider];
  const clear = [cookie(STATE_COOKIES[provider], "", { maxAge: 0, sameSite: "Lax" })];
  const flow = await readFlow(env, getCookie(req, STATE_COOKIES[provider]), provider);
  const state = url.searchParams.get("state");
  // Without the cookie this browser set, the callback isn't one this browser
  // started: a forwarded or replayed link, or a stale tab.
  if (!flow || !state || !sameText(state, flow.state)) {
    return finish(env, provider, null, { error: "state" }, clear);
  }
  if (!(await allowed(env, req, "oauth"))) return finish(env, provider, flow, { error: "busy" }, clear);
  if (url.searchParams.has("error")) return finish(env, provider, flow, { error: "cancelled" }, clear);
  const code = url.searchParams.get("code");
  if (!code || code.length > 1024) return finish(env, provider, flow, { error: "state" }, clear);

  // An authorization code works once; a replayed one fails here.
  const token = await config.exchange(env, code, flow.verifier).catch(() => null);
  if (!token) return finish(env, provider, flow, { error: "exchange" }, clear);
  const account = await config.account(token).catch(() => null);
  if (!account) return finish(env, provider, flow, { error: "profile" }, clear);

  if (flow.ticket && flow.ticketExp !== null) {
    const first = await consumeOnce(env, flow.ticket, "oauth-ticket", flow.ticketExp);
    if (first === null) return finish(env, provider, flow, { error: "unavailable" }, clear);
    if (!first) return finish(env, provider, flow, { error: "expired" }, clear);
  }

  if (flow.intent === "link" && flow.uid) {
    return finish(env, provider, flow, { link: await signLinkToken(env, flow.uid, provider, account) }, clear);
  }

  if (flow.intent === "reauth" && flow.uid) {
    const owner = await identityOwner(env, provider, account.id);
    if (owner === undefined) return finish(env, provider, flow, { error: "unavailable" }, clear);
    if (owner !== flow.uid) return finish(env, provider, flow, { error: "reauth_mismatch" }, clear);
    return finish(env, provider, flow, { session: await signSession(env, flow.uid, now()) }, clear);
  }

  const user = await signIn(env, provider, account).catch(() => null);
  if (!user) return finish(env, provider, flow, { error: "unavailable" }, clear);
  if (provider === "osu") {
    // osu! already sent the full profile, so search and the community page
    // can show this account's map counts without asking osu! again.
    const summary = normalizeOsuUser(account.raw, "mania");
    if (summary) {
      const store = storeProfileSummary(env, user.id, summary).catch(() => {});
      if (ctx) ctx.waitUntil(store);
      else await store;
    }
  }
  if (provider === "discord" && hooks.onDiscordAccount) {
    const sync = hooks.onDiscordAccount(account.id, user.id).catch(() => {});
    if (ctx) ctx.waitUntil(sync);
    else await sync;
  }
  return finish(env, provider, flow, { session: await signSession(env, user.id, now()) }, clear);
}

async function handleSession(req: Request, env: WorkerEnv): Promise<Response> {
  const cookieToken = getCookie(req, SESSION_COOKIE);
  const session = await requestSession(req, env);
  const loginProviders = availableProviders(env);
  const clearCookies = cookieToken ? [cookie(SESSION_COOKIE, "", { maxAge: 0 })] : [];
  if (!session) return json({ user: null, loginProviders }, 200, env, clearCookies);

  const user = await fetchSessionUser(env, session.uid);
  if (!user) return json({ user: null, loginProviders }, 200, env, clearCookies);

  const supabaseToken = await mintSupabaseToken(env, user);
  // A refreshed session keeps the time the person last signed in.
  const sessionToken = await signSession(env, user.id, session.at);
  return json({ user, supabaseToken, sessionToken, loginProviders }, 200, env);
}

function handleLogout(env: WorkerEnv): Response {
  return json({ ok: true }, 200, env, [cookie(SESSION_COOKIE, "", { maxAge: 0 })]);
}

async function readBody(req: Request): Promise<Raw | null> {
  if (!(req.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) return null;
  const length = Number(req.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return null;
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    return obj(JSON.parse(text));
  } catch {
    return null;
  }
}

/** A provider the account already has, to confirm it's you with: never `except`. */
function confirmWith(env: WorkerEnv, identities: Identity[], except: Provider | null): Provider | null {
  const ready = availableProviders(env);
  return identities.map((i) => i.provider).find((p) => p !== except && ready.includes(p)) ?? null;
}

type AccountRequest = { session: Session; body: Raw };

/** Common checks for the routes that change how an account signs in. */
async function accountRequest(req: Request, env: WorkerEnv): Promise<AccountRequest | Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, env);
  if (!originAllowed(req, env)) return json({ error: "forbidden" }, 403, env);
  if (!(await allowed(env, req, "account"))) return json({ error: "too many requests" }, 429, env);
  const session = await bearerSession(req, env);
  if (!session) return json({ error: "sign in first" }, 401, env);
  const body = await readBody(req);
  if (!body) return json({ error: "invalid request" }, 400, env);
  return { session, body };
}

async function handleIdentities(req: Request, env: WorkerEnv): Promise<Response> {
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405, env);
  const session = await bearerSession(req, env);
  if (!session) return json({ error: "sign in first" }, 401, env);
  const identities = await identitiesOf(env, session.uid);
  if (!identities) return json({ error: "unavailable" }, 503, env);
  return json(
    { identities, available: availableProviders(env), fresh: isFresh(session) },
    200,
    env,
  );
}

async function handleLinkStart(req: Request, env: WorkerEnv): Promise<Response> {
  const request = await accountRequest(req, env);
  if (request instanceof Response) return request;
  const { session, body } = request;
  const provider = body.provider;
  if (!isProvider(provider)) return json({ error: "unknown provider" }, 400, env);
  if (!CONFIG[provider].ready(env)) return json({ error: "unavailable" }, 503, env);
  const intent = body.intent === "reauth" ? "reauth" : "link";

  const identities = await identitiesOf(env, session.uid);
  if (!identities) return json({ error: "unavailable" }, 503, env);
  const has = identities.some((i) => i.provider === provider);
  if (intent === "link") {
    if (has) return json({ status: "already_linked", provider }, 200, env);
    if (!isFresh(session)) {
      return json({ error: "reauth_required", via: confirmWith(env, identities, null) }, 403, env);
    }
  } else if (!has) {
    return json({ error: "not_linked" }, 400, env);
  }

  const ticket = await signTicket(env, { uid: session.uid, provider, intent });
  const origin = new URL(req.url).origin;
  return json({ url: `${origin}/auth/${provider}/login?ticket=${encodeURIComponent(ticket)}` }, 200, env);
}

async function handleLinkComplete(
  req: Request,
  env: WorkerEnv,
  ctx: ExecutionContext | undefined,
  hooks: AuthHooks,
): Promise<Response> {
  const request = await accountRequest(req, env);
  if (request instanceof Response) return request;
  const { session, body } = request;
  const raw = typeof body.token === "string" && body.token.length <= 4096 ? body.token : null;
  const link = raw ? await readLinkToken(env, raw) : null;
  if (!link) return json({ error: "expired" }, 400, env);
  // Only the account that asked for the link can finish it.
  if (link.uid !== session.uid) return json({ error: "wrong_account" }, 403, env);

  const first = await consumeOnce(env, link.jti, "link", link.exp);
  if (first === null) return json({ error: "unavailable" }, 503, env);
  if (!first) {
    // Finishing the same link twice (a reload, a double click) is fine.
    const owner = await identityOwner(env, link.provider, link.providerUserId);
    return owner === session.uid
      ? json({ status: "already_linked", provider: link.provider }, 200, env)
      : json({ error: "used" }, 409, env);
  }

  const result = await rpc<string>(env, "link_account_identity", {
    p_user: session.uid,
    p_provider: link.provider,
    p_provider_user_id: link.providerUserId,
    p_display_name: link.name,
    p_avatar_url: link.avatarUrl,
  });
  if (!result.ok) return json({ error: "unavailable" }, 503, env);
  const status = result.data;
  if (status === "linked" || status === "already_linked") {
    if (link.provider === "discord" && hooks.onDiscordAccount) {
      const sync = hooks.onDiscordAccount(link.providerUserId, session.uid).catch(() => {});
      if (ctx) ctx.waitUntil(sync);
      else await sync;
    }
    return json({ status, provider: link.provider }, 200, env);
  }
  return json({ status, provider: link.provider }, 409, env);
}

async function handleUnlink(req: Request, env: WorkerEnv): Promise<Response> {
  const request = await accountRequest(req, env);
  if (request instanceof Response) return request;
  const { session, body } = request;
  const provider = body.provider;
  if (!isProvider(provider)) return json({ error: "unknown provider" }, 400, env);

  const identities = await identitiesOf(env, session.uid);
  if (!identities) return json({ error: "unavailable" }, 503, env);
  if (!identities.some((i) => i.provider === provider)) {
    return json({ status: "not_linked", provider }, 404, env);
  }
  if (identities.length <= 1) return json({ status: "last_identity", provider }, 409, env);
  if (!isFresh(session)) {
    return json({ error: "reauth_required", via: confirmWith(env, identities, provider) }, 403, env);
  }

  const result = await rpc<string>(env, "unlink_account_identity", { p_user: session.uid, p_provider: provider });
  if (!result.ok) return json({ error: "unavailable" }, 503, env);
  const status = result.data;
  if (status === "unlinked") return json({ status, provider }, 200, env);
  return json({ status, provider }, status === "not_linked" ? 404 : 409, env);
}

/** osu! profile covers are only reachable through the API, so the app asks on demand. */
async function handleCover(
  req: Request,
  env: WorkerEnv,
  appToken: () => Promise<string | null>,
): Promise<Response> {
  const uid = await sessionUid(req, env);
  if (!uid) return json({ cover_url: null }, 401, env);
  const user = await fetchSessionUser(env, uid);
  if (!user) return json({ cover_url: null }, 404, env);
  if (user.osu_id === null) return json({ cover_url: null }, 200, env);

  const token = await appToken();
  if (!token) return json({ cover_url: null }, 200, env);
  const res = await fetch(`https://osu.ppy.sh/api/v2/users/${user.osu_id}?key=id`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return json({ cover_url: null }, 200, env);
  const profile = (await res.json()) as {
    cover_url?: string;
    cover?: { url?: string; custom_url?: string | null };
  };
  const cover = profile.cover?.custom_url ?? profile.cover?.url ?? profile.cover_url ?? null;
  return json({ cover_url: cover }, 200, env);
}

export async function handleAuthRoute(
  req: Request,
  url: URL,
  env: WorkerEnv,
  deps: {
    ctx?: ExecutionContext;
    hooks?: AuthHooks;
    appToken: () => Promise<string | null>;
  },
): Promise<Response | null> {
  if (!url.pathname.startsWith("/auth/")) return null;
  const response = await authRoute(req, url, env, deps);
  // Sessions, link results and tickets are never kept by a cache.
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function authRoute(
  req: Request,
  url: URL,
  env: WorkerEnv,
  deps: {
    ctx?: ExecutionContext;
    hooks?: AuthHooks;
    appToken: () => Promise<string | null>;
  },
): Promise<Response> {
  const hooks = deps.hooks ?? {};

  const flow = /^\/auth\/(osu|discord)\/(login|callback)$/.exec(url.pathname);
  if (flow) {
    if (req.method !== "GET") return json({ error: "method not allowed" }, 405, env);
    const provider = flow[1] as Provider;
    return flow[2] === "login"
      ? handleLogin(req, url, env, provider)
      : handleCallback(req, url, env, provider, deps.ctx, hooks);
  }

  switch (url.pathname) {
    case "/auth/session":
      return handleSession(req, env);
    case "/auth/logout":
      if (req.method !== "POST") return json({ error: "method not allowed" }, 405, env);
      return handleLogout(env);
    case "/auth/osu/cover":
      return handleCover(req, env, deps.appToken);
    case "/auth/identities":
      return handleIdentities(req, env);
    case "/auth/link/start":
      return handleLinkStart(req, env);
    case "/auth/link/complete":
      return handleLinkComplete(req, env, deps.ctx, hooks);
    case "/auth/identities/unlink":
      return handleUnlink(req, env);
    default:
      return json({ error: "not found" }, 404, env);
  }
}
