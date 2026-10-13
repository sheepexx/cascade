import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { createTestDatabase, dbError, type TestDatabase } from "./database";

/**
 * Profiles, friends, blocks and private messages (migration 0041) against the
 * real functions and row-level security, as each person involved.
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

describe("social", () => {
  let t: TestDatabase;
  let alice: string;
  let bob: string;
  let carol: string;

  beforeEach(async () => {
    t = await createTestDatabase();
    alice = await t.createUser("Alice");
    bob = await t.createUser("bob");
    carol = await t.createUser("carol");
  });
  afterEach(() => t.close());

  const rpc = <T = Json>(user: string, sql: string, params: unknown[] = []) =>
    t.asUser(user, (tx) => one<T>(tx, `select ${sql} as v`, params));

  const profile = (viewer: string | null, name: string) =>
    viewer
      ? rpc<Json | null>(viewer, "public.get_profile($1)", [name])
      : t.db.transaction(async (tx) => {
          await tx.exec("set local role anon");
          return one<Json | null>(tx, "select public.get_profile($1) as v", [name]);
        });

  const befriend = async (a: string, b: string) => {
    await rpc(a, "public.send_friend_request($1)", [b]);
    await rpc(b, "public.respond_friend_request($1, true)", [a]);
  };

  describe("profiles", () => {
    it("finds people by username, case-insensitively, signed in or not", async () => {
      const seen = await profile(null, "alice");
      expect(seen).toMatchObject({ id: alice, username: "Alice", relationship: "none", is_self: false });
      expect(await profile(alice, "ALICE")).toMatchObject({ is_self: true, relationship: "self" });
      expect(await profile(alice, "nobody-here")).toBeNull();
    });

    it("marks admins on their profile cards (migration 0046)", async () => {
      await t.db.query("update public.users set is_admin = true where id = $1", [bob]);
      expect(await profile(null, "bob")).toMatchObject({ is_admin: true });
      expect(await profile(alice, "alice")).toMatchObject({ is_admin: false });
      const found = await rpc<{ users: Json[] }>(alice, "public.search_users($1, 20, 0)", ["bob"]);
      expect(found.users[0]).toMatchObject({ username: "bob", is_admin: true });
    });

    it("follows a username change, since profiles key on the account id", async () => {
      await t.db.query("update public.users set username = 'Alicia' where id = $1", [alice]);
      expect(await profile(bob, "alice")).toBeNull();
      expect(await profile(bob, "alicia")).toMatchObject({ id: alice });
    });

    it("finds an account by osu! id", async () => {
      const { rows } = await t.db.query<{ osu_id: string }>(
        "select osu_id::text from public.users where id = $1",
        [bob],
      );
      expect(await profile(alice, rows[0].osu_id)).toMatchObject({ id: bob });
    });

    it("applies privacy levels to what a viewer may see", async () => {
      await rpc(alice, "public.set_my_privacy($1::jsonb)", [
        JSON.stringify({ mapping_stats: "everyone", mapping_time: "friends", projects: "nobody" }),
      ]);
      const stranger = (await profile(bob, "alice")) as Json;
      expect(stranger.visible).toEqual({
        mapping_stats: true,
        mapping_time: false,
        project_time: false,
        projects: false,
      });
      await befriend(alice, bob);
      const friend = (await profile(bob, "alice")) as Json;
      expect(friend.visible).toMatchObject({ mapping_time: true, project_time: true, projects: false });
      const self = (await profile(alice, "alice")) as Json;
      expect(self.visible).toMatchObject({ projects: true });
    });

    it("rejects unknown or invalid privacy settings", async () => {
      expect(
        (await failure(() => rpc(alice, "public.set_my_privacy($1::jsonb)", ['{"secret":"everyone"}'])))?.message,
      ).toMatch(/unknown privacy setting/);
      expect(
        (await failure(() => rpc(alice, "public.set_my_privacy($1::jsonb)", ['{"messages":"aliens"}'])))?.message,
      ).toMatch(/check constraint/);
    });

    it("shows presence only to the people the owner allows", async () => {
      await rpc(alice, "public.social_heartbeat($1)", ["Mapping Song"]);
      const toStranger = (await profile(bob, "alice")) as Json;
      expect(toStranger.presence).toMatchObject({ online: true, activity: null });
      await befriend(alice, bob);
      const toFriend = (await profile(bob, "alice")) as Json;
      expect(toFriend.presence).toMatchObject({ online: true, activity: "Mapping Song" });

      await rpc(alice, "public.set_my_privacy($1::jsonb)", ['{"online_status":"nobody"}']);
      expect(((await profile(bob, "alice")) as Json).presence).toBeNull();
      expect(((await profile(null, "alice")) as Json).presence).toBeNull();
    });

    it("keeps other people's account rows unreadable", async () => {
      const rows = await t.asUser(bob, async (tx) => (await tx.query("select * from public.users")).rows);
      expect(rows).toHaveLength(1);
      expect(
        await failure(() =>
          t.asUser(bob, (tx) => tx.query("select * from public.social_privacy")),
        ),
      ).toBeNull();
      const cache = await failure(() =>
        t.asUser(bob, (tx) => tx.query("select * from public.osu_profile_cache")),
      );
      expect(cache?.message).toMatch(/permission denied/);
    });
  });

  describe("search", () => {
    it("ranks exact, then prefix, then partial matches and leaves out who blocked you", async () => {
      await t.createUser("bobby");
      await t.createUser("xbobx");
      const result = await rpc<{ users: { username: string }[]; total: number }>(
        carol,
        "public.search_users($1, 10, 0)",
        ["BOB"],
      );
      expect(result.users.map((u) => u.username)).toEqual(["bob", "bobby", "xbobx"]);
      expect(result.total).toBe(3);

      await rpc(bob, "public.block_user($1)", [carol]);
      const after = await rpc<{ users: { username: string }[] }>(carol, "public.search_users($1, 10, 0)", ["bob"]);
      expect(after.users.map((u) => u.username)).toEqual(["bobby", "xbobx"]);
    });

    it("treats LIKE wildcards in the query as plain text", async () => {
      const result = await rpc<{ users: unknown[] }>(carol, "public.search_users($1, 10, 0)", ["%"]);
      expect(result.users).toEqual([]);
    });

    it("pages through results", async () => {
      for (let i = 0; i < 5; i++) await t.createUser(`page${i}`);
      const first = await rpc<{ users: { username: string }[]; total: number }>(
        alice,
        "public.search_users($1, 2, 0)",
        ["page"],
      );
      const second = await rpc<{ users: { username: string }[] }>(alice, "public.search_users($1, 2, 2)", ["page"]);
      expect(first.total).toBe(5);
      expect(first.users).toHaveLength(2);
      expect(second.users).toHaveLength(2);
      expect(second.users[0].username).not.toBe(first.users[0].username);
    });

    it("needs a signed-in caller", async () => {
      const err = await failure(() =>
        t.db.transaction(async (tx) => {
          await tx.exec("set local role anon");
          await tx.query("select public.search_users('bob', 10, 0)");
        }),
      );
      expect(err?.message).toMatch(/permission denied|sign in/);
    });
  });

  describe("friends", () => {
    it("sends, lists and accepts a request, notifying both sides", async () => {
      expect(await rpc(alice, "public.send_friend_request($1)", [bob])).toBe("outgoing");
      expect(await rpc(alice, "public.send_friend_request($1)", [bob])).toBe("outgoing");
      const bobLists = await rpc<{ incoming: { id: string }[] }>(bob, "public.list_friends()");
      expect(bobLists.incoming.map((u) => u.id)).toEqual([alice]);
      expect(((await profile(bob, "alice")) as Json).relationship).toBe("incoming");

      const notices = await t.asUser(bob, async (tx) =>
        (await tx.query<{ kind: string }>("select kind from public.notifications where dismissed_at is null")).rows,
      );
      expect(notices).toEqual([{ kind: "friend_request" }]);

      expect(await rpc(bob, "public.respond_friend_request($1, true)", [alice])).toBe("friends");
      const aliceLists = await rpc<{ friends: { id: string }[]; outgoing: unknown[] }>(alice, "public.list_friends()");
      expect(aliceLists.friends.map((u) => u.id)).toEqual([bob]);
      expect(aliceLists.outgoing).toEqual([]);
      const accepted = await t.asUser(alice, async (tx) =>
        (await tx.query<{ kind: string }>("select kind from public.notifications")).rows,
      );
      expect(accepted).toEqual([{ kind: "friend_accept" }]);
      const retired = await t.asUser(bob, async (tx) =>
        (await tx.query("select 1 from public.notifications where dismissed_at is null")).rows,
      );
      expect(retired).toEqual([]);
    });

    it("turns a request to someone who already asked into an accept", async () => {
      await rpc(alice, "public.send_friend_request($1)", [bob]);
      expect(await rpc(bob, "public.send_friend_request($1)", [alice])).toBe("friends");
      expect(((await profile(alice, "bob")) as Json).relationship).toBe("friends");
    });

    it("refuses requests to yourself, to unknown users and to people who don't accept them", async () => {
      expect((await failure(() => rpc(alice, "public.send_friend_request($1)", [alice])))?.message).toMatch(/yourself/);
      expect(
        (await failure(() => rpc(alice, "public.send_friend_request($1)", ["00000000-0000-0000-0000-000000000000"])))
          ?.message,
      ).toMatch(/not found/);
      await rpc(bob, "public.set_my_privacy($1::jsonb)", ['{"friend_requests":"nobody"}']);
      expect((await failure(() => rpc(alice, "public.send_friend_request($1)", [bob])))?.message).toMatch(
        /isn't accepting/,
      );
      expect(((await profile(alice, "bob")) as Json).can_friend_request).toBe(false);
    });

    it("keeps a declined sender from asking again for a week, without telling them", async () => {
      await rpc(alice, "public.send_friend_request($1)", [bob]);
      expect(await rpc(bob, "public.respond_friend_request($1, false)", [alice])).toBe("none");
      expect(((await profile(alice, "bob")) as Json).relationship).toBe("none");
      expect((await failure(() => rpc(alice, "public.send_friend_request($1)", [bob])))?.message).toMatch(/yet/);
      await t.db.query(
        "update public.friend_requests set responded_at = now() - interval '8 days' where sender = $1",
        [alice],
      );
      expect(await rpc(alice, "public.send_friend_request($1)", [bob])).toBe("outgoing");
    });

    it("lets the sender cancel, and either friend remove the friendship", async () => {
      await rpc(alice, "public.send_friend_request($1)", [bob]);
      await rpc(alice, "public.cancel_friend_request($1)", [bob]);
      expect(((await profile(bob, "alice")) as Json).relationship).toBe("none");
      expect((await failure(() => rpc(bob, "public.respond_friend_request($1, true)", [alice])))?.message).toMatch(
        /no longer pending/,
      );
      await befriend(alice, bob);
      await rpc(bob, "public.remove_friend($1)", [alice]);
      expect(((await profile(alice, "bob")) as Json).relationship).toBe("none");
    });

    it("caps how many requests one account sends in a day", async () => {
      const targets: string[] = [];
      for (let i = 0; i < 31; i++) targets.push(await t.createUser(`target${i}`));
      for (const target of targets.slice(0, 30)) await rpc(alice, "public.send_friend_request($1)", [target]);
      expect((await failure(() => rpc(alice, "public.send_friend_request($1)", [targets[30]])))?.message).toMatch(
        /a lot of friend requests/,
      );
    });

    it("can't be written to directly", async () => {
      const err = await failure(() =>
        t.asUser(alice, (tx) =>
          tx.query("insert into public.friendships (user_low, user_high) values ($1, $2)", [
            alice < bob ? alice : bob,
            alice < bob ? bob : alice,
          ]),
        ),
      );
      expect(err?.message).toMatch(/permission denied/);
    });
  });

  describe("blocking", () => {
    it("ends the friendship and stops requests both ways", async () => {
      await befriend(alice, bob);
      await rpc(alice, "public.block_user($1)", [bob]);
      expect(((await profile(alice, "bob")) as Json).relationship).toBe("blocked");
      expect(((await profile(bob, "alice")) as Json).relationship).toBe("none");
      expect((await failure(() => rpc(bob, "public.send_friend_request($1)", [alice])))?.message).toMatch(
        /can't add/,
      );
      expect((await failure(() => rpc(alice, "public.send_friend_request($1)", [bob])))?.message).toMatch(
        /can't add/,
      );
      const lists = await rpc<{ friends: unknown[]; blocked: { id: string }[] }>(alice, "public.list_friends()");
      expect(lists.friends).toEqual([]);
      expect(lists.blocked.map((u) => u.id)).toEqual([bob]);
    });

    it("hides the blocker's presence and statistics from the blocked person", async () => {
      await rpc(alice, "public.set_my_privacy($1::jsonb)", [
        JSON.stringify({ online_status: "everyone", mapping_stats: "everyone", mapping_time: "everyone" }),
      ]);
      await rpc(alice, "public.social_heartbeat(null)");
      await rpc(alice, "public.block_user($1)", [bob]);
      const seen = (await profile(bob, "alice")) as Json;
      expect(seen.presence).toBeNull();
      expect(seen.visible).toEqual({ mapping_stats: false, mapping_time: false, project_time: false, projects: false });
      expect(seen.can_message).toBe(false);
      const stats = await rpc<Json>(bob, "public.get_mapping_stats($1)", [alice]);
      expect(stats.counters).toBeNull();
      expect(stats.totals).toBeNull();
    });

    it("refuses collaboration invitations between the two", async () => {
      const project = await t.createProject(alice, { meta: { title: "Song" }, difficulties: [] });
      await rpc(bob, "public.block_user($1)", [alice]);
      const err = await failure(() => rpc(alice, "public.add_collaborator($1, $2, 'editor')", [project, "bob"]));
      expect(err?.message).toMatch(/can't invite/);
      await rpc(bob, "public.unblock_user($1)", [alice]);
      expect(await rpc(alice, "public.add_collaborator($1, $2, 'editor')", [project, "bob"])).toMatchObject({
        user_id: bob,
      });
    });
  });

  describe("messages", () => {
    const send = (user: string, conversation: string, body: string) =>
      rpc<Json>(user, "public.send_message($1, $2, null)", [conversation, body]);

    it("delivers between friends, counts unread and marks read", async () => {
      await befriend(alice, bob);
      const conversation = await rpc<string>(alice, "public.open_conversation($1)", [bob]);
      expect(await rpc<string>(bob, "public.open_conversation($1)", [alice])).toBe(conversation);
      await send(alice, conversation, "  hello  ");
      await send(alice, conversation, "are you there?");

      const counts = await rpc<Json>(bob, "public.get_social_counts()");
      expect(counts).toMatchObject({ unread_messages: 2 });
      const list = await rpc<Json[]>(bob, "public.list_conversations()");
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: conversation, unread: 2, can_send: true });
      expect((list[0].last_message as Json).body).toBe("are you there?");

      const bodies = await t.asUser(bob, async (tx) =>
        (
          await tx.query<{ body: string }>(
            "select body from public.messages where conversation_id = $1 order by created_at",
            [conversation],
          )
        ).rows.map((r) => r.body),
      );
      expect(bodies).toEqual(["hello", "are you there?"]);

      const notices = await t.asUser(bob, async (tx) =>
        (
          await tx.query<{ kind: string; read_at: string | null }>(
            "select kind, read_at from public.notifications where kind = 'message'",
          )
        ).rows,
      );
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({ kind: "message", read_at: null });

      await rpc(bob, "public.mark_conversation_read($1)", [conversation]);
      expect(await rpc<Json>(bob, "public.get_social_counts()")).toMatchObject({ unread_messages: 0 });
      const read = await t.asUser(bob, async (tx) =>
        (await tx.query<{ read_at: string | null }>("select read_at from public.notifications where kind = 'message'"))
          .rows,
      );
      expect(read[0].read_at).not.toBeNull();
    });

    it("keeps conversations private to their two members", async () => {
      await befriend(alice, bob);
      const conversation = await rpc<string>(alice, "public.open_conversation($1)", [bob]);
      await send(alice, conversation, "secret");
      const seen = await t.asUser(carol, async (tx) => (await tx.query("select * from public.messages")).rows);
      expect(seen).toEqual([]);
      expect((await failure(() => send(carol, conversation, "hi")))?.message).toMatch(/not found/);
      const direct = await failure(() =>
        t.asUser(carol, (tx) =>
          tx.query("insert into public.messages (conversation_id, sender, body) values ($1, $2, 'x')", [
            conversation,
            carol,
          ]),
        ),
      );
      expect(direct?.message).toMatch(/permission denied/);
      expect(
        await t.asUser(carol, async (tx) => (await tx.query("select * from public.conversations")).rows),
      ).toEqual([]);
    });

    it("authorizes the typing channel for members only", async () => {
      await befriend(alice, bob);
      const conversation = await rpc<string>(alice, "public.open_conversation($1)", [bob]);
      const canJoin = (user: string, topic: string) =>
        t.asUser(user, async (tx) => {
          await tx.query("select set_config('realtime.topic', $1, true)", [topic]);
          await tx.query("insert into realtime.messages (topic, extension, payload, event, private) values ($1, 'broadcast', '{}', 'typing', true)", [topic]);
          return true;
        });
      expect(await canJoin(bob, `dm:${conversation}`)).toBe(true);
      expect((await failure(() => canJoin(carol, `dm:${conversation}`)))?.message).toMatch(/row-level security/);
      expect((await failure(() => canJoin(carol, "dm:not-a-uuid")))?.message).toMatch(/row-level security/);
    });

    it("lets anyone message anyone by default (migration 0043)", async () => {
      const conversation = await rpc<string>(alice, "public.open_conversation($1)", [bob]);
      await send(alice, conversation, "hi, loved your 7K set");
      expect(await rpc<Json>(bob, "public.get_social_counts()")).toMatchObject({ unread_messages: 1 });
      expect(await rpc<Json>(bob, "public.get_my_privacy()")).toMatchObject({ messages: "everyone" });
    });

    it("follows the recipient's message setting, but always allows a reply", async () => {
      await rpc(bob, "public.set_my_privacy($1::jsonb)", ['{"messages":"nobody"}']);
      expect((await failure(() => rpc(alice, "public.open_conversation($1)", [bob])))?.message).toMatch(
        /isn't accepting messages/,
      );
      await rpc(bob, "public.set_my_privacy($1::jsonb)", ['{"messages":"everyone"}']);
      const conversation = await rpc<string>(alice, "public.open_conversation($1)", [bob]);
      await send(alice, conversation, "hi bob");
      await rpc(bob, "public.set_my_privacy($1::jsonb)", ['{"messages":"friends"}']);
      expect((await failure(() => send(alice, conversation, "again")))?.message).toMatch(/can't send/);
      // Alice turned messages off, but Bob may answer her since she wrote first.
      await rpc(alice, "public.set_my_privacy($1::jsonb)", ['{"messages":"nobody"}']);
      await send(bob, conversation, "hi alice");
      await send(alice, conversation, "thanks");
    });

    it("stops both people sending once either blocks, but keeps the history", async () => {
      await befriend(alice, bob);
      const conversation = await rpc<string>(alice, "public.open_conversation($1)", [bob]);
      await send(alice, conversation, "before");
      await rpc(bob, "public.block_user($1)", [alice]);
      expect((await failure(() => send(alice, conversation, "after")))?.message).toMatch(/can't send/);
      expect((await failure(() => send(bob, conversation, "after")))?.message).toMatch(/can't send/);
      expect(await rpc<string>(alice, "public.open_conversation($1)", [bob])).toBe(conversation);
      const rows = await t.asUser(alice, async (tx) => (await tx.query("select body from public.messages")).rows);
      expect(rows).toEqual([{ body: "before" }]);
    });

    it("validates length and rate", async () => {
      await befriend(alice, bob);
      const conversation = await rpc<string>(alice, "public.open_conversation($1)", [bob]);
      expect((await failure(() => send(alice, conversation, "   ")))?.message).toMatch(/empty/);
      expect((await failure(() => send(alice, conversation, "x".repeat(2001))))?.message).toMatch(/2000/);
      for (let i = 0; i < 8; i++) await send(alice, conversation, `m${i}`);
      expect((await failure(() => send(alice, conversation, "one more")))?.message).toMatch(/too quickly/);
    });

    it("lets senders edit and delete only their own messages", async () => {
      await befriend(alice, bob);
      const conversation = await rpc<string>(alice, "public.open_conversation($1)", [bob]);
      const message = await send(alice, conversation, "tpyo");
      const edited = await rpc<Json>(alice, "public.edit_message($1, $2)", [message.id, "typo"]);
      expect(edited).toMatchObject({ body: "typo" });
      expect(edited.edited_at).not.toBeNull();
      expect((await failure(() => rpc(bob, "public.edit_message($1, $2)", [message.id, "hacked"])))?.message).toMatch(
        /own messages/,
      );
      expect((await failure(() => rpc(bob, "public.delete_message($1)", [message.id])))?.message).toMatch(/own messages/);
      await rpc(alice, "public.delete_message($1)", [message.id]);
      const rows = await t.asUser(bob, async (tx) =>
        (await tx.query<{ body: string; deleted_at: string | null }>("select body, deleted_at from public.messages")).rows,
      );
      expect(rows[0].body).toBe("");
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it("toggles reactions for members only and clears them on delete (migration 0045)", async () => {
      const conversation = await rpc<string>(alice, "public.open_conversation($1)", [bob]);
      const message = await send(alice, conversation, "new map is up");
      const react = (user: string, emoji: string) =>
        rpc<Json>(user, "public.toggle_reaction($1, $2)", [message.id, emoji]);

      expect((await react(bob, "🔥")).reactions).toEqual({ "🔥": [bob] });
      expect((await react(alice, "🔥")).reactions).toEqual({ "🔥": [bob, alice] });
      expect((await react(bob, "👍🏽")).reactions).toEqual({ "🔥": [bob, alice], "👍🏽": [bob] });
      expect((await react(bob, "1️⃣")).reactions).toMatchObject({ "1️⃣": [bob] });
      expect((await react(bob, "🔥")).reactions).toEqual({ "🔥": [alice], "👍🏽": [bob], "1️⃣": [bob] });
      await react(bob, "1️⃣");
      expect((await react(bob, "👍🏽")).reactions).toEqual({ "🔥": [alice] });

      for (const text of ["", "lol", "🔥 🔥", "a🔥", "<b>"]) {
        expect((await failure(() => react(bob, text)))?.message).toMatch(/isn't a reaction/);
      }
      expect((await failure(() => react(carol, "🔥")))?.message).toMatch(/not found/);
      const direct = await failure(() =>
        t.asUser(bob, (tx) => tx.query("update public.messages set reactions = '{}' where id = $1", [message.id])),
      );
      expect(direct?.message).toMatch(/permission denied/);

      await rpc(bob, "public.block_user($1)", [alice]);
      expect((await failure(() => react(bob, "👀")))?.message).toMatch(/can't react/);
      await rpc(bob, "public.unblock_user($1)", [alice]);

      await rpc(alice, "public.delete_message($1)", [message.id]);
      const rows = await t.asUser(bob, async (tx) =>
        (await tx.query<{ reactions: Json }>("select reactions from public.messages")).rows,
      );
      expect(rows[0].reactions).toEqual({});
      expect((await failure(() => react(bob, "🔥")))?.message).toMatch(/not found/);
    });

    it("caps the number of different reactions on one message", async () => {
      const conversation = await rpc<string>(alice, "public.open_conversation($1)", [bob]);
      const message = await send(alice, conversation, "react away");
      const emoji = [..."😀😁😂🤣😃😄😅😆😉😊😋😎😍😘🥰😗😙😚🙂🤗"];
      for (const e of emoji) await rpc(bob, "public.toggle_reaction($1, $2)", [message.id, e]);
      expect(
        (await failure(() => rpc(bob, "public.toggle_reaction($1, $2)", [message.id, "🤩"])))?.message,
      ).toMatch(/as many reactions/);
      // Adding to a reaction already there still works.
      await rpc(alice, "public.toggle_reaction($1, $2)", [message.id, "😀"]);
    });

    it("doesn't notify a member who muted the conversation", async () => {
      await befriend(alice, bob);
      const conversation = await rpc<string>(alice, "public.open_conversation($1)", [bob]);
      await rpc(bob, "public.set_conversation_state($1, true, null)", [conversation]);
      await send(alice, conversation, "quiet");
      const notices = await t.asUser(bob, async (tx) => (await tx.query("select 1 from public.notifications where kind = 'message'")).rows);
      expect(notices).toEqual([]);
      expect(await rpc<Json>(bob, "public.get_social_counts()")).toMatchObject({ unread_messages: 0 });
    });
  });

  describe("reports", () => {
    it("files a report once a day and shows it to admins only", async () => {
      await rpc(alice, "public.report_user($1, 'spam', 'buy gold')", [bob]);
      expect((await failure(() => rpc(alice, "public.report_user($1, 'spam', null)", [bob])))?.message).toMatch(
        /already reported/,
      );
      expect((await failure(() => rpc(alice, "public.admin_list_user_reports('open')")))?.message).toMatch(/admin/);
      await t.db.query("update public.users set is_admin = true where id = $1", [carol]);
      const reports = await rpc<Json[]>(carol, "public.admin_list_user_reports('open')");
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({ reason: "spam", reported: "bob", reporter: "Alice" });
    });
  });

  describe("main menu roster", () => {
    it("shows last seen only for people who show their online status to everyone", async () => {
      await t.db.query("update public.users set avatar_url = 'a', last_signed_in_at = now()");
      await rpc(bob, "public.set_my_privacy($1::jsonb)", ['{"online_status":"friends"}']);
      const { rows } = await t.db.query<{ username: string; last_seen_at: string | null }>(
        "select username, last_seen_at from public.roster_pool(10) order by username",
      );
      expect(rows.find((r) => r.username === "bob")?.last_seen_at).toBeNull();
      expect(rows.find((r) => r.username === "Alice")?.last_seen_at).not.toBeNull();
      const err = await failure(() => t.asUser(alice, (tx) => tx.query("select * from public.roster_pool(10)")));
      expect(err?.message).toMatch(/permission denied/);
    });
  });
});
