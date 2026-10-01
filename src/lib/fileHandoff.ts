import { ownBlob } from "./ownedBlobs";

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

function request<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(HANDOFF_STORE, mode);
    const req = run(tx.objectStore(HANDOFF_STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Reads the parked files into memory, then deletes them, so nothing the editor
 * goes on to read depends on a record that is gone.
 */
export async function takeHandedOffFiles(): Promise<File[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(HANDOFF_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HANDOFF_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    const parked = await request<unknown>(db, "readonly", (store) => store.get(HANDOFF_KEY));
    const files = await Promise.all(filesFromParked(parked).map((file) => ownBlob(file)));
    await request(db, "readwrite", (store) => store.delete(HANDOFF_KEY));
    return files.filter((file): file is File => file instanceof File);
  } finally {
    db.close();
  }
}
