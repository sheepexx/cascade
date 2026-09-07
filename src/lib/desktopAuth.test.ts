import { describe, expect, it } from "vitest";
import { desktopLoginUrl } from "./desktopAuth";

describe("desktopLoginUrl", () => {
  it("asks the worker to redirect back to the listening port", () => {
    const url = new URL(desktopLoginUrl(51234));
    expect(url.pathname).toBe("/auth/osu/login");
    expect(url.searchParams.get("client")).toBe("desktop");
    expect(url.searchParams.get("port")).toBe("51234");
  });
})
