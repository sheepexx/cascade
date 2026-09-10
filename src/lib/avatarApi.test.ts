import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAvatar } from "../../api/avatar";

afterEach(() => vi.unstubAllGlobals());

describe("avatar API", () => {
  it("requires a user query parameter", async () => {
    const response = await handleAvatar(new Request("https://cascade.test/api/avatar"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing user parameter" });
  });

  it("resolves the osu user and streams the avatar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://osu.ppy.sh/users/12345/example" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleAvatar(
      new Request("https://cascade.test/api/avatar?user=example"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://a.ppy.sh/12345",
      expect.objectContaining({ headers: { "User-Agent": expect.any(String) } }),
    );
  });

  it("returns not found when osu does not resolve the user", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const response = await handleAvatar(
      new Request("https://cascade.test/api/avatar?user=missing"),
    );

    expect(response.status).toBe(404);
  });
});
