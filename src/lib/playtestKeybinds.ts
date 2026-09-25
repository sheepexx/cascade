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
 * for a key, the way osu!stable does: keys go in lane by lane as they are
 * typed, even when a later lane still holds one of them. `typed` lists the
 * lanes already set in this pass; retyping one of their keys moves it.
 * Clashes with lanes outside the pass are settled once the queue runs out.
 */
export function assignPlaytestKey(
  keys: string[],
  queue: number[],
  code: string,
  typed: number[] = [],
): { keys: string[]; queue: number[]; typed: number[] } {
  const [column, ...rest] = queue;
  if (column === undefined) return { keys, queue: [], typed };
  const next = [...keys];
  const retyped = typed.find((lane) => lane !== column && next[lane] === code);
  if (retyped !== undefined) {
    next[retyped] = "";
    if (!rest.includes(retyped)) rest.push(retyped);
  }
  next[column] = code;
  const nextTyped = [...typed.filter((lane) => lane !== column), column];
  if (rest.length) return { keys: next, queue: rest, typed: nextTyped };
  const settled = settlePlaytestKeys(next, nextTyped);
  return { keys: settled.keys, queue: settled.cleared, typed: nextTyped };
}

/**
 * Ends a binding pass: a lane outside `typed` that shares a key with a lane
 * set in the pass gives it up. The cleared lanes are returned so they can be
 * asked for a new key.
 */
export function settlePlaytestKeys(
  keys: string[],
  typed: number[],
): { keys: string[]; cleared: number[] } {
  const taken = new Set(typed.map((lane) => keys[lane]).filter(Boolean));
  const next = [...keys];
  const cleared: number[] = [];
  next.forEach((key, lane) => {
    if (key && !typed.includes(lane) && taken.has(key)) {
      next[lane] = "";
      cleared.push(lane);
    }
  });
  return { keys: next, cleared };
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
