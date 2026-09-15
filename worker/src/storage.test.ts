import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowedContentType,
  applyAssetResponseSecurity,
  handleStorageRoute,
  r2BucketUsage,
  resolveRange,
  type StorageAuthContext,
  type WorkerEnv,
} from "./storage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("asset content security", () => {
  it("allows supported media and archive types but rejects active documents", () => {
    expect(allowedContentType("image/png")).toBe(true);
    expect(allowedContentType("audio/mpeg")).toBe(true);
    expect(allowedContentType("application/ogg")).toBe(true);
    expect(allowedContentType("video/webm")).toBe(true);
    expect(allowedContentType("application/zip")).toBe(true);

    expect(allowedContentType("image/svg+xml")).toBe(false);
    expect(allowedContentType("text/html")).toBe(false);
    expect(allowedContentType("application/xhtml+xml")).toBe(false);
    expect(allowedContentType("application/xml")).toBe(false);
  });

  it("forces previously stored active content to download as inert bytes", () => {
    const headers = new Headers({ "Content-Type": "image/svg+xml" });

    applyAssetResponseSecurity(headers);

    expect(headers.get("Content-Type")).toBe("application/octet-stream");
    expect(headers.get("Content-Disposition")).toBe("attachment");
    expect(headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(headers.get("Content-Security-Policy")).toContain("default-src 'none'");
  });

  it("keeps safe media inline while still applying a sandbox policy", () => {
    const headers = new Headers({ "Content-Type": "image/jpeg" });

    applyAssetResponseSecurity(headers);

    expect(headers.get("Content-Type")).toBe("image/jpeg");
    expect(headers.has("Content-Disposition")).toBe(false);
    expect(headers.get("Content-Security-Policy")).toContain("sandbox");
  });
});

describe("shared publication ownership", () => {
  const owner = "6994f386-9685-416b-91c1-a9e47880d799";
  const projectId = "15dfbb4a-41d7-4a90-8213-3cb62649ae91";
  const auth: StorageAuthContext = {
    uid: owner,
    isAdmin: false,
    supabaseToken: "user-token",
  };

  it("rejects an upload that omits its project id", async () => {
    const put = vi.fn();
    const env = sharedUploadEnv(put);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));
    const request = sharedUploadRequest();

    const response = await handleStorageRoute(
      request,
      new URL(request.url),
      env,
      async () => auth,
    );

    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({ error: "valid project id required" });
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects an upload for a project the caller does not own", async () => {
    const put = vi.fn();
    const env = sharedUploadEnv(put);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));
    const request = sharedUploadRequest(projectId);

    const response = await handleStorageRoute(
      request,
      new URL(request.url),
      env,
      async () => auth,
    );

    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({
      error: "only the project owner can publish",
    });
    expect(put).not.toHaveBeenCalled();
  });

  it("uploads only after the caller's project ownership is confirmed", async () => {
    const put = vi.fn(async (key: string) => ({
      key,
      size: 3,
      etag: "etag",
    }));
    const env = sharedUploadEnv(put);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: projectId }]))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const request = sharedUploadRequest(projectId);

    const response = await handleStorageRoute(
      request,
      new URL(request.url),
      env,
      async () => auth,
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      path: `${owner}/testslug/card.png`,
      bytes: 3,
    });
    expect(put).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/projects?`);
    expect(String(fetchMock.mock.calls[1][0])).toContain(`/shared_maps?`);
  });

  function sharedUploadRequest(ownedProjectId?: string): Request {
    const query = ownedProjectId ? `?projectId=${ownedProjectId}` : "";
    return new Request(`https://worker.test/storage/shared/testslug/card.png${query}`, {
      method: "PUT",
      headers: {
        "Content-Length": "3",
        "Content-Type": "image/png",
      },
      body: "png",
    });
  }

  function sharedUploadEnv(put: ReturnType<typeof vi.fn>): WorkerEnv {
    const bucket = {
      put,
      async list() {
        return { objects: [], delimitedPrefixes: [], truncated: false };
      },
    } as unknown as R2Bucket;
    return {
      PROJECT_ASSETS: bucket,
      SHARED_ASSETS: bucket,
      CLIENT_ID: "60987",
      FRONTEND_URL: "https://cascade.sheepex.net",
      OSU_REDIRECT_URI:
        "https://mania-editor.noahcraft01.workers.dev/auth/osu/callback",
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

  function jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});

describe("project deletion", () => {
  const projectId = "15dfbb4a-41d7-4a90-8213-3cb62649ae91";
  const owner = "6994f386-9685-416b-91c1-a9e47880d799";
  const path = `${projectId}/asset.mp3`;
  const auth: StorageAuthContext = {
    uid: owner,
    isAdmin: false,
    supabaseToken: "user-token",
  };

  it("deletes the database row before removing both storage prefixes", async () => {
    const events: string[] = [];
    const env = deleteEnv(events);
    vi.stubGlobal("fetch", deleteFetch(events));

    const request = new Request(`https://worker.test/storage/projects/${projectId}`, {
      method: "DELETE",
    });
    const response = await handleStorageRoute(
      request,
      new URL(request.url),
      env,
      async () => auth,
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ deleted: true, warnings: [] });
    expect(events.indexOf("database-delete")).toBeLessThan(
      events.indexOf("r2-delete"),
    );
    expect(events.indexOf("database-delete")).toBeLessThan(
      events.indexOf("supabase-delete"),
    );
  });

  it("reports cleanup warnings after the database row is safely deleted", async () => {
    const events: string[] = [];
    const env = deleteEnv(events, true);
    vi.stubGlobal("fetch", deleteFetch(events));

    const request = new Request(`https://worker.test/storage/projects/${projectId}`, {
      method: "DELETE",
    });
    const response = await handleStorageRoute(
      request,
      new URL(request.url),
      env,
      async () => auth,
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      deleted: true,
      warnings: ["R2 deletion failed"],
    });
    expect(events).toContain("database-delete");
  });

  it("does not remove files for a user who does not own the project", async () => {
    const events: string[] = [];
    const env = deleteEnv(events);
    vi.stubGlobal("fetch", deleteFetch(events));

    const request = new Request(`https://worker.test/storage/projects/${projectId}`, {
      method: "DELETE",
    });
    const response = await handleStorageRoute(
      request,
      new URL(request.url),
      env,
      async () => ({ ...auth, uid: "a9f1fc19-35dd-49e5-8375-c83eeed34ca3" }),
    );

    expect(response?.status).toBe(403);
    expect(events).toEqual(["project-read"]);
  });

  function deleteEnv(events: string[], failR2 = false): WorkerEnv {
    let listed = false;
    const object: R2Object = {
      key: path,
      version: "version",
      size: 10,
      etag: "etag",
      httpEtag: '"etag"',
      checksums: { toJSON: () => ({}) },
      uploaded: new Date(0),
      storageClass: "Standard",
      writeHttpMetadata() {},
    };
    const projectBucket: R2Bucket = {
      async head() {
        throw new Error("not implemented");
      },
      async get() {
        throw new Error("not implemented");
      },
      async put() {
        throw new Error("not implemented");
      },
      async createMultipartUpload() {
        throw new Error("not implemented");
      },
      resumeMultipartUpload() {
        throw new Error("not implemented");
      },
      async list() {
        events.push("r2-list");
        if (listed) {
          return { objects: [], delimitedPrefixes: [], truncated: false };
        }
        listed = true;
        return {
          objects: [object],
          delimitedPrefixes: [],
          truncated: false,
        };
      },
      async delete() {
        events.push("r2-delete");
        if (failR2) throw new Error("R2 deletion failed");
      },
    };
    return {
      PROJECT_ASSETS: projectBucket,
      SHARED_ASSETS: projectBucket,
      CLIENT_ID: "60987",
      FRONTEND_URL: "https://cascade.sheepex.net",
      OSU_REDIRECT_URI:
        "https://mania-editor.noahcraft01.workers.dev/auth/osu/callback",
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

  function deleteFetch(events: string[]) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/rest/v1/projects?") && init?.method === "DELETE") {
        events.push("database-delete");
        return jsonResponse([{ id: projectId }]);
      }
      if (url.includes("/rest/v1/projects?")) {
        events.push("project-read");
        return jsonResponse([{ id: projectId, owner }]);
      }
      if (url.includes("/rest/v1/project_assets?")) {
        events.push("assets-read");
        return jsonResponse([{ storage_path: path }]);
      }
      if (url.includes("/storage/v1/object/list/maps")) {
        events.push("supabase-list");
        return jsonResponse([
          { id: "object-id", name: "asset.mp3", metadata: { size: 10 } },
        ]);
      }
      if (url.includes("/storage/v1/object/maps")) {
        events.push("supabase-delete");
        return jsonResponse({});
      }
      return new Response(null, { status: 404 });
    });
  }

  function jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});

describe("account skin storage", () => {
  const owner = "6994f386-9685-416b-91c1-a9e47880d799";
  const sha256 = "a".repeat(64);
  const storagePath = `users/${owner}/skins/1/${sha256}.osk`;
  const skin = {
    id: "15dfbb4a-41d7-4a90-8213-3cb62649ae91",
    user_id: owner,
    slot: 1,
    filename: "cloud-skin.osk",
    storage_path: storagePath,
    sha256,
    bytes: 9,
    updated_at: "2026-08-13T12:00:00.000Z",
  };
  const auth: StorageAuthContext = {
    uid: owner,
    isAdmin: false,
    supabaseToken: "user-token",
  };

  it("stores a user-namespaced object and upserts its slot metadata", async () => {
    const events: string[] = [];
    const env = skinEnv(events);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        events.push("metadata-upsert");
        return jsonResponse([skin]);
      }
      events.push("metadata-read");
      return jsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request(
      `https://worker.test/storage/users/skins/1/${sha256}.osk?filename=cloud-skin.osk`,
      {
        method: "PUT",
        headers: {
          "Content-Length": "9",
          "Content-Type": "application/zip",
        },
        body: "skin-data",
      },
    );

    const response = await handleStorageRoute(
      request,
      new URL(request.url),
      env,
      async () => auth,
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ skin });
    expect(events).toEqual(["metadata-read", `r2-put:${storagePath}`, "metadata-upsert"]);
    const upsert = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(String(upsert?.[0])).toContain("on_conflict=user_id%2Cslot");
    expect(JSON.parse(String(upsert?.[1]?.body))).toMatchObject({
      user_id: owner,
      slot: 1,
      filename: "cloud-skin.osk",
      storage_path: storagePath,
      sha256,
      bytes: 9,
    });
  });

  it("requires an authenticated account before reading a skin slot", async () => {
    const events: string[] = [];
    const env = skinEnv(events);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://worker.test/storage/users/skins/1");

    const response = await handleStorageRoute(
      request,
      new URL(request.url),
      env,
      async () => null,
    );

    expect(response?.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("resolves metadata without downloading the object for a HEAD request", async () => {
    const events: string[] = [];
    const env = skinEnv(events);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([skin])));
    const request = new Request("https://worker.test/storage/users/skins/1", {
      method: "HEAD",
    });

    const response = await handleStorageRoute(
      request,
      new URL(request.url),
      env,
      async () => auth,
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Length")).toBe("9");
    expect(events).toEqual([`r2-head:${storagePath}`]);
  });

  it("deletes metadata before removing the stored object", async () => {
    const events: string[] = [];
    const env = skinEnv(events);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "DELETE") events.push("metadata-delete");
        return jsonResponse([{ id: skin.id, storage_path: storagePath }]);
      }),
    );
    const request = new Request("https://worker.test/storage/users/skins/1", {
      method: "DELETE",
    });

    const response = await handleStorageRoute(
      request,
      new URL(request.url),
      env,
      async () => auth,
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ deleted: true, warnings: [] });
    expect(events).toEqual(["metadata-delete", `r2-delete:${storagePath}`]);
  });

  function skinEnv(events: string[]): WorkerEnv {
    const object = (key: string): R2Object => ({
      key,
      version: "version",
      size: 9,
      etag: "etag",
      httpEtag: '"etag"',
      checksums: { toJSON: () => ({}) },
      uploaded: new Date(0),
      storageClass: "Standard",
      writeHttpMetadata() {},
    });
    const bucket: R2Bucket = {
      async head(key) {
        events.push(`r2-head:${key}`);
        return object(key);
      },
      async get() {
        throw new Error("not implemented");
      },
      async put(key) {
        events.push(`r2-put:${key}`);
        return object(key);
      },
      async createMultipartUpload() {
        throw new Error("not implemented");
      },
      resumeMultipartUpload() {
        throw new Error("not implemented");
      },
      async list() {
        return { objects: [], delimitedPrefixes: [], truncated: false };
      },
      async delete(keys) {
        const values = typeof keys === "string" ? [keys] : keys;
        for (const key of values) events.push(`r2-delete:${key}`);
      },
    };
    return {
      PROJECT_ASSETS: bucket,
      SHARED_ASSETS: bucket,
      CLIENT_ID: "60987",
      FRONTEND_URL: "https://cascade.sheepex.net",
      OSU_REDIRECT_URI:
        "https://mania-editor.noahcraft01.workers.dev/auth/osu/callback",
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

  function jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});

describe("r2BucketUsage", () => {
  it("adds object sizes across paginated bucket listings", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        objects: [{ size: 120 }, { size: 80 }],
        truncated: true,
        cursor: "next-page",
      })
      .mockResolvedValueOnce({
        objects: [{ size: 25 }],
        truncated: false,
      });

    await expect(
      r2BucketUsage({ list } as unknown as R2Bucket),
    ).resolves.toEqual({ bytes: 225, objects: 3 });
    expect(list).toHaveBeenNthCalledWith(1, { limit: 1000 });
    expect(list).toHaveBeenNthCalledWith(2, {
      limit: 1000,
      cursor: "next-page",
    });
  });
});

describe("resolveRange", () => {
  it("ignores an undefined suffix on offset ranges", () => {
    const range = {
      offset: 0,
      length: 1024,
      suffix: undefined,
    } as unknown as R2Range;
    expect(resolveRange(range, 160496)).toEqual({ offset: 0, length: 1024 });
  });

  it("resolves suffix and open-ended ranges", () => {
    expect(resolveRange({ suffix: 512 }, 4096)).toEqual({
      offset: 3584,
      length: 512,
    });
    expect(resolveRange({ offset: 1024 }, 4096)).toEqual({
      offset: 1024,
      length: 3072,
    });
  });
});
