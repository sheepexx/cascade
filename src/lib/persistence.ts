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
const EXPORT_FOLDER_KEY = "export:folder";
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
  /** The mapset's own hitsound samples. */
  sampleFiles?: { name: string; blob: Blob }[];
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
  titleUnicode?: string;
  artistUnicode?: string;
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
  /** The original-script names, when the map carries them. */
  titleUnicode?: string;
  artistUnicode?: string;
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
  | "audioFiles"
  | "audio"
  | "backgroundFiles"
  | "videoFiles"
  | "sampleFiles"
  | "background"
  | "skin"
>;

type MediaRecord = MediaPayload & { signature: string };

const MEDIA_FIELDS: (keyof MediaPayload)[] = [
  "audioFiles",
  "audio",
  "backgroundFiles",
  "videoFiles",
  "sampleFiles",
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

const summaryKeyFor = (key: string) => `summary:${key}`;
// Bump when the summary's fields change, so older ones are rebuilt.
const SUMMARY_VERSION = 1;

type TrackTiming = Pick<
  LocalTrackSummary,
  "previewTime" | "bpm" | "beatOffsetMs" | "timing" | "kiai"
>;

/**
 * What the project lists and the menu's music need from a project, stored
 * beside it and written in the same transaction as its chart. Listing reads
 * these instead of every note of every map, which took most of a second on a
 * large library and stalled whatever was animating at the time.
 */
type ProjectSummaryRecord = {
  summaryVersion: number;
  savedAt: number;
  meta: Pick<
    SongMeta,
    "title" | "titleUnicode" | "artist" | "artistUnicode" | "creator" | "tags"
  >;
  difficulties: LocalProjectDifficulty[];
  sizeBytes: number;
  sourceFormat?: LocalProjectSummary["sourceFormat"];
  /** Which of the media record's files the active difficulty uses. */
  backgroundFilename?: string;
  audioFilename?: string;
  /** Null when the project has no timing, so it cannot be a menu track. */
  track: TrackTiming | null;
};

function pickFile(
  files: { name: string; blob: Blob }[] | undefined,
  wanted: string | undefined,
  fallback: { name: string; blob: Blob } | null | undefined,
): Blob | undefined {
  const list = files ?? [];
  if (wanted) {
    const hit = list.find((f) => f.name === wanted);
    if (hit) return hit.blob;
  }
  return list[0]?.blob ?? fallback?.blob ?? undefined;
}

function summarizeProject(project: SavedProject): ProjectSummaryRecord {
  const active = activeDifficulty(project);
  const { title, titleUnicode, artist, artistUnicode, creator, tags } =
    project.meta;
  return {
    summaryVersion: SUMMARY_VERSION,
    savedAt: project.savedAt,
    meta: { title, titleUnicode, artist, artistUnicode, creator, tags },
    difficulties: project.difficulties.map((d) => ({
      name: d.name,
      keyCount: d.keyCount,
      stars: d.notes ? computeStarRating(d.notes, d.keyCount) : 0,
    })),
    sizeBytes: mediaBytes(project),
    sourceFormat: project.difficulties[0]?.sourceFormat,
    backgroundFilename: active?.backgroundFilename,
    audioFilename: active?.audioFilename,
    track: isTimed(project)
      ? {
          previewTime: trackPreviewTime(project),
          ...trackBeat(project),
          kiai: trackKiai(project),
        }
      : null,
  };
}

function isCurrentSummary(value: unknown): value is ProjectSummaryRecord {
  return (
    !!value &&
    (value as ProjectSummaryRecord).summaryVersion === SUMMARY_VERSION
  );
}

function projectRow(
  id: string,
  summary: ProjectSummaryRecord,
  media: MediaPayload | undefined,
): LocalProjectSummary {
  const { meta } = summary;
  return {
    id,
    title: meta.title,
    titleUnicode: meta.titleUnicode,
    artistUnicode: meta.artistUnicode,
    artist: meta.artist,
    creator: meta.creator,
    tags: meta.tags,
    updatedAt: summary.savedAt,
    difficultyCount: summary.difficulties.length,
    difficulties: summary.difficulties,
    sizeBytes: summary.sizeBytes,
    sourceFormat: summary.sourceFormat,
    backgroundBlob: pickFile(
      media?.backgroundFiles,
      summary.backgroundFilename,
      media?.background,
    ),
  };
}

function trackRow(
  id: string,
  summary: ProjectSummaryRecord,
): LocalTrackSummary | null {
  if (!summary.track) return null;
  const { meta } = summary;
  return {
    id,
    title: meta.title,
    titleUnicode: meta.titleUnicode,
    artistUnicode: meta.artistUnicode,
    artist: meta.artist,
    ...summary.track,
    updatedAt: summary.savedAt,
  };
}

function trackWithMedia(
  id: string,
  summary: ProjectSummaryRecord,
  media: MediaPayload | undefined,
): LocalTrack | null {
  const row = trackRow(id, summary);
  const audioBlob = pickFile(
    media?.audioFiles,
    summary.audioFilename,
    media?.audio,
  );
  if (!row || !audioBlob) return null;
  return {
    ...row,
    audioBlob,
    backgroundBlob: pickFile(
      media?.backgroundFiles,
      summary.backgroundFilename,
      media?.background,
    ),
  };
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
  // Star ratings are cached per notes array, so only edited difficulties
  // are rated again here.
  const summary = summarizeProject(project);

  await withStore<void>("readwrite", (store) => {
    store.put({ ...chart, version: VERSION, localId }, key);
    if (!mediaUnchanged) store.put({ ...media, signature }, mediaKeyFor(key));
    store.put(summary, summaryKeyFor(key));
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
  let summary: unknown;
  const project = await withStore<SavedProject | null>("readonly", (store, resolve) => {
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
      const summaryReq = store.get(summaryKeyFor(key));
      summaryReq.onsuccess = () => {
        summary = summaryReq.result;
      };
      const mediaReq = store.get(mediaKeyFor(key));
      mediaReq.onsuccess = () => {
        const media = (mediaReq.result as MediaRecord | undefined) ?? null;
        if (media) lastMediaSignature.set(key, media.signature);
        resolve(mergeMedia(value, media));
      };
    };
  });
  // Saved by a tab still running a version from before summaries, or not
  // listed since: catch the summary up once the editor has settled.
  if (
    project?.version === VERSION &&
    !(isCurrentSummary(summary) && summary.savedAt === project.savedAt)
  ) {
    refreshSummaryWhenIdle(key, project);
  }
  return project;
}

type IdleScope = typeof globalThis & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

function refreshSummaryWhenIdle(key: string, project: SavedProject): void {
  const run = () => {
    void storeSummaries([{ key, summary: summarizeProject(project) }]).catch(
      () => {},
    );
  };
  const scope = globalThis as IdleScope;
  if (scope.requestIdleCallback) scope.requestIdleCallback(run, { timeout: 10000 });
  else setTimeout(run, 2000);
}

/** Writes summaries unless a save has already written a newer one. */
async function storeSummaries(
  entries: { key: string; summary: ProjectSummaryRecord }[],
): Promise<void> {
  await withStore<void>("readwrite", (store) => {
    for (const { key, summary } of entries) {
      const req = store.get(summaryKeyFor(key));
      req.onsuccess = () => {
        const current = req.result as unknown;
        if (isCurrentSummary(current) && current.savedAt >= summary.savedAt) return;
        store.put(summary, summaryKeyFor(key));
      };
    }
  });
}

type StoredSummary = {
  id: string;
  summary: ProjectSummaryRecord;
  media?: MediaPayload;
};

/**
 * Every stored project's summary, and its media record when `withMedia` is
 * set. Media records hold only file handles, so they are cheap to read. A
 * project saved before summaries existed is read in full this one time, and
 * its summary is written for next time.
 */
async function readSummaries(withMedia: boolean): Promise<StoredSummary[]> {
  const missing: { key: string; summary: ProjectSummaryRecord }[] = [];
  const rows = await withStore<StoredSummary[]>("readonly", (store, resolve) => {
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      const allKeys = new Set(keysReq.result);
      const projectKeys = keysReq.result.filter((key) => projectIdFromKey(key));
      if (!projectKeys.length) {
        resolve([]);
        return;
      }

      const out: StoredSummary[] = [];
      let pending = projectKeys.length;
      const done = () => {
        pending -= 1;
        if (pending === 0) resolve(out);
      };
      const readMedia = (
        key: string,
        then: (media: MediaRecord | undefined) => void,
      ) => {
        const req = store.get(mediaKeyFor(key));
        req.onsuccess = () => then(req.result as MediaRecord | undefined);
      };
      const readFull = (key: string, id: string) => {
        const req = store.get(key);
        req.onsuccess = () => {
          const project = req.result as SavedProject | undefined;
          if (!project) {
            done();
            return;
          }
          // Legacy records carry their media inline and are never given a
          // summary; the next save moves them to the current form.
          if (project.version === LEGACY_VERSION) {
            out.push({ id, summary: summarizeProject(project), media: project });
            done();
            return;
          }
          if (project.version !== VERSION) {
            done();
            return;
          }
          readMedia(key, (media) => {
            const summary = summarizeProject(mergeMedia(project, media));
            missing.push({ key, summary });
            out.push({ id, summary, media });
            done();
          });
        };
      };

      for (const projectKeyValue of projectKeys) {
        const key = projectKeyValue as string;
        const id = projectIdFromKey(key) as string;
        if (!allKeys.has(summaryKeyFor(key))) {
          readFull(key, id);
          continue;
        }
        const req = store.get(summaryKeyFor(key));
        req.onsuccess = () => {
          const summary = req.result as unknown;
          if (!isCurrentSummary(summary)) {
            readFull(key, id);
            return;
          }
          if (!withMedia) {
            out.push({ id, summary });
            done();
            return;
          }
          readMedia(key, (media) => {
            out.push({ id, summary, media });
            done();
          });
        };
      }
    };
  });
  if (missing.length) void storeSummaries(missing).catch(() => {});
  return rows;
}

const newestFirst = (a: { updatedAt: number }, b: { updatedAt: number }) =>
  b.updatedAt - a.updatedAt;

export async function listLocalProjects(): Promise<LocalProjectSummary[]> {
  const rows = await readSummaries(true);
  return rows
    .map(({ id, summary, media }) => projectRow(id, summary, media))
    .sort(newestFirst);
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

export async function countLocalProjects(): Promise<number> {
  return withStore<number>("readonly", (store, resolve) => {
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      resolve(keysReq.result.filter((key) => projectIdFromKey(key)).length);
    };
  });
}

export async function listLocalTrackSummaries(): Promise<LocalTrackSummary[]> {
  const rows = await readSummaries(false);
  return rows
    .map(({ id, summary }) => trackRow(id, summary))
    .filter((row): row is LocalTrackSummary => row !== null)
    .sort(newestFirst);
}

/** One menu track with its audio, read without the project's notes. */
export async function loadLocalTrack(id: string): Promise<LocalTrack | null> {
  const key = projectKey(id);
  const stored = await withStore<{
    summary: ProjectSummaryRecord;
    media: MediaRecord | undefined;
  } | null>("readonly", (store, resolve) => {
    const req = store.get(summaryKeyFor(key));
    req.onsuccess = () => {
      const summary = req.result as unknown;
      if (!isCurrentSummary(summary)) {
        resolve(null);
        return;
      }
      const mediaReq = store.get(mediaKeyFor(key));
      mediaReq.onsuccess = () =>
        resolve({ summary, media: mediaReq.result as MediaRecord | undefined });
    };
  });
  if (stored) return trackWithMedia(id, stored.summary, stored.media);
  const project = await loadProject(id);
  return project ? trackWithMedia(id, summarizeProject(project), project) : null;
}

export async function listLocalTracks(): Promise<LocalTrack[]> {
  const rows = await readSummaries(true);
  return rows
    .map(({ id, summary, media }) => trackWithMedia(id, summary, media))
    .filter((row): row is LocalTrack => row !== null)
    .sort(newestFirst);
}

export async function clearProject(localId: string = KEY): Promise<void> {
  const key = projectKey(localId);
  await withStore<void>("readwrite", (store) => {
    store.delete(key);
    store.delete(mediaKeyFor(key));
    store.delete(summaryKeyFor(key));
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

/**
 * The folder picked for exports in a browser that lets a page write to one.
 * Only this device has it: a folder handle cannot travel with an account.
 */
export async function saveExportFolderHandle(
  handle: FileSystemDirectoryHandle | null,
): Promise<void> {
  await withStore<void>("readwrite", (store) => {
    if (handle) store.put(handle, EXPORT_FOLDER_KEY);
    else store.delete(EXPORT_FOLDER_KEY);
  });
}

export async function loadExportFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  return withStore<FileSystemDirectoryHandle | null>("readonly", (store, resolve) => {
    const req = store.get(EXPORT_FOLDER_KEY);
    req.onsuccess = () =>
      resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
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

export async function deleteSkinFromLibrary(name: string): Promise<void> {
  await withStore<void>("readwrite", (store) => {
    const req = store.get(SKIN_LIBRARY_KEY);
    req.onsuccess = () => {
      const existing = (req.result as SavedSkinBlob[] | undefined) ?? [];
      store.put(
        existing.filter((item) => item.name !== name),
        SKIN_LIBRARY_KEY,
      );
    };
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
