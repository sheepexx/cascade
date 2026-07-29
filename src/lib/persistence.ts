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

const DB_NAME = "mania-editor";
const STORE = "project";
const KEY = "current";
const SKIN_KEY = "skin";
const HITSOUND_SKIN_KEY = "skin:hitsounds";
const SKIN_LIBRARY_KEY = "skin:library";
const LEGACY_VERSION = 1;
const VERSION = 2;
export const PROJECT_VERSION = VERSION;

const PREFS_KEY = "mania-editor:prefs";
const VOLUME_KEY = "mania-editor:volume";
const VIEW_KEY = "mania-editor:view";
const HITSOUND_SKIN_SOURCE_KEY = "mania-editor:hitsound-skin-source";
const LOCALE_KEY = "mania-editor:locale";

const projectKey = (id?: string | null) =>
  !id || id === KEY ? KEY : `local:${id}`;

const projectIdFromKey = (key: IDBValidKey) => {
  if (key === KEY) return KEY;
  return typeof key === "string" && key.startsWith("local:")
    ? key.slice("local:".length)
    : null;
};

const mediaKeyFor = (key: string) => `media:${key}`;

export type SavedProject = {
  version: number;
  localId?: string;
  savedAt: number;
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
  activeId: string;
  view: ViewState;
  appSettings: AppSettings;
  bgScope: BackgroundScope;
  audioFiles?: { name: string; blob: Blob }[];
  audio?: { name: string; blob: Blob } | null;
  backgroundFiles?: { name: string; blob: Blob }[];
  videoFiles?: { name: string; blob: Blob }[];
  background?: { name: string; blob: Blob } | null;
  skin?: { name: string; blob: Blob } | null;
};

export type LocalProjectSummary = {
  id: string;
  title: string;
  artist: string;
  creator: string;
  updatedAt: number;
  difficultyCount: number;
  sourceFormat?: "osu" | "sm";
  backgroundBlob?: Blob;
};

export type SavedSkinBlob = {
  name: string;
  blob: Blob;
  savedAt?: number;
};

type MediaPayload = Pick<
  SavedProject,
  "audioFiles" | "audio" | "backgroundFiles" | "videoFiles" | "background" | "skin"
>;

type MediaRecord = MediaPayload & { signature: string };

const MEDIA_FIELDS: (keyof MediaPayload)[] = [
  "audioFiles",
  "audio",
  "backgroundFiles",
  "videoFiles",
  "background",
  "skin",
];

function fileTag(file: { name: string; blob: Blob } | null | undefined) {
  return file ? `${file.name}:${file.blob.size}:${file.blob.type}` : "-";
}

function mediaSignature(media: MediaPayload): string {
  return MEDIA_FIELDS.map((field) => {
    const value = media[field];
    return Array.isArray(value) ? value.map(fileTag).join(",") : fileTag(value);
  }).join("|");
}

function splitMedia(project: SavedProject): {
  chart: SavedProject;
  media: MediaPayload;
} {
  const chart = { ...project };
  const media: MediaPayload = {};
  for (const field of MEDIA_FIELDS) {
    if (field in chart) {
      (media as Record<string, unknown>)[field] = chart[field];
      delete chart[field];
    }
  }
  return { chart, media };
}

function mergeMedia(
  chart: SavedProject,
  media: MediaRecord | null | undefined,
): SavedProject {
  if (!media) return chart;
  const merged = { ...chart };
  for (const field of MEDIA_FIELDS) {
    (merged as Record<string, unknown>)[field] = media[field];
  }
  return merged;
}

const lastMediaSignature = new Map<string, string>();

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

const OPEN_TIMEOUT_MS = 15000;

function requestDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, VERSION);
    } catch (err) {
      reject(err);
      return;
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (run: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      run();
    };

    timer = setTimeout(() => {
      settle(() =>
        reject(
          new Error(
            "Timed out opening browser storage. Another tab with this editor may be blocking it.",
          ),
        ),
      );
    }, OPEN_TIMEOUT_MS);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => settle(() => resolve(req.result));
    req.onerror = () =>
      settle(() => reject(req.error ?? new Error("Could not open browser storage.")));
    req.onblocked = () =>
      settle(() =>
        reject(
          new Error(
            "Browser storage is blocked by another tab with this editor open.",
          ),
        ),
      );
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = requestDb().then(
      (db) => {
        db.onclose = () => {
          dbPromise = null;
        };
        db.onversionchange = () => {
          dbPromise = null;
          db.close();
        };
        return db;
      },
      (err) => {
        dbPromise = null;
        throw err;
      },
    );
  }
  return dbPromise;
}

let inFlight = 0;
let closeWhenIdle = false;

function releaseDb(): void {
  if (inFlight > 0) {
    closeWhenIdle = true;
    return;
  }
  closeWhenIdle = false;
  const pending = dbPromise;
  dbPromise = null;
  void pending?.then(
    (db) => db.close(),
    () => {},
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => queueMicrotask(releaseDb));
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, resolve: (value: T) => void) => void,
): Promise<T> {
  const attempt = async (retryOnClosed: boolean): Promise<T> => {
    const db = await openDb();
    try {
      return await new Promise<T>((resolve, reject) => {
        let value: T;
        let settled = false;
        const tx = db.transaction(STORE, mode);
        tx.oncomplete = () => {
          settled = true;
          resolve(value);
        };
        tx.onerror = () =>
          reject(tx.error ?? new Error("Browser storage write failed."));
        tx.onabort = () =>
          reject(tx.error ?? new Error("Browser storage write was aborted."));
        run(tx.objectStore(STORE), (v) => {
          value = v;
          if (settled) resolve(v);
        });
      });
    } catch (err) {
      const name = (err as Error | null)?.name;
      if (retryOnClosed && (name === "InvalidStateError" || name === "TransactionInactiveError")) {
        dbPromise = null;
        return attempt(false);
      }
      throw err;
    }
  };

  inFlight += 1;
  try {
    return await attempt(true);
  } finally {
    inFlight -= 1;
    if (inFlight === 0 && closeWhenIdle) releaseDb();
  }
}

export async function saveProject(
  project: SavedProject,
  localId: string = KEY,
): Promise<void> {
  const key = projectKey(localId);
  const { chart, media } = splitMedia(project);
  const signature = mediaSignature(media);
  const mediaUnchanged = lastMediaSignature.get(key) === signature;

  await withStore<void>("readwrite", (store) => {
    store.put({ ...chart, version: VERSION, localId }, key);
    if (!mediaUnchanged) store.put({ ...media, signature }, mediaKeyFor(key));
  });

  lastMediaSignature.set(key, signature);
}

export async function loadProject(localId: string = KEY): Promise<SavedProject | null> {
  const key = projectKey(localId);
  return withStore<SavedProject | null>("readonly", (store, resolve) => {
    const req = store.get(key);
    req.onsuccess = () => {
      const value = req.result as SavedProject | undefined;
      if (!value) {
        resolve(null);
        return;
      }
      if (value.version === LEGACY_VERSION) {
        resolve(value);
        return;
      }
      if (value.version !== VERSION) {
        resolve(null);
        return;
      }
      const mediaReq = store.get(mediaKeyFor(key));
      mediaReq.onsuccess = () => {
        const media = (mediaReq.result as MediaRecord | undefined) ?? null;
        if (media) lastMediaSignature.set(key, media.signature);
        resolve(mergeMedia(value, media));
      };
    };
  });
}

export async function listLocalProjects(): Promise<LocalProjectSummary[]> {
  return withStore<LocalProjectSummary[]>("readonly", (store, resolve) => {
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      const projectKeys = keysReq.result.filter((key) => projectIdFromKey(key));
      if (!projectKeys.length) {
        resolve([]);
        return;
      }

      const rows: LocalProjectSummary[] = [];
      let pending = projectKeys.length;
      const done = () => {
        pending -= 1;
        if (pending === 0) {
          rows.sort((a, b) => b.updatedAt - a.updatedAt);
          resolve(rows);
        }
      };

      for (const key of projectKeys) {
        const req = store.get(key);
        req.onsuccess = () => {
          const project = req.result as SavedProject | undefined;
          const id = projectIdFromKey(key);
          if (!id || !project) {
            done();
            return;
          }
          const add = (full: SavedProject) => {
            rows.push({
              id,
              title: full.meta.title,
              artist: full.meta.artist,
              creator: full.meta.creator,
              updatedAt: full.savedAt,
              difficultyCount: full.difficulties.length,
              sourceFormat: full.difficulties[0]?.sourceFormat,
              backgroundBlob: pickLocalBackground(full),
            });
            done();
          };

          if (project.version === LEGACY_VERSION) {
            add(project);
            return;
          }
          if (project.version !== VERSION) {
            done();
            return;
          }
          const mediaReq = store.get(mediaKeyFor(key as string));
          mediaReq.onsuccess = () =>
            add(mergeMedia(project, mediaReq.result as MediaRecord | undefined));
        };
      }
    };
  });
}

export async function clearProject(localId: string = KEY): Promise<void> {
  const key = projectKey(localId);
  await withStore<void>("readwrite", (store) => {
    store.delete(key);
    store.delete(mediaKeyFor(key));
  });
  lastMediaSignature.delete(key);
}

export function savePreferences(prefs: AppSettings): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
  }
}

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
  }
}

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

export function saveVolume(volume: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
  }
}

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

export function saveLocale(locale: string): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
  }
}

export function loadLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
}

export async function saveSkinBlob(
  skin: { name: string; blob: Blob } | null,
): Promise<void> {
  await withStore<void>("readwrite", (store) => {
    if (skin) store.put(skin, SKIN_KEY);
    else store.delete(SKIN_KEY);
  });
}

export async function loadSkinBlob(): Promise<{
  name: string;
  blob: Blob;
} | null> {
  return withStore<{ name: string; blob: Blob } | null>(
    "readonly",
    (store, resolve) => {
      const req = store.get(SKIN_KEY);
      req.onsuccess = () =>
        resolve(
          (req.result as { name: string; blob: Blob } | undefined) ?? null,
        );
    },
  );
}

export async function saveHitsoundSkinBlob(
  skin: SavedSkinBlob | null,
): Promise<void> {
  await withStore<void>("readwrite", (store) => {
    if (skin) store.put(skin, HITSOUND_SKIN_KEY);
    else store.delete(HITSOUND_SKIN_KEY);
  });
}

export async function loadHitsoundSkinBlob(): Promise<SavedSkinBlob | null> {
  return withStore<SavedSkinBlob | null>("readonly", (store, resolve) => {
    const req = store.get(HITSOUND_SKIN_KEY);
    req.onsuccess = () =>
      resolve((req.result as SavedSkinBlob | undefined) ?? null);
  });
}

export async function saveSkinToLibrary(skin: {
  name: string;
  blob: Blob;
}): Promise<void> {
  await withStore<void>("readwrite", (store) => {
    const req = store.get(SKIN_LIBRARY_KEY);
    req.onsuccess = () => {
      const existing = (req.result as SavedSkinBlob[] | undefined) ?? [];
      const next = [
        { ...skin, savedAt: Date.now() },
        ...existing.filter((item) => item.name !== skin.name),
      ];
      store.put(next, SKIN_LIBRARY_KEY);
    };
  });
}

export async function loadSkinLibrary(): Promise<SavedSkinBlob[]> {
  return withStore<SavedSkinBlob[]>("readonly", (store, resolve) => {
    const req = store.get(SKIN_LIBRARY_KEY);
    req.onsuccess = () =>
      resolve(
        ((req.result as SavedSkinBlob[] | undefined) ?? []).sort(
          (a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0),
        ),
      );
  });
}

export function saveHitsoundSkinSource(source: HitsoundSkinSource): void {
  try {
    localStorage.setItem(HITSOUND_SKIN_SOURCE_KEY, source);
  } catch {
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
