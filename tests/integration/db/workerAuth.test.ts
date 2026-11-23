import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "./database";
import { postgrest } from "./postgrest";
import worker from "../../../worker/src/index";
import { signSession } from "../../../worker/src/auth";
import type { WorkerEnv } from "../../../worker/src/storage";

/**
 * Signing in, linking and unlinking through the real Worker routes, against
 * every migration in a real Postgres. osu! and Discord are stand-ins that
 * behave like the real OAuth servers where it matters: codes work once, and
 * Discord checks the PKCE verifier against the challenge it was sent.
 */

const WORKER = "https://worker.test";
const FRONTEND = "https://cascade.sheepex.net";
const SERVICE_KEY = "service-role-key";

type Account = { id: string; name: string; avatar?: string | null; country?: string };

class FakeProvider {
  private codes = new Map<string, { account: Account; challenge: string | null }>();
  private tokens = new Map<string, Account>();
  failProfile = false;

  issue(account: Account, challenge: string | null): string {
    const code = randomUUID();
    this.codes.set(code, { account, challenge });
    return code;
  }

  exchange(form: URLSearchParams): Response {
    const code = form.get("code") ?? "";
    const grant = this.codes.get(code);
    // Codes are single-use, like the real servers'.
    this.codes.delete(code);
    if (!grant) return Response.json({ error: "invalid_grant" }, { status: 400 });
    if (grant.challenge !== null) {
      const verifier = form.get("code_verifier") ?? "";
      const expected = createHash("sha256").update(verifier).digest("base64url");
      if (expected !== grant.challenge) return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    const token = randomUUID();
    this.tokens.set(token, grant.account);
    return Response.json({ access_token: token, token_type: "Bearer" });
  }

  me(authorization: string | null): Account | null {
    if (this.failProfile) return null;
    return this.tokens.get(authorization?.replace(/^Bearer /, "") ?? "") ?? null;
  }
}

const osu = new FakeProvider();
const discord = new FakeProvider();

function env(): WorkerEnv {
  return {
    PROJECT_ASSETS: {} as R2Bucket,
    SHARED_ASSETS: {} as R2Bucket,
    AUTH_LIMITER: { limit: async () => ({ success: true }) },
    CLIENT_ID: "60987",
    FRONTEND_URL: FRONTEND,
    OSU_REDIRECT_URI: `${WORKER}/auth/osu/callback`,
    SUPABASE_URL: "https://db.test",
    SUPABASE_STORAGE_FALLBACK: "false",
    SUPABASE_STORAGE_ALLOWANCE_BYTES: "1073741824",
    R2_STORAGE_ALLOWANCE_BYTES: "10737418240",
    MAX_ASSET_BYTES: "62914560",
    DISCORD_APPLICATION_ID: "1100000000000000001",
    DISCORD_PUBLIC_KEY: "",
    DISCORD_REDIRECT_URI: `${WORKER}/auth/discord/callback`,
    DISCORD_GUILD_ID: "",
    DISCORD_CONTRIBUTOR_ROLE_ID: "",
    DISCORD_REVIEW_CHANNEL_ID: "",
    DISCORD_MAINTAINER_IDS: "",
    CLIENT_SECRET: "osu-secret",
    DISCORD_CLIENT_SECRET: "discord-secret",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    SUPABASE_JWT_SECRET: "jwt-secret",
    COOKIE_SECRET: "cookie-secret",
  } as unknown as WorkerEnv;
}

let t: TestDatabase;
let pending: Promise<unknown>[];

beforeEach(async () => {
  t = await createTestDatabase();
  pending = [];
  const rest = postgrest(t.db, SERVICE_KEY);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin === "https://db.test") return rest(url, init);
    const auth = new Headers(init?.headers).get("Authorization");
    if (url.href === "https://osu.ppy.sh/oauth/token") {
      return osu.exchange(new URLSearchParams(String(init?.body)));
    }
    if (url.href === "https://osu.ppy.sh/api/v2/me") {
      const me = osu.me(auth);
      return me
        ? Response.json({ id: Number(me.id), username: me.name, avatar_url: me.avatar ?? `https://a.ppy.sh/${me.id}`, country_code: me.country ?? "DE" })
        : new Response(null, { status: 401 });
    }
    if (url.href === "https://discord.com/api/v10/oauth2/token") {
      return discord.exchange(new URLSearchParams(String(init?.body)));
    }
    if (url.href === "https://discord.com/api/v10/users/@me") {
      const me = discord.me(auth);
      return me
        ? Response.json({ id: me.id, username: me.name.toLowerCase(), global_name: me.name, avatar: me.avatar ?? null })
        : new Response(null, { status: 401 });
    }
    throw new Error(`unexpected request to ${url.href}`);
  });
});

afterEach(async () => {
  await Promise.all(pending);
  vi.unstubAllGlobals();
  await t.close();
});

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = {
    waitUntil: (p: Promise<unknown>) => pending.push(p),
    passThroughOnException() {},
  } as unknown as ExecutionContext;
  return worker.fetch(new Request(`${WORKER}${path}`, init), env(), ctx);
}

function setCookie(res: Response, name: string): string | null {
  for (const header of res.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const [key, ...value] = pair.split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

type Flow = { state: string; challenge: string | null; cookie: string; cookieName: string };

async function start(provider: "osu" | "discord", query = ""): Promise<Flow & { res: Response }> {
  const res = await call(`/auth/${provider}/login${query}`);
  expect(res.status).toBe(302);
  const cookieName = provider === "osu" ? "me_oauth_state" : "me_oauth_state_discord";
  const authorize = new URL(res.headers.get("Location")!);
  return {
    res,
    state: authorize.searchParams.get("state")!,
    challenge: authorize.searchParams.get("code_challenge"),
    cookie: setCookie(res, cookieName)!,
    cookieName,
  };
}

function finish(provider: "osu" | "discord", flow: Flow, code: string, state = flow.state): Promise<Response> {
  return call(`/auth/${provider}/callback?code=${code}&state=${state}`, {
    headers: { Cookie: `${flow.cookieName}=${flow.cookie}` },
  });
}

async function signIn(provider: "osu" | "discord", account: Account, query = ""): Promise<Response> {
  const flow = await start(provider, query);
  const fake = provider === "osu" ? osu : discord;
  return finish(provider, flow, fake.issue(account, flow.challenge));
}

function sessionFrom(res: Response): string {
  const location = res.headers.get("Location")!;
  const match = /#session=([^&]+)$/.exec(location) ?? /[?&]session=([^&]+)/.exec(location);
  expect(match, location).not.toBeNull();
  return decodeURIComponent(match![1]);
}

async function session(token: string) {
  const res = await call("/auth/session", { headers: { Authorization: `Bearer ${token}` } });
  return (await res.json()) as {
    user: { id: string; osu_id: number | null; username: string; providers: string[]; avatar_url: string | null } | null;
    sessionToken?: string;
    loginProviders: string[];
  };
}

function post(path: string, token: string, body: unknown): Promise<Response> {
  return call(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Origin: FRONTEND },
    body: JSON.stringify(body),
  });
}

/** Runs a link from Connected accounts to the end, as the app would. */
async function link(token: string, provider: "osu" | "discord", account: Account): Promise<Response> {
  const started = await post("/auth/link/start", token, { provider });
  expect(started.status, await started.clone().text()).toBe(200);
  const { url } = (await started.json()) as { url: string };
  const query = new URL(url).search;
  const back = await signIn(provider, account, query);
  const location = back.headers.get("Location")!;
  const linkToken = decodeURIComponent(/#link=(.+)$/.exec(location)![1]);
  return post("/auth/link/complete", token, { token: linkToken });
}

async function users(): Promise<{ id: string; osu_id: string | null; username: string; profile_provider: string }[]> {
  const { rows } = await t.db.query<{ id: string; osu_id: string | null; username: string; profile_provider: string }>(
    "select id, osu_id::text, username, profile_provider from public.users order by created_at, username",
  );
  return rows;
}

async function identities(): Promise<{ user_id: string; provider: string; provider_user_id: string }[]> {
  const { rows } = await t.db.query<{ user_id: string; provider: string; provider_user_id: string }>(
    "select user_id, provider, provider_user_id from public.account_identities order by provider, provider_user_id",
  );
  return rows;
}

/** A session that signed in a while ago, beyond the window for sensitive changes. */
async function staleSession(uid: string): Promise<string> {
  return signSession(env(), uid, Math.floor(Date.now() / 1000) - 3600);
}

describe("signing in", () => {
  it("keeps an existing osu! user's account and id", async () => {
    const id = await t.createUser("peppy");
    const { rows } = await t.db.query<{ osu_id: string }>("select osu_id::text from public.users where id = $1", [id]);
    const res = await signIn("osu", { id: rows[0].osu_id, name: "peppy" });
    expect(res.headers.get("Location")).toMatch(new RegExp(`^${FRONTEND}/\\?auth=ok#session=`));
    expect(setCookie(res, "me_session")).toBeTruthy();
    const me = await session(sessionFrom(res));
    expect(me.user).toMatchObject({ id, username: "peppy", providers: ["osu"] });
    expect(await users()).toHaveLength(1);
  });

  it("follows an osu! rename for accounts made with osu!", async () => {
    const id = await t.createUser("old name");
    const { rows } = await t.db.query<{ osu_id: string }>("select osu_id::text from public.users where id = $1", [id]);
    await signIn("osu", { id: rows[0].osu_id, name: "new name" });
    expect((await users())[0]).toMatchObject({ id, username: "new name" });
  });

  it("makes a new account for a new Discord user, with no osu! id", async () => {
    const res = await signIn("discord", { id: "80351110224678912", name: "Nelly", avatar: "a".repeat(32) });
    const me = await session(sessionFrom(res));
    expect(me.user).toMatchObject({
      osu_id: null,
      username: "Nelly",
      providers: ["discord"],
      avatar_url: `https://cdn.discordapp.com/avatars/80351110224678912/${"a".repeat(32)}.png?size=256`,
    });
    expect(await identities()).toEqual([
      { user_id: me.user!.id, provider: "discord", provider_user_id: "80351110224678912" },
    ]);
  });

  it("signs an existing Discord user in to the same account", async () => {
    const first = await session(sessionFrom(await signIn("discord", { id: "80351110224678912", name: "Nelly" })));
    const again = await session(sessionFrom(await signIn("discord", { id: "80351110224678912", name: "Nelly" })));
    expect(again.user!.id).toBe(first.user!.id);
    expect(await users()).toHaveLength(1);
  });

  it("never makes two accounts from callbacks that arrive together", async () => {
    const account = { id: "80351110224678912", name: "Nelly" };
    const flows = await Promise.all([start("discord"), start("discord"), start("discord")]);
    const results = await Promise.all(flows.map((flow) => finish("discord", flow, discord.issue(account, flow.challenge))));
    const ids = await Promise.all(results.map(async (res) => (await session(sessionFrom(res))).user!.id));
    expect(new Set(ids).size).toBe(1);
    expect(await users()).toHaveLength(1);
    expect(await identities()).toHaveLength(1);
  });

  it("gives a Discord user whose name is taken a name of their own", async () => {
    await t.createUser("Nelly");
    const res = await signIn("discord", { id: "80351110224678912", name: "nelly" });
    const me = await session(sessionFrom(res));
    expect(me.user!.username).toBe("nelly#2");
  });

  it("refuses a callback this browser didn't start", async () => {
    const flow = await start("discord");
    const forged = await call(`/auth/discord/callback?code=${discord.issue({ id: "1", name: "x" }, flow.challenge)}&state=${flow.state}`);
    expect(forged.headers.get("Location")).toBe(`${FRONTEND}/?auth=error&reason=state&provider=discord`);
    const wrongState = await finish("discord", flow, discord.issue({ id: "1", name: "x" }, flow.challenge), "x".repeat(43));
    expect(wrongState.headers.get("Location")).toContain("reason=state");
    expect(await users()).toHaveLength(0);
  });

  it("refuses an expired or tampered flow cookie", async () => {
    const flow = await start("discord");
    const tampered = { ...flow, cookie: `${flow.cookie.slice(0, -4)}AAAA` };
    const res = await finish("discord", tampered, discord.issue({ id: "1", name: "x" }, flow.challenge));
    expect(res.headers.get("Location")).toContain("reason=state");
    vi.useFakeTimers({ now: Date.now() + 11 * 60_000, toFake: ["Date"] });
    try {
      const late = await finish("discord", flow, discord.issue({ id: "1", name: "x" }, flow.challenge));
      expect(late.headers.get("Location")).toContain("reason=state");
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a replayed authorization code and a wrong PKCE verifier", async () => {
    const flow = await start("discord");
    const code = discord.issue({ id: "80351110224678912", name: "Nelly" }, flow.challenge);
    expect((await finish("discord", flow, code)).headers.get("Location")).toContain("auth=ok");
    const replay = await finish("discord", flow, code);
    expect(replay.headers.get("Location")).toContain("reason=exchange");

    const other = await start("discord");
    const mismatched = discord.issue({ id: "80351110224678913", name: "Eve" }, "not-the-challenge");
    expect((await finish("discord", other, mismatched)).headers.get("Location")).toContain("reason=exchange");
    expect(await users()).toHaveLength(1);
  });

  it("reports a cancelled consent screen", async () => {
    const flow = await start("discord");
    const res = await call(`/auth/discord/callback?error=access_denied&state=${flow.state}`, {
      headers: { Cookie: `${flow.cookieName}=${flow.cookie}` },
    });
    expect(res.headers.get("Location")).toContain("reason=cancelled");
  });

  it("hands a desktop login to the app's loopback listener only", async () => {
    const nonce = "desktop-nonce-1234567890";
    const res = await signIn("discord", { id: "80351110224678912", name: "Nelly" }, `?client=desktop&port=51234&nonce=${nonce}`);
    const location = new URL(res.headers.get("Location")!);
    expect(location.origin).toBe("http://127.0.0.1:51234");
    expect(location.pathname).toBe("/callback");
    expect(location.searchParams.get("nonce")).toBe(nonce);
    expect((await session(location.searchParams.get("session")!)).user!.username).toBe("Nelly");
    // The desktop app keeps its token itself; no browser cookie is set.
    expect(setCookie(res, "me_session")).toBeNull();
    expect((await call("/auth/discord/login?client=desktop&port=80&nonce=x")).status).toBe(400);
  });

  it("forgets a session after logout and refuses an expired one", async () => {
    const token = sessionFrom(await signIn("discord", { id: "80351110224678912", name: "Nelly" }));
    const logout = await call("/auth/logout", { method: "POST" });
    expect(logout.headers.getSetCookie().join()).toMatch(/me_session=;.*Max-Age=0/);
    vi.useFakeTimers({ now: Date.now() + 31 * 86_400_000, toFake: ["Date"] });
    try {
      expect((await session(token)).user).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists the providers this deployment can sign in with", async () => {
    expect((await (await call("/auth/session")).json()) as unknown).toMatchObject({
      user: null,
      loginProviders: ["osu", "discord"],
    });
  });
});

describe("linking", () => {
  it("links an unclaimed osu! account to a Discord account", async () => {
    const token = sessionFrom(await signIn("discord", { id: "80351110224678912", name: "Nelly" }));
    const res = await link(token, "osu", { id: "4242", name: "nelly_osu" });
    expect(await res.json()).toEqual({ status: "linked", provider: "osu" });
    const me = await session(token);
    expect(me.user).toMatchObject({ osu_id: 4242, username: "Nelly", providers: ["discord", "osu"] });
    // Signing in with either now reaches the same account, and osu! doesn't
    // rename an account that was made with Discord.
    const viaOsu = await session(sessionFrom(await signIn("osu", { id: "4242", name: "nelly_osu" })));
    expect(viaOsu.user).toMatchObject({ id: me.user!.id, username: "Nelly" });
  });

  it("links an unclaimed Discord account to an osu! account", async () => {
    const id = await t.createUser("peppy");
    const { rows } = await t.db.query<{ osu_id: string }>("select osu_id::text from public.users where id = $1", [id]);
    const token = sessionFrom(await signIn("osu", { id: rows[0].osu_id, name: "peppy" }));
    expect(await (await link(token, "discord", { id: "80351110224678912", name: "Nelly" })).json()).toEqual({
      status: "linked",
      provider: "discord",
    });
    const viaDiscord = await session(sessionFrom(await signIn("discord", { id: "80351110224678912", name: "Nelly" })));
    expect(viaDiscord.user).toMatchObject({ id, username: "peppy" });
  });

  it("refuses an identity another account already has, changing neither", async () => {
    const alice = sessionFrom(await signIn("osu", { id: "1001", name: "alice" }));
    await signIn("discord", { id: "80351110224678912", name: "Nelly" });
    const before = { users: await users(), identities: await identities() };
    const res = await link(alice, "discord", { id: "80351110224678912", name: "Nelly" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ status: "claimed", provider: "discord" });
    expect({ users: await users(), identities: await identities() }).toEqual(before);
  });

  it("treats linking the same identity again as done", async () => {
    const token = sessionFrom(await signIn("discord", { id: "80351110224678912", name: "Nelly" }));
    await link(token, "osu", { id: "4242", name: "nelly_osu" });
    const again = await post("/auth/link/start", token, { provider: "osu" });
    expect(await again.json()).toEqual({ status: "already_linked", provider: "osu" });
    expect(await identities()).toHaveLength(2);
  });

  it("never lets a link result finish on another account", async () => {
    const victim = sessionFrom(await signIn("osu", { id: "1001", name: "victim" }));
    const attacker = sessionFrom(await signIn("osu", { id: "1002", name: "attacker" }));
    const started = (await (await post("/auth/link/start", attacker, { provider: "discord" })).json()) as { url: string };
    const back = await signIn("discord", { id: "80351110224678912", name: "Mallory" }, new URL(started.url).search);
    const linkToken = decodeURIComponent(/#link=(.+)$/.exec(back.headers.get("Location")!)![1]);
    const res = await post("/auth/link/complete", victim, { token: linkToken });
    expect(res.status).toBe(403);
    expect(await identities()).toHaveLength(2);
  });

  it("uses a link result once", async () => {
    const token = sessionFrom(await signIn("osu", { id: "1001", name: "alice" }));
    const started = (await (await post("/auth/link/start", token, { provider: "discord" })).json()) as { url: string };
    const back = await signIn("discord", { id: "80351110224678912", name: "Nelly" }, new URL(started.url).search);
    const linkToken = decodeURIComponent(/#link=(.+)$/.exec(back.headers.get("Location")!)![1]);
    expect((await post("/auth/link/complete", token, { token: linkToken })).status).toBe(200);
    // A second try reports the link that exists rather than linking again.
    expect(await (await post("/auth/link/complete", token, { token: linkToken })).json()).toEqual({
      status: "already_linked",
      provider: "discord",
    });
  });

  it("uses a link ticket once", async () => {
    const token = sessionFrom(await signIn("osu", { id: "1001", name: "alice" }));
    const { url } = (await (await post("/auth/link/start", token, { provider: "discord" })).json()) as { url: string };
    await signIn("discord", { id: "80351110224678912", name: "Nelly" }, new URL(url).search);
    const replay = await signIn("discord", { id: "80351110224678913", name: "Eve" }, new URL(url).search);
    expect(replay.headers.get("Location")).toContain("reason=expired");
  });

  it("asks for a fresh sign-in before linking from an old session", async () => {
    await signIn("osu", { id: "1001", name: "alice" });
    const [alice] = await users();
    const stale = await staleSession(alice.id);
    const res = await post("/auth/link/start", stale, { provider: "discord" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "reauth_required", via: "osu" });

    const reauth = (await (await post("/auth/link/start", stale, { provider: "osu", intent: "reauth" })).json()) as { url: string };
    const back = await signIn("osu", { id: "1001", name: "alice" }, new URL(reauth.url).search);
    const fresh = sessionFrom(back);
    expect((await session(fresh)).user!.id).toBe(alice.id);
    expect((await post("/auth/link/start", fresh, { provider: "discord" })).status).toBe(200);
  });

  it("refuses to confirm with a different account", async () => {
    await signIn("osu", { id: "1001", name: "alice" });
    await signIn("osu", { id: "1002", name: "bob" });
    const alice = (await users()).find((u) => u.username === "alice")!;
    const stale = await staleSession(alice.id);
    const reauth = (await (await post("/auth/link/start", stale, { provider: "osu", intent: "reauth" })).json()) as { url: string };
    const back = await signIn("osu", { id: "1002", name: "bob" }, new URL(reauth.url).search);
    expect(back.headers.get("Location")).toContain("reason=reauth_mismatch");
  });

  it("changes nothing when the provider fails during a link", async () => {
    const token = sessionFrom(await signIn("osu", { id: "1001", name: "alice" }));
    const { url } = (await (await post("/auth/link/start", token, { provider: "discord" })).json()) as { url: string };
    discord.failProfile = true;
    try {
      const back = await signIn("discord", { id: "80351110224678912", name: "Nelly" }, new URL(url).search);
      expect(back.headers.get("Location")).toContain("reason=profile");
    } finally {
      discord.failProfile = false;
    }
    expect(await identities()).toHaveLength(1);
  });

  it("only accepts account changes with the session in a header", async () => {
    const token = sessionFrom(await signIn("osu", { id: "1001", name: "alice" }));
    const viaCookie = await call("/auth/link/start", {
      method: "POST",
      headers: { Cookie: `me_session=${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "discord" }),
    });
    expect(viaCookie.status).toBe(401);
    const asForm = await call("/auth/link/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
      body: JSON.stringify({ provider: "discord" }),
    });
    expect(asForm.status).toBe(400);
    const crossSite = await call("/auth/link/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify({ provider: "discord" }),
    });
    expect(crossSite.status).toBe(403);
  });
});

describe("unlinking", () => {
  it("never removes the last way to sign in", async () => {
    const token = sessionFrom(await signIn("discord", { id: "80351110224678912", name: "Nelly" }));
    const res = await post("/auth/identities/unlink", token, { provider: "discord" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ status: "last_identity", provider: "discord" });
    expect(await identities()).toHaveLength(1);
  });

  it("removes one of two, keeping the account and its maps", async () => {
    const token = sessionFrom(await signIn("discord", { id: "80351110224678912", name: "Nelly" }));
    await link(token, "osu", { id: "4242", name: "nelly_osu" });
    const [nelly] = await users();
    const project = await t.createProject(nelly.id, { meta: { title: "Kept" } });

    const res = await post("/auth/identities/unlink", token, { provider: "osu" });
    expect(await res.json()).toEqual({ status: "unlinked", provider: "osu" });
    expect(await users()).toEqual([{ ...nelly, osu_id: null }]);
    const { rows } = await t.db.query("select id from public.projects where id = $1 and owner = $2", [project, nelly.id]);
    expect(rows).toHaveLength(1);
    // The osu! account is free again: signing in with it makes a new account.
    const fresh = await session(sessionFrom(await signIn("osu", { id: "4242", name: "nelly_osu" })));
    expect(fresh.user!.id).not.toBe(nelly.id);
  });

  it("asks for a fresh sign-in with the method that stays", async () => {
    const token = sessionFrom(await signIn("discord", { id: "80351110224678912", name: "Nelly" }));
    await link(token, "osu", { id: "4242", name: "nelly_osu" });
    const [nelly] = await users();
    const res = await post("/auth/identities/unlink", await staleSession(nelly.id), { provider: "discord" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "reauth_required", via: "osu" });
  });

  it("lists an account's sign-in methods for its owner only", async () => {
    const token = sessionFrom(await signIn("discord", { id: "80351110224678912", name: "Nelly" }));
    const res = await call("/auth/identities", { headers: { Authorization: `Bearer ${token}` } });
    expect(await res.json()).toMatchObject({
      identities: [{ provider: "discord", provider_user_id: "80351110224678912", display_name: "Nelly" }],
      available: ["osu", "discord"],
      fresh: true,
    });
    expect((await call("/auth/identities")).status).toBe(401);
  });
});
