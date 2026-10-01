import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "./activityLog";
import { groupInbox, inboxGroupOf, mergeInbox } from "./inboxItems";
import type { InboxNotification } from "./notifications";

function notification(id: string, createdAt: Date, read = false): InboxNotification {
  return {
    id,
    recipient: "me",
    kind: "invite",
    title: `Invite ${id}`,
    body: null,
    project_id: "p1",
    actor: null,
    actor_username: null,
    actor_avatar_url: null,
    action_url: null,
    read_at: read ? createdAt.toISOString() : null,
    created_at: createdAt.toISOString(),
  };
}

function activity(id: string, createdAt: Date, read = false): ActivityEntry {
  return {
    id,
    tone: "error",
    title: `Error ${id}`,
    createdAt: createdAt.getTime(),
    readAt: read ? createdAt.getTime() : null,
  };
}

// Wednesday 1 October 2026, mid-afternoon local time.
const now = new Date(2026, 9, 1, 15, 30);
const at = (daysAgo: number, hour = 12) => new Date(2026, 9, 1 - daysAgo, hour);

describe("mergeInbox", () => {
  it("interleaves account notifications and activity newest first", () => {
    const items = mergeInbox(
      [notification("n1", at(0, 9)), notification("n2", at(2), true)],
      [activity("a1", at(0, 14)), activity("a2", at(1), true)],
    );
    expect(items.map((i) => i.key)).toEqual([
      "activity:a1",
      "account:n1",
      "activity:a2",
      "account:n2",
    ]);
    expect(items.map((i) => i.read)).toEqual([false, false, true, true]);
  });
});

describe("inbox groups", () => {
  it("groups by calendar day, not by 24-hour windows", () => {
    expect(inboxGroupOf(at(0, 0).getTime(), now)).toBe("today");
    expect(inboxGroupOf(at(1, 23).getTime(), now)).toBe("yesterday");
    expect(inboxGroupOf(at(1, 0).getTime(), now)).toBe("yesterday");
    expect(inboxGroupOf(at(2).getTime(), now)).toBe("week");
    expect(inboxGroupOf(at(6).getTime(), now)).toBe("week");
    expect(inboxGroupOf(at(7).getTime(), now)).toBe("older");
  });

  it("keeps the list order inside each group", () => {
    const items = mergeInbox(
      [notification("n1", at(0, 9)), notification("n2", at(9))],
      [activity("a1", at(0, 14)), activity("a2", at(3))],
    );
    const groups = groupInbox(items, now);
    expect(groups.map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([
      ["today", ["a1", "n1"]],
      ["week", ["a2"]],
      ["older", ["n2"]],
    ]);
  });
});
