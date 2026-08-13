import { keyLabel } from "./playtestKeybinds";

// Rebindable single-key editor shortcuts, keyed by KeyboardEvent.code like the
// playtest lane binds. Ctrl/Cmd combos (save, undo, copy...) and structural
// keys (Escape, Shift, Delete, arrows) stay fixed — they're listed in the info
// modal but not editable.

export type EditorAction =
  // Always active.
  | "playPause"
  | "slowMo"
  | "zenMode"
  | "volumeUp"
  | "volumeDown"
  | "scrollSpeedDown"
  | "scrollSpeedUp"
  | "prevBookmark"
  | "nextBookmark"
  | "zoomIn"
  | "zoomOut"
  | "addBookmark"
  | "playtestToggle"
  | "toggleReceptors"
  | "hitsoundMode"
  | "waveformOverlay"
  // Only with a selection.
  | "mirrorSelection"
  | "reverseSelection"
  | "shuffleSelection"
  | "scaleHalf"
  | "scaleDouble"
  // Only in hitsound mode.
  | "whistleAdd"
  | "finishAdd"
  | "clapAdd";

export type EditorKeybinds = Record<EditorAction, string>;

export const DEFAULT_EDITOR_KEYBINDS: EditorKeybinds = {
  playPause: "Space",
  slowMo: "KeyS",
  zenMode: "Tab",
  volumeUp: "ArrowUp",
  volumeDown: "ArrowDown",
  scrollSpeedDown: "Minus",
  scrollSpeedUp: "Equal",
  prevBookmark: "PageUp",
  nextBookmark: "PageDown",
  zoomIn: "F4",
  zoomOut: "F3",
  addBookmark: "KeyB",
  playtestToggle: "F5",
  toggleReceptors: "KeyR",
  hitsoundMode: "KeyH",
  waveformOverlay: "KeyW",
  mirrorSelection: "KeyM",
  reverseSelection: "KeyF",
  shuffleSelection: "KeyS",
  scaleHalf: "BracketLeft",
  scaleDouble: "BracketRight",
  whistleAdd: "KeyW",
  finishAdd: "KeyF",
  clapAdd: "KeyC",
};

const LEGACY_ZOOM_KEYBINDS = {
  scrollSpeedDown: "F3",
  scrollSpeedUp: "F4",
  zoomIn: "Equal",
  zoomOut: "Minus",
};

/**
 * Shortcuts only collide when they can fire in the same context: selection
 * actions coexist with global ones today (S is both slow-motion and shuffle),
 * and hitsound additions only apply inside hitsound mode.
 */
const CONFLICT_GROUPS: EditorAction[][] = [
  [
    "playPause",
    "slowMo",
    "zenMode",
    "volumeUp",
    "volumeDown",
    "scrollSpeedDown",
    "scrollSpeedUp",
    "prevBookmark",
    "nextBookmark",
    "zoomIn",
    "zoomOut",
    "addBookmark",
    "playtestToggle",
    "toggleReceptors",
    "hitsoundMode",
    "waveformOverlay",
  ],
  [
    "mirrorSelection",
    "reverseSelection",
    "shuffleSelection",
    "scaleHalf",
    "scaleDouble",
  ],
  ["whistleAdd", "finishAdd", "clapAdd"],
];

// A bound key also accepts its numpad twin so numpad zoom keeps working.
const CODE_ALIASES: Record<string, string[]> = {
  Equal: ["NumpadAdd"],
  Minus: ["NumpadSubtract"],
  Enter: ["NumpadEnter"],
};

export function matchesBind(code: string, bound: string): boolean {
  if (!bound) return false;
  if (code === bound) return true;
  return (CODE_ALIASES[bound] ?? []).includes(code);
}

export function timelineZoomDirection(key: string): -1 | 0 | 1 {
  if (key === "-" || key === "Subtract") return -1;
  if (key === "+" || key === "=" || key === "Add") return 1;
  return 0;
}

export function normalizeEditorKeybinds(
  input: Partial<Record<string, unknown>> | undefined,
): EditorKeybinds {
  const out = { ...DEFAULT_EDITOR_KEYBINDS };
  if (!input) return out;
  const legacyZoomDefaults = Object.entries(LEGACY_ZOOM_KEYBINDS).every(
    ([action, code]) => input[action] === code,
  );
  for (const action of Object.keys(out) as EditorAction[]) {
    const v = input[action];
    if (typeof v === "string" && v) out[action] = v;
  }
  if (legacyZoomDefaults) {
    out.scrollSpeedDown = DEFAULT_EDITOR_KEYBINDS.scrollSpeedDown;
    out.scrollSpeedUp = DEFAULT_EDITOR_KEYBINDS.scrollSpeedUp;
    out.zoomIn = DEFAULT_EDITOR_KEYBINDS.zoomIn;
    out.zoomOut = DEFAULT_EDITOR_KEYBINDS.zoomOut;
  }
  return out;
}

export function editorKeyLabel(code: string): string {
  switch (code) {
    case "Equal":
      return "+";
    case "Minus":
      return "-";
    case "BracketLeft":
      return "[";
    case "BracketRight":
      return "]";
    case "Tab":
      return "Tab";
    case "ArrowUp":
      return "Arrow Up";
    case "ArrowDown":
      return "Arrow Down";
    default:
      return keyLabel(code);
  }
}

export function editorKeybindConflicts(binds: EditorKeybinds): string[] {
  const warnings: string[] = [];
  for (const group of CONFLICT_GROUPS) {
    const byCode = new Map<string, EditorAction[]>();
    for (const action of group) {
      const code = binds[action];
      if (!code) continue;
      byCode.set(code, [...(byCode.get(code) ?? []), action]);
    }
    for (const [code, actions] of byCode) {
      if (actions.length > 1) {
        warnings.push(
          `${editorKeyLabel(code)} is bound to ${actions.join(" and ")}`,
        );
      }
    }
  }
  return warnings;
}
