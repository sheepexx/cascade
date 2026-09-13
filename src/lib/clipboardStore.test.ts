import { beforeEach, describe, expect, it } from "vitest";
import { makeDifficulty } from "../types";
import {
  activeClip,
  clearClipboard,
  getClipboard,
  parseClipboard,
  pushClip,
  selectClip,
  type ClipEntry,
} from "./clipboardStore";

const notes = (id: string): ClipEntry => ({ kind: "notes", id, notes: [] });

describe("clipboard store", () => {
  beforeEach(() => clearClipboard());

  it("puts the newest copy on top and makes it the one to paste", () => {
    pushClip(notes("a"));
    pushClip({ kind: "difficulty", id: "b", difficulty: makeDifficulty("Hard", 7) });
    const state = getClipboard();
    expect(state.entries.map((e) => e.id)).toEqual(["b", "a"]);
    expect(activeClip()?.kind).toBe("difficulty");
  });

  it("moves a re-copied entry to the top instead of listing it twice", () => {
    pushClip(notes("a"));
    pushClip(notes("b"));
    pushClip(notes("a"));
    expect(getClipboard().entries.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("keeps the eight newest entries", () => {
    for (let i = 0; i < 10; i++) pushClip(notes(`n${i}`));
    const ids = getClipboard().entries.map((e) => e.id);
    expect(ids).toHaveLength(8);
    expect(ids[0]).toBe("n9");
    expect(ids).not.toContain("n1");
  });

  it("selects only entries it holds", () => {
    pushClip(notes("a"));
    pushClip(notes("b"));
    selectClip("a");
    expect(activeClip()?.id).toBe("a");
    selectClip("missing");
    expect(activeClip()?.id).toBe("a");
  });
});

describe("parseClipboard", () => {
  it("drops malformed entries and an active id that no longer exists", () => {
    const raw = JSON.stringify({
      activeId: "gone",
      entries: [
        notes("a"),
        { kind: "difficulty", id: "broken", difficulty: { name: "No notes" } },
        { kind: "mystery", id: "c" },
      ],
    });
    expect(parseClipboard(raw)).toEqual({ activeId: null, entries: [notes("a")] });
  });

  it("treats unreadable storage as empty", () => {
    expect(parseClipboard("{not json")).toEqual({ activeId: null, entries: [] });
    expect(parseClipboard(null)).toEqual({ activeId: null, entries: [] });
  });
});
