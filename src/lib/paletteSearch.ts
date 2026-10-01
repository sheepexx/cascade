/**
 * Ranking for the Ctrl+K palette. A command matches when every word of the
 * query appears in its label, group, aliases or keywords; how well it matches
 * decides the order. Aliases are other names people use for the same thing
 * ("bpm" for Timing), so they rank close to the label. Keywords only make a
 * command findable.
 */

export type Searchable = {
  label: string;
  group: string;
  keywords?: string;
  aliases?: readonly string[];
};

const lower = (s: string) => s.toLocaleLowerCase();

/** -1 for no match, otherwise higher is better. An empty query matches all. */
export function rankCommand(command: Searchable, rawQuery: string): number {
  const query = lower(rawQuery.trim());
  if (!query) return 1;
  const label = lower(command.label);
  const aliases = (command.aliases ?? []).map(lower);
  const haystack = `${label} ${lower(command.group)} ${aliases.join(" ")} ${lower(command.keywords ?? "")}`;
  const tokens = query.split(/\s+/).filter(Boolean);
  if (!tokens.every((token) => haystack.includes(token))) return -1;
  if (label === query) return 100;
  if (aliases.includes(query)) return 90;
  if (label.startsWith(query)) return 60;
  if (aliases.some((alias) => alias.startsWith(query))) return 50;
  if (label.includes(query)) return 30;
  if (aliases.some((alias) => alias.includes(query))) return 25;
  // Every word starts a word of the label: "exp osz" for "Export .osz".
  const words = label.split(/[\s.\-–—/]+/).filter(Boolean);
  if (tokens.every((token) => words.some((word) => word.startsWith(token)))) return 20;
  return 10;
}

/** Commands matching the query, best first, ties in their listed order. */
export function searchCommands<T extends Searchable>(commands: readonly T[], query: string): T[] {
  return commands
    .map((command, order) => ({ command, order, score: rankCommand(command, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.command);
}

const NEW_SEEN_KEY = "cascade:palette-new-seen";
/** How long a "New" badge stays after the palette first shows it. */
export const NEW_BADGE_MS = 14 * 24 * 60 * 60_000;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function storage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadNewSeen(store: StorageLike | null = storage()): Record<string, number> {
  try {
    const raw = store?.getItem(NEW_SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, at]) => typeof at === "number" && Number.isFinite(at)),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Notes when the palette first showed each new command; returns the map. */
export function markNewSeen(
  ids: readonly string[],
  now = Date.now(),
  store: StorageLike | null = storage(),
): Record<string, number> {
  const seen = loadNewSeen(store);
  let changed = false;
  for (const id of ids) {
    if (seen[id] === undefined) {
      seen[id] = now;
      changed = true;
    }
  }
  if (changed) {
    try {
      store?.setItem(NEW_SEEN_KEY, JSON.stringify(seen));
    } catch {
      // The badge then simply shows again next time.
    }
  }
  return seen;
}

/** Stored in place of a first sighting once the command has been used. */
const RETIRED = -1;

/** Running a new command ends its badge for good. */
export function retireNewBadge(
  id: string,
  store: StorageLike | null = storage(),
): Record<string, number> {
  const seen = { ...loadNewSeen(store), [id]: RETIRED };
  try {
    store?.setItem(NEW_SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Recents still hide it while the command is among them.
  }
  return seen;
}

/** A "New" badge shows until the command is used or two weeks have passed. */
export function showNewBadge(
  id: string,
  seen: Readonly<Record<string, number>>,
  used: readonly string[],
  now = Date.now(),
): boolean {
  if (used.includes(id)) return false;
  const first = seen[id];
  if (first === undefined) return true;
  return first !== RETIRED && now - first < NEW_BADGE_MS;
}
