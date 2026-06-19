import {
  DEFAULT_VIEW,
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  SNAP_DIVISORS,
  type SnapDivisor,
  type ViewState,
} from "../types";
import type {
  AppSettings,
  BackgroundScope,
  Difficulty,
  SongMeta,
  TimingPoint,
} from "../types";

/**
 * Local project persistence via IndexedDB.
 *
 * The whole working project — metadata, timing, every difficulty, the view
 * state, *and* the raw audio / background bytes — is stored as a single record.
 * IndexedDB is used instead of localStorage because audio files are Blobs that
 * are both too large for localStorage's ~5 MB budget and not JSON-serializable.
 */

const DB_NAME = "mania-editor";
const STORE = "project";
const KEY = "current";
/** Key (in the same store) for the site-level editor skin blob. */
const SKIN_KEY = "skin";
const VERSION = 1;

/** localStorage key for the small, JSON-serialisable site preferences. */
const PREFS_KEY = "mania-editor:prefs";
/** localStorage key for the playback volume (perceived slider position 0..1). */
const VOLUME_KEY = "mania-editor:volume";
/** localStorage key for editor view controls such as snap and scroll speed. */
const VIEW_KEY = "mania-editor:view";

/** Everything needed to bring the editor back exactly as the user left it. */
export type SavedProject = {
  version: number;
  savedAt: number;
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
  activeId: string;
  view: ViewState;
  appSettings: AppSettings;
  bgScope: BackgroundScope;
  /** Every audio file in the set, keyed by filename. */
  audioFiles?: { name: string; blob: Blob }[];
  /** Legacy single-audio field, still read from older saves. */
  audio?: { name: string; blob: Blob } | null;
  /** Every background image in the set, keyed by filename. New format. */
  backgroundFiles?: { name: string; blob: Blob }[];
  /** Legacy single background field, still read from older saves. */
  background?: { name: string; blob: Blob } | null;
  /** Raw `.osk` bytes of the active editor skin, re-parsed on load. */
  skin?: { name: string; blob: Blob } | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist the current project, overwriting any previous save. */
export async function saveProject(project: SavedProject): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(project, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Load the last saved project, or null if nothing has been saved. */
export async function loadProject(): Promise<SavedProject | null> {
  const db = await openDb();
  try {
    return await new Promise<SavedProject | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        const value = req.result as SavedProject | undefined;
        resolve(value && value.version === VERSION ? value : null);
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Remove the saved project. */
export async function clearProject(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// ---- Site preferences (general settings), persisted independently of a map ---

/** Persist the general app settings to localStorage. Cheap and synchronous. */
export function savePreferences(prefs: AppSettings): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage full / unavailable — settings just won't persist */
  }
}

/** Load the saved app settings, or null if none / unreadable. */
export function loadPreferences(): Partial<AppSettings> | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Partial<AppSettings>) : null;
  } catch {
    return null;
  }
}

/** Persist editor view controls to localStorage. */
export function saveViewPreferences(view: ViewState): void {
  try {
    localStorage.setItem(
      VIEW_KEY,
      JSON.stringify({
        snapDivisor: view.snapDivisor,
        scrollSpeed: view.scrollSpeed,
      }),
    );
  } catch {
    /* ignore */
  }
}

/** Load saved editor view controls, clamped to currently supported values. */
export function loadViewPreferences(): ViewState | null {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ViewState>;
    const snapDivisor = SNAP_DIVISORS.includes(
      parsed.snapDivisor as SnapDivisor,
    )
      ? (parsed.snapDivisor as SnapDivisor)
      : DEFAULT_VIEW.snapDivisor;
    const scrollSpeed = Number(parsed.scrollSpeed);
    return {
      snapDivisor,
      scrollSpeed: Number.isFinite(scrollSpeed)
        ? Math.round(
            Math.min(
              MAX_SCROLL_SPEED,
              Math.max(MIN_SCROLL_SPEED, scrollSpeed),
            ),
          )
        : DEFAULT_VIEW.scrollSpeed,
    };
  } catch {
    return null;
  }
}

/** Persist the playback volume (0..1). */
export function saveVolume(volume: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    /* ignore */
  }
}

/** Load the saved playback volume (clamped 0..1), or null if none. */
export function loadVolume(): number | null {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
  } catch {
    return null;
  }
}

// ---- Site skin, persisted independently of a map ----------------------------

/** Persist (or clear, when null) the editor skin's raw `.osk` bytes. */
export async function saveSkinBlob(
  skin: { name: string; blob: Blob } | null,
): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      if (skin) store.put(skin, SKIN_KEY);
      else store.delete(SKIN_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Load the saved editor skin bytes, or null if none. */
export async function loadSkinBlob(): Promise<{
  name: string;
  blob: Blob;
} | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(SKIN_KEY);
      req.onsuccess = () =>
        resolve((req.result as { name: string; blob: Blob } | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
