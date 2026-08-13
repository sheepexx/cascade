import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleStorageRoute,
  r2BucketUsage,
  resolveRange,
  type StorageAuthContext,
  type WorkerEnv,
} from "./storage";

afterEach(() => {
  vi.unstubAllGlobals();
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

  it("removes both storage prefixes before deleting the database row", async () => {
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
    expect(await response?.json()).toEqual({ deleted: true });
    expect(events.indexOf("r2-delete")).toBeLessThan(
      events.indexOf("database-delete"),
    );
    expect(events.indexOf("supabase-delete")).toBeLessThan(
      events.indexOf("database-delete"),
    );
  });

  it("keeps the database row when storage cleanup fails", async () => {
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

    expect(response?.status).toBe(502);
    expect(events).not.toContain("database-delete");
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
      SUPABASE_STORAGE_FALLBACK: "true",
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
