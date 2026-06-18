import type {
  AppSettings,
  BackgroundScope,
  Difficulty,
  SongMeta,
  TimingPoint,
  ViewState,
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
const VERSION = 1;

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
  audio: { name: string; blob: Blob } | null;
  background: { name: string; blob: Blob } | null;
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
