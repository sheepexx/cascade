const KEY = "mania:commandRecents";
const MAX_RECENTS = 8;

/**
 * Most-recently-run command palette entries, newest first. Kept on the device
 * only: the palette fronts around forty actions in a fixed order, and floating
 * the handful someone actually uses to the top keeps that list usable as it
 * grows. Storage is best-effort, so every path here falls back to "no recents"
 * rather than breaking the palette.
 */
export function loadRecentCommands(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string").slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

/** Move `id` to the front and return the new list. */
export function rememberCommand(id: string, current = loadRecentCommands()): string[] {
  const next = [id, ...current.filter((existing) => existing !== id)].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked - recents are only a convenience.
  }
  return next;
}

/**
 * Lift recently run entries to the top, newest first, leaving everything else
 * in its original order. Disabled entries stay put: promoting an action that
 * can't run would only push a usable one out of view.
 */
export function orderByRecency<T extends { id: string; disabled?: boolean }>(
  items: T[],
  recents: readonly string[],
): T[] {
  if (!recents.length) return items;
  const rank = new Map(recents.map((id, index) => [id, index]));
  const promoted: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (!item.disabled && rank.has(item.id)) promoted.push(item);
    else rest.push(item);
  }
  promoted.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...promoted, ...rest];
}
