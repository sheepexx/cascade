import { describe, expect, it } from "vitest";
import { diffText } from "./typingFx";

describe("diffText", () => {
  it("finds a letter typed at the end", () => {
    expect(diffText("hell", "hello", 5)).toEqual({ start: 4, removed: 0, inserted: "o" });
  });

  it("puts a repeated letter where the caret says it went", () => {
    // "helo" -> "hello" with the caret after the new l (index 4): the insert
    // is at 3, not 2.
    expect(diffText("helo", "hello", 4)).toEqual({ start: 3, removed: 0, inserted: "l" });
  });

  it("finds a backspace in the middle", () => {
    expect(diffText("abcdef", "abdef", 2)).toEqual({ start: 2, removed: 1, inserted: "" });
  });

  it("finds a forward delete of a repeated letter at the caret", () => {
    // Caret before the second "o" of "foo"; Delete removes it.
    expect(diffText("foo", "fo", 2)).toEqual({ start: 2, removed: 1, inserted: "" });
  });

  it("finds a selection replaced by typing", () => {
    expect(diffText("one two three", "one 2 three", 5)).toEqual({
      start: 4,
      removed: 3,
      inserted: "2",
    });
  });

  it("handles clearing the field", () => {
    expect(diffText("abc", "", 0)).toEqual({ start: 0, removed: 3, inserted: "" });
  });

  it("works without a caret", () => {
    expect(diffText("abc", "abXc", null)).toEqual({ start: 2, removed: 0, inserted: "X" });
  });

  it("never splits a surrogate pair", () => {
    // Two different emoji sharing their high surrogate.
    const a = "x\u{1F600}";
    const b = "x\u{1F601}";
    const change = diffText(a, b, b.length);
    expect(change.start).toBe(1);
    expect(change.removed).toBe(2);
    expect(change.inserted).toBe("\u{1F601}");
  });

  it("ignores a caret that does not fit the change", () => {
    // React reset the value and left the caret somewhere unrelated.
    expect(diffText("abc", "abcd", 0)).toEqual({ start: 3, removed: 0, inserted: "d" });
  });
});
