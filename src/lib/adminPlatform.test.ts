import { describe, expect, it } from "vitest";
import { platformRank, userPlatform, type AdminUserSummary } from "./admin";

function summary(desktop: number, web: number): AdminUserSummary {
  return {
    id: "3c0a6c53-6b8e-4a6a-9f1a-0c1a4e5b7d21",
    osu_id: 1234,
    username: "sheepex",
    avatar_url: null,
    is_admin: false,
    created_at: "2026-01-01T00:00:00Z",
    last_signed_in_at: null,
    event_count: desktop + web,
    events_7d: 0,
    events_30d: 0,
    last_event_at: null,
    export_count: 0,
    project_count: 0,
    storage_bytes: 0,
    preset_count: 0,
    comment_count: 0,
    collab_count: 0,
    feedback_count: 0,
    last_browser: null,
    last_os: null,
    desktop_events: desktop,
    web_events: web,
    last_platform: null,
    last_app_version: null,
    desktop_version: null,
    last_desktop_at: null,
  };
}

describe("userPlatform", () => {
  it("labels an account by the clients it has actually used", () => {
    expect(userPlatform(summary(0, 12))).toBe("web");
    expect(userPlatform(summary(9, 0))).toBe("desktop");
    expect(userPlatform(summary(9, 12))).toBe("both");
    expect(userPlatform(summary(0, 0))).toBe("unknown");
  });

  it("sorts desktop users above mixed, web and silent accounts", () => {
    const order = [summary(0, 0), summary(0, 1), summary(1, 1), summary(1, 0)]
      .sort((a, b) => platformRank(b) - platformRank(a))
      .map(userPlatform);
    expect(order).toEqual(["desktop", "both", "web", "unknown"]);
  });
});
