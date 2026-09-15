import { afterEach, describe, expect, it, vi } from "vitest";

describe("desktopLoginUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("asks the worker to redirect back to the listening port", async () => {
    // The worker URL is read when the module loads, so it is stubbed before the
    // import. Otherwise the test only passes where a .env happens to set it.
    vi.stubEnv("VITE_WORKER_URL", "https://worker.example");
    const { desktopLoginUrl } = await import("./desktopAuth");
    const url = new URL(desktopLoginUrl(51234, "12345678-1234-1234-1234-123456789abc"));
    expect(url.pathname).toBe("/auth/osu/login");
    expect(url.searchParams.get("client")).toBe("desktop");
    expect(url.searchParams.get("port")).toBe("51234");
    expect(url.searchParams.get("nonce")).toBe("12345678-1234-1234-1234-123456789abc");
  });
});
