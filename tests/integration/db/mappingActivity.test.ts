import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, dbError, type TestDatabase } from "./database";

/**
 * Mapping time (migration 0042): what the database credits from the app's
 * reports, and who may read it back.
 */

type Json = Record<string, unknown>;

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";

function entry(overrides: Json = {}): Json {
  return {
    day: new Date().toISOString().slice(0, 10),
    project_key: "local:abc",
    project_title: "Song",
    project_artist: "Artist",
    edit: 60,
    playtest: 0,
    review: 0,
    notes_placed: 10,
    ...overrides,
  };
}

/** A span of `seconds` ending `endsAgo` seconds before now. */
function span(seconds: number, endsAgo = 0): [string, string] {
  const end = Date.now() - endsAgo * 1000;
  return [new Date(end - seconds * 1000).toISOString(), new Date(end).toISOString()];
}

describe("mapping activity", () => {
  let t: TestDatabase;
  let alice: string;
  let bob: string;

  beforeEach(async () => {
    t = await createTestDatabase();
    alice = await t.createUser("alice");
    bob = await t.createUser("bob");
  });
  afterEach(() => t.close());

  const record = (user: string, session: string, entries: Json[], [from, to]: [string, string]) =>
    t.asUser(user, async (tx) => {
      const { rows } = await tx.query<{ v: number }>(
        "select public.record_mapping_activity($1, $2::jsonb, $3::timestamptz, $4::timestamptz) as v",
        [session, JSON.stringify(entries), from, to],
      );
      return rows[0].v;
    });

  const stats = (viewer: string | null, owner: string) =>
    viewer
      ? t.asUser(viewer, async (tx) => {
          const { rows } = await tx.query<{ v: Json }>("select public.get_mapping_stats($1) as v", [owner]);
          return rows[0].v;
        })
      : t.db.transaction(async (tx) => {
          await tx.exec("set local role anon");
          const { rows } = await tx.query<{ v: Json }>("select public.get_mapping_stats($1) as v", [owner]);
          return rows[0].v;
        });

  it("credits a minute of editing and aggregates it per day, project and difficulty", async () => {
    const credited = await record(
      alice,
      SESSION_A,
      [entry({ difficulty_key: "d1", difficulty_name: "Hard", maps_created: 1 })],
      span(60, 120),
    );
    expect(credited).toBe(60);
    const own = await stats(alice, alice);
    expect(own.totals).toMatchObject({ edit: 60, playtest: 0, longest_session: 60 });
    expect(own.counters).toMatchObject({ notes_placed: 10, maps_created: 1, active_days: 1, maps_edited: 1 });
    const projects = own.projects as Json[];
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ title: "Song", created_in_cascade: true, edit: 60 });
    expect(projects[0].difficulties).toEqual([{ key: "d1", name: "Hard", edit: 60, playtest: 0, review: 0 }]);
  });

  it("counts the same minute once when two windows report it", async () => {
    const window = span(60, 5);
    expect(await record(alice, SESSION_A, [entry()], window)).toBe(60);
    expect(await record(alice, SESSION_B, [entry()], window)).toBe(0);
    expect(((await stats(alice, alice)).totals as Json).edit).toBe(60);
  });

  it("credits two windows that were active one after the other", async () => {
    expect(await record(alice, SESSION_A, [entry({ edit: 30 })], span(30, 60))).toBe(30);
    expect(await record(alice, SESSION_B, [entry({ edit: 30 })], span(30, 30))).toBe(30);
  });

  it("never credits more time than the span the report covers", async () => {
    expect(await record(alice, SESSION_A, [entry({ edit: 600, review: 600 })], span(90, 5))).toBe(90);
    const totals = (await stats(alice, alice)).totals as Json;
    expect(Number(totals.edit) + Number(totals.review)).toBe(90);
  });

  it("refuses spans in the future and days long past", async () => {
    const future: [string, string] = [
      new Date(Date.now() + 60_000).toISOString(),
      new Date(Date.now() + 120_000).toISOString(),
    ];
    expect(await record(alice, SESSION_A, [entry({ notes_placed: 0 })], future)).toBe(0);
    const old = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    expect(await record(alice, SESSION_A, [entry({ day: old })], span(60, 5))).toBe(0);
    const own = await stats(alice, alice);
    expect(own.calendar).toEqual([]);
  });

  it("recovers a report from a crash within the last two days", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    expect(await record(alice, SESSION_A, [entry({ day: yesterday, edit: 45 })], span(45, 86_000))).toBe(45);
    const days = (await stats(alice, alice)).calendar as Json[];
    expect(days.map((d) => d.day)).toEqual([yesterday]);
  });

  it("ignores malformed numbers, project keys and days", async () => {
    const credited = await record(
      alice,
      SESSION_A,
      [
        entry({ edit: "lots", review: 60, notes_placed: -5, project_key: "evil'; drop table users;--" }),
        entry({ day: "not a day", edit: 600 }),
      ],
      span(60, 5),
    );
    expect(credited).toBe(60);
    const own = await stats(alice, alice);
    expect(own.projects).toEqual([]);
    expect(own.counters).toMatchObject({ notes_placed: 0 });
  });

  it("links a cloud project only when the mapper can open it", async () => {
    const mine = await t.createProject(alice, { meta: { title: "Mine" }, difficulties: [] });
    const theirs = await t.createProject(bob, { meta: { title: "Theirs" }, difficulties: [] });
    await record(
      alice,
      SESSION_A,
      [entry({ project_key: `cloud:${mine}`, edit: 30 }), entry({ project_key: `cloud:${theirs}`, edit: 30 })],
      span(60, 5),
    );
    const { rows } = await t.db.query<{ project_key: string; project_id: string | null }>(
      "select project_key, project_id from public.mapping_projects order by project_key",
    );
    const linked = Object.fromEntries(rows.map((r) => [r.project_key, r.project_id]));
    expect(linked[`cloud:${mine}`]).toBe(mine);
    expect(linked[`cloud:${theirs}`]).toBeNull();
  });

  it("shows each part only to the people the mapper allows", async () => {
    await record(alice, SESSION_A, [entry({ beatmapset_id: 123 })], span(60, 5));

    const anon = await stats(null, alice);
    expect(anon.visible).toEqual({ mapping_stats: false, mapping_time: false, project_time: false, projects: false });
    expect(anon.counters).toBeNull();
    expect(anon.totals).toBeNull();
    expect(anon.projects).toBeNull();
    expect(anon.map_times).toBeNull();

    await t.asUser(alice, (tx) =>
      tx.query("select public.set_my_privacy($1::jsonb)", [
        JSON.stringify({ mapping_stats: "everyone", mapping_time: "nobody", project_time: "everyone" }),
      ]),
    );
    const levels = await stats(bob, alice);
    expect(levels.counters).not.toBeNull();
    expect(levels.totals).toBeNull();
    const day = (levels.calendar as Json[])[0];
    expect(day.level).toBe(4);
    expect(day.edit).toBeNull();
    expect(levels.projects).toBeNull();
    expect(levels.map_times).toEqual([
      expect.objectContaining({ beatmapset_id: 123, edit: 60 }),
    ]);
  });

  it("can't be read or written directly", async () => {
    const read = await t.asUser(bob, (tx) => tx.query("select * from public.mapping_days")).catch(dbError);
    expect(read).toMatchObject({ message: expect.stringMatching(/permission denied/) });
    const write = await t
      .asUser(alice, (tx) =>
        tx.query("insert into public.mapping_days (user_id, day, edit_seconds) values ($1, current_date, 99999)", [
          alice,
        ]),
      )
      .catch(dbError);
    expect(write).toMatchObject({ message: expect.stringMatching(/permission denied/) });
  });

  it("lets the mapper clear their own statistics", async () => {
    await record(alice, SESSION_A, [entry()], span(60, 5));
    await t.asUser(alice, (tx) => tx.query("select public.clear_mapping_activity(null)"));
    const own = await stats(alice, alice);
    expect(own.totals).toMatchObject({ edit: 0, longest_session: 0 });
    expect(own.projects).toEqual([]);
  });
});
