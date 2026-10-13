import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Transaction } from "@electric-sql/pglite";
import { createTestDatabase, type TestDatabase } from "../db/database";

/**
 * A stand-in for the Supabase services the editor talks to, backed by a real
 * Postgres (PGlite) with every migration applied. Requests run as the user in
 * their token, under that user's row-level security; Realtime joins and sends
 * are allowed or refused by the actual policies on realtime.messages, as
 * Supabase does for private channels. It is not Supabase: the PostgREST and
 * Realtime protocols are reduced to what the editor's client calls, and its
 * fake client (fakeSupabase.ts) speaks this simpler protocol instead.
 *
 * Tests can hold back, reorder or drop what a window receives, to play out
 * delayed delivery and reconnects.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type Delivery = { type: "broadcast" | "postgres" | "presence"; topic: string; body: Json };

type Connection = {
  id: string;
  label: string;
  userId: string | null;
  res: ServerResponse;
  joined: Map<string, { kind: "realtime" | "postgres" }>;
  presence: Map<string, { key: string; payload: Json }>;
};

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/** The user id in a token the fake client made: an unsigned JWT. */
function userFromToken(header: string | undefined): string | null {
  const token = header?.replace(/^Bearer\s+/i, "");
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string };
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

/** What PostgREST would report for a Postgres error. */
function restError(error: unknown, fn?: string) {
  const raw = error as { code?: string; message?: string };
  if (raw.code === "42883" && fn) {
    return { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache` };
  }
  return { code: raw.code ?? "", message: raw.message ?? String(error) };
}

function param(value: unknown): unknown {
  return value !== null && typeof value === "object" ? JSON.stringify(value) : value;
}

export type Backend = {
  url: string;
  close(): Promise<void>;
};

export async function startBackend(port = 0): Promise<Backend> {
  let db: TestDatabase = await createTestDatabase();
  const connections = new Map<string, Connection>();
  const held = new Map<string, Delivery[]>();
  const holding = new Set<string>();
  const failingSends = new Set<string>();
  const failingRpcs = new Map<string, string>();
  let revisions = new Map<string, number>();
  let nextConnection = 1;

  const asUser = <T>(userId: string | null, run: (tx: Transaction) => Promise<T>) => {
    if (!userId) {
      return db.db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        return run(tx);
      });
    }
    return db.asUser(userId, run);
  };

  const push = (connection: Connection, delivery: Delivery) => {
    if (holding.has(connection.label)) {
      const queue = held.get(connection.label) ?? [];
      queue.push(delivery);
      held.set(connection.label, queue);
      return;
    }
    connection.res.write(`data: ${JSON.stringify(delivery)}\n\n`);
  };

  /** Runs Realtime's own check: can this user read (or write) on `topic`? */
  const realtimeAllows = async (userId: string | null, topic: string, write: boolean) => {
    try {
      return await db.db.transaction(async (tx) => {
        const probe = await tx.query<{ id: number }>(
          "insert into realtime.messages (topic, extension, private) values ($1, 'broadcast', true) returning id",
          [topic],
        );
        if (userId) {
          await tx.query(
            `select set_config('request.jwt.claim.sub', $1, true),
                    set_config('request.jwt.claim.role', 'authenticated', true)`,
            [userId],
          );
        }
        await tx.query("select set_config('realtime.topic', $1, true)", [topic]);
        await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
        const allowed = write
          ? (await tx.query(
              "insert into realtime.messages (topic, extension, private) values ($1, 'broadcast', true) returning id",
              [topic],
            )).rows.length > 0
          : (await tx.query("select 1 from realtime.messages where id = $1", [probe.rows[0].id])).rows.length > 0;
        throw Object.assign(new Error("rollback"), { allowed });
      });
    } catch (error) {
      const allowed = (error as { allowed?: boolean }).allowed;
      return allowed === true;
    }
  };

  const deliverBroadcast = (topic: string, event: string, payload: Json, except: string | null) => {
    for (const connection of connections.values()) {
      if (connection.id === except || connection.joined.get(topic)?.kind !== "realtime") continue;
      push(connection, { type: "broadcast", topic, body: { event, payload } });
    }
  };

  const presenceState = (topic: string) => {
    const state: Record<string, Json[]> = {};
    for (const connection of connections.values()) {
      const tracked = connection.presence.get(topic);
      if (tracked) (state[tracked.key] ??= []).push(tracked.payload);
    }
    return state;
  };

  const syncPresence = (topic: string) => {
    const state = presenceState(topic);
    for (const connection of connections.values()) {
      if (connection.joined.get(topic)?.kind === "realtime") {
        push(connection, { type: "presence", topic, body: state as Json });
      }
    }
  };

  /** Postgres Changes for projects: one UPDATE per new revision. */
  const announceProjectChanges = async () => {
    const { rows } = await db.db.query<{ id: string; revision: number; last_mutation_id: string | null; updated_by: string | null }>(
      "select id, revision::int as revision, last_mutation_id, updated_by from public.projects",
    );
    for (const row of rows) {
      if (revisions.get(row.id) === row.revision) continue;
      const known = revisions.has(row.id);
      revisions.set(row.id, row.revision);
      if (!known) continue;
      const topic = `project-sync:${row.id}`;
      for (const connection of connections.values()) {
        if (connection.joined.get(topic)?.kind !== "postgres") continue;
        const visible = await asUser(connection.userId, (tx) =>
          tx.query<{ ok: boolean }>("select public.can_view_project($1) as ok", [row.id]),
        );
        if (!visible.rows[0]?.ok) continue;
        push(connection, {
          type: "postgres",
          topic,
          body: { eventType: "UPDATE", table: "projects", new: row as unknown as Json, old: {} },
        });
      }
    }
  };

  const scalarFunctions = new Map<string, boolean>();
  const returnsScalar = async (fn: string) => {
    const known = scalarFunctions.get(fn);
    if (known !== undefined) return known;
    const { rows } = await db.db.query<{ scalar: boolean }>(
      `select not p.proretset and t.typtype <> 'c' and p.prorettype <> 'record'::regtype
                and p.prorettype <> 'void'::regtype as scalar
         from pg_proc p join pg_type t on t.oid = p.prorettype
        where p.proname = $1 and p.pronamespace = 'public'::regnamespace
        limit 1`,
      [fn],
    );
    const scalar = rows[0]?.scalar ?? false;
    scalarFunctions.set(fn, scalar);
    return scalar;
  };

  /**
   * Postgres Changes for messages: each new or changed row goes to every
   * window subscribed to its message inbox that may read the row, as
   * Realtime filters changes through row-level security.
   */
  let messageVersions = new Map<string, string>();
  const announceMessageChanges = async () => {
    // A database migrated only part of the way has no messages yet.
    const exists = await db.db.query<{ t: string | null }>("select to_regclass('public.messages')::text as t");
    if (!exists.rows[0]?.t) return;
    const { rows } = await db.db.query<Record<string, Json> & { id: string }>(
      "select id, conversation_id, sender, body, reply_to, created_at, edited_at, deleted_at, reactions from public.messages",
    );
    for (const row of rows) {
      const version = `${row.edited_at ?? ""}|${row.deleted_at ?? ""}|${JSON.stringify(row.reactions)}`;
      const before = messageVersions.get(row.id);
      if (before === version) continue;
      messageVersions.set(row.id, version);
      for (const connection of connections.values()) {
        for (const [topic, joined] of connection.joined) {
          if (joined.kind !== "postgres" || !topic.startsWith("messages-inbox:")) continue;
          const visible = await asUser(connection.userId, (tx) =>
            tx.query("select 1 from public.messages where id = $1", [row.id]),
          );
          if (!visible.rows.length) continue;
          push(connection, {
            type: "postgres",
            topic,
            body: { eventType: before === undefined ? "INSERT" : "UPDATE", table: "messages", new: row as Json, old: {} },
          });
        }
      }
    }
  };

  const remember = async () => {
    const { rows } = await db.db.query<{ id: string; revision: number }>(
      "select id, revision::int as revision from public.projects",
    );
    revisions = new Map(rows.map((row) => [row.id, row.revision]));
  };

  const rpc = async (userId: string | null, fn: string, args: Record<string, unknown>) => {
    if (!IDENTIFIER.test(fn)) return { error: { code: "PGRST202", message: "bad function" } };
    const names = Object.keys(args);
    if (!names.every((name) => IDENTIFIER.test(name))) return { error: { code: "400", message: "bad args" } };
    const failure = failingRpcs.get(fn);
    if (failure) return { error: { code: "", message: failure } };
    const sql = `select * from public.${fn}(${names.map((name, i) => `${name} => $${i + 1}`).join(", ")})`;
    try {
      const result = await asUser(userId, (tx) => tx.query(sql, names.map((name) => param(args[name]))));
      await announceProjectChanges();
      await announceMessageChanges();
      // PostgREST answers a function returning one plain value with the
      // value itself, not a row.
      if (await returnsScalar(fn)) {
        const row = result.rows[0] as Record<string, unknown> | undefined;
        return { data: row ? (Object.values(row)[0] ?? null) : null };
      }
      return { data: result.rows };
    } catch (error) {
      return { error: restError(error, fn) };
    }
  };

  type Filter = [string, "eq" | "in" | "lt", unknown];
  const table = async (
    userId: string | null,
    request: {
      table: string;
      action: "select" | "update" | "insert";
      columns?: string;
      filters?: Filter[];
      order?: { column: string; ascending: boolean } | null;
      limit?: number | null;
      values?: Record<string, unknown>;
      single?: "single" | "maybe" | null;
    },
  ) => {
    const columns = (request.columns ?? "*").split(",").map((c) => c.trim()).filter(Boolean);
    if (!IDENTIFIER.test(request.table) || !columns.every((c) => c === "*" || IDENTIFIER.test(c))) {
      return { error: { code: "400", message: "bad query" } };
    }
    const params: unknown[] = [];
    const where = (request.filters ?? []).map(([column, op, value]) => {
      if (!IDENTIFIER.test(column)) throw new Error("bad filter");
      if (op === "in") {
        params.push((value as unknown[]).map(String));
        return `${column}::text = any($${params.length}::text[])`;
      }
      if (op === "lt") {
        params.push(value);
        return `${column} < $${params.length}`;
      }
      params.push(String(value));
      return `${column}::text = $${params.length}::text`;
    });
    const whereSql = where.length ? ` where ${where.join(" and ")}` : "";
    const list = columns.join(", ");
    let sql: string;
    if (request.action === "select") {
      const order = request.order;
      if (order && !IDENTIFIER.test(order.column)) return { error: { code: "400", message: "bad order" } };
      const orderSql = order ? ` order by ${order.column} ${order.ascending ? "asc" : "desc"}` : "";
      const limitSql =
        typeof request.limit === "number" && Number.isInteger(request.limit) && request.limit > 0
          ? ` limit ${request.limit}`
          : "";
      sql = `select ${list} from public.${request.table}${whereSql}${orderSql}${limitSql}`;
    } else {
      const entries = Object.entries(request.values ?? {});
      if (!entries.every(([key]) => IDENTIFIER.test(key))) return { error: { code: "400", message: "bad values" } };
      const placeholders = entries.map(([, value]) => {
        params.push(param(value));
        return `$${params.length}`;
      });
      sql =
        request.action === "update"
          ? `update public.${request.table} set ${entries.map(([key], i) => `${key} = ${placeholders[i]}`).join(", ")}${whereSql} returning ${list}`
          : `insert into public.${request.table} (${entries.map(([key]) => key).join(", ")}) values (${placeholders.join(", ")}) returning ${list}`;
    }
    try {
      const result = await asUser(userId, (tx) => tx.query<Record<string, unknown>>(sql, params));
      if (request.action !== "select") await announceProjectChanges();
      const rows = result.rows;
      if (request.single === "single") {
        if (rows.length !== 1) {
          return { error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
        }
        return { data: rows[0] };
      }
      if (request.single === "maybe") return { data: rows[0] ?? null };
      return { data: rows };
    } catch (error) {
      return { error: restError(error) };
    }
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://backend");
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      });
      res.end();
      return;
    }
    const userId = userFromToken(req.headers.authorization);
    try {
      if (req.method === "GET" && url.pathname === "/realtime") {
        const connection: Connection = {
          id: `c${nextConnection++}`,
          label: url.searchParams.get("label") ?? "",
          userId: userFromToken(`Bearer ${url.searchParams.get("token") ?? ""}`),
          res,
          joined: new Map(),
          presence: new Map(),
        };
        connections.set(connection.id, connection);
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        });
        res.write(`event: hello\ndata: ${JSON.stringify({ id: connection.id })}\n\n`);
        req.on("close", () => {
          connections.delete(connection.id);
          for (const topic of connection.presence.keys()) syncPresence(topic);
        });
        return;
      }
      const body = req.method === "POST" ? await readJson(req) : {};
      switch (url.pathname) {
        case "/rpc":
          return send(res, 200, await rpc(userId, String(body.fn), (body.args ?? {}) as Record<string, unknown>));
        case "/table":
          return send(res, 200, await table(userId, body as Parameters<typeof table>[1]));
        case "/realtime/join": {
          const connection = connections.get(String(body.connection));
          const topic = String(body.topic);
          if (!connection) return send(res, 200, { ok: false, error: "not connected" });
          const kind = body.kind === "postgres" ? "postgres" : "realtime";
          if (body.private && kind === "realtime" && !(await realtimeAllows(connection.userId, topic, false))) {
            return send(res, 200, { ok: false, error: "Unauthorized: You do not have permissions to read from this Channel topic" });
          }
          connection.joined.set(topic, { kind });
          if (kind === "realtime") syncPresence(topic);
          return send(res, 200, { ok: true });
        }
        case "/realtime/leave": {
          const connection = connections.get(String(body.connection));
          const topic = String(body.topic);
          connection?.joined.delete(topic);
          if (connection?.presence.delete(topic)) syncPresence(topic);
          return send(res, 200, { ok: true });
        }
        case "/realtime/send": {
          const connection = connections.get(String(body.connection));
          const topic = String(body.topic);
          if (!connection || connection.joined.get(topic)?.kind !== "realtime") return send(res, 200, { ok: false });
          if (failingSends.has(connection.label)) return send(res, 200, { ok: false });
          if (!(await realtimeAllows(connection.userId, topic, true))) return send(res, 200, { ok: false });
          deliverBroadcast(topic, String(body.event), body.payload as Json, connection.id);
          return send(res, 200, { ok: true });
        }
        case "/realtime/v1/api/broadcast": {
          // Supabase's REST broadcast: delivered to every subscriber of the
          // topic, the sending window included.
          const messages = (body.messages ?? []) as { topic: string; event: string; payload: Json }[];
          for (const message of messages) {
            if (!(await realtimeAllows(userId, message.topic, true))) return send(res, 403, { error: "forbidden" });
          }
          for (const message of messages) deliverBroadcast(message.topic, message.event, message.payload, null);
          return send(res, 202, {});
        }
        case "/realtime/track": {
          const connection = connections.get(String(body.connection));
          const topic = String(body.topic);
          if (!connection) return send(res, 200, { ok: false });
          if (body.payload === null) connection.presence.delete(topic);
          else connection.presence.set(topic, { key: String(body.key), payload: body.payload as Json });
          syncPresence(topic);
          return send(res, 200, { ok: true });
        }
        // Test controls.
        case "/__test/reset": {
          await db.close();
          db = await createTestDatabase(typeof body.through === "string" ? { through: body.through } : {});
          for (const connection of connections.values()) connection.res.end();
          connections.clear();
          held.clear();
          holding.clear();
          failingSends.clear();
          failingRpcs.clear();
          revisions = new Map();
          messageVersions = new Map();
          scalarFunctions.clear();
          return send(res, 200, { ok: true });
        }
        case "/__test/user":
          return send(res, 200, { id: await db.createUser(String(body.username)) });
        case "/__test/project": {
          const id = await db.createProject(String(body.owner), body.data);
          for (const [userId, role] of Object.entries((body.share ?? {}) as Record<string, "editor" | "viewer">)) {
            await db.share(id, userId, role);
          }
          await remember();
          return send(res, 200, { id });
        }
        case "/__test/project-data": {
          const { rows } = await db.db.query<{ data: Json; revision: number }>(
            "select data, revision::int as revision from public.projects where id = $1",
            [String(body.id)],
          );
          return send(res, 200, rows[0] ?? null);
        }
        case "/__test/sql": {
          const result = await db.db.query(String(body.sql), (body.params ?? []) as unknown[]);
          await announceProjectChanges();
          return send(res, 200, { rows: result.rows });
        }
        case "/__test/hold":
          holding.add(String(body.label));
          return send(res, 200, { ok: true });
        case "/__test/release": {
          const label = String(body.label);
          holding.delete(label);
          const queue = held.get(label) ?? [];
          held.delete(label);
          if (body.reverse) queue.reverse();
          const keep = body.drop ? [] : queue;
          for (const connection of connections.values()) {
            if (connection.label !== label) continue;
            for (const delivery of keep) {
              if (connection.joined.has(delivery.topic)) push(connection, delivery);
            }
          }
          return send(res, 200, { released: keep.length });
        }
        case "/__test/fail-sends":
          if (body.on) failingSends.add(String(body.label));
          else failingSends.delete(String(body.label));
          return send(res, 200, { ok: true });
        case "/__test/fail-rpc":
          if (typeof body.message === "string") failingRpcs.set(String(body.fn), body.message);
          else failingRpcs.delete(String(body.fn));
          return send(res, 200, { ok: true });
        case "/__test/disconnect": {
          for (const connection of [...connections.values()]) {
            if (connection.label === String(body.label)) connection.res.end();
          }
          return send(res, 200, { ok: true });
        }
        default:
          return send(res, 404, { error: "not found" });
      }
    } catch (error) {
      return send(res, 500, { error: String(error) });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      for (const connection of connections.values()) connection.res.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}
