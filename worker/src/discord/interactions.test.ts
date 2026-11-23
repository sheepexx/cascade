import { describe, expect, it, vi } from "vitest";
import type { WorkerEnv } from "../storage";
import { handleDiscordRoute, handleInteraction, type BotDeps, type Interaction } from "./interactions";
import type { BotData, Contribution, DiscordAccount, PublicProfile, PublicStats } from "./data";
import { plain } from "./format";
import { verifyInteraction } from "./verify";

const GUILD = "500000000000000001";
const ROLE = "600000000000000001";

function env(overrides: Partial<Record<string, unknown>> = {}): WorkerEnv {
  return {
    FRONTEND_URL: "https://cascade.sheepex.net",
    DISCORD_APPLICATION_ID: "1100000000000000001",
    DISCORD_CLIENT_SECRET: "secret",
    DISCORD_REDIRECT_URI: "https://worker.test/auth/discord/callback",
    DISCORD_BOT_TOKEN: "bot-token",
    DISCORD_GUILD_ID: GUILD,
    DISCORD_CONTRIBUTOR_ROLE_ID: ROLE,
    DISCORD_REVIEW_CHANNEL_ID: "700000000000000001",
    DISCORD_MAINTAINER_IDS: "",
    DISCORD_PUBLIC_KEY: "",
    ...overrides,
  } as unknown as WorkerEnv;
}

const NELLY: DiscordAccount = {
  user_id: "11111111-1111-4111-8111-111111111111",
  username: "Nelly",
  handle: "Nelly",
  is_admin: false,
  discord_lookup: "nobody",
  leaderboard: "nobody",
};

const PROFILE: PublicProfile = {
  id: NELLY.user_id,
  username: "Nelly",
  handle: "Nelly",
  avatar_url: "https://cdn.discordapp.com/embed/avatars/1.png",
  osu_id: null,
  is_contributor: true,
  country_code: null,
  cascade_joined_at: "2026-01-01T00:00:00Z",
  visible: { mapping_stats: true, mapping_time: false, project_time: false, projects: false },
  osu: null,
};

const STATS: PublicStats = {
  visible: { mapping_stats: true, mapping_time: false },
  counters: {
    notes_placed: 1234,
    notes_deleted: 0,
    timing_changes: 0,
    sv_changes: 0,
    playtests: 5,
    exports: 2,
    maps_created: 1,
    difficulties_created: 1,
    active_days: 3,
    maps_edited: 4,
    first_day: null,
  },
  totals: null,
};

const PENDING: Contribution = {
  id: "22222222-2222-4222-8222-222222222222",
  number: 12,
  kind: "bug",
  title: "Export drops long notes",
  body: "Steps",
  status: "pending",
  points: 0,
  discord_user_id: "300000000000000001",
  discord_username: "reporter",
  linked: false,
  source: "discord",
  review_channel_id: null,
  review_message_id: null,
  reviewed_by_discord: null,
  review_note: null,
  created_at: "2026-11-01T00:00:00Z",
  reviewed_at: null,
};

function deps(overrides: Partial<BotData> = {}) {
  const data = {
    discordAccount: vi.fn(async () => null as DiscordAccount | null),
    profile: vi.fn(async () => PROFILE),
    stats: vi.fn(async () => STATS),
    contributor: vi.fn(async () => ({ points: 0, accepted: 0, pending: 0, threshold: 30, override: null, contributor: false, recent: [] })),
    submit: vi.fn(async () => ({ id: PENDING.id, number: 12, linked: false })),
    setReviewMessage: vi.fn(async () => null),
    review: vi.fn(async () => ({
      result: "reviewed" as const,
      contribution: { ...PENDING, status: "accepted" as const, points: 10, reviewed_by_discord: "400000000000000001" },
      status: { points: 30, accepted: 3, pending: 0, threshold: 30, override: null, contributor: true, recent: [] },
    })),
    identityOwner: vi.fn(async () => null),
    ...overrides,
  } as unknown as BotData;
  const rest = {
    setContributorRole: vi.fn(async () => "added" as const),
    postMessage: vi.fn(async () => "800000000000000001"),
    editMessage: vi.fn(async () => true),
    editOriginal: vi.fn(async () => true),
    putCommands: vi.fn(async () => ({ ok: true, status: 200, scope: "guild" as const })),
  };
  return { data, rest } satisfies BotDeps;
}

function command(name: string, options: Interaction["data"] = {}, member: Partial<NonNullable<Interaction["member"]>> = {}): Interaction {
  return {
    type: 2,
    token: "interaction-token",
    guild_id: GUILD,
    member: { user: { id: "300000000000000001", username: "reporter" }, roles: [], permissions: "0", ...member },
    data: { name, ...options },
  };
}

function text(response: { data?: Record<string, unknown> }): string {
  return JSON.stringify(response.data);
}

describe("signatures", () => {
  async function keyPair() {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const raw = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
    return { pair, hex: Buffer.from(raw).toString("hex") };
  }

  async function signed(privateKey: CryptoKey, body: string, timestamp = String(Math.floor(Date.now() / 1000))) {
    const signature = new Uint8Array(
      await crypto.subtle.sign({ name: "Ed25519" }, privateKey, new TextEncoder().encode(timestamp + body)),
    );
    return new Request("https://worker.test/discord/interactions", {
      method: "POST",
      headers: { "X-Signature-Ed25519": Buffer.from(signature).toString("hex"), "X-Signature-Timestamp": timestamp },
      body,
    });
  }

  it("accepts Discord's signature and nothing else", async () => {
    const { pair, hex } = await keyPair();
    const other = await keyPair();
    const body = JSON.stringify({ type: 1 });
    expect(await verifyInteraction(await signed(pair.privateKey, body), hex)).toBe(body);
    expect(await verifyInteraction(await signed(other.pair.privateKey, body), hex)).toBeNull();
    const tampered = await signed(pair.privateKey, body);
    expect(await verifyInteraction(new Request(tampered, { body: JSON.stringify({ type: 2 }) }), hex)).toBeNull();
    const old = String(Math.floor(Date.now() / 1000) - 600);
    expect(await verifyInteraction(await signed(pair.privateKey, body, old), hex)).toBeNull();
  });

  it("answers Discord's check and refuses unsigned calls", async () => {
    const { pair, hex } = await keyPair();
    const e = env({ DISCORD_PUBLIC_KEY: hex });
    const ping = await handleDiscordRoute(await signed(pair.privateKey, '{"type":1}'), new URL("https://worker.test/discord/interactions"), e, undefined);
    expect(await ping!.json()).toEqual({ type: 1 });
    const unsigned = await handleDiscordRoute(
      new Request("https://worker.test/discord/interactions", { method: "POST", body: '{"type":1}' }),
      new URL("https://worker.test/discord/interactions"),
      e,
      undefined,
    );
    expect(unsigned!.status).toBe(401);
  });
});

describe("looking people up", () => {
  it("tells nobody whether a member who keeps it private has linked", async () => {
    const unlinked = deps();
    const privateOne = deps({ discordAccount: vi.fn(async (_e, id: string) => (id === "300000000000000009" ? NELLY : null)) });
    const lookup = command("profile", { options: [{ name: "user", type: 6, value: "300000000000000009" }] });
    const a = await handleInteraction(lookup, env(), undefined, unlinked);
    const b = await handleInteraction(lookup, env(), undefined, privateOne);
    expect(text(a)).toBe(text(b));
    expect(privateOne.data.profile).not.toHaveBeenCalled();
  });

  it("shows a member who allows it, without osu! for a Discord-only account", async () => {
    const d = deps({ discordAccount: vi.fn(async () => ({ ...NELLY, discord_lookup: "everyone" as const })) });
    const res = await handleInteraction(
      command("profile", { options: [{ name: "user", type: 6, value: "300000000000000009" }] }),
      env(),
      undefined,
      d,
    );
    const body = text(res);
    expect(body).toContain('"title":"Nelly"');
    expect(body).toContain("Contributor");
    expect(body).toContain("1,234");
    expect(body).not.toContain("osu.ppy.sh");
    expect(body).toContain("hidden by this profile's privacy settings");
    expect(res.data?.allowed_mentions).toEqual({ parse: [] });
  });

  it("points someone who hasn't linked to Cascade", async () => {
    const res = await handleInteraction(command("profile"), env(), undefined, deps());
    expect(text(res)).toContain("https://cascade.sheepex.net/?connect=discord");
    expect(res.data?.flags).toBe(64);
  });
});

describe("maintainer tools", () => {
  const admin = (member: Partial<NonNullable<Interaction["member"]>>, guild = GUILD) => ({
    ...command("cascade-admin", { options: [{ name: "pending", type: 1, options: [] }] }, member),
    guild_id: guild,
  });

  it("are refused to everyone else", async () => {
    const d = deps({ pending: vi.fn(async () => []) });
    const res = await handleInteraction(admin({}), env(), undefined, d);
    expect(text(res)).toContain("Only Cascade maintainers");
    expect(d.data.pending).not.toHaveBeenCalled();
  });

  it("work for server administrators, listed maintainers and Cascade admins, in the Cascade server only", async () => {
    const pending = vi.fn(async () => []);
    expect(text(await handleInteraction(admin({ permissions: String(1 << 3) }), env(), undefined, deps({ pending })))).toContain(
      "Nothing is waiting",
    );
    expect(
      text(await handleInteraction(admin({}), env({ DISCORD_MAINTAINER_IDS: "300000000000000001" }), undefined, deps({ pending }))),
    ).toContain("Nothing is waiting");
    const cascadeAdmin = deps({ pending, discordAccount: vi.fn(async () => ({ ...NELLY, is_admin: true })) });
    expect(text(await handleInteraction(admin({}), env(), undefined, cascadeAdmin))).toContain("Nothing is waiting");
    expect(
      text(await handleInteraction(admin({ permissions: String(1 << 3) }, "999999999999999999"), env(), undefined, deps({ pending }))),
    ).toContain("Only Cascade maintainers");
    // Without a configured server, a server's own administrators aren't Cascade's.
    expect(
      text(await handleInteraction(admin({ permissions: String(1 << 3) }), env({ DISCORD_GUILD_ID: "" }), undefined, deps({ pending }))),
    ).toContain("Only Cascade maintainers");
  });

  it("turn a review button into the record of the decision and give the role", async () => {
    const d = deps({ contributor: vi.fn(async () => ({ points: 30, accepted: 3, pending: 0, threshold: 30, override: null, contributor: true, recent: [] })) });
    const press: Interaction = {
      type: 3,
      token: "t",
      guild_id: GUILD,
      member: { user: { id: "400000000000000001" }, permissions: String(1 << 3), roles: [] },
      data: { custom_id: "review:accept:12" },
    };
    const res = await handleInteraction(press, env(), undefined, d);
    expect(res.type).toBe(7);
    expect(res.data?.components).toEqual([]);
    expect(text(res)).toContain("Accepted, +10 points");
    expect(d.data.review).toHaveBeenCalledWith(expect.anything(), 12, true, "400000000000000001", null, null);
    expect(d.rest.setContributorRole).toHaveBeenCalledWith(expect.anything(), "300000000000000001", true);
  });
});

describe("contributions", () => {
  it("open a form, then file what was written and post it for review", async () => {
    const d = deps();
    expect((await handleInteraction(command("bug"), env(), undefined, d)).type).toBe(9);
    const submitted: Interaction = {
      type: 5,
      token: "t",
      guild_id: GUILD,
      member: { user: { id: "300000000000000001", username: "reporter" } },
      data: {
        custom_id: "contribute:bug",
        components: [
          { type: 1, components: [{ type: 4, custom_id: "title", value: " Export drops long notes " }] },
          { type: 1, components: [{ type: 4, custom_id: "details", value: "Steps" }] },
        ],
      },
    };
    const res = await handleInteraction(submitted, env(), undefined, d);
    expect(text(res)).toContain("#12");
    expect(d.data.submit).toHaveBeenCalledWith(expect.anything(), "bug", "Export drops long notes", "Steps", "300000000000000001", "reporter");
    expect(d.rest.postMessage).toHaveBeenCalled();
    expect(d.data.setReviewMessage).toHaveBeenCalledWith(expect.anything(), PENDING.id, "700000000000000001", "800000000000000001");
  });

  it("explain a rate limit", async () => {
    const d = deps({ submit: vi.fn(async () => ({ error: "rate_limited" })) });
    const res = await handleInteraction(
      { type: 5, token: "t", member: { user: { id: "300000000000000001" } }, data: { custom_id: "contribute:suggestion", components: [] } },
      env(),
      undefined,
      d,
    );
    expect(text(res)).toContain("wait a while");
    expect(d.rest.postMessage).not.toHaveBeenCalled();
  });
});

describe("slow answers", () => {
  it("say \"thinking\" in time and fill the reply in afterwards", async () => {
    vi.useFakeTimers();
    try {
      let release: () => void = () => {};
      const d = deps({
        roadmap: vi.fn(() => new Promise<never[]>((resolve) => (release = () => resolve([])))),
      });
      const waits: Promise<unknown>[] = [];
      const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
      const pending = handleInteraction(command("roadmap"), env(), ctx, d);
      await vi.advanceTimersByTimeAsync(2_500);
      expect(await pending).toEqual({ type: 5, data: { flags: 0 } });
      release();
      await Promise.all(waits);
      expect(d.rest.editOriginal).toHaveBeenCalledWith(expect.anything(), "interaction-token", expect.objectContaining({ embeds: expect.any(Array) }));
    } finally {
      vi.useRealTimers();
    }
  });
});

const ZWSP = String.fromCharCode(0x200b);

describe("text from people", () => {
  it("can't format, link or mention", () => {
    expect(plain("[free nitro](https://evil.example) @everyone **bold** <@123>")).toBe(
      String.raw`\[free nitro\]\(https://evil.example\) @` + ZWSP + String.raw`everyone \*\*bold\*\* <` + ZWSP + "@" + ZWSP + String.raw`123\>`,
    );
  });
});
