import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { createTestDatabase, dbError, type TestDatabase } from "./database";

/**
 * The chart save functions against the real migrations: the revision check
 * (0038), what each role may do, and what an older client or an older
 * database still gets.
 */

const chart = (label: string) => ({
  meta: { title: "Song", artist: "Artist", creator: "Mapper" },
  timingPoints: [],
  difficulties: [],
  label,
});

const SHA = "a".repeat(64);

type Ids = { owner: string; editor: string; viewer: string; stranger: string; project: string };

async function seed(t: TestDatabase): Promise<Ids> {
  const owner = await t.createUser("owner");
  const editor = await t.createUser("editor");
  const viewer = await t.createUser("viewer");
  const stranger = await t.createUser("stranger");
  const project = await t.createProject(owner, chart("first"));
  await t.share(project, editor, "editor");
  await t.share(project, viewer, "viewer");
  return { owner, editor, viewer, stranger, project };
}

async function stored(t: TestDatabase, project: string) {
  const { rows } = await t.db.query<{ label: string; revision: number }>(
    "select data->>'label' as label, revision::int as revision from public.projects where id = $1",
    [project],
  );
  return rows[0];
}

const saveSnapshot = (tx: Transaction, project: string, label: string, expected: number | null) =>
  tx.query<{ revision: number }>(
    `select revision::int as revision
       from public.save_project_snapshot(
         p_project => $1, p_data => $2::jsonb,
         p_mutation_id => gen_random_uuid(), p_expected_revision => $3)`,
    [project, JSON.stringify(chart(label)), expected],
  );

const assetRow = (project: string) => ({
  kind: "audio",
  filename: "audio.mp3",
  storage_path: `${project}/${SHA}.mp3`,
  sha256: SHA,
  bytes: 10,
});

const saveWithAssets = (tx: Transaction, project: string, label: string, expected: number) =>
  tx.query<{ revision: number }>(
    `select revision::int as revision
       from public.save_project_with_assets(
         p_project => $1, p_assets => $2::jsonb, p_data => $3::jsonb,
         p_mutation_id => gen_random_uuid(), p_expected_revision => $4)`,
    [project, JSON.stringify([assetRow(project)]), JSON.stringify(chart(label)), expected],
  );

async function failure(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return dbError(error);
  }
  return null;
}

describe("chart saves with a revision check", () => {
  let t: TestDatabase;
  let ids: Ids;

  beforeEach(async () => {
    t = await createTestDatabase();
    ids = await seed(t);
  });
  afterEach(() => t.close());

  it("refuses a stale snapshot instead of overwriting a newer one", async () => {
    const start = (await stored(t, ids.project)).revision;
    // Both editors loaded `start`; the owner saves first.
    await t.asUser(ids.owner, (tx) => saveSnapshot(tx, ids.project, "owner", start));
    const stale = await failure(() =>
      t.asUser(ids.editor, (tx) => saveSnapshot(tx, ids.project, "editor-stale", start)),
    );
    expect(stale).toEqual({ code: "PT409", message: "project revision conflict" });
    expect(await stored(t, ids.project)).toEqual({ label: "owner", revision: start + 1 });

    // Merged against the newer revision, the editor's save goes through.
    const saved = await t.asUser(ids.editor, (tx) =>
      saveSnapshot(tx, ids.project, "merged", start + 1),
    );
    expect(saved.rows[0].revision).toBe(start + 2);
    expect(await stored(t, ids.project)).toEqual({ label: "merged", revision: start + 2 });
  });

  it("refuses a save without a revision", async () => {
    const error = await failure(() =>
      t.asUser(ids.owner, (tx) => saveSnapshot(tx, ids.project, "x", null)),
    );
    expect(error?.code).toBe("22023");
  });

  it("checks the revision before switching the asset manifest", async () => {
    const start = (await stored(t, ids.project)).revision;
    await t.asUser(ids.owner, (tx) => saveSnapshot(tx, ids.project, "owner", start));
    const stale = await failure(() =>
      t.asUser(ids.editor, (tx) => saveWithAssets(tx, ids.project, "stale", start)),
    );
    expect(stale?.code).toBe("PT409");
    const { rows } = await t.db.query("select * from public.project_assets where project_id = $1", [ids.project]);
    expect(rows).toHaveLength(0);
    expect((await stored(t, ids.project)).label).toBe("owner");

    await t.asUser(ids.editor, (tx) => saveWithAssets(tx, ids.project, "with-assets", start + 1));
    expect(await stored(t, ids.project)).toEqual({ label: "with-assets", revision: start + 2 });
    const after = await t.db.query("select filename from public.project_assets where project_id = $1", [ids.project]);
    expect(after.rows).toEqual([{ filename: "audio.mp3" }]);
  });

  it("lets the owner and editors save, and refuses viewers and strangers", async () => {
    let revision = (await stored(t, ids.project)).revision;
    for (const user of [ids.owner, ids.editor]) {
      await t.asUser(user, (tx) => saveSnapshot(tx, ids.project, user, revision));
      revision += 1;
      await t.asUser(user, (tx) => saveWithAssets(tx, ids.project, `${user}-assets`, revision));
      revision += 1;
    }
    for (const user of [ids.viewer, ids.stranger]) {
      for (const save of [
        (tx: Transaction) => saveSnapshot(tx, ids.project, "nope", revision),
        (tx: Transaction) => saveWithAssets(tx, ids.project, "nope", revision),
      ]) {
        const error = await failure(() => t.asUser(user, save));
        expect(error?.message).toBe("project edit access required");
      }
      // Row-level security hides the row from a direct update as well.
      const direct = await t.asUser(user, (tx) =>
        tx.query("update public.projects set title = 'x' where id = $1 returning id", [ids.project]),
      );
      expect(direct.rows).toHaveLength(0);
    }
    expect(await stored(t, ids.project)).toEqual({ label: `${ids.editor}-assets`, revision });
  });

  it("refuses the unchecked 0033 functions an older client calls", async () => {
    const before = await stored(t, ids.project);
    const snapshot = await failure(() =>
      t.asUser(ids.owner, (tx) =>
        tx.query("select * from public.save_project_snapshot($1, $2::jsonb, gen_random_uuid())", [
          ids.project,
          JSON.stringify(chart("legacy")),
        ]),
      ),
    );
    expect(snapshot?.code).toBe("PT426");
    expect(snapshot?.message).toMatch(/Reload the page or update the app/);
    const withAssets = await failure(() =>
      t.asUser(ids.owner, (tx) =>
        tx.query(
          "select * from public.save_project_with_assets($1, $2::jsonb, $3::jsonb, gen_random_uuid())",
          [ids.project, "[]", JSON.stringify(chart("legacy"))],
        ),
      ),
    );
    expect(withAssets?.code).toBe("PT426");
    expect(await stored(t, ids.project)).toEqual(before);
  });

  it("refuses a signed-in user's direct chart update but allows other columns", async () => {
    const before = await stored(t, ids.project);
    const direct = await failure(() =>
      t.asUser(ids.editor, (tx) =>
        tx.query("update public.projects set data = $2::jsonb where id = $1", [
          ids.project,
          JSON.stringify(chart("direct")),
        ]),
      ),
    );
    expect(direct?.code).toBe("PT426");
    expect(await stored(t, ids.project)).toEqual(before);
    await t.asUser(ids.owner, (tx) =>
      tx.query("update public.projects set title = 'Renamed' where id = $1", [ids.project]),
    );
    const { rows } = await t.db.query<{ title: string }>("select title from public.projects where id = $1", [ids.project]);
    expect(rows[0].title).toBe("Renamed");
  });

  it("still lets maintenance without a user write the chart", async () => {
    await t.db.query("update public.projects set data = $2::jsonb where id = $1", [
      ids.project,
      JSON.stringify(chart("maintenance")),
    ]);
    expect((await stored(t, ids.project)).label).toBe("maintenance");
  });
});

describe("migration 0038 on an existing database", () => {
  it("keeps existing projects and can run twice", async () => {
    const t = await createTestDatabase({ through: "0037_usage_milestones.sql" });
    const ids = await seed(t);
    await t.asUser(ids.owner, (tx) =>
      tx.query("select * from public.save_project_snapshot($1, $2::jsonb, gen_random_uuid())", [
        ids.project,
        JSON.stringify(chart("before-0038")),
      ]),
    );
    const before = await stored(t, ids.project);
    const migration = readFileSync(
      fileURLToPath(new URL("../../../supabase/migrations/0038_snapshot_revision_check.sql", import.meta.url)),
      "utf8",
    );
    await t.db.exec(migration);
    await t.db.exec(migration);
    expect(await stored(t, ids.project)).toEqual(before);
    await t.asUser(ids.editor, (tx) => saveSnapshot(tx, ids.project, "after", before.revision));
    expect(await stored(t, ids.project)).toEqual({ label: "after", revision: before.revision + 1 });
    await t.close();
  });

  it("before 0038, a revision-guarded update is the client's safe fallback", async () => {
    const t = await createTestDatabase({ through: "0037_usage_milestones.sql" });
    const ids = await seed(t);
    const missing = await failure(() =>
      t.asUser(ids.owner, (tx) => saveSnapshot(tx, ids.project, "x", 0)),
    );
    expect(missing?.code).toBe("42883");
    const guarded = (user: string, label: string, expected: number) =>
      t.asUser(user, (tx) =>
        tx.query<{ revision: number }>(
          `update public.projects set data = $2::jsonb, last_mutation_id = gen_random_uuid()
            where id = $1 and revision = $3 returning revision::int as revision`,
          [ids.project, JSON.stringify(chart(label)), expected],
        ),
      );
    const start = (await stored(t, ids.project)).revision;
    expect((await guarded(ids.owner, "owner", start)).rows).toEqual([{ revision: start + 1 }]);
    expect((await guarded(ids.editor, "stale", start)).rows).toEqual([]);
    expect(await stored(t, ids.project)).toEqual({ label: "owner", revision: start + 1 });
    await t.close();
  });
});
