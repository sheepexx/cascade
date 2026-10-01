import { useSyncExternalStore } from "react";

/**
 * A short history of what the app told the user on this device: saves and
 * imports that failed, export checks that found differences, and the like.
 * Toasts go away after a few seconds; this keeps them so one that went by
 * unnoticed can be found again in the inbox. It stays in this browser and
 * holds messages only, never map data.
 */

export type ActivityTone = "info" | "success" | "warning" | "error";

export type ActivityEntry = {
  id: string;
  tone: ActivityTone;
  title: string;
  body?: string;
  /** Longer text behind a Details toggle, copied as is. */
  details?: string;
  createdAt: number;
  readAt: number | null;
};

export type ActivityInput = {
  tone: ActivityTone;
  title: string;
  body?: string;
  details?: string;
  /** Already seen, so it doesn't count towards the unread badge. */
  read?: boolean;
};

export type ActivityLog = {
  list(): readonly ActivityEntry[];
  add(input: ActivityInput): string;
  markRead(id: string): void;
  markUnread(id: string): void;
  markAllRead(): void;
  dismiss(id: string): void;
  subscribe(listener: () => void): () => void;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const ACTIVITY_LIMIT = 40;
export const ACTIVITY_STORAGE_KEY = "cascade:activity";
/** The same message again within this long is a repeat, not a new entry. */
export const ACTIVITY_REPEAT_MS = 10_000;
const MAX_TEXT = 300;
const MAX_DETAILS = 20_000;
const TONES = new Set<ActivityTone>(["info", "success", "warning", "error"]);

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Keeps only well-formed entries from whatever was stored. */
export function sanitizeActivity(raw: unknown): ActivityEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ActivityEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const title = clip(e.title, MAX_TEXT);
    if (typeof e.id !== "string" || !title) continue;
    if (typeof e.tone !== "string" || !TONES.has(e.tone as ActivityTone)) continue;
    if (typeof e.createdAt !== "number" || !Number.isFinite(e.createdAt)) continue;
    out.push({
      id: e.id,
      tone: e.tone as ActivityTone,
      title,
      body: clip(e.body, MAX_TEXT),
      details: clip(e.details, MAX_DETAILS),
      createdAt: e.createdAt,
      readAt: typeof e.readAt === "number" ? e.readAt : null,
    });
    if (out.length >= ACTIVITY_LIMIT) break;
  }
  return out;
}

let idCounter = 0;
function defaultId(): string {
  idCounter += 1;
  return `act-${Date.now().toString(36)}-${idCounter}`;
}

export function createActivityLog({
  storage,
  now = Date.now,
  makeId = defaultId,
}: {
  storage: StorageLike | null;
  now?: () => number;
  makeId?: () => string;
}): ActivityLog {
  let entries: readonly ActivityEntry[] = [];
  try {
    const stored = storage?.getItem(ACTIVITY_STORAGE_KEY);
    entries = stored ? sanitizeActivity(JSON.parse(stored)) : [];
  } catch {
    entries = [];
  }
  const listeners = new Set<() => void>();

  const commit = (next: readonly ActivityEntry[]) => {
    entries = next;
    try {
      storage?.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing or a full quota: the history lasts for this session.
    }
    for (const listener of listeners) listener();
  };
  const update = (id: string, change: (e: ActivityEntry) => ActivityEntry) => {
    if (!entries.some((e) => e.id === id)) return;
    commit(entries.map((e) => (e.id === id ? change(e) : e)));
  };

  return {
    list: () => entries,
    add(input) {
      const at = now();
      const title = clip(input.title, MAX_TEXT) ?? "";
      const body = clip(input.body, MAX_TEXT);
      const details = clip(input.details, MAX_DETAILS);
      const readAt = input.read ? at : null;
      const repeat = entries.find(
        (e) =>
          e.tone === input.tone &&
          e.title === title &&
          e.body === body &&
          at - e.createdAt < ACTIVITY_REPEAT_MS,
      );
      if (repeat) {
        const bumped = { ...repeat, details, createdAt: at, readAt: readAt ?? null };
        commit([bumped, ...entries.filter((e) => e.id !== repeat.id)]);
        return repeat.id;
      }
      const entry: ActivityEntry = { id: makeId(), tone: input.tone, title, body, details, createdAt: at, readAt };
      commit([entry, ...entries].slice(0, ACTIVITY_LIMIT));
      return entry.id;
    },
    markRead: (id) => update(id, (e) => (e.readAt === null ? { ...e, readAt: now() } : e)),
    markUnread: (id) => update(id, (e) => ({ ...e, readAt: null })),
    markAllRead() {
      if (entries.every((e) => e.readAt !== null)) return;
      const at = now();
      commit(entries.map((e) => (e.readAt === null ? { ...e, readAt: at } : e)));
    },
    dismiss(id) {
      if (!entries.some((e) => e.id === id)) return;
      commit(entries.filter((e) => e.id !== id));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let shared: ActivityLog | null = null;

/** This browser's activity log. */
export function activityLog(): ActivityLog {
  if (!shared) {
    let storage: StorageLike | null;
    try {
      storage = typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      // Reading localStorage throws when the browser blocks site data.
      storage = null;
    }
    shared = createActivityLog({ storage });
  }
  return shared;
}

export function useActivityLog(): readonly ActivityEntry[] {
  const log = activityLog();
  return useSyncExternalStore(log.subscribe, log.list, log.list);
}
