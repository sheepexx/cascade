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
  HitsoundSkinSource,
  SongMeta,
  TimingPoint,
} from "../types";

/**
 * Local project persistence via IndexedDB.
 *
 * The whole working project - metadata, timing, every difficulty, the view
 * state, *and* the raw audio / background bytes - is stored as a single record.
 * IndexedDB is used instead of localStorage because audio files are Blobs that
 * are both too large for localStorage's ~5 MB budget and not JSON-serializable.
 */

const DB_NAME = "mania-editor";
const STORE = "project";
const KEY = "current";
/** Key (in the same store) for the site-level editor skin blob. */
const SKIN_KEY = "skin";
const HITSOUND_SKIN_KEY = "skin:hitsounds";
const SKIN_LIBRARY_KEY = "skin:library";
const VERSION = 1;

/** localStorage key for the small, JSON-serialisable site preferences. */
const PREFS_KEY = "mania-editor:prefs";
/** localStorage key for the playback volume (perceived slider position 0..1). */
const VOLUME_KEY = "mania-editor:volume";
/** localStorage key for editor view controls such as snap and scroll speed. */
const VIEW_KEY = "mania-editor:view";
const HITSOUND_SKIN_SOURCE_KEY = "mania-editor:hitsound-skin-source";

const projectKey = (id?: string | null) =>
  !id || id === KEY ? KEY : `local:${id}`;

const projectIdFromKey = (key: IDBValidKey) => {
  if (key === KEY) return KEY;
  return typeof key === "string" && key.startsWith("local:")
    ? key.slice("local:".length)
    : null;
};

/** Everything needed to bring the editor back exactly as the user left it. */
export type SavedProject = {
  version: number;
  /** Stable local-project id. Legacy saves may not have one. */
  localId?: string;
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

export type LocalProjectSummary = {
  id: string;
  title: string;
  artist: string;
  creator: string;
  updatedAt: number;
  difficultyCount: number;
  /** Format of the original imported map, if known. */
  sourceFormat?: "osu" | "sm";
  /** A background image blob to use as the start-menu thumbnail, if any. */
  backgroundBlob?: Blob;
};

export type SavedSkinBlob = {
  name: string;
  blob: Blob;
  savedAt?: number;
};

/**
 * Pick a background blob to use as a thumbnail: prefer the active difficulty's
 * background, then any background in the set, then the legacy single background.
 */
function pickLocalBackground(project: SavedProject): Blob | undefined {
  const files = project.backgroundFiles ?? [];
  const active =
    project.difficulties.find((d) => d.id === project.activeId) ??
    project.difficulties[0];
  const wanted = active?.backgroundFilename;
  if (wanted) {
    const hit = files.find((f) => f.name === wanted);
    if (hit) return hit.blob;
  }
  return files[0]?.blob ?? project.background?.blob ?? undefined;
}

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

/** Persist a local project, overwriting the record with the same id. */
export async function saveProject(
  project: SavedProject,
  localId: string = KEY,
): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ ...project, localId }, projectKey(localId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Load a saved local project, or null if nothing has been saved for that id. */
export async function loadProject(localId: string = KEY): Promise<SavedProject | null> {
  const db = await openDb();
  try {
    return await new Promise<SavedProject | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(projectKey(localId));
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

/** List local projects newest first, including the legacy single-slot save. */
export async function listLocalProjects(): Promise<LocalProjectSummary[]> {
  const db = await openDb();
  try {
    return await new Promise<LocalProjectSummary[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const keysReq = store.getAllKeys();
      keysReq.onerror = () => reject(keysReq.error);
      keysReq.onsuccess = () => {
        const keys = keysReq.result;
        const projectKeys = keys.filter((key) => projectIdFromKey(key));
        if (!projectKeys.length) {
          resolve([]);
          return;
        }

        const rows: LocalProjectSummary[] = [];
        let pending = projectKeys.length;
        for (const key of projectKeys) {
          const req = store.get(key);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const project = req.result as SavedProject | undefined;
            const id = projectIdFromKey(key);
            if (id && project?.version === VERSION) {
              rows.push({
                id,
                title: project.meta.title,
                artist: project.meta.artist,
                creator: project.meta.creator,
                updatedAt: project.savedAt,
                difficultyCount: project.difficulties.length,
                sourceFormat: project.difficulties[0]?.sourceFormat,
                backgroundBlob: pickLocalBackground(project),
              });
            }
            pending -= 1;
            if (pending === 0) {
              rows.sort((a, b) => b.updatedAt - a.updatedAt);
              resolve(rows);
            }
          };
        }
      };
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Remove a saved local project. */
export async function clearProject(localId: string = KEY): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(projectKey(localId));
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
    /* storage full / unavailable - settings just won't persist */
  }
}

/** Load the saved app settings, or null if none / unreadable. */
export function loadPreferences(): Partial<AppSettings> | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppSettings> & {
      dimBackground?: boolean | number;
    };
    const dimBackground =
      typeof parsed.dimBackground === "boolean"
        ? parsed.dimBackground
          ? 100
          : 0
        : Number(parsed.dimBackground);
    const next = { ...parsed };
    // Only carry a valid dim value through; otherwise drop the key entirely so
    // the caller's default applies (an explicit `undefined` would override it
    // when spread, surfacing as "NaN%" in the settings UI).
    if (Number.isFinite(dimBackground)) {
      next.dimBackground = Math.max(0, Math.min(100, dimBackground));
    } else {
      delete next.dimBackground;
    }
    return next;
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

/** Persist (or clear) the selected skin used only for hitsound playback. */
export async function saveHitsoundSkinBlob(
  skin: SavedSkinBlob | null,
): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      if (skin) store.put(skin, HITSOUND_SKIN_KEY);
      else store.delete(HITSOUND_SKIN_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Load the selected hitsound-only skin bytes, or null if none. */
export async function loadHitsoundSkinBlob(): Promise<SavedSkinBlob | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(HITSOUND_SKIN_KEY);
      req.onsuccess = () =>
        resolve((req.result as SavedSkinBlob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Add or update an imported `.osk` in the reusable local skin library. */
export async function saveSkinToLibrary(skin: {
  name: string;
  blob: Blob;
}): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.get(SKIN_LIBRARY_KEY);
      req.onsuccess = () => {
        const existing = (req.result as SavedSkinBlob[] | undefined) ?? [];
        const now = Date.now();
        const next = [
          { ...skin, savedAt: now },
          ...existing.filter((item) => item.name !== skin.name),
        ];
        store.put(next, SKIN_LIBRARY_KEY);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Load all user-imported skins saved in the reusable local library. */
export async function loadSkinLibrary(): Promise<SavedSkinBlob[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(SKIN_LIBRARY_KEY);
      req.onsuccess = () =>
        resolve(
          ((req.result as SavedSkinBlob[] | undefined) ?? []).sort(
            (a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0),
          ),
        );
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export function saveHitsoundSkinSource(source: HitsoundSkinSource): void {
  try {
    localStorage.setItem(HITSOUND_SKIN_SOURCE_KEY, source);
  } catch {
    /* ignore */
  }
}

export function loadHitsoundSkinSource(): HitsoundSkinSource {
  try {
    const raw = localStorage.getItem(HITSOUND_SKIN_SOURCE_KEY);
    return raw === "default" || raw === "selected" || raw === "visual"
      ? raw
      : "visual";
  } catch {
    return "visual";
  }
}
