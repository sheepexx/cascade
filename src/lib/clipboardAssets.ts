import { uniqueFileName } from "./imageConvert";
import { t } from "./i18n/core";

export type ClipAssetKind = "audio" | "background" | "video";

export type ClipAsset = { kind: ClipAssetKind; name: string; blob: Blob };

/** What a clipboard entry remembers about its files, without the bytes. */
export type ClipAssetInfo = { kind: ClipAssetKind; name: string; bytes: number };

type AssetRecord = { savedAt: number; files: ClipAsset[] };

// A copied difficulty's music, background and video are far too big for the
// localStorage entry that lists it, so they live in their own database, keyed
// by the clipboard entry's id.
const DB_NAME = "mania-editor-clipboard";
const STORE = "assets";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error(t("lib.storageUnavailable")));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          dbPromise = null;
          db.close();
        };
        resolve(db);
      };
      req.onerror = () =>
        reject(req.error ?? new Error(t("lib.storageOpen")));
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function run<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = body(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error ?? new Error(t("lib.storageError")));
    tx.onabort = () =>
      reject(tx.error ?? new Error(t("lib.storageAborted")));
  });
}

export async function saveClipAssets(clipId: string, files: ClipAsset[]) {
  const record: AssetRecord = { savedAt: Date.now(), files };
  await run("readwrite", (store) => {
    store.put(record, clipId);
  });
}

export async function loadClipAssets(clipId: string): Promise<ClipAsset[]> {
  const record = (await run("readonly", (store) => store.get(clipId))) as
    | AssetRecord
    | undefined;
  return record?.files ?? [];
}

export async function deleteClipAssets(clipIds: string[]) {
  if (!clipIds.length) return;
  await run("readwrite", (store) => {
    for (const id of clipIds) store.delete(id);
  });
}

/**
 * Drops files whose entry left the clipboard while no tab was around to
 * delete them. Recent ones stay, in case another tab has saved its files but
 * not yet listed the copy they belong to.
 */
export async function pruneClipAssets(keep: Set<string>, olderThanMs = 60_000) {
  const cutoff = Date.now() - olderThanMs;
  await run("readwrite", (store) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const record = cursor.value as AssetRecord;
      if (!keep.has(String(cursor.key)) && record.savedAt < cutoff) {
        cursor.delete();
      }
      cursor.continue();
    };
  });
}

async function digest(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

async function sameBytes(a: Blob, b: Blob): Promise<boolean> {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  return x === y;
}

/**
 * Where each copied file lands in the map it is pasted into. A file the map
 * already has under the same name with the same bytes is reused; one whose
 * name is taken by other bytes is added under a free name; anything else is
 * added as it was.
 */
export async function placeClipAssets(
  files: ClipAsset[],
  existing: Record<ClipAssetKind, Record<string, { blob: Blob }>>,
): Promise<{
  names: Partial<Record<ClipAssetKind, string>>;
  added: ClipAsset[];
}> {
  const names: Partial<Record<ClipAssetKind, string>> = {};
  const added: ClipAsset[] = [];
  for (const file of files) {
    const pool = existing[file.kind];
    const same = pool[file.name];
    if (same && (await sameBytes(same.blob, file.blob))) {
      names[file.kind] = file.name;
      continue;
    }
    const taken = new Set(
      [
        ...Object.keys(pool),
        ...added.filter((a) => a.kind === file.kind).map((a) => a.name),
      ].map((name) => name.toLowerCase()),
    );
    const name = uniqueFileName(file.name, taken);
    names[file.kind] = name;
    added.push({ ...file, name });
  }
  return { names, added };
}
