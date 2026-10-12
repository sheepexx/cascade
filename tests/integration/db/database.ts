import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const SHIM = fileURLToPath(new URL("./supabaseShim.sql", import.meta.url));

export type Role = "owner" | "editor" | "viewer";

export type DbError = { code: string; message: string };

/** A Postgres error as PostgREST would report it, or null when the call worked. */
export function dbError(error: unknown): DbError | null {
  if (!error) return null;
  const raw = error as { code?: unknown; message?: unknown };
  return {
    code: typeof raw.code === "string" ? raw.code : "",
    message: typeof raw.message === "string" ? raw.message : String(error),
  };
}

export type TestDatabase = {
  db: PGlite;
  /** Runs `run` as a signed-in user, with that user's row-level security. */
  asUser<T>(userId: string, run: (tx: Transaction) => Promise<T>): Promise<T>;
  createUser(username: string): Promise<string>;
  createProject(owner: string, data: unknown): Promise<string>;
  share(projectId: string, userId: string, role: Exclude<Role, "owner">): Promise<void>;
  close(): Promise<void>;
};

let osuIds = 1000;

/**
 * A real Postgres (PGlite) with every migration applied in order, so tests run
 * against the same functions, triggers and row-level security as production.
 * `through` stops after the named migration, to test a database a deploy has
 * not migrated yet.
 */
export async function createTestDatabase(
  options: { through?: string } = {},
): Promise<TestDatabase> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(readFileSync(SHIM, "utf8"));
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    if (options.through && file > options.through) break;
    await db.exec(readFileSync(`${MIGRATIONS}${file}`, "utf8"));
  }

  const asUser = <T>(userId: string, run: (tx: Transaction) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.query(
        `select set_config('request.jwt.claim.sub', $1, true),
                set_config('request.jwt.claim.role', 'authenticated', true)`,
        [userId],
      );
      await tx.exec("set local role authenticated");
      return run(tx);
    });

  return {
    db,
    asUser,
    async createUser(username) {
      const { rows } = await db.query<{ id: string }>(
        "insert into public.users (osu_id, username) values ($1, $2) returning id",
        [osuIds++, username],
      );
      return rows[0].id;
    },
    async createProject(owner, data) {
      return asUser(owner, async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `insert into public.projects (owner, title, data)
           values ($1, coalesce($2::jsonb #>> '{meta,title}', 'Untitled'), $2::jsonb)
           returning id`,
          [owner, JSON.stringify(data)],
        );
        return rows[0].id;
      });
    },
    async share(projectId, userId, role) {
      await db.query(
        "insert into public.project_collaborators (project_id, user_id, role) values ($1, $2, $3)",
        [projectId, userId, role],
      );
    },
    close: () => db.close(),
  };
}
