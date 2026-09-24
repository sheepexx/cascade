import type { MenuTimingPoint } from "./menuPulse";
import {
  DEFAULT_VIEW,
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  SNAP_OPTIONS,
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
import { kiaiRanges, type KiaiRange } from "./timing";
import { computeStarRating } from "./starRating";
// Type-only in the other direction, so this pair does not cycle at runtime.
import { mirrorProject } from "./projectVault";
import { t } from "./i18n/core";

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
const OSU_LINKED_KEY = "mania-editor:osu-linked";

const projectKey = (id?: string | null) =>
  !id || id === KEY ? KEY : `local:${id}`;

/**
 * The key a project is stored and mirrored under. Callers that need to reach the
 * on-disk mirror must use this rather than the raw local id.
 */
export const projectStorageKey = projectKey;

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

export type LocalProjectDifficulty = {
  name: string;
  keyCount: number;
  stars: number;
};

export type LocalProjectSummary = {
  id: string;
  title: string;
  artist: string;
  creator: string;
  tags?: string;
  updatedAt: number;
  difficultyCount: number;
  difficulties: LocalProjectDifficulty[];
  sizeBytes: number;
  sourceFormat?: "osu" | "sm" | "qua" | "mc";
  backgroundBlob?: Blob;
};

export type SavedSkinBlob = {
  name: string;
  blob: Blob;
  savedAt?: number;
};

export type LocalTrack = {
  id: string;
  title: string;
  artist: string;
  audioBlob: Blob;
  backgroundBlob?: Blob;
  previewTime: number;
  bpm: number;
  beatOffsetMs: number;
  /** Every red line of the active difficulty, in time order. */
  timing: MenuTimingPoint[];
  kiai: KiaiRange[];
  updatedAt: number;
};

export type LocalTrackSummary = Omit<
  LocalTrack,
  "audioBlob" | "backgroundBlob"
>;

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

const blobDigestCache = new WeakMap<Blob, Promise<string>>();

function blobDigest(blob: Blob): Promise<string> {
  const cached = blobDigestCache.get(blob);
  if (cached) return cached;
  const digest = blob
    .arrayBuffer()
    .then((bytes) => crypto.subtle.digest("SHA-256", bytes))
    .then((hash) =>
      [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    );
  blobDigestCache.set(blob, digest);
  return digest;
}

async function fileTag(
  file: { name: string; blob: Blob } | null | undefined,
): Promise<string> {
  return file
    ? `${file.name}:${file.blob.size}:${file.blob.type}:${await blobDigest(file.blob)}`
    : "-";
}

async function mediaSignature(media: MediaPayload): Promise<string> {
  return (
    await Promise.all(
      MEDIA_FIELDS.map(async (field) => {
        const value = media[field];
        return Array.isArray(value)
          ? (await Promise.all(value.map(fileTag))).join(",")
          : fileTag(value);
      }),
    )
  ).join("|");
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

function mediaBytes(project: SavedProject): number {
  let total = 0;
  for (const field of MEDIA_FIELDS) {
    const value = project[field];
    if (Array.isArray(value)) {
      for (const file of value) total += file.blob.size;
    } else if (value) {
      total += value.blob.size;
    }
  }
  return total;
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
    const settle = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      run();
    };

    const timer = setTimeout(() => {
      settle(() =>
        reject(
          new Error(
            t("lib.storageTimeout"),
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
      settle(() => reject(req.error ?? new Error(t("lib.storageOpen2"))));
    req.onblocked = () =>
      settle(() =>
        reject(
          new Error(
            t("lib.storageBlocked"),
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
          reject(tx.error ?? new Error(t("lib.storageWrite")));
        tx.onabort = () =>
          reject(tx.error ?? new Error(t("lib.storageAborted")));
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

let persistenceRequested = false;

export function requestPersistentStorage(): void {
  if (persistenceRequested) return;
  persistenceRequested = true;
  const storage = navigator.storage;
  if (!storage?.persist || !storage.persisted) return;
  void storage
    .persisted()
    .then((granted) => (granted ? true : storage.persist()))
    .catch(() => false);
}

export async function saveProject(
  project: SavedProject,
  localId: string = KEY,
): Promise<void> {
  const key = projectKey(localId);
  const { chart, media } = splitMedia(project);
  const signature = await mediaSignature(media);
  const mediaUnchanged = lastMediaSignature.get(key) === signature;

  await withStore<void>("readwrite", (store) => {
    store.put({ ...chart, version: VERSION, localId }, key);
    if (!mediaUnchanged) store.put({ ...media, signature }, mediaKeyFor(key));
  });

  lastMediaSignature.set(key, signature);

  // The on-disk mirror trails IndexedDB rather than gating it: a project that
  // saved must stay saved even if the folder is read-only or gone.
  void mirrorSavedProject(project, key, !mediaUnchanged);
}

/**
 * Writes the desktop copy of a project. Deliberately fire-and-forget — the
 * authoritative save has already happened by the time this runs, and the web
 * build drops it entirely.
 */
async function mirrorSavedProject(
  project: SavedProject,
  key: string,
  mediaChanged: boolean,
): Promise<void> {
  try {
    await mirrorProject(project, key, mediaChanged);
  } catch {
    // A mirror that cannot be written is not worth surfacing on every autosave.
  }
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
              tags: full.meta.tags,
              updatedAt: full.savedAt,
              difficultyCount: full.difficulties.length,
              difficulties: full.difficulties.map((d) => ({
                name: d.name,
                keyCount: d.keyCount,
                stars: d.notes ? computeStarRating(d.notes, d.keyCount) : 0,
              })),
              sizeBytes: mediaBytes(full),
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

function isTimed(project: SavedProject): boolean {
  const timed = (points: TimingPoint[] | undefined) =>
    (points ?? []).some((p) => p.uninherited && Number.isFinite(p.bpm) && p.bpm > 0);
  return (
    timed(project.timingPoints) ||
    project.difficulties.some((d) => timed(d.timingPoints))
  );
}

function activeDifficulty(project: SavedProject): Difficulty | undefined {
  return (
    project.difficulties.find((d) => d.id === project.activeId) ??
    project.difficulties[0]
  );
}

function trackPoints(project: SavedProject): TimingPoint[] {
  const active = activeDifficulty(project);
  return active?.timingPoints?.length
    ? active.timingPoints
    : (project.timingPoints ?? []);
}

function pickTrackAudio(project: SavedProject): Blob | undefined {
  const files = project.audioFiles ?? [];
  const active = activeDifficulty(project);
  const wanted = active?.audioFilename;
  if (wanted) {
    const hit = files.find((f) => f.name === wanted);
    if (hit) return hit.blob;
  }
  return files[0]?.blob ?? project.audio?.blob ?? undefined;
}

function trackPreviewTime(project: SavedProject): number {
  const preview = activeDifficulty(project)?.previewTime ?? -1;
  return preview > 0 ? preview : 0;
}

function trackBeat(project: SavedProject): {
  bpm: number;
  beatOffsetMs: number;
  timing: MenuTimingPoint[];
} {
  const points = trackPoints(project)
    .filter((p) => p.uninherited && Number.isFinite(p.bpm) && p.bpm > 0)
    .sort((a, b) => a.time - b.time);
  const first = points[0];
  const timing = points.map((p) => ({
    time: p.time,
    bpm: p.bpm,
    meter: p.meter > 0 ? p.meter : 4,
    omitFirstBarline: p.omitFirstBarline === true,
  }));
  return first
    ? { bpm: first.bpm, beatOffsetMs: first.time, timing }
    : { bpm: 0, beatOffsetMs: 0, timing };
}

function trackKiai(project: SavedProject): KiaiRange[] {
  return kiaiRanges(trackPoints(project), Number.POSITIVE_INFINITY);
}

function localTrackSummary(
  id: string,
  project: SavedProject,
): LocalTrackSummary | null {
  if (!isTimed(project)) return null;
  return {
    id,
    title: project.meta.title,
    artist: project.meta.artist,
    previewTime: trackPreviewTime(project),
    ...trackBeat(project),
    kiai: trackKiai(project),
    updatedAt: project.savedAt,
  };
}

function localTrack(id: string, project: SavedProject): LocalTrack | null {
  const summary = localTrackSummary(id, project);
  const audioBlob = pickTrackAudio(project);
  if (!summary || !audioBlob) return null;
  return {
    ...summary,
    audioBlob,
    backgroundBlob: pickLocalBackground(project),
  };
}

export async function countLocalProjects(): Promise<number> {
  return withStore<number>("readonly", (store, resolve) => {
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      resolve(keysReq.result.filter((key) => projectIdFromKey(key)).length);
    };
  });
}

export async function listLocalTrackSummaries(): Promise<LocalTrackSummary[]> {
  return withStore<LocalTrackSummary[]>("readonly", (store, resolve) => {
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      const projectKeys = keysReq.result.filter((key) => projectIdFromKey(key));
      if (!projectKeys.length) {
        resolve([]);
        return;
      }

      const rows: LocalTrackSummary[] = [];
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
          if (
            !id ||
            !project ||
            (project.version !== LEGACY_VERSION && project.version !== VERSION)
          ) {
            done();
            return;
          }
          const summary = localTrackSummary(id, project);
          if (summary) rows.push(summary);
          done();
        };
      }
    };
  });
}

export async function loadLocalTrack(id: string): Promise<LocalTrack | null> {
  const project = await loadProject(id);
  return project ? localTrack(id, project) : null;
}

export async function listLocalTracks(): Promise<LocalTrack[]> {
  return withStore<LocalTrack[]>("readonly", (store, resolve) => {
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      const projectKeys = keysReq.result.filter((key) => projectIdFromKey(key));
      if (!projectKeys.length) {
        resolve([]);
        return;
      }

      const rows: LocalTrack[] = [];
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
            const row = localTrack(id, full);
            if (!row) {
              done();
              return;
            }
            rows.push(row);
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
    const snapDivisor = SNAP_OPTIONS.includes(
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

/**
 * Whether Cascade has already told this install that it can see osu!. The notice
 * is a one-off introduction to the integration, not a status line, so it stays
 * quiet on every launch after the first.
 */
export function osuLinkAnnounced(): boolean {
  try {
    return localStorage.getItem(OSU_LINKED_KEY) !== null;
  } catch {
    // Without storage the notice would greet every launch, which is the very
    // thing it must not do.
    return true;
  }
}

export function markOsuLinkAnnounced(): void {
  try {
    localStorage.setItem(OSU_LINKED_KEY, new Date().toISOString());
  } catch {
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
