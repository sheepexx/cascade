import type { PGlite } from "@electric-sql/pglite";

/**
 * Just enough of PostgREST for the Worker's database calls: `POST
 * /rest/v1/rpc/<function>` runs the function with named arguments, as the
 * role in the request's token (service_role for the service key, anon for an
 * anonymous token), against the real migrations. Other REST calls the Worker
 * makes on the side (cache upserts) are acknowledged and dropped.
 */

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function roleOf(authorization: string | null, serviceKey: string): "service_role" | "anon" | null {
  const token = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  if (token === serviceKey) return "service_role";
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: string };
    return claims.role === "anon" ? "anon" : null;
  } catch {
    return null;
  }
}

function reply(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function postgrest(db: PGlite, serviceKey: string) {
  return async (url: URL, init: RequestInit | undefined): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const role = roleOf(headers.get("Authorization"), serviceKey);
    if (!role) return reply(401, { message: "JWT invalid" });
    const rpc = /^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/.exec(url.pathname);
    if (!rpc) return reply(201, undefined);

    const fn = rpc[1];
    const args = (init?.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>;
    const names = Object.keys(args);
    if (!names.every((name) => IDENTIFIER.test(name))) return reply(400, { message: "bad argument" });
    const call = names.map((name, i) => `${name} => $${i + 1}`).join(", ");
    try {
      const value = await db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        const { rows } = await tx.query<{ v: unknown }>(
          `select to_json(public.${fn}(${call})) as v`,
          names.map((name) => {
            const value = args[name];
            return value !== null && typeof value === "object" ? JSON.stringify(value) : value;
          }),
        );
        return rows[0]?.v ?? null;
      });
      return reply(200, value);
    } catch (error) {
      const raw = error as { code?: string; message?: string };
      if (raw.code === "42883") {
        return reply(404, { code: "PGRST202", message: `Could not find the function public.${fn}` });
      }
      return reply(400, { code: raw.code ?? "", message: raw.message ?? String(error) });
    }
  };
}
