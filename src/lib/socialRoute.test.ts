import { describe, expect, it } from "vitest";
import { parseSocialPath, sameRoute, socialPath, type SocialRoute } from "./socialRoute";

describe("parseSocialPath", () => {
  it("reads profiles, with an optional section", () => {
    expect(parseSocialPath("/user/peppy")).toEqual({ view: "profile", name: "peppy", tab: "overview" });
    expect(parseSocialPath("/user/Some%20One/maps")).toEqual({ view: "profile", name: "Some One", tab: "maps" });
    expect(parseSocialPath("/user/[abc]_x/activity/")).toEqual({ view: "profile", name: "[abc]_x", tab: "activity" });
  });

  it("refuses names osu! can't have, unknown sections and broken escapes", () => {
    expect(parseSocialPath("/user/<script>")).toBeNull();
    expect(parseSocialPath("/user/peppy/settings")).toBeNull();
    expect(parseSocialPath("/user/%E0%A4%A")).toBeNull();
    expect(parseSocialPath("/user/" + "a".repeat(40))).toBeNull();
    expect(parseSocialPath("/user")).toBeNull();
  });

  it("reads friends tabs, conversations and the community page", () => {
    expect(parseSocialPath("/friends")).toEqual({ view: "friends", tab: "all" });
    expect(parseSocialPath("/friends/pending")).toEqual({ view: "friends", tab: "pending" });
    expect(parseSocialPath("/friends/nope")).toBeNull();
    expect(parseSocialPath("/messages")).toEqual({ view: "messages", conversationId: null });
    expect(parseSocialPath("/messages/6994F386-9685-416B-91C1-A9E47880D799")).toEqual({
      view: "messages",
      conversationId: "6994f386-9685-416b-91c1-a9e47880d799",
    });
    expect(parseSocialPath("/messages/not-a-uuid")).toBeNull();
    expect(parseSocialPath("/community")).toEqual({ view: "community" });
  });

  it("leaves every other path to the rest of the app", () => {
    for (const path of ["/", "/m/abcd", "/docs", "/de", "/userx/peppy", "/community/x"]) {
      expect(parseSocialPath(path)).toBeNull();
    }
  });
});

describe("socialPath", () => {
  it("round-trips every route", () => {
    const routes: SocialRoute[] = [
      { view: "profile", name: "Some One", tab: "overview" },
      { view: "profile", name: "x", tab: "maps" },
      { view: "friends", tab: "all" },
      { view: "friends", tab: "blocked" },
      { view: "messages", conversationId: null },
      { view: "messages", conversationId: "6994f386-9685-416b-91c1-a9e47880d799" },
      { view: "community" },
    ];
    for (const route of routes) expect(parseSocialPath(socialPath(route))).toEqual(route);
  });

  it("compares profile names without case", () => {
    expect(
      sameRoute(
        { view: "profile", name: "Peppy", tab: "overview" },
        { view: "profile", name: "peppy", tab: "overview" },
      ),
    ).toBe(true);
    expect(sameRoute({ view: "community" }, null)).toBe(false);
  });
});
