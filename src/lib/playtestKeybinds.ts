import { MAX_KEYS, MIN_KEYS } from "../types";

export type PlaytestKeybinds = Record<number, string[]>;

const DEFAULT_ROWS = [
  "KeyS",
  "KeyD",
  "KeyF",
  "Space",
  "KeyJ",
  "KeyK",
  "KeyL",
  "Semicolon",
  "KeyA",
  "Quote",
  "KeyQ",
  "KeyW",
  "KeyE",
  "KeyR",
  "KeyU",
  "KeyI",
  "KeyO",
  "KeyP",
];

const DEFAULT_BY_KEYS: Record<number, string[]> = {
  1: ["Space"],
  2: ["KeyF", "KeyJ"],
  3: ["KeyD", "Space", "KeyK"],
  4: ["KeyD", "KeyF", "KeyJ", "KeyK"],
  5: ["KeyD", "KeyF", "Space", "KeyJ", "KeyK"],
  6: ["KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL"],
  7: ["KeyS", "KeyD", "KeyF", "Space", "KeyJ", "KeyK", "KeyL"],
};

export function defaultPlaytestKeybinds(): PlaytestKeybinds {
  const out: PlaytestKeybinds = {};
  for (let keys = MIN_KEYS; keys <= MAX_KEYS; keys++) {
    out[keys] = DEFAULT_BY_KEYS[keys] ?? DEFAULT_ROWS.slice(0, keys);
  }
  return out;
}

export function normalizePlaytestKeybinds(
  input: Partial<PlaytestKeybinds> | undefined,
): PlaytestKeybinds {
  const defaults = defaultPlaytestKeybinds();
  const out: PlaytestKeybinds = {};
  for (let keys = MIN_KEYS; keys <= MAX_KEYS; keys++) {
    const provided = input?.[keys];
    out[keys] =
      Array.isArray(provided) && provided.length
        ? Array.from({ length: keys }, (_, i) => provided[i] || "")
        : defaults[keys];
  }
  return out;
}

/**
 * Binds `code` to the lane at the front of `queue`, the lanes still waiting
 * for a key. A key drives one lane only, so a lane already using it is
 * cleared and joins the end of the queue to get a new one.
 */
export function assignPlaytestKey(
  keys: string[],
  queue: number[],
  code: string,
): { keys: string[]; queue: number[] } {
  const [column, ...rest] = queue;
  if (column === undefined) return { keys, queue: [] };
  const next = [...keys];
  const stolen = next.findIndex((existing, i) => i !== column && existing === code);
  if (stolen !== -1) next[stolen] = "";
  next[column] = code;
  if (stolen !== -1 && !rest.includes(stolen)) rest.push(stolen);
  return { keys: next, queue: rest };
}

export function keyLabel(code: string): string {
  if (!code) return "Unset";
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Semicolon") return ";";
  if (code === "Quote") return "'";
  if (code === "Backquote") return "`";
  if (code.startsWith("Numpad")) return code.replace("Numpad", "Num ");
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function keybindWarnings(keys: string[]): string[] {
  const warnings: string[] = [];
  const missing = keys.reduce((count, key) => count + (key ? 0 : 1), 0);
  if (missing) warnings.push(`${missing} unset key${missing === 1 ? "" : "s"}`);
  const counts = new Map<string, number>();
  for (const key of keys) {
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1);
  if (duplicates.length) {
    warnings.push(
      `Duplicate: ${duplicates.map(([key]) => keyLabel(key)).join(", ")}`,
    );
  }
  return warnings;
}
