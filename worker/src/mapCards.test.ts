import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleMapCardRoute,
  handleStorageRoute,
  pngDimensions,
  type StorageAuthContext,
  type WorkerEnv,
} from "./storage";

const owner = "6994f386-9685-416b-91c1-a9e47880d799";
const stranger = "15dfbb4a-41d7-4a90-8213-3cb62649ae91";
const auth: StorageAuthContext = { uid: owner, isAdmin: false, supabaseToken: "user-token" };

afterEach(() => {
  vi.unstubAllGlobals();
});

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(48);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "a0f1d7a2-8f53-4b61-9d9e-5b7f7f1c2d3e",
    user_id: owner,
    slug: "abcdefghjk",
    map_key: "osu-4123",
    storage_path: "cards/abcdefghjk.png",
    bytes: 48,
    width: 1600,
    height: 1032,
    version: 1,
    updated_at: "2026-09-24T12:00:00Z",
    ...overrides,
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Bucket = {
  put: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  head: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function makeEnv(bucket: Partial<Bucket> = {}): WorkerEnv & { bucket: Bucket } {
  const full: Bucket = {
    put: bucket.put ?? vi.fn(async (key: string, value: Uint8Array) => ({ key, size: value.byteLength })),
    get: bucket.get ?? vi.fn(async () => null),
    head: bucket.head ?? vi.fn(async () => null),
    delete: bucket.delete ?? vi.fn(async () => undefined),
  };
  const r2 = full as unknown as R2Bucket;
  return {
    bucket: full,
    PROJECT_ASSETS: r2,
    SHARED_ASSETS: r2,
    CLIENT_ID: "60987",
    FRONTEND_URL: "https://cascade.sheepex.net",
    OSU_REDIRECT_URI: "https://mania-editor.noahcraft01.workers.dev/auth/osu/callback",
    SUPABASE_URL: "https://splqsxhwdusjeqthinxz.supabase.co",
    SUPABASE_STORAGE_FALLBACK: "false",
    SUPABASE_STORAGE_ALLOWANCE_BYTES: "1073741824",
    R2_STORAGE_ALLOWANCE_BYTES: "10737418240",
    MAX_ASSET_BYTES: "62914560",
    CLIENT_SECRET: "client-secret",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SUPABASE_JWT_SECRET: "jwt-secret",
    COOKIE_SECRET: "cookie-secret",
  };
}

function upload(body: Uint8Array | string, contentType = "image/png", key = "osu-4123"): Request {
  const size = typeof body === "string" ? body.length : body.byteLength;
  return new Request(`https://worker.test/storage/cards?key=${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Length": String(size), "Content-Type": contentType },
    body,
  });
}

async function route(
  req: Request,
  env: WorkerEnv,
  who: StorageAuthContext | null = auth,
): Promise<Response> {
  const response = await handleStorageRoute(req, new URL(req.url), env, async () => who);
  if (!response) throw new Error("route not handled");
  return response;
}

describe("png header parsing", () => {
  it("reads the IHDR size and rejects anything else", () => {
    expect(pngDimensions(png(1600, 1032))).toEqual({ width: 1600, height: 1032 });
    expect(pngDimensions(new TextEncoder().encode("<svg onload=alert(1)>".padEnd(40)))).toBeNull();
    expect(pngDimensions(png(0, 10))).toBeNull();
    expect(pngDimensions(png(10, 10).subarray(0, 20))).toBeNull();
  });
});

describe("map card upload", () => {
  it("requires a signed-in user", async () => {
    const env = makeEnv();
    const response = await route(upload(png(10, 10)), env, null);
    expect(response.status).toBe(401);
    expect(env.bucket.put).not.toHaveBeenCalled();
  });

  it("only accepts real PNG images", async () => {
    const env = makeEnv();
    vi.stubGlobal("fetch", vi.fn(async () => json([])));
    expect((await route(upload(png(10, 10), "image/svg+xml"), env)).status).toBe(415);
    expect((await route(upload("not a png at all, just some text"), env)).status).toBe(415);
    expect((await route(upload(png(5000, 10)), env)).status).toBe(415);
    expect(env.bucket.put).not.toHaveBeenCalled();
  });

  it("rejects keys outside the allowed alphabet", async () => {
    const env = makeEnv();
    const response = await route(upload(png(10, 10), "image/png", "../../etc"), env);
    expect(response.status).toBe(400);
  });

  it("creates a row, then stores the image under a fresh slug", async () => {
    const env = makeEnv();
    const calls: { method: string; url: string; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method, url, body });
        if (method === "POST") {
          return json([row({ slug: body.slug, storage_path: body.storage_path })], 201);
        }
        return json([]);
      }),
    );

    const response = await route(upload(png(1600, 1032)), env);

    expect(response.status).toBe(200);
    const { card } = (await response.json()) as { card: Record<string, unknown> };
    expect(card.map_key).toBe("osu-4123");
    expect(card.slug).toMatch(/^[a-z0-9]{10}$/);
    expect(card).not.toHaveProperty("user_id");
    const insert = calls.find((call) => call.method === "POST");
    expect(insert?.body).toMatchObject({
      user_id: owner,
      map_key: "osu-4123",
      width: 1600,
      height: 1032,
      bytes: 48,
    });
    expect(env.bucket.put).toHaveBeenCalledOnce();
    const [key, , options] = env.bucket.put.mock.calls[0];
    expect(key).toBe(`cards/${card.slug}.png`);
    expect(options.httpMetadata.contentType).toBe("image/png");
  });

  it("replaces an existing card in place and bumps its version", async () => {
    const env = makeEnv();
    const patches: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          const body = JSON.parse(String(init.body));
          patches.push(body);
          return json([row({ ...body })]);
        }
        if (init?.method === "POST") throw new Error("must not insert");
        return json(String(url).includes("map_key=eq.") ? [row({ version: 3 })] : []);
      }),
    );

    const response = await route(upload(png(1600, 900)), env);

    expect(response.status).toBe(200);
    expect(env.bucket.put.mock.calls[0][0]).toBe("cards/abcdefghjk.png");
    expect(patches).toEqual([{ bytes: 48, width: 1600, height: 900, version: 4 }]);
    const { card } = (await response.json()) as { card: { slug: string; version: number } };
    expect(card).toMatchObject({ slug: "abcdefghjk", version: 4 });
  });

  it("stops at the per-account card limit", async () => {
    const env = makeEnv();
    const many = Array.from({ length: 100 }, (_, i) => row({ id: String(i) }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => json(String(url).includes("map_key=eq.") ? [] : many)),
    );
    const response = await route(upload(png(10, 10)), env);
    expect(response.status).toBe(409);
    expect(env.bucket.put).not.toHaveBeenCalled();
  });

  it("removes the new row again when the image cannot be stored", async () => {
    const env = makeEnv({ put: vi.fn(async () => { throw new Error("r2 down"); }) });
    const methods: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        methods.push(method);
        if (method === "POST") return json([row()], 201);
        if (method === "DELETE") return new Response(null, { status: 204 });
        return json([]);
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await route(upload(png(10, 10)), env);
    expect(response.status).toBe(502);
    expect(methods).toContain("DELETE");
  });
});

describe("map card deletion", () => {
  it("refuses to delete someone else's card", async () => {
    const env = makeEnv();
    vi.stubGlobal("fetch", vi.fn(async () => json([row({ user_id: stranger })])));
    const request = new Request("https://worker.test/storage/cards/abcdefghjk", { method: "DELETE" });
    const response = await route(request, env);
    expect(response.status).toBe(403);
    expect(env.bucket.delete).not.toHaveBeenCalled();
  });

  it("deletes the row before the image", async () => {
    const events: string[] = [];
    const env = makeEnv({ delete: vi.fn(async (key: string) => { events.push(`r2:${key}`); }) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          events.push("row");
          return new Response(null, { status: 204 });
        }
        return json([row()]);
      }),
    );
    const request = new Request("https://worker.test/storage/cards/abcdefghjk", { method: "DELETE" });
    const response = await route(request, env);
    expect(response.status).toBe(200);
    expect(events).toEqual(["row", "r2:cards/abcdefghjk.png"]);
  });
});

describe("public map card route", () => {
  function stored() {
    return {
      size: 48,
      httpEtag: '"etag-1"',
      uploaded: new Date("2026-09-24T12:00:00Z"),
      body: "png-bytes",
      writeHttpMetadata(headers: Headers) {
        headers.set("Content-Type", "image/png");
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
      },
    };
  }

  it("serves the PNG directly with a short cache so updates show up", async () => {
    const env = makeEnv({ get: vi.fn(async () => stored()) });
    const request = new Request("https://worker.test/card/abcdefghjk.png");
    const response = await handleMapCardRoute(request, new URL(request.url), env);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe("image/png");
    expect(response?.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(response?.headers.get("ETag")).toBe('"etag-1"');
    expect(await response?.text()).toBe("png-bytes");
    expect(env.bucket.get.mock.calls[0][0]).toBe("cards/abcdefghjk.png");
  });

  it("answers a matching revalidation with 304", async () => {
    const { body: _body, ...metadataOnly } = stored();
    const env = makeEnv({ get: vi.fn(async () => metadataOnly) });
    const request = new Request("https://worker.test/card/abcdefghjk.png", {
      headers: { "If-None-Match": '"etag-1"' },
    });
    const response = await handleMapCardRoute(request, new URL(request.url), env);
    expect(response?.status).toBe(304);
  });

  it("404s for unknown or malformed card links and ignores other paths", async () => {
    const env = makeEnv();
    for (const path of ["/card/abcdefghjk.png", "/card/abc.png", "/card/ABCDEFGHJK.png", "/card/abcdefghjk.jpg"]) {
      const request = new Request(`https://worker.test${path}`);
      const response = await handleMapCardRoute(request, new URL(request.url), env);
      expect(response?.status).toBe(404);
    }
    const other = new Request("https://worker.test/m/abcdefghjk");
    expect(await handleMapCardRoute(other, new URL(other.url), env)).toBeNull();
  });

  it("does not accept writes on the public route", async () => {
    const env = makeEnv();
    const request = new Request("https://worker.test/card/abcdefghjk.png", { method: "POST" });
    const response = await handleMapCardRoute(request, new URL(request.url), env);
    expect(response?.status).toBe(405);
  });
});
