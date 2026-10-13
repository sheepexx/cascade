/**
 * The emoji the message picker offers, from emojibase. The data is a few
 * hundred kilobytes, so it loads on first use into a chunk of its own.
 */

export type EmojiEntry = { unicode: string; label: string; search: string };
export type EmojiGroup = { id: number; emojis: EmojiEntry[] };

type Compact = { unicode: string; label: string; group?: number; order?: number; tags?: string[] };

/** emojibase groups in the picker, in order; 2 (skin tone pieces) is left out. */
export const EMOJI_GROUPS = [0, 1, 3, 4, 5, 6, 7, 8, 9] as const;

/** Offered first for reactions, before anyone has recent ones. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "😮", "😢"];

let loading: Promise<EmojiGroup[]> | null = null;

export function loadEmoji(): Promise<EmojiGroup[]> {
  loading ??= import("emojibase-data/en/compact.json")
    .then((mod) => {
      const data = (mod as unknown as { default: Compact[] }).default;
      const byGroup = new Map<number, Compact[]>();
      for (const e of data) {
        if (e.group === undefined || !EMOJI_GROUPS.includes(e.group as (typeof EMOJI_GROUPS)[number])) continue;
        const list = byGroup.get(e.group) ?? [];
        list.push(e);
        byGroup.set(e.group, list);
      }
      return EMOJI_GROUPS.map((id) => ({
        id,
        emojis: (byGroup.get(id) ?? [])
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((e) => ({
            unicode: e.unicode,
            label: e.label,
            search: [e.label, ...(e.tags ?? [])].join(" ").toLowerCase(),
          })),
      }));
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

/** Emoji whose name or tags contain every word of the query. */
export function searchEmoji(groups: readonly EmojiGroup[], query: string, limit = 120): EmojiEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: EmojiEntry[] = [];
  for (const group of groups) {
    for (const e of group.emojis) {
      if (words.every((w) => e.search.includes(w))) {
        out.push(e);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

const RECENT_KEY = "cascade:recent-emoji";
const RECENT_MAX = 24;

export function recentEmoji(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((e): e is string => typeof e === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(emoji: string): void {
  try {
    const next = [emoji, ...recentEmoji().filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Recent emoji are a convenience; nothing is lost without them.
  }
}
