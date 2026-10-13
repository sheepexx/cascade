import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, dbError, type TestDatabase } from "./database";

/** Usage events per browser (migration 0040), counted in the database. */

describe("admin browser stats", () => {
  let t: TestDatabase;
  let alice: string;
  let admin: string;

  beforeEach(async () => {
    t = await createTestDatabase();
    alice = await t.createUser("alice");
    admin = await t.createUser("admin");
    await t.db.query("update public.users set is_admin = true where id = $1", [admin]);
  });
  afterEach(() => t.close());

  const stats = (userId: string) =>
    t.asUser(userId, (tx) =>
      tx.query<{ browser: string; events: number }>("select * from public.admin_browser_stats()"),
    );

  it("counts every event, past the 1000 rows one request returns", async () => {
    await t.db.query(
      `insert into public.analytics_events (event_type, browser, platform)
       select 'app_opened', 'Chrome', 'web' from generate_series(1, 1500)`,
    );
    await t.db.query(
      `insert into public.analytics_events (event_type, browser, platform) values
         ('app_opened', 'Firefox', 'web'),
         ('app_opened', 'Firefox', 'web'),
         ('app_opened', '', 'web'),
         ('app_opened', 'Edge', 'desktop'),
         ('app_opened', 'Unknown', 'desktop')`,
    );
    expect((await stats(admin)).rows).toEqual([
      { browser: "Chrome", events: 1500 },
      { browser: "Desktop app", events: 2 },
      { browser: "Firefox", events: 2 },
      { browser: "Unknown", events: 1 },
    ]);
  });

  it("is for admins only", async () => {
    let error: unknown = null;
    await stats(alice).catch((e: unknown) => (error = e));
    expect(dbError(error)?.message).toMatch(/admin access required/);
  });
});
