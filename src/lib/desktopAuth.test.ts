import { describe, expect, it } from "vitest";
import { sessionFromDeepLink } from "./desktopAuth";

describe("sessionFromDeepLink", () => {
  it("reads the session the worker hands back", () => {
    expect(sessionFromDeepLink("cascade://auth?session=abc.def.ghi")).toBe(
      "abc.def.ghi",
    );
  });

  it("decodes an escaped token", () => {
    expect(sessionFromDeepLink("cascade://auth?session=tok%20en%2F%2B1")).toBe(
      "tok en/+1",
    );
  });

  it.each([
    "https://cascade.sheepex.net/?session=abc",
    "evil://auth?session=abc",
    "cascade://auth",
    "cascade://auth?other=abc",
    "not a url",
    "",
  ])("ignores %s", (url) => {
    expect(sessionFromDeepLink(url)).toBeNull();
  });
})
