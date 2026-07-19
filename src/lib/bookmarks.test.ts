import { describe, expect, it } from "vitest";
import {
  bookmarkInDirection,
  loopAroundTime,
  remapBookmarkLabels,
} from "./bookmarks";

describe("bookmark navigation", () => {
  it("moves in either direction and wraps at the ends", () => {
    const bookmarks = [100, 200, 300];
    expect(bookmarkInDirection(bookmarks, 205, "previous")).toBe(200);
    expect(bookmarkInDirection(bookmarks, 205, "next")).toBe(300);
    expect(bookmarkInDirection(bookmarks, 50, "previous")).toBe(300);
    expect(bookmarkInDirection(bookmarks, 350, "next")).toBe(100);
  });

  it("picks a loop around the playhead and falls back at either edge", () => {
    const bookmarks = [100, 200, 300];
    expect(loopAroundTime(bookmarks, 250)).toEqual({ startMs: 200, endMs: 300 });
    expect(loopAroundTime(bookmarks, 50)).toEqual({ startMs: 100, endMs: 200 });
    expect(loopAroundTime(bookmarks, 350)).toEqual({ startMs: 200, endMs: 300 });
  });

  it("remaps labels with their timestamps", () => {
    expect(
      remapBookmarkLabels(
        [100, 200],
        { "100": "Intro", "200": "Drop" },
        (ms) => ms / 2,
      ),
    ).toEqual({ "50": "Intro", "100": "Drop" });
  });
});
