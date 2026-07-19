import { describe, it, expect } from "vitest";
import {
  DEFAULT_EDITOR_KEYBINDS,
  editorKeyLabel,
  editorKeybindConflicts,
  matchesBind,
  normalizeEditorKeybinds,
} from "./editorKeybinds";

describe("normalizeEditorKeybinds", () => {
  it("fills every action with defaults", () => {
    expect(normalizeEditorKeybinds(undefined)).toEqual(
      DEFAULT_EDITOR_KEYBINDS,
    );
    expect(normalizeEditorKeybinds({})).toEqual(DEFAULT_EDITOR_KEYBINDS);
  });

  it("keeps saved overrides and drops junk", () => {
    const out = normalizeEditorKeybinds({
      playPause: "KeyP",
      zenMode: 42,
      bogusAction: "KeyQ",
    });
    expect(out.playPause).toBe("KeyP");
    expect(out.zenMode).toBe(DEFAULT_EDITOR_KEYBINDS.zenMode);
    expect("bogusAction" in out).toBe(false);
  });
});

describe("matchesBind", () => {
  it("matches exact codes and numpad aliases", () => {
    expect(matchesBind("Space", "Space")).toBe(true);
    expect(matchesBind("NumpadAdd", "Equal")).toBe(true);
    expect(matchesBind("NumpadSubtract", "Minus")).toBe(true);
    expect(matchesBind("KeyA", "KeyB")).toBe(false);
    expect(matchesBind("KeyA", "")).toBe(false);
  });
});

describe("editorKeybindConflicts", () => {
  it("accepts the defaults (contextual reuse is not a conflict)", () => {
    // S = slowMo + shuffleSelection, W = waveform + whistle, F = reverse +
    // finish — all live in different contexts and must not warn.
    expect(editorKeybindConflicts(DEFAULT_EDITOR_KEYBINDS)).toEqual([]);
  });

  it("warns on duplicates within the same context", () => {
    const binds = {
      ...DEFAULT_EDITOR_KEYBINDS,
      addBookmark: "Space", // collides with playPause (both global)
    };
    const warnings = editorKeybindConflicts(binds);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Space");
    expect(warnings[0]).toContain("playPause");
    expect(warnings[0]).toContain("addBookmark");
  });
});

describe("editorKeyLabel", () => {
  it("labels special codes readably", () => {
    expect(editorKeyLabel("Equal")).toBe("+");
    expect(editorKeyLabel("Minus")).toBe("-");
    expect(editorKeyLabel("BracketLeft")).toBe("[");
    expect(editorKeyLabel("KeyS")).toBe("S");
    expect(editorKeyLabel("PageUp")).toBe("Page Up");
  });
});
