import { describe, expect, it } from "vitest";
import { groupMessages, linkify, mergeMessages } from "./messageThread";
import type { Message } from "./social";

const msg = (id: string, sender: string, at: string, body = id): Message => ({
  id,
  conversation_id: "c",
  sender,
  body,
  reply_to: null,
  created_at: at,
  edited_at: null,
  deleted_at: null,
});

describe("mergeMessages", () => {
  it("adds, replaces by id and keeps the oldest first", () => {
    const a = msg("a", "x", "2026-10-13T10:00:00Z");
    const b = msg("b", "y", "2026-10-13T10:01:00Z");
    const merged = mergeMessages([b], [a, { ...b, body: "edited" }]);
    expect(merged.map((m) => [m.id, m.body])).toEqual([
      ["a", "a"],
      ["b", "edited"],
    ]);
  });
});

describe("groupMessages", () => {
  it("groups by day and by consecutive sender within five minutes", () => {
    const now = new Date(2026, 9, 13, 18, 0);
    const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).toISOString();
    const days = groupMessages(
      [
        msg("1", "x", at(12, 9, 0)),
        msg("2", "x", at(13, 9, 0)),
        msg("3", "x", at(13, 9, 3)),
        msg("4", "x", at(13, 9, 30)),
        msg("5", "y", at(13, 9, 31)),
      ],
      "en",
      now,
    );
    expect(days.map((d) => d.label)).toEqual(["yesterday", "today"]);
    expect(days[1].runs.map((r) => r.messages.map((m) => m.id))).toEqual([["2", "3"], ["4"], ["5"]]);
  });
});

describe("linkify", () => {
  it("links http(s) URLs and leaves the rest as text", () => {
    expect(linkify("see https://osu.ppy.sh/beatmapsets/1, thanks")).toEqual([
      { text: "see " },
      { text: "https://osu.ppy.sh/beatmapsets/1", href: "https://osu.ppy.sh/beatmapsets/1" },
      { text: ", thanks" },
    ]);
  });

  it("never links other schemes", () => {
    const parts = linkify("javascript:alert(1) data:text/html,<b>x</b>");
    expect(parts.every((p) => !p.href)).toBe(true);
    expect(parts.map((p) => p.text).join("")).toBe("javascript:alert(1) data:text/html,<b>x</b>");
  });

  it("keeps plain text whole", () => {
    expect(linkify("no links here")).toEqual([{ text: "no links here" }]);
  });
});
