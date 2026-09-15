import { useSyncExternalStore } from "react";
import type { Difficulty, SongMeta } from "../types";
import {
  deleteClipAssets,
  pruneClipAssets,
  type ClipAssetInfo,
} from "./clipboardAssets";
import type { PatternNote } from "./patterns";

export type NoteClip = {
  kind: "notes";
  id: string;
  notes: PatternNote[];
  /** The osu! timestamp this copy also put on the system clipboard. */
  timestamp?: string;
};

export type DifficultyClip = {
  kind: "difficulty";
  id: string;
  difficulty: Difficulty;
  /** "Artist - Title" of the map it was copied from. */
  source?: string;
  /** The source map's song details, for pasting into a map that has none. */
  meta?: SongMeta;
  /** Music, background and video saved alongside, see clipboardAssets. */
  assets?: ClipAssetInfo[];
};

export type ClipEntry = NoteClip | DifficultyClip;

export type ClipboardState = {
  /** The entry Ctrl+V pastes. */
  activeId: string | null;
  /** Newest first. */
  entries: ClipEntry[];
};

const STORAGE_KEY = "mania-editor:clipboard";
const MAX_ENTRIES = 8;
const EMPTY: ClipboardState = { activeId: null, entries: [] };

function isEntry(value: unknown): value is ClipEntry {
  const entry = value as ClipEntry | null;
  if (!entry || typeof entry.id !== "string") return false;
  if (entry.kind === "notes") return Array.isArray(entry.notes);
  if (entry.kind === "difficulty") {
    return (
      Array.isArray(entry.difficulty?.notes) &&
      Array.isArray(entry.difficulty?.timingPoints)
    );
  }
  return false;
}

export function parseClipboard(raw: string | null): ClipboardState {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<ClipboardState>;
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.filter(isEntry).slice(0, MAX_ENTRIES)
      : [];
    const activeId = entries.some((e) => e.id === parsed.activeId)
      ? (parsed.activeId as string)
      : null;
    return { activeId, entries };
  } catch {
    return EMPTY;
  }
}

function read(): ClipboardState {
  try {
    return parseClipboard(localStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY;
  }
}

// Kept in storage rather than component state so a copy survives switching
// difficulty, opening another project, a reload, or another tab. A few long
// difficulties can outgrow the quota; the saved copy then drops the oldest
// entries until it fits, while this tab keeps them all.
function write(next: ClipboardState) {
  for (let keep = next.entries.length; keep >= 0; keep--) {
    const entries = next.entries.slice(0, keep);
    const activeId = entries.some((e) => e.id === next.activeId)
      ? next.activeId
      : null;
    try {
      if (entries.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeId, entries }));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      return;
    } catch {
      // Over quota, or storage is blocked: retry with fewer entries.
    }
  }
}

let state: ClipboardState = read();
const listeners = new Set<() => void>();

if (typeof indexedDB !== "undefined") {
  void pruneClipAssets(new Set(state.entries.map((e) => e.id))).catch(() => {});
}

function commit(next: ClipboardState) {
  const kept = new Set(next.entries.map((e) => e.id));
  const dropped = state.entries
    .filter((e) => e.kind === "difficulty" && e.assets?.length && !kept.has(e.id))
    .map((e) => e.id);
  state = next;
  write(next);
  if (dropped.length) void deleteClipAssets(dropped).catch(() => {});
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    state = read();
    for (const listener of listeners) listener();
  });
}

export function getClipboard(): ClipboardState {
  return state;
}

export function activeClip(from: ClipboardState = state): ClipEntry | null {
  return from.entries.find((e) => e.id === from.activeId) ?? null;
}

/** Puts an entry on top of the pasteboard and makes it the one Ctrl+V pastes. */
export function pushClip(entry: ClipEntry) {
  commit({
    activeId: entry.id,
    entries: [entry, ...state.entries.filter((e) => e.id !== entry.id)].slice(
      0,
      MAX_ENTRIES,
    ),
  });
}

export function selectClip(id: string) {
  if (state.activeId === id || !state.entries.some((e) => e.id === id)) return;
  commit({ ...state, activeId: id });
}

export function clearClipboard() {
  commit(EMPTY);
}

export function subscribeClipboard(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useClipboard(): ClipboardState {
  return useSyncExternalStore(subscribeClipboard, getClipboard);
}
