import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { createTestDatabase, dbError, type TestDatabase } from "./database";

/** 1-10 ratings (migration 0039) under the real row-level security. */

const asAnon = <T>(t: TestDatabase, run: (tx: Transaction) => Promise<T>) =>
  t.db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    return run(tx);
  });

const submit = (tx: Transaction, question: string, score: number, comment: string | null = null) =>
  tx.query("select public.submit_feedback_rating($1, $2, $3, '1.2.440', 'web')", [question, score, comment]);

async function failure(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return dbError(error);
  }
  return null;
}

describe("feedback ratings", () => {
  let t: TestDatabase;
  let alice: string;
  let bob: string;
  let admin: string;

  beforeEach(async () => {
    t = await createTestDatabase();
    alice = await t.createUser("alice");
    bob = await t.createUser("bob");
    admin = await t.createUser("admin");
    await t.db.query("update public.users set is_admin = true where id = $1", [admin]);
  });
  afterEach(() => t.close());

  const all = () =>
    t.db.query<{ user_id: string | null; author_username: string | null; question: string; score: number; comment: string | null }>(
      "select user_id, author_username, question, score, comment from public.feedback_ratings order by created_at",
    );

  it("takes a rating from someone signed out, with no account attached", async () => {
    await asAnon(t, (tx) => submit(tx, "recommend", 8, "  Fast and clean  "));
    expect((await all()).rows).toEqual([
      { user_id: null, author_username: null, question: "recommend", score: 8, comment: "Fast and clean" },
    ]);
  });

  it("ties a signed-in rating to the account, and keeps the first answer to a question", async () => {
    await t.asUser(alice, (tx) => submit(tx, "recommend", 9));
    await t.asUser(alice, (tx) => submit(tx, "recommend", 2));
    await t.asUser(alice, (tx) => submit(tx, "reliability", 6, ""));
    expect((await all()).rows).toEqual([
      { user_id: alice, author_username: "alice", question: "recommend", score: 9, comment: null },
      { user_id: alice, author_username: "alice", question: "reliability", score: 6, comment: null },
    ]);
  });

  it("lets people read only their own ratings, and admins read all", async () => {
    await t.asUser(alice, (tx) => submit(tx, "recommend", 9));
    await t.asUser(bob, (tx) => submit(tx, "workflow", 4));
    await asAnon(t, (tx) => submit(tx, "missing", 7));
    const select = "select question from public.feedback_ratings order by question";
    expect((await t.asUser(alice, (tx) => tx.query(select))).rows).toEqual([{ question: "recommend" }]);
    expect((await t.asUser(admin, (tx) => tx.query(select))).rows).toHaveLength(3);
    const anon = await failure(() => asAnon(t, (tx) => tx.query(select)));
    expect(anon?.code).toBe("42501");
  });

  it("refuses scores outside 1-10, unknown questions and direct writes", async () => {
    for (const [question, score] of [["recommend", 0], ["recommend", 11], ["mood", 5]] as const) {
      expect(await failure(() => t.asUser(alice, (tx) => submit(tx, question, score)))).not.toBeNull();
    }
    const direct = await failure(() =>
      t.asUser(alice, (tx) =>
        tx.query("insert into public.feedback_ratings (user_id, question, score) values ($1, 'recommend', 10)", [bob]),
      ),
    );
    expect(direct?.code).toBe("42501");
    const tooLong = await failure(() => t.asUser(alice, (tx) => submit(tx, "recommend", 5, "x".repeat(2001))));
    expect(tooLong).not.toBeNull();
    expect((await all()).rows).toHaveLength(0);
  });

  it("caps a flood of signed-out ratings but not signed-in ones", async () => {
    for (let i = 0; i < 50; i++) await asAnon(t, (tx) => submit(tx, "recommend", 5));
    const flood = await failure(() => asAnon(t, (tx) => submit(tx, "recommend", 5)));
    expect(flood?.code).toBe("PT429");
    await t.asUser(alice, (tx) => submit(tx, "recommend", 5));
    expect((await all()).rows).toHaveLength(51);
  });
});
