/**
 * Files handed over from a static page on this site (the map viewer page
 * takes a dropped .osz) to the editor. The page parks them in IndexedDB and
 * opens /?open=handoff; the editor collects them once on start and opens them
 * like files from the system's "Open with". public/map-viewer.js writes the
 * same database, store and record shape.
 */

export const HANDOFF_DB = "cascade-handoff";
export const HANDOFF_STORE = "files";
export const HANDOFF_KEY = "pending";
export const HANDOFF_PARAM = "handoff";
/** A handoff older than this was abandoned; ignore it. */
export const HANDOFF_MAX_AGE_MS = 10 * 60_000;

type Parked = { at: number; files: Array<{ name: string; type: string; blob: Blob }> };

/** Whether this page load came from a handoff. */
export function isHandoffUrl(search: string): boolean {
  return new URLSearchParams(search).get("open") === HANDOFF_PARAM;
}

/** Turns a parked record into files, or nothing if it's stale or malformed. */
export function filesFromParked(record: unknown, now = Date.now()): File[] {
  if (!record || typeof record !== "object") return [];
  const { at, files } = record as Partial<Parked>;
  if (typeof at !== "number" || now - at > HANDOFF_MAX_AGE_MS || now < at - 60_000) return [];
  if (!Array.isArray(files)) return [];
  return files
    .filter((f) => f && typeof f.name === "string" && f.blob instanceof Blob)
    .map((f) => new File([f.blob], f.name, { type: f.type || f.blob.type }));
}

/** Reads and deletes the parked files. */
export async function takeHandedOffFiles(): Promise<File[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(HANDOFF_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HANDOFF_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    return await new Promise<File[]>((resolve, reject) => {
      const tx = db.transaction(HANDOFF_STORE, "readwrite");
      const store = tx.objectStore(HANDOFF_STORE);
      const get = store.get(HANDOFF_KEY);
      get.onsuccess = () => {
        store.delete(HANDOFF_KEY);
        tx.oncomplete = () => resolve(filesFromParked(get.result));
      };
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
