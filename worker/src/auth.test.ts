import { describe, expect, it } from "vitest";
import {
  discordAvatarUrl,
  handleAuthRoute,
  isFresh,
  pkceChallenge,
  readFlow,
  readLinkToken,
  readTicket,
  REAUTH_WINDOW_SECONDS,
  signFlow,
  signLinkToken,
  signSession,
  signTicket,
  verifySession,
} from "./auth";
import type { WorkerEnv } from "./storage";

const UID = "11111111-1111-4111-8111-111111111111";

function env(overrides: Partial<Record<string, unknown>> = {}): WorkerEnv {
  return {
    FRONTEND_URL: "https://cascade.sheepex.net",
    CLIENT_ID: "60987",
    CLIENT_SECRET: "osu-secret",
    OSU_REDIRECT_URI: "https://worker.test/auth/osu/callback",
    DISCORD_APPLICATION_ID: "1100000000000000001",
    DISCORD_CLIENT_SECRET: "discord-secret",
    DISCORD_REDIRECT_URI: "https://worker.test/auth/discord/callback",
    COOKIE_SECRET: "cookie-secret",
    SUPABASE_JWT_SECRET: "jwt-secret",
    SUPABASE_URL: "https://db.test",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    ...overrides,
  } as unknown as WorkerEnv;
}

const route = (path: string, e = env()) =>
  handleAuthRoute(new Request(`https://worker.test${path}`), new URL(`https://worker.test${path}`), e, {
    appToken: async () => null,
  }) as Promise<Response>;

describe("sessions", () => {
  it("carry the account and when its owner last signed in", async () => {
    const token = await signSession(env(), UID, 1_700_000_000);
    expect(await verifySession(env(), token)).toEqual({ uid: UID, at: 1_700_000_000 });
    expect(await verifySession(env(), await signSession(env(), UID, null))).toEqual({ uid: UID, at: null });
  });

  it("are never made from the other tokens signed with the same key", async () => {
    const e = env();
    const ticket = await signTicket(e, { uid: UID, provider: "discord", intent: "link" });
    const link = await signLinkToken(e, UID, "discord", { id: "1", name: "x", avatarUrl: null, countryCode: null, raw: null });
    const flow = await signFlow(e, {
      provider: "osu",
      state: "s".repeat(43),
      verifier: null,
      intent: "link",
      uid: UID,
      ticket: UID,
      ticketExp: 0,
      port: null,
      nonce: null,
    });
    for (const token of [ticket, link, flow]) expect(await verifySession(e, token)).toBeNull();
  });

  it("are refused when signed with another key", async () => {
    const token = await signSession(env({ COOKIE_SECRET: "other" }), UID, null);
    expect(await verifySession(env(), token)).toBeNull();
  });

  it("allow sensitive changes only shortly after signing in", () => {
    const now = 1_700_000_000;
    expect(isFresh({ uid: UID, at: now - 10 }, now)).toBe(true);
    expect(isFresh({ uid: UID, at: now - REAUTH_WINDOW_SECONDS - 1 }, now)).toBe(false);
    expect(isFresh({ uid: UID, at: null }, now)).toBe(false);
    expect(isFresh({ uid: UID, at: now + 3600 }, now)).toBe(false);
  });
});

describe("tickets and link tokens", () => {
  it("belong to the provider they were made for", async () => {
    const e = env();
    const ticket = await signTicket(e, { uid: UID, provider: "discord", intent: "reauth" });
    expect(await readTicket(e, ticket, "discord")).toMatchObject({ uid: UID, intent: "reauth" });
    expect(await readTicket(e, ticket, "osu")).toBeNull();
    expect(await readLinkToken(e, ticket)).toBeNull();
  });

  it("carry the proven provider account to the app", async () => {
    const e = env();
    const token = await signLinkToken(e, UID, "discord", {
      id: "80351110224678912",
      name: "Nelly",
      avatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
      countryCode: null,
      raw: null,
    });
    expect(await readLinkToken(e, token)).toMatchObject({
      uid: UID,
      provider: "discord",
      providerUserId: "80351110224678912",
      name: "Nelly",
    });
    expect(await readFlow(e, token, "discord")).toBeNull();
  });
});

describe("pkce", () => {
  it("matches RFC 7636's example", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("discord avatars", () => {
  it("uses the avatar, or the default Discord shows", () => {
    expect(discordAvatarUrl("80351110224678912", "a".repeat(32))).toBe(
      `https://cdn.discordapp.com/avatars/80351110224678912/${"a".repeat(32)}.png?size=256`,
    );
    expect(discordAvatarUrl("80351110224678912", null)).toBe(
      `https://cdn.discordapp.com/embed/avatars/${Number((80351110224678912n >> 22n) % 6n)}.png`,
    );
    expect(discordAvatarUrl("80351110224678912", "../../evil")).toMatch(/embed\/avatars/);
  });
});

describe("starting a sign-in", () => {
  it("sends Discord a PKCE challenge and only the identify scope", async () => {
    const res = await route("/auth/discord/login");
    const authorize = new URL(res.headers.get("Location")!);
    expect(authorize.origin + authorize.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(authorize.searchParams.get("scope")).toBe("identify");
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("redirect_uri")).toBe("https://worker.test/auth/discord/callback");
    expect(authorize.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("me_oauth_state_discord="))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Max-Age=600/);
    // The verifier and the state stay in the signed cookie, not the URL.
    const flow = await readFlow(env(), cookie.split(";")[0].split("=").slice(1).join("="), "discord");
    expect(flow?.state).toBe(authorize.searchParams.get("state"));
    expect(await pkceChallenge(flow!.verifier!)).toBe(authorize.searchParams.get("code_challenge"));
  });

  it("keeps osu!'s sign-in as it was", async () => {
    const res = await route("/auth/osu/login");
    const authorize = new URL(res.headers.get("Location")!);
    expect(authorize.origin + authorize.pathname).toBe("https://osu.ppy.sh/oauth/authorize");
    expect(authorize.searchParams.get("client_id")).toBe("60987");
    expect(authorize.searchParams.has("code_challenge")).toBe(false);
  });

  it("explains when Discord isn't set up", async () => {
    const res = await route("/auth/discord/login", env({ DISCORD_CLIENT_SECRET: undefined }));
    expect(res.headers.get("Location")).toBe("https://cascade.sheepex.net/?auth=error&reason=unavailable&provider=discord");
  });

  it("refuses a ticket that isn't valid", async () => {
    const res = await route("/auth/discord/login?ticket=not-a-ticket");
    expect(res.headers.get("Location")).toContain("reason=expired");
  });

  it("slows down an address that keeps trying", async () => {
    const res = await route("/auth/discord/login", env({ AUTH_LIMITER: { limit: async () => ({ success: false }) } }));
    expect(res.headers.get("Location")).toContain("reason=busy");
  });
});
