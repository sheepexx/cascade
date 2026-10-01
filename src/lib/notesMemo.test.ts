import { describe, expect, it, vi } from "vitest";
import { memoByNotes } from "./notesMemo";
import type { ManiaNote } from "../types";

describe("memoByNotes", () => {
  it("computes once per notes array and arguments", () => {
    const compute = vi.fn((notes: ManiaNote[], keys: number) => notes.length * keys);
    const memo = memoByNotes(compute);
    const notes: ManiaNote[] = [{ id: "a", column: 0, startTime: 0 }];
    expect(memo(notes, 4)).toBe(4);
    expect(memo(notes, 4)).toBe(4);
    expect(memo(notes, 7)).toBe(7);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(memo([...notes], 4)).toBe(4);
    expect(compute).toHaveBeenCalledTimes(3);
  });
});
