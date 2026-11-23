import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { createTestDatabase, dbError, type TestDatabase } from "./database";

/**
 * Sign-in identities (migration 0047): what happens to accounts that already
 * exist, the guarantees the tables give whatever calls them, and accounts
 * made with Discord using everything that doesn't need osu!.
 */

type Json = Record<string, unknown>;

async function failure(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return dbError(error);
  }
  return null;
}

async function one<T = Json>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await tx.query<{ v: T }>(sql, params);
  return rows[0].v;
}

describe("account identities", () => {
  let t: TestDatabase;

  afterEach(() => t.close());

  const service = <T = Json>(sql: string, params: unknown[] = []) =>
    t.db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return one<T>(tx, `select ${sql} as v`, params);
    });

  describe("existing accounts", () => {
    it("keeps every account, its id and what it owns through the migration, run twice", async () => {
      t = await createTestDatabase({ through: "0046_profile_admin_badge.sql" });
      const alice = await t.createUser("alice");
      const bob = await t.createUser("bob");
      const project = await t.createProject(alice, { meta: { title: "Alice's map" } });
      await t.share(project, bob, "editor");
      await t.asUser(alice, (tx) => tx.query("select public.send_friend_request($1)", [bob]));
      await t.asUser(bob, (tx) => tx.query("select public.respond_friend_request($1, true)", [alice]));
      const before = await t.db.query("select id, osu_id, username, created_at from public.users order by id");

      await t.migrate("0046_profile_admin_badge.sql");
      await t.migrate("0046_profile_admin_badge.sql");

      expect((await t.db.query("select id, osu_id, username, created_at from public.users order by id")).rows).toEqual(
        before.rows,
      );
      const { rows: identities } = await t.db.query<{ user_id: string; provider: string; provider_user_id: string }>(
        `select i.user_id, i.provider, i.provider_user_id from public.account_identities i
         join public.users u on u.id = i.user_id where i.provider_user_id = u.osu_id::text order by i.user_id`,
      );
      expect(identities.map((i) => i.user_id).sort()).toEqual([alice, bob].sort());
      expect(identities.every((i) => i.provider === "osu")).toBe(true);
      const { rows: owned } = await t.db.query("select owner from public.projects where id = $1", [project]);
      expect(owned).toEqual([{ owner: alice }]);
      const { rows: collaborators } = await t.db.query(
        "select user_id from public.project_collaborators where project_id = $1",
        [project],
      );
      expect(collaborators).toEqual([{ user_id: bob }]);
      const { rows: friends } = await t.db.query(
        "select 1 from public.friendships where user_low = least($1::uuid, $2::uuid) and user_high = greatest($1::uuid, $2::uuid)",
        [alice, bob],
      );
      expect(friends).toHaveLength(1);
    });

    it("signs an osu! account from before identities in to itself", async () => {
      t = await createTestDatabase();
      const id = await t.createUser("peppy");
      // As an older Worker would leave it: the row, without its identity.
      await t.db.query("delete from public.account_identities where user_id = $1", [id]);
      const { rows } = await t.db.query<{ osu_id: string }>("select osu_id::text from public.users where id = $1", [id]);
      const signed = await service<{ id: string; created: boolean }>("public.auth_sign_in('osu', $1, 'peppy')", [rows[0].osu_id]);
      expect(signed).toMatchObject({ id, created: false });
      expect((await t.db.query("select 1 from public.account_identities where user_id = $1", [id])).rows).toHaveLength(1);
    });

    it("gives accounts an older Worker creates their osu! identity", async () => {
      t = await createTestDatabase();
      const { rows } = await t.db.query<{ id: string }>(
        "insert into public.users (osu_id, username) values (777, 'legacy') returning id",
      );
      const { rows: identities } = await t.db.query("select provider, provider_user_id from public.account_identities where user_id = $1", [
        rows[0].id,
      ]);
      expect(identities).toEqual([{ provider: "osu", provider_user_id: "777" }]);
    });
  });

  describe("guarantees", () => {
    beforeEach(async () => {
      t = await createTestDatabase();
    });

    it("lets one provider account belong to one Cascade account, once per provider", async () => {
      const alice = await t.createDiscordUser("alice", "1001");
      const bob = await t.createUser("bob");
      expect(
        (await failure(() =>
          t.db.query("insert into public.account_identities (user_id, provider, provider_user_id) values ($1, 'discord', '1001')", [bob]),
        ))?.code,
      ).toBe("23505");
      expect(
        (await failure(() =>
          t.db.query("insert into public.account_identities (user_id, provider, provider_user_id) values ($1, 'discord', '1002')", [alice]),
        ))?.code,
      ).toBe("23505");
      expect(
        (await failure(() =>
          t.db.query("insert into public.account_identities (user_id, provider, provider_user_id) values ($1, 'steam', '1')", [bob]),
        ))?.code,
      ).toBe("23514");
      expect(
        (await failure(() =>
          t.db.query("insert into public.account_identities (user_id, provider, provider_user_id) values ($1, 'discord', '00')", [bob]),
        ))?.code,
      ).toBe("23514");
    });

    it("keeps identities out of reach of signed-in users, admins included", async () => {
      const alice = await t.createUser("alice");
      await t.db.query("update public.users set is_admin = true where id = $1", [alice]);
      const denied = async (sql: string, params: unknown[] = []) =>
        (await failure(() => t.asUser(alice, (tx) => tx.query(sql, params))))?.code;
      expect(await denied("select * from public.account_identities")).toBe("42501");
      expect(await denied("insert into public.account_identities (user_id, provider, provider_user_id) values ($1, 'discord', '5')", [alice])).toBe("42501");
      expect(await denied("delete from public.account_identities")).toBe("42501");
      expect(await denied("select public.auth_sign_in('discord', '5', 'x')")).toBe("42501");
      expect(await denied("select public.link_account_identity($1, 'discord', '5')", [alice])).toBe("42501");
      expect(await denied("select public.unlink_account_identity($1, 'osu')", [alice])).toBe("42501");
      expect(await denied("select public.identity_owner('osu', '1000')")).toBe("42501");
      expect(await denied("select public.account_identities_of($1)", [alice])).toBe("42501");
      expect(await denied("select public.auth_consume_token(gen_random_uuid(), 'link', now())")).toBe("42501");
      expect(await denied("select * from public.auth_used_tokens")).toBe("42501");
      // Admins may still edit accounts, but not how they sign in.
      expect(
        (await failure(() => t.asUser(alice, (tx) => tx.query("update public.users set osu_id = 999 where id = $1", [alice]))))?.message,
      ).toMatch(/sign-in identities/);
      expect(
        (await failure(() =>
          t.asUser(alice, (tx) => tx.query("update public.users set profile_provider = 'discord' where id = $1", [alice])),
        ))?.message,
      ).toMatch(/sign-in identities/);
      await t.asUser(alice, (tx) => tx.query("update public.users set is_admin = false where id = $1", [alice]));
    });

    it("shows every account's sign-in methods to admins only (migration 0049)", async () => {
      const admin = await t.createUser("admin");
      await t.db.query("update public.users set is_admin = true where id = $1", [admin]);
      const nelly = await t.createDiscordUser("Nelly", "1001");
      const list = await t.asUser(admin, async (tx) => {
        const { rows } = await tx.query<{ v: { user_id: string; provider: string; display_name: string }[] }>(
          "select public.admin_account_identities() as v",
        );
        return rows[0].v;
      });
      expect(list.filter((i) => i.user_id === nelly)).toEqual([
        expect.objectContaining({ provider: "discord", provider_user_id: "1001", display_name: "Nelly" }),
      ]);
      expect(list.filter((i) => i.user_id === admin)).toEqual([expect.objectContaining({ provider: "osu" })]);
      const refused = await failure(() => t.asUser(nelly, (tx) => tx.query("select public.admin_account_identities()")));
      expect(refused?.message).toMatch(/admin access required/);
    });

    it("never changes an account's id", async () => {
      const alice = await t.createUser("alice");
      expect(
        (await failure(() => t.db.query("update public.users set id = gen_random_uuid() where id = $1", [alice])))?.message,
      ).toMatch(/never changes/);
    });

    it("refuses to link an identity another account has, without changing either", async () => {
      const alice = await t.createDiscordUser("alice", "1001");
      const bob = await t.createUser("bob");
      expect(await service("public.link_account_identity($1, 'discord', '1001')", [bob])).toBe("claimed");
      const { rows: bobOsu } = await t.db.query<{ osu_id: string }>("select osu_id::text from public.users where id = $1", [bob]);
      expect(await service("public.link_account_identity($1, 'osu', $2)", [alice, bobOsu[0].osu_id])).toBe("claimed");
      expect(await service("public.link_account_identity($1, 'discord', '1001')", [alice])).toBe("already_linked");
      expect(await service("public.link_account_identity($1, 'discord', '1002')", [alice])).toBe("provider_taken");
      const { rows } = await t.db.query("select user_id, provider from public.account_identities order by provider");
      expect(rows).toEqual([
        { user_id: alice, provider: "discord" },
        { user_id: bob, provider: "osu" },
      ]);
    });

    it("keeps users.osu_id in step with the osu! identity", async () => {
      const alice = await t.createDiscordUser("alice", "1001");
      expect(await service("public.link_account_identity($1, 'osu', '4242')", [alice])).toBe("linked");
      expect((await t.db.query("select osu_id::text from public.users where id = $1", [alice])).rows).toEqual([{ osu_id: "4242" }]);
      expect(await service("public.unlink_account_identity($1, 'osu')", [alice])).toBe("unlinked");
      expect((await t.db.query("select osu_id from public.users where id = $1", [alice])).rows).toEqual([{ osu_id: null }]);
      expect(await service("public.unlink_account_identity($1, 'discord')", [alice])).toBe("last_identity");
      expect(await service("public.unlink_account_identity($1, 'osu')", [alice])).toBe("not_linked");
    });

    it("moves the profile to the remaining provider when its own is removed", async () => {
      const alice = await t.createUser("alice");
      expect(await service("public.link_account_identity($1, 'discord', '1001', 'Alice D')", [alice])).toBe("linked");
      expect(await service("public.unlink_account_identity($1, 'osu')", [alice])).toBe("unlinked");
      expect((await t.db.query("select username, profile_provider from public.users where id = $1", [alice])).rows).toEqual([
        { username: "alice", profile_provider: "discord" },
      ]);
    });

    it("accepts a one-time token once", async () => {
      const jti = "11111111-1111-4111-8111-111111111111";
      expect(await service("public.auth_consume_token($1, 'link', now() + interval '5 minutes')", [jti])).toBe(true);
      expect(await service("public.auth_consume_token($1, 'link', now() + interval '5 minutes')", [jti])).toBe(false);
    });
  });

  describe("names", () => {
    beforeEach(async () => {
      t = await createTestDatabase();
    });

    const profile = (viewer: string, name: string) =>
      t.asUser(viewer, (tx) => one<Json | null>(tx, "select public.get_profile($1) as v", [name]));

    it("numbers a Discord name another account has, without touching that account", async () => {
      const osu = await t.createUser("Nelly");
      const first = await t.createDiscordUser("nelly", "1001");
      const second = await t.createDiscordUser("NELLY", "1002");
      const { rows } = await t.db.query<{ id: string; username: string }>("select id, username from public.users order by created_at");
      expect(rows).toEqual([
        { id: osu, username: "Nelly" },
        { id: first, username: "nelly#2" },
        { id: second, username: "NELLY#3" },
      ]);
    });

    it("tidies names and keeps them to 32 characters", async () => {
      const id = await t.createDiscordUser("  a\u200b  very\tlong   name that goes on and on and on  ", "1001");
      const { rows } = await t.db.query<{ username: string }>("select username from public.users where id = $1", [id]);
      expect(rows[0].username).toBe("a very long name that goes on an");
      const blank = await t.createDiscordUser("\u200b", "1002");
      expect((await t.db.query("select username from public.users where id = $1", [blank])).rows).toEqual([{ username: "mapper" }]);
    });

    it("sends a shared name to the osu!-verified account and reaches the other by its handle", async () => {
      const discordFirst = await t.createDiscordUser("sheep", "1001");
      // Someone later signs up with osu! under the same name, as osu! has it.
      const osuLater = await t.createUser("sheep");
      expect(await profile(osuLater, "sheep")).toMatchObject({ id: osuLater, handle: "sheep" });
      const other = (await profile(osuLater, discordFirst)) as Json;
      expect(other).toMatchObject({ id: discordFirst, handle: discordFirst });

      const project = await t.createProject(osuLater, { meta: { title: "Map" } });
      const invited = await t.asUser(osuLater, (tx) =>
        one<Json>(tx, "select public.add_collaborator($1, $2, 'viewer') as v", [project, discordFirst]),
      );
      expect(invited).toMatchObject({ user_id: discordFirst });
    });

    it("follows a Discord rename, and only that", async () => {
      const id = await t.createDiscordUser("nelly", "1001");
      await t.createDiscordUser("nelly", "1001");
      expect((await t.db.query("select username from public.users where id = $1", [id])).rows).toEqual([{ username: "nelly" }]);
      await t.createDiscordUser("Nelly Renamed", "1001");
      expect((await t.db.query("select username from public.users where id = $1", [id])).rows).toEqual([
        { username: "Nelly Renamed" },
      ]);
    });
  });

  describe("accounts made with Discord", () => {
    let nelly: string;
    let bob: string;

    beforeEach(async () => {
      t = await createTestDatabase();
      nelly = await t.createDiscordUser("Nelly", "80351110224678912");
      bob = await t.createUser("bob");
    });

    it("save cloud projects, invite collaborators and comment", async () => {
      const project = await t.createProject(nelly, { meta: { title: "Discord map" } });
      await t.asUser(nelly, (tx) => tx.query("select public.add_collaborator($1, 'bob', 'editor')", [project]));
      await t.asUser(nelly, (tx) =>
        tx.query(
          "insert into public.comments (project_id, author, author_username, author_osu_id, time_ms, body) values ($1, $2, 'Nelly', null, 0, 'hi')",
          [project, nelly],
        ),
      );
      const { rows } = await t.asUser(bob, (tx) => tx.query("select body from public.comments where project_id = $1", [project]));
      expect(rows).toEqual([{ body: "hi" }]);
    });

    it("have a profile, privacy settings, friends and messages", async () => {
      const card = await t.asUser(bob, (tx) => one<Json>(tx, "select public.get_profile('Nelly') as v"));
      expect(card).toMatchObject({ id: nelly, osu_id: null, osu: null, handle: "Nelly" });
      await t.asUser(nelly, (tx) => tx.query("select public.set_my_privacy($1::jsonb)", [JSON.stringify({ mapping_stats: "everyone" })]));
      await t.asUser(nelly, (tx) => tx.query("select public.send_friend_request($1)", [bob]));
      await t.asUser(bob, (tx) => tx.query("select public.respond_friend_request($1, true)", [nelly]));
      const conversation = await t.asUser(nelly, (tx) => one<string>(tx, "select public.open_conversation($1) as v", [bob]));
      await t.asUser(nelly, (tx) => tx.query("select public.send_message($1, 'hello', null)", [conversation]));
      const lists = await t.asUser(bob, (tx) => one<{ friends: Json[] }>(tx, "select public.list_friends() as v"));
      expect(lists.friends.map((f) => f.id)).toEqual([nelly]);
    });

    it("record mapping time and see their statistics", async () => {
      const now = Date.now();
      await t.asUser(nelly, (tx) =>
        tx.query("select public.record_mapping_activity($1, $2::jsonb, $3::timestamptz, $4::timestamptz)", [
          "33333333-3333-4333-8333-333333333333",
          JSON.stringify([{ day: new Date(now).toISOString().slice(0, 10), project_key: "local:x", edit: 60, notes_placed: 5 }]),
          new Date(now - 60_000).toISOString(),
          new Date(now).toISOString(),
        ]),
      );
      const stats = await t.asUser(nelly, (tx) => one<{ counters: Json }>(tx, "select public.get_mapping_stats($1) as v", [nelly]));
      expect(stats.counters).toMatchObject({ notes_placed: 5 });
    });

    it("send feedback and get notifications", async () => {
      await t.asUser(nelly, (tx) =>
        tx.query("insert into public.feedback (user_id, author_username, author_osu_id, body) values ($1, 'Nelly', null, 'nice')", [nelly]),
      );
      const project = await t.createProject(bob, { meta: { title: "Bob's map" } });
      await t.asUser(bob, (tx) => tx.query("select public.add_collaborator($1, 'Nelly', 'viewer')", [project]));
      const { rows } = await t.asUser(nelly, (tx) => tx.query("select kind from public.notifications"));
      expect(rows).toEqual([{ kind: "invite" }]);
    });
  });
});
