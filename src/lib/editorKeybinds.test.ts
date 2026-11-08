import { describe, it, expect } from "vitest";
import {
  DEFAULT_EDITOR_KEYBINDS,
  editorKeyLabel,
  editorKeybindConflictActions,
  editorKeybindConflicts,
  matchesBareBind,
  matchesBind,
  normalizeEditorKeybinds,
  playtestKeyAction,
  snapDivisorForBind,
  timelineZoomDirection,
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

  it("migrates the old F3/F4 timeline and minus/plus playfield defaults", () => {
    const out = normalizeEditorKeybinds({
      scrollSpeedDown: "F3",
      scrollSpeedUp: "F4",
      zoomIn: "Equal",
      zoomOut: "Minus",
    });
    expect(out.scrollSpeedDown).toBe("Minus");
    expect(out.scrollSpeedUp).toBe("Equal");
    expect(out.zoomOut).toBe("F3");
    expect(out.zoomIn).toBe("F4");
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

  it("keeps the default snap shortcuts on the number row", () => {
    expect(matchesBind("Digit6", DEFAULT_EDITOR_KEYBINDS.snap6)).toBe(true);
    expect(matchesBind("Numpad6", DEFAULT_EDITOR_KEYBINDS.snap6)).toBe(false);
    expect(DEFAULT_EDITOR_KEYBINDS).not.toHaveProperty("snap9");
  });
});

const press = (code: string, mods: Partial<KeyboardEvent> = {}) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isComposing: false,
  defaultPrevented: false,
  ...mods,
});

describe("matchesBareBind", () => {
  it("leaves Ctrl+C to copy notes when play/pause is bound to C", () => {
    expect(matchesBareBind(press("KeyC"), "KeyC")).toBe(true);
    expect(matchesBareBind(press("KeyC", { ctrlKey: true }), "KeyC")).toBe(false);
    expect(matchesBareBind(press("KeyC", { metaKey: true }), "KeyC")).toBe(false);
    expect(matchesBareBind(press("KeyC", { altKey: true }), "KeyC")).toBe(false);
  });

  it("still allows Shift and ignores keys an input method is composing", () => {
    expect(matchesBareBind(press("KeyC", { shiftKey: true }), "KeyC")).toBe(true);
    expect(matchesBareBind(press("KeyC", { isComposing: true }), "KeyC")).toBe(false);
  });
});

describe("playtestKeyAction", () => {
  const editor = { active: false, canStart: true, typing: false };

  it("lets Ctrl+V paste into the comment box instead of starting a playtest", () => {
    const ctrlV = press("KeyV", { ctrlKey: true });
    expect(playtestKeyAction(ctrlV, "KeyV", { ...editor, typing: true })).toBeNull();
    expect(playtestKeyAction(ctrlV, "KeyV", editor)).toBeNull();
  });

  it("leaves Ctrl+V and plain V alone in Beatmap Settings text fields", () => {
    const settings = { active: false, canStart: false, typing: true };
    expect(playtestKeyAction(press("KeyV", { ctrlKey: true }), "KeyV", settings)).toBeNull();
    expect(playtestKeyAction(press("KeyV"), "KeyV", settings)).toBeNull();
  });

  it("starts and exits on a plain press outside text fields", () => {
    expect(playtestKeyAction(press("KeyV"), "KeyV", editor)).toBe("start");
    expect(playtestKeyAction(press("KeyV"), "KeyV", { ...editor, active: true })).toBe("exit");
  });

  it("keeps F5 from reloading the page while a dialog blocks the playtest", () => {
    expect(playtestKeyAction(press("F5"), "F5", { ...editor, canStart: false })).toBe("block");
  });

  it("ignores other keys and presses something already handled", () => {
    expect(playtestKeyAction(press("KeyB"), "KeyV", editor)).toBeNull();
    expect(playtestKeyAction(press("KeyV", { defaultPrevented: true }), "KeyV", editor)).toBeNull();
  });
});

describe("snapDivisorForBind", () => {
  it("maps 0 to free snap and 1-8 to their divisors", () => {
    expect(snapDivisorForBind("Digit0", DEFAULT_EDITOR_KEYBINDS)).toBe(0);
    for (let divisor = 1; divisor <= 8; divisor++) {
      expect(
        snapDivisorForBind(`Digit${divisor}`, DEFAULT_EDITOR_KEYBINDS),
      ).toBe(divisor);
    }
    expect(snapDivisorForBind("Digit9", DEFAULT_EDITOR_KEYBINDS)).toBeNull();
    expect(snapDivisorForBind("Numpad6", DEFAULT_EDITOR_KEYBINDS)).toBeNull();
  });

  it("uses customized bindings", () => {
    const binds = { ...DEFAULT_EDITOR_KEYBINDS, snap6: "KeyG" };
    expect(snapDivisorForBind("KeyG", binds)).toBe(6);
    expect(snapDivisorForBind("Digit6", binds)).toBeNull();
  });
});

describe("timelineZoomDirection", () => {
  it("recognizes main-row and numpad symbols independently of key code", () => {
    expect(timelineZoomDirection("-")).toBe(-1);
    expect(timelineZoomDirection("Subtract")).toBe(-1);
    expect(timelineZoomDirection("+")).toBe(1);
    expect(timelineZoomDirection("=")).toBe(1);
    expect(timelineZoomDirection("Add")).toBe(1);
    expect(timelineZoomDirection("ß")).toBe(0);
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

describe("editorKeybindConflictActions", () => {
  it("is empty for the defaults", () => {
    expect(editorKeybindConflictActions(DEFAULT_EDITOR_KEYBINDS).size).toBe(0);
  });

  it("names every action that shares a key in one context", () => {
    const binds = { ...DEFAULT_EDITOR_KEYBINDS, addBookmark: "Space" };
    expect([...editorKeybindConflictActions(binds)].sort()).toEqual(
      ["addBookmark", "playPause"],
    );
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
