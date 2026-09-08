import { afterEach, describe, expect, it, vi } from "vitest";
import {
  countableDesktopDownload,
  desktopDownloadTarget,
  downloadOs,
  handleDesktopRoute,
  type WorkerEnv,
} from "./storage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("desktopDownloadTarget", () => {
  it("classifies each published installer", () => {
    expect(desktopDownloadTarget("1.2.254/Cascade_1.2.254_x64-setup.exe")).toEqual(
      { version: "1.2.254", asset: "setup" },
    );
    expect(desktopDownloadTarget("1.2.254/Cascade_1.2.254_x64_en-US.msi")).toEqual(
      { version: "1.2.254", asset: "msi" },
    );
    expect(desktopDownloadTarget("1.2.254/Cascade_1.2.254_portable.exe")).toEqual(
      { version: "1.2.254", asset: "portable" },
    );
    expect(desktopDownloadTarget("1.2.254/notes.txt")).toEqual({
      version: "1.2.254",
      asset: "other",
    });
  });

  it("ignores the manifest and anything outside a version folder", () => {
    expect(desktopDownloadTarget("latest.json")).toBeNull();
    expect(desktopDownloadTarget("nightly/Cascade_setup.exe")).toBeNull();
    expect(desktopDownloadTarget("1.2.254/nested/Cascade_setup.exe")).toBeNull();
  });
});

describe("countableDesktopDownload", () => {
  const key = "1.2.254/Cascade_1.2.254_x64-setup.exe";

  it("counts a plain successful GET", () => {
    const req = new Request("https://worker.test/desktop/" + key);
    expect(countableDesktopDownload(req, key, 200)).toEqual({
      version: "1.2.254",
      asset: "setup",
    });
  });

  it("skips HEAD, partial content, range resumes and crawlers", () => {
    const head = new Request("https://worker.test/desktop/" + key, {
      method: "HEAD",
    });
    expect(countableDesktopDownload(head, key, 200)).toBeNull();

    const plain = new Request("https://worker.test/desktop/" + key);
    expect(countableDesktopDownload(plain, key, 206)).toBeNull();

    const ranged = new Request("https://worker.test/desktop/" + key, {
      headers: { Range: "bytes=1024-" },
    });
    expect(countableDesktopDownload(ranged, key, 200)).toBeNull();

    const crawler = new Request("https://worker.test/desktop/" + key, {
      headers: { "User-Agent": "Googlebot/2.1" },
    });
    expect(countableDesktopDownload(crawler, key, 200)).toBeNull();
  });
});

describe("downloadOs", () => {
  it("reads the platform out of the user agent", () => {
    expect(downloadOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      "Windows",
    );
    expect(downloadOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(
      "macOS",
    );
    expect(downloadOs("Mozilla/5.0 (X11; Linux x86_64)")).toBe("Linux");
    expect(downloadOs(null)).toBeNull();
  });
});

describe("handleDesktopRoute", () => {
  const key = "1.2.254/Cascade_1.2.254_x64-setup.exe";

  it("records the download without blocking the response", async () => {
    const posts: { url: string; body: unknown }[] = [];
    const pending: Promise<unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        posts.push({
          url: String(input),
          body: JSON.parse(String(init?.body ?? "null")),
        });
        return new Response(null, { status: 201 });
      }),
    );

    const request = new Request(`https://worker.test/desktop/${key}`);
    const response = await handleDesktopRoute(
      request,
      new URL(request.url),
      desktopEnv(),
      {
        waitUntil: (p: Promise<unknown>) => {
          pending.push(p);
        },
      } as unknown as ExecutionContext,
    );

    expect(response?.status).toBe(200);
    await Promise.all(pending);
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(
      "https://splqsxhwdusjeqthinxz.supabase.co/rest/v1/desktop_downloads",
    );
    expect(posts[0].body).toEqual({
      version: "1.2.254",
      asset: "setup",
      os: null,
    });
  });

  it("leaves the manifests uncounted and short-cached", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    for (const name of ["latest.json", "update.json"]) {
      const request = new Request(`https://worker.test/desktop/${name}`);
      const response = await handleDesktopRoute(
        request,
        new URL(request.url),
        desktopEnv(),
        { waitUntil: () => {} } as unknown as ExecutionContext,
      );
      expect(response?.headers.get("Cache-Control")).toBe("public, max-age=60");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still serves the file when the counter fails", async () => {
    const pending: Promise<unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("supabase unreachable");
      }),
    );

    const request = new Request(`https://worker.test/desktop/${key}`);
    const response = await handleDesktopRoute(
      request,
      new URL(request.url),
      desktopEnv(),
      {
        waitUntil: (p: Promise<unknown>) => {
          pending.push(p);
        },
      } as unknown as ExecutionContext,
    );

    expect(response?.status).toBe(200);
    await expect(Promise.all(pending)).resolves.toBeDefined();
  });

  function desktopEnv(): WorkerEnv {
    const object = {
      body: new Blob(["installer"]).stream(),
      size: 9,
      httpEtag: '"abc"',
      range: undefined,
      writeHttpMetadata: () => {},
    };
    return {
      SHARED_ASSETS: {
        get: async () => object,
        head: async () => object,
      } as unknown as R2Bucket,
      PROJECT_ASSETS: {} as unknown as R2Bucket,
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
});
