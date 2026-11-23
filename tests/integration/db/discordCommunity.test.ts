import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { createTestDatabase, dbError, type TestDatabase } from "./database";

/**
 * The Discord bot's side of the database (migration 0048): what the bot may
 * show about someone, and contributions, whose points only an admin's review
 * gives, once.
 */

type Json = Record<string, unknown>;

async function one<T = Json>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await tx.query<{ v: T }>(sql, params);
  return rows[0].v;
}

describe("discord community", () => {
  let t: TestDatabase;

  beforeEach(async () => {
    t = await createTestDatabase();
  });
  afterEach(() => t.close());

  const service = <T = Json>(sql: string, params: unknown[] = []) =>
    t.db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return one<T>(tx, `select ${sql} as v`, params);
    });

  const anon = <T = Json>(sql: string, params: unknown[] = []) =>
    t.db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      return one<T>(tx, `select ${sql} as v`, params);
    });

  const submit = (discordId: string, title: string, kind = "bug") =>
    service<{ id?: string; number?: number; linked?: boolean; error?: string }>(
      "public.submit_contribution($1, $2, 'details', $3, 'someone')",
      [kind, title, discordId],
    );

  const review = (number: number, accept: boolean, reviewer = "9000") =>
    service<{ result: string; contribution?: Json; status?: Json }>(
      "public.review_contribution($1, $2, $3)",
      [number, accept, reviewer],
    );

  describe("what the bot may show", () => {
    it("shows nothing about a Discord account until its owner allows it", async () => {
      expect(await service("public.discord_account('1001')")).toBeNull();
      const nelly = await t.createDiscordUser("Nelly", "1001");
      expect(await service("public.discord_account('1001')")).toMatchObject({
        user_id: nelly,
        handle: "Nelly",
        discord_lookup: "nobody",
        leaderboard: "nobody",
      });
      await t.asUser(nelly, (tx) =>
        tx.query("select public.set_my_privacy($1::jsonb)", [JSON.stringify({ discord_lookup: "everyone", leaderboard: "everyone" })]),
      );
      expect(await service("public.discord_account('1001')")).toMatchObject({ discord_lookup: "everyone", leaderboard: "everyone" });
      const mine = await t.asUser(nelly, (tx) => one<Json>(tx, "select public.get_my_privacy() as v"));
      expect(mine).toMatchObject({ discord_lookup: "everyone", leaderboard: "everyone", projects: "nobody" });
    });

    it("keeps the bot's functions away from signed-in users", async () => {
      const nelly = await t.createDiscordUser("Nelly", "1001");
      for (const sql of [
        "select public.discord_account('1001')",
        "select public.submit_contribution('bug', 'title', '', '1001', 'x')",
        "select public.review_contribution(1, true, '1001')",
        "select public.bot_leaderboard('mapping_time')",
        "select public.set_contributor_override('1001', 'grant', null, '1001')",
      ]) {
        const error = await t.asUser(nelly, (tx) => tx.query(sql)).then(() => null, dbError);
        expect(error?.code, sql).toBe("42501");
      }
      expect(await t.asUser(nelly, (tx) => tx.query("select * from public.contributions"))).toMatchObject({ rows: [] });
    });

    it("lists only people who chose the leaderboard, for numbers they show to everyone", async () => {
      const shy = await t.createDiscordUser("shy", "1001");
      const open = await t.createDiscordUser("open", "1002");
      const half = await t.createDiscordUser("half", "1003");
      const today = new Date().toISOString().slice(0, 10);
      for (const [user, seconds] of [[shy, 600], [open, 300], [half, 900]] as const) {
        await t.db.query(
          "insert into public.mapping_days (user_id, day, edit_seconds, notes_placed) values ($1, $2, $3, 10)",
          [user, today, seconds],
        );
      }
      const set = (user: string, settings: Json) =>
        t.asUser(user, (tx) => tx.query("select public.set_my_privacy($1::jsonb)", [JSON.stringify(settings)]));
      await set(shy, { mapping_time: "everyone", mapping_stats: "everyone" });
      await set(open, { leaderboard: "everyone", mapping_time: "everyone" });
      await set(half, { leaderboard: "everyone" });
      expect(await service("public.bot_leaderboard('mapping_time')")).toEqual([{ username: "open", handle: "open", value: 300 }]);
      expect(await service("public.bot_leaderboard('notes_placed')")).toEqual([]);
    });
  });

  describe("contributions", () => {
    it("takes reports, refuses repeats and limits how many one person sends", async () => {
      expect(await submit("1001", "no")).toEqual({ error: "title" });
      const first = await submit("1001", "Export drops long notes");
      expect(first).toMatchObject({ number: 1, linked: false });
      expect(await submit("1001", "export drops LONG notes")).toEqual({ error: "duplicate", number: 1 });
      await submit("1001", "Second thing");
      await submit("1001", "Third thing");
      expect(await submit("1001", "Fourth thing")).toEqual({ error: "rate_limited" });
      expect(await submit("1002", "Someone else's report")).toMatchObject({ number: 4 });
    });

    it("awards points once, however many reviewers click at once", async () => {
      await submit("1001", "Export drops long notes");
      const results = await Promise.all([review(1, true, "9000"), review(1, true, "9001"), review(1, false, "9002")]);
      expect(results.filter((r) => r.result === "reviewed")).toHaveLength(1);
      expect(results.filter((r) => r.result === "already_reviewed")).toHaveLength(2);
      const status = await service<Json>("public.contributor_status(null, '1001')");
      expect(status).toMatchObject({ points: 10, accepted: 1, contributor: false, threshold: 30 });
    });

    it("never lets someone review their own report", async () => {
      await submit("1001", "Export drops long notes");
      expect((await review(1, true, "1001")).result).toBe("own_submission");
      expect(await service<Json>("public.contributor_status(null, '1001')")).toMatchObject({ points: 0, pending: 1 });
    });

    it("gives nothing for a rejected report and keeps accepted points when values change", async () => {
      await submit("1001", "A bug");
      await submit("1001", "An idea", "suggestion");
      expect((await review(1, false)).contribution).toMatchObject({ status: "rejected", points: 0 });
      expect((await review(2, true)).contribution).toMatchObject({ status: "accepted", points: 5 });
      await service("public.set_contribution_settings(50, 50, null)");
      expect(await service<Json>("public.contributor_status(null, '1001')")).toMatchObject({ points: 5 });
    });

    it("makes a Contributor at the threshold, unless an admin says otherwise", async () => {
      await service("public.set_contribution_settings(null, null, 15)");
      await submit("1001", "First bug");
      await submit("1001", "Second bug");
      await review(1, true);
      expect(await service<Json>("public.contributor_status(null, '1001')")).toMatchObject({ contributor: false });
      await review(2, true);
      expect(await service<Json>("public.contributor_status(null, '1001')")).toMatchObject({ points: 20, contributor: true });
      expect(await service<Json>("public.set_contributor_override('1001', 'deny', 'spam', '9000')")).toMatchObject({
        contributor: false,
        override: "deny",
      });
      expect(await service<Json>("public.set_contributor_override('1001', 'auto', null, '9000')")).toMatchObject({
        contributor: true,
        override: null,
      });
      expect(await service<Json>("public.set_contributor_override('1002', 'grant', null, '9000')")).toMatchObject({
        points: 0,
        contributor: true,
      });
    });

    it("follows a Discord account to the Cascade account it links to, badge included", async () => {
      await service("public.set_contribution_settings(null, null, 10)");
      await submit("1001", "Export drops long notes");
      await review(1, true);
      const alice = await t.createUser("alice");
      expect(await service("public.link_account_identity($1, 'discord', '1001')", [alice])).toBe("linked");
      expect(await service<Json>("public.contributor_status($1, '1001')", [alice])).toMatchObject({ points: 10, contributor: true });
      const card = await t.asUser(alice, (tx) => one<Json>(tx, "select public.get_profile('alice') as v"));
      expect(card).toMatchObject({ is_contributor: true });
      // Reports sent once linked count for the account straight away.
      expect(await submit("1001", "Another one")).toMatchObject({ linked: true });
    });

    it("lets an admin record work done elsewhere, but not for themselves", async () => {
      expect(await service<Json>("public.award_contribution('1001', 'Translated Cascade', 40, '1001')")).toEqual({
        result: "own_submission",
      });
      const awarded = await service<{ status: Json }>("public.award_contribution('1001', 'Translated Cascade', 40, '9000')");
      expect(awarded.status).toMatchObject({ points: 40, contributor: true });
    });

    it("lets Cascade admins read contributions in the app, and nobody else", async () => {
      await submit("1001", "Export drops long notes");
      const admin = await t.createUser("admin");
      await t.db.query("update public.users set is_admin = true where id = $1", [admin]);
      const { rows } = await t.asUser(admin, (tx) => tx.query("select title from public.contributions"));
      expect(rows).toEqual([{ title: "Export drops long notes" }]);
    });
  });

  describe("roadmap and changelog", () => {
    it("keeps a public roadmap that only the bot changes", async () => {
      const item = await service<{ id: number }>("public.roadmap_save(null, 'Skin editor', 'Edit skins in Cascade', 'in_progress')");
      await service("public.roadmap_save(null, 'Taiko support', '', 'planned')");
      const list = await anon<Json[]>("public.roadmap_list()");
      expect(list.map((i) => i.title)).toEqual(["Skin editor", "Taiko support"]);
      expect(await service("public.roadmap_save($1, null, null, 'done')", [item.id])).toMatchObject({ status: "done" });
      expect(await service("public.roadmap_remove($1)", [item.id])).toBe(true);
      expect(await service("public.roadmap_remove($1)", [item.id])).toBe(false);
      const error = await t.db
        .transaction(async (tx) => {
          await tx.exec("set local role anon");
          await tx.query("insert into public.roadmap_items (title) values ('x')");
        })
        .then(() => null, dbError);
      expect(error?.code).toBe("42501");
    });

    it("lists each published release once", async () => {
      const alice = await t.createUser("alice");
      const bob = await t.createUser("bob");
      for (const user of [alice, bob]) {
        await t.db.query(
          "insert into public.notifications (recipient, kind, title, body, dedupe_key, actor) values ($1, 'app_update', 'Discord login', 'Log in with Discord', 'app-update:1.2.482', $2)",
          [user, alice],
        );
      }
      expect(await service<Json[]>("public.recent_app_updates(5)")).toEqual([
        expect.objectContaining({ title: "Discord login", version: "1.2.482" }),
      ]);
    });
  });
});
