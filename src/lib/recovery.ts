import type {
  BackgroundScope,
  Difficulty,
  ManiaNote,
  SongMeta,
  TimingPoint,
} from "../types";
import { MAX_KEYS, MIN_KEYS } from "../types";

/**
 * Crash recovery and backup history for the open project.
 *
 * A saved project lives in the project store (see persistence.ts) and only
 * changes there on Ctrl+S or an autosave. This store sits beside it and keeps
 * what the editor holds right now, so a crash, a closed tab or a reload never
 * takes more than a few seconds of work with it.
 *
 * Three kinds of record:
 *
 * - The live head of a project and one record per difficulty. Difficulties
 *   are immutable in the editor, so a write only touches the ones whose object
 *   changed: editing one difficulty of a big set never rewrites the others.
 * - The project's media, written once per change of files and only while the
 *   project has work that is not saved anywhere else.
 * - Backups: whole-chart copies taken every few minutes of editing and before
 *   anything that replaces the chart. They are capped per project and by age.
 */

export type RecoveryChart = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
  activeId: string;
  bgScope: BackgroundScope;
};

export type RecoveryFile = { name: string; blob: Blob };

export type RecoveryMedia = {
  audioFiles: RecoveryFile[];
  backgroundFiles: RecoveryFile[];
  videoFiles: RecoveryFile[];
  sampleFiles: RecoveryFile[];
};

export type BackupReason =
  | "interval"
  | "manual"
  | "replaced"
  | "before-restore"
  | "before-delete"
  | "before-external-edit";

export type RecoveryHead = {
  projectId: string;
  title: string;
  artist: string;
  difficultyIds: string[];
  meta: SongMeta;
  timingPoints: TimingPoint[];
  activeId: string;
  bgScope: BackgroundScope;
  noteCount: number;
  /** When this state was written. */
  updatedAt: number;
  /** First edit that is not saved anywhere else yet; null when clean. */
  editedAt: number | null;
  /** Last time the project was saved somewhere durable. */
  savedAt: number | null;
  /**
   * Set when the editor moved on to another map with this one unsaved. Such
   * work stays restorable from the backup list, but it was not lost to a
   * crash, so the startup prompt leaves it alone.
   */
  closedAt: number | null;
  hasMedia: boolean;
};

export type BackupSummary = {
  key: string;
  projectId: string;
  createdAt: number;
  reason: BackupReason;
  title: string;
  artist: string;
  difficultyCount: number;
  noteCount: number;
};

export type BackupRecord = BackupSummary & { chart: RecoveryChart };

/**
 * heads, diffs and media hold live state; backups holds backup summaries and
 * backupCharts their charts, so listing backups never reads a chart.
 */
export type RecoveryStoreName = "heads" | "diffs" | "media" | "backups" | "backupCharts";

/** A put, or a delete when `value` is undefined. */
export type RecoveryOp = {
  store: RecoveryStoreName;
  key: string;
  value?: unknown;
};

export interface RecoveryBackend {
  get<T>(store: RecoveryStoreName, key: string): Promise<T | undefined>;
  /** Every record whose key starts with `prefix` (all of them without one). */
  entries<T>(
    store: RecoveryStoreName,
    prefix?: string,
  ): Promise<{ key: string; value: T }[]>;
  keys(store: RecoveryStoreName, prefix?: string): Promise<string[]>;
  /** Applies every op in one transaction, so a head never points at a missing difficulty. */
  commit(ops: RecoveryOp[]): Promise<void>;
}

export const BACKUP_INTERVAL_MS = 5 * 60_000;
export const BACKUP_LIMITS = {
  perProject: 15,
  keepNewest: 3,
  maxAgeMs: 30 * 24 * 60 * 60_000,
  maxProjects: 20,
};
export const MAX_RECOVERY_PROJECTS = 12;
const SEP = "|";

const diffKey = (projectId: string, diffId: string) =>
  `${projectId}${SEP}${diffId}`;
const backupKey = (projectId: string, createdAt: number, seq: number) =>
  `${projectId}${SEP}${String(createdAt).padStart(15, "0")}${SEP}${String(seq).padStart(6, "0")}`;
const projectPrefix = (projectId: string) => `${projectId}${SEP}`;

export function noteTotal(difficulties: readonly Difficulty[]): number {
  let total = 0;
  for (const d of difficulties) total += d.notes?.length ?? 0;
  return total;
}

/**
 * Backups to delete: past the per-project cap, past the age limit (the newest
 * few of a project always survive that one), and every backup of projects
 * beyond the most recently touched ones.
 */
export function backupsToPrune(
  entries: readonly Pick<BackupSummary, "key" | "projectId" | "createdAt">[],
  now: number,
  limits = BACKUP_LIMITS,
): string[] {
  const byProject = new Map<string, typeof entries[number][]>();
  for (const entry of entries) {
    const list = byProject.get(entry.projectId) ?? [];
    list.push(entry);
    byProject.set(entry.projectId, list);
  }
  const doomed: string[] = [];
  const projects = [...byProject.entries()]
    .map(([projectId, list]) => ({
      projectId,
      list: [...list].sort((a, b) => b.createdAt - a.createdAt),
    }))
    .sort((a, b) => b.list[0].createdAt - a.list[0].createdAt);
  projects.forEach(({ list }, rank) => {
    if (rank >= limits.maxProjects) {
      doomed.push(...list.map((e) => e.key));
      return;
    }
    list.forEach((entry, index) => {
      const tooMany = index >= limits.perProject;
      const tooOld =
        index >= limits.keepNewest && now - entry.createdAt > limits.maxAgeMs;
      if (tooMany || tooOld) doomed.push(entry.key);
    });
  });
  return doomed;
}

/**
 * Heads to drop past the project cap. Clean ones go first, oldest first; work
 * that was never saved is only dropped once there is nothing else to drop.
 */
export function headsToEvict(
  heads: readonly Pick<RecoveryHead, "projectId" | "updatedAt" | "editedAt">[],
  keep: string | null,
  max = MAX_RECOVERY_PROJECTS,
): string[] {
  const excess = heads.length - max;
  if (excess <= 0) return [];
  const candidates = heads
    .filter((h) => h.projectId !== keep)
    .sort((a, b) => {
      const dirtyA = a.editedAt !== null ? 1 : 0;
      const dirtyB = b.editedAt !== null ? 1 : 0;
      return dirtyA - dirtyB || a.updatedAt - b.updatedAt;
    });
  return candidates.slice(0, excess).map((h) => h.projectId);
}

/**
 * Heads holding work that was never saved anywhere, newest first. Every write
 * carries the edit still pending at that moment, and a finished save clears
 * it, so a set editedAt is the whole test: comparing times would misjudge an
 * edit made while a save was running.
 */
export function unsavedHeads<T extends Pick<RecoveryHead, "editedAt" | "updatedAt">>(
  heads: readonly T[],
): T[] {
  return heads
    .filter((h) => h.editedAt !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Unsaved work the editor was still holding when it went away. */
export function recoverableHeads<
  T extends Pick<RecoveryHead, "editedAt" | "updatedAt" | "closedAt">,
>(heads: readonly T[]): T[] {
  return unsavedHeads(heads).filter((h) => h.closedAt === null);
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function sanitizeNotes(notes: unknown, keyCount: number): ManiaNote[] {
  if (!Array.isArray(notes)) return [];
  const out: ManiaNote[] = [];
  for (const raw of notes as Partial<ManiaNote>[]) {
    if (!raw || typeof raw !== "object") continue;
    const column = raw.column;
    if (
      typeof raw.id !== "string" ||
      !finite(raw.startTime) ||
      !Number.isInteger(column) ||
      (column as number) < 0 ||
      (column as number) >= keyCount
    ) {
      continue;
    }
    if (raw.endTime !== undefined && !(finite(raw.endTime) && raw.endTime > raw.startTime)) {
      const rice = { ...raw } as ManiaNote;
      delete rice.endTime;
      out.push(rice);
    } else {
      out.push(raw as ManiaNote);
    }
  }
  return out;
}

function sanitizeTiming(points: unknown): TimingPoint[] {
  if (!Array.isArray(points)) return [];
  return (points as Partial<TimingPoint>[]).filter(
    (p): p is TimingPoint =>
      !!p &&
      typeof p === "object" &&
      typeof p.id === "string" &&
      finite(p.time) &&
      (!p.uninherited || (finite(p.bpm) && p.bpm > 0)),
  );
}

/**
 * Repairs what a crash or a half-written record could leave behind, so a
 * recovered chart opens instead of taking the editor down with it. Notes with
 * impossible times or lanes are dropped rather than guessed at. Returns null
 * when nothing usable is left.
 */
export function sanitizeChart(chart: unknown): RecoveryChart | null {
  if (!chart || typeof chart !== "object") return null;
  const raw = chart as Partial<RecoveryChart>;
  if (!Array.isArray(raw.difficulties)) return null;
  const difficulties: Difficulty[] = [];
  for (const d of raw.difficulties as Partial<Difficulty>[]) {
    if (!d || typeof d !== "object" || typeof d.id !== "string") continue;
    const keyCount = Number(d.keyCount);
    if (!Number.isInteger(keyCount) || keyCount < MIN_KEYS || keyCount > MAX_KEYS) continue;
    difficulties.push({
      ...(d as Difficulty),
      notes: sanitizeNotes(d.notes, keyCount),
      timingPoints: sanitizeTiming(d.timingPoints),
    });
  }
  if (!difficulties.length) return null;
  const meta =
    raw.meta && typeof raw.meta === "object" && typeof raw.meta.title === "string"
      ? raw.meta
      : null;
  if (!meta) return null;
  const activeId =
    typeof raw.activeId === "string" && difficulties.some((d) => d.id === raw.activeId)
      ? raw.activeId
      : difficulties[0].id;
  return {
    meta,
    timingPoints: sanitizeTiming(raw.timingPoints),
    difficulties,
    activeId,
    bgScope: raw.bgScope === "difficulty" ? "difficulty" : "mapset",
  };
}

/** When a piece of work was last touched: a clock time today, a date before. */
export function formatRecoveryTime(at: number, locale: string, now = Date.now()): string {
  const date = new Date(at);
  const today = new Date(now);
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return `${date.toLocaleDateString(locale, { month: "short", day: "numeric" })} ${time}`;
}

/** Whether two charts hold the same map, ignoring which difficulty is open. */
export function sameChartContent(
  a: Pick<RecoveryChart, "meta" | "timingPoints" | "difficulties">,
  b: Pick<RecoveryChart, "meta" | "timingPoints" | "difficulties">,
): boolean {
  if (a.difficulties.length !== b.difficulties.length) return false;
  return (
    JSON.stringify([a.meta, a.timingPoints, a.difficulties]) ===
    JSON.stringify([b.meta, b.timingPoints, b.difficulties])
  );
}

/**
 * A difficulty's notes as one string of ids and one typed array. Storing it
 * clones in a few milliseconds where an array of 100k note objects took tens,
 * which is the difference between a recovery write nobody notices and a
 * dropped frame.
 */
export type PackedNotes = {
  v: 1;
  ids: string;
  data: Float64Array;
  /** Custom sample file names, by note index; most maps have none. */
  files?: Record<number, string>;
};

const NOTE_FIELDS = [
  "column",
  "startTime",
  "endTime",
  "hitSound",
  "sampleSet",
  "additionSet",
  "sampleIndex",
  "sampleVolume",
] as const;
const STRIDE = NOTE_FIELDS.length;

export function packNotes(notes: readonly ManiaNote[]): PackedNotes | null {
  const data = new Float64Array(notes.length * STRIDE);
  const ids: string[] = new Array(notes.length);
  let files: Record<number, string> | undefined;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (note.id.includes("\n")) return null;
    ids[i] = note.id;
    const base = i * STRIDE;
    for (let f = 0; f < STRIDE; f++) {
      const value = note[NOTE_FIELDS[f]];
      data[base + f] = value === undefined ? Number.NaN : value;
    }
    if (note.sampleFile !== undefined) (files ??= {})[i] = note.sampleFile;
  }
  return { v: 1, ids: ids.join("\n"), data, ...(files ? { files } : {}) };
}

export function unpackNotes(packed: PackedNotes): ManiaNote[] {
  const count = packed.data.length / STRIDE;
  const ids = count ? packed.ids.split("\n") : [];
  const notes: ManiaNote[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const note: ManiaNote = { id: ids[i], column: 0, startTime: 0 };
    const base = i * STRIDE;
    for (let f = 0; f < STRIDE; f++) {
      const value = packed.data[base + f];
      if (!Number.isNaN(value)) (note as Record<string, number | string>)[NOTE_FIELDS[f]] = value;
    }
    const file = packed.files?.[i];
    if (file !== undefined) note.sampleFile = file;
    notes[i] = note;
  }
  return notes;
}

type StoredDifficulty = Difficulty & { packedNotes?: PackedNotes };

function storeDifficulty(difficulty: Difficulty): StoredDifficulty {
  const packedNotes = packNotes(difficulty.notes);
  return packedNotes ? { ...difficulty, notes: [], packedNotes } : difficulty;
}

/** Reads a stored difficulty back, packed or (from older records) not. */
function readDifficulty(stored: StoredDifficulty): Difficulty {
  if (!stored?.packedNotes) return stored;
  const { packedNotes, ...difficulty } = stored;
  return { ...difficulty, notes: unpackNotes(packedNotes) };
}

function storeChart(chart: RecoveryChart): RecoveryChart {
  return { ...chart, difficulties: chart.difficulties.map(storeDifficulty) };
}

function readChart(chart: RecoveryChart): RecoveryChart {
  return { ...chart, difficulties: (chart.difficulties ?? []).map(readDifficulty) };
}

let blobIds = new WeakMap<Blob, number>();
let nextBlobId = 1;
function blobId(blob: Blob): number {
  let id = blobIds.get(blob);
  if (id === undefined) {
    id = nextBlobId++;
    blobIds.set(blob, id);
  }
  return id;
}

/** Identifies a set of media files within this session, without reading them. */
export function mediaIdentity(media: RecoveryMedia): string {
  const part = (files: RecoveryFile[]) =>
    files.map((f) => `${f.name}:${f.blob.size}:${blobId(f.blob)}`).join(",");
  return [
    part(media.audioFiles),
    part(media.backgroundFiles),
    part(media.videoFiles),
    part(media.sampleFiles),
  ].join("|");
}

const emptyMedia = (media: RecoveryMedia) =>
  !media.audioFiles.length &&
  !media.backgroundFiles.length &&
  !media.videoFiles.length &&
  !media.sampleFiles.length;

type Written = {
  diffs: Map<string, Difficulty>;
  mediaKey: string | null;
  /** The head's savedAt, once known; undefined until read or written. */
  savedAt?: number | null;
  lastBackupAt: number;
  lastBackupDiffs: readonly Difficulty[] | null;
  lastBackupMeta: SongMeta | null;
  lastBackupTiming: readonly TimingPoint[] | null;
};

export type RecoveryState = {
  projectId: string;
  chart: RecoveryChart;
  media: RecoveryMedia;
};

/**
 * Writes and reads the recovery store. One instance per backend; everything is
 * serialised through a queue so overlapping writes for a project land in order.
 */
export class RecoveryRecorder {
  private written = new Map<string, Written>();
  private queue: Promise<unknown> = Promise.resolve();
  private seq = 0;

  constructor(
    private readonly backend: RecoveryBackend,
    private readonly now: () => number = Date.now,
  ) {}

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }

  private state(projectId: string): Written {
    let written = this.written.get(projectId);
    if (!written) {
      written = {
        diffs: new Map(),
        mediaKey: null,
        lastBackupAt: 0,
        lastBackupDiffs: null,
        lastBackupMeta: null,
        lastBackupTiming: null,
      };
      this.written.set(projectId, written);
    }
    return written;
  }

  /**
   * Writes the project's current state. `editedAt` is the first edit not yet
   * saved anywhere else, or null when the editor matches a saved copy.
   * Returns the number of difficulty records it had to write.
   */
  persist(
    { projectId, chart, media }: RecoveryState,
    editedAt: number | null,
    { closed = false }: { closed?: boolean } = {},
  ): Promise<number> {
    return this.enqueue(async () => {
      const written = this.state(projectId);
      const ops: RecoveryOp[] = [];
      const ids = new Set<string>();
      let changed = 0;
      for (const d of chart.difficulties) {
        ids.add(d.id);
        if (written.diffs.get(d.id) === d) continue;
        ops.push({ store: "diffs", key: diffKey(projectId, d.id), value: storeDifficulty(d) });
        changed += 1;
      }
      for (const id of written.diffs.keys()) {
        if (!ids.has(id)) ops.push({ store: "diffs", key: diffKey(projectId, id) });
      }
      // Media only matters while the work is unsaved: a saved project already
      // holds its files, and duplicating audio for every save would only eat
      // into the browser's storage.
      const wantMedia = editedAt !== null && !emptyMedia(media);
      const mediaKey = wantMedia ? mediaIdentity(media) : null;
      if (mediaKey !== written.mediaKey) {
        ops.push(
          wantMedia
            ? { store: "media", key: projectId, value: media }
            : { store: "media", key: projectId },
        );
      }
      // Read once per session; after that the page can flush on its way out
      // without waiting on a read first.
      if (written.savedAt === undefined) {
        const previous = await this.backend.get<RecoveryHead>("heads", projectId);
        written.savedAt = previous?.savedAt ?? null;
      }
      const now = this.now();
      const head: RecoveryHead = {
        projectId,
        title: chart.meta.title,
        artist: chart.meta.artist,
        difficultyIds: chart.difficulties.map((d) => d.id),
        meta: chart.meta,
        timingPoints: chart.timingPoints,
        activeId: chart.activeId,
        bgScope: chart.bgScope,
        noteCount: noteTotal(chart.difficulties),
        updatedAt: now,
        editedAt,
        savedAt: written.savedAt,
        closedAt: closed ? now : null,
        hasMedia: wantMedia,
      };
      ops.push({ store: "heads", key: projectId, value: head });
      await this.backend.commit(ops);
      written.diffs = new Map(chart.difficulties.map((d) => [d.id, d]));
      written.mediaKey = mediaKey;
      return changed;
    });
  }

  /** Records that the project was saved, so its head stops counting as unsaved work. */
  markSaved(projectId: string, at = this.now()): Promise<void> {
    return this.enqueue(async () => {
      const head = await this.backend.get<RecoveryHead>("heads", projectId);
      const written = this.state(projectId);
      written.savedAt = at;
      if (!head) return;
      written.mediaKey = null;
      await this.backend.commit([
        {
          store: "heads",
          key: projectId,
          value: { ...head, editedAt: null, savedAt: at, hasMedia: false },
        },
        { store: "media", key: projectId },
      ]);
    });
  }

  /**
   * Keeps a whole copy of the chart. An interval backup is skipped when the
   * last one is recent or nothing changed since it; the other reasons always
   * write, since they come just before the chart is replaced.
   */
  backup(state: RecoveryState, reason: BackupReason): Promise<boolean> {
    return this.enqueue(async () => {
      const written = this.state(state.projectId);
      const now = this.now();
      const { chart } = state;
      if (reason === "interval") {
        if (now - written.lastBackupAt < BACKUP_INTERVAL_MS) return false;
        const same =
          written.lastBackupMeta === chart.meta &&
          written.lastBackupTiming === chart.timingPoints &&
          written.lastBackupDiffs !== null &&
          written.lastBackupDiffs.length === chart.difficulties.length &&
          written.lastBackupDiffs.every((d, i) => d === chart.difficulties[i]);
        if (same) return false;
      }
      if (!noteTotal(chart.difficulties) && reason !== "manual") return false;
      const summary: BackupSummary = {
        key: backupKey(state.projectId, now, this.seq++),
        projectId: state.projectId,
        createdAt: now,
        reason,
        title: chart.meta.title,
        artist: chart.meta.artist,
        difficultyCount: chart.difficulties.length,
        noteCount: noteTotal(chart.difficulties),
      };
      await this.backend.commit([
        { store: "backups", key: summary.key, value: summary },
        { store: "backupCharts", key: summary.key, value: storeChart(chart) },
      ]);
      written.lastBackupAt = now;
      written.lastBackupDiffs = chart.difficulties;
      written.lastBackupMeta = chart.meta;
      written.lastBackupTiming = chart.timingPoints;
      return true;
    });
  }

  /** Drops a project's live state. Its backups stay. */
  forget(projectId: string): Promise<void> {
    return this.enqueue(async () => {
      const diffKeys = await this.backend.keys("diffs", projectPrefix(projectId));
      await this.backend.commit([
        { store: "heads", key: projectId },
        { store: "media", key: projectId },
        ...diffKeys.map((key) => ({ store: "diffs" as const, key })),
      ]);
      this.written.delete(projectId);
    });
  }

  heads(): Promise<RecoveryHead[]> {
    return this.enqueue(async () =>
      (await this.backend.entries<RecoveryHead>("heads")).map((e) => e.value),
    );
  }

  /** Work the editor still held when it went away: a crash, a closed tab. */
  async recoverable(): Promise<RecoveryHead[]> {
    return recoverableHeads(await this.heads());
  }

  /** Every project with work that was never saved, open or closed. */
  async unsaved(): Promise<RecoveryHead[]> {
    return unsavedHeads(await this.heads());
  }

  /** Moves recoverable work out of the startup prompt without deleting it. */
  close(projectId: string): Promise<void> {
    return this.enqueue(async () => {
      const head = await this.backend.get<RecoveryHead>("heads", projectId);
      if (!head || head.closedAt !== null) return;
      await this.backend.commit([
        { store: "heads", key: projectId, value: { ...head, closedAt: this.now() } },
      ]);
    });
  }

  deleteBackup(key: string): Promise<void> {
    return this.enqueue(() =>
      this.backend.commit([
        { store: "backups", key },
        { store: "backupCharts", key },
      ]),
    );
  }

  /** Rebuilds a project from its head, its difficulties and, if kept, its media. */
  load(projectId: string): Promise<{
    head: RecoveryHead;
    chart: RecoveryChart;
    media: RecoveryMedia | null;
  } | null> {
    return this.enqueue(async () => {
      const head = await this.backend.get<RecoveryHead>("heads", projectId);
      if (!head) return null;
      const records = await this.backend.entries<StoredDifficulty>(
        "diffs",
        projectPrefix(projectId),
      );
      const byId = new Map(
        records.filter((r) => r.value).map((r) => [r.value.id, readDifficulty(r.value)]),
      );
      const difficulties = head.difficultyIds
        .map((id) => byId.get(id))
        .filter((d): d is Difficulty => !!d);
      const chart = sanitizeChart({
        meta: head.meta,
        timingPoints: head.timingPoints,
        difficulties,
        activeId: head.activeId,
        bgScope: head.bgScope,
      });
      if (!chart) return null;
      const media = head.hasMedia
        ? ((await this.backend.get<RecoveryMedia>("media", projectId)) ?? null)
        : null;
      return { head, chart, media };
    });
  }

  backups(projectId?: string): Promise<BackupSummary[]> {
    return this.enqueue(async () => {
      const records = await this.backend.entries<BackupSummary>(
        "backups",
        projectId ? projectPrefix(projectId) : undefined,
      );
      return records
        .map(({ value }): BackupSummary => ({
          key: value.key,
          projectId: value.projectId,
          createdAt: value.createdAt,
          reason: value.reason,
          title: value.title,
          artist: value.artist,
          difficultyCount: value.difficultyCount,
          noteCount: value.noteCount,
        }))
        .sort((a, b) => b.createdAt - a.createdAt || (a.key < b.key ? 1 : -1));
    });
  }

  loadBackup(key: string): Promise<BackupRecord | null> {
    return this.enqueue(async () => {
      const summary = await this.backend.get<BackupSummary & { chart?: RecoveryChart }>(
        "backups",
        key,
      );
      if (!summary) return null;
      // Records from before the stores were split carry the chart inline.
      const stored =
        summary.chart ?? (await this.backend.get<RecoveryChart>("backupCharts", key));
      if (!stored) return null;
      const chart = sanitizeChart(readChart(stored));
      if (!chart) return null;
      return {
        key: summary.key,
        projectId: summary.projectId,
        createdAt: summary.createdAt,
        reason: summary.reason,
        title: summary.title,
        artist: summary.artist,
        difficultyCount: summary.difficultyCount,
        noteCount: summary.noteCount,
        chart,
      };
    });
  }

  /** Applies the backup limits and the project cap. Safe to run at any time. */
  prune(keep: string | null = null): Promise<void> {
    return this.enqueue(async () => {
      const backups = (await this.backend.entries<BackupSummary>("backups")).map(
        ({ key, value }) => ({ key, projectId: value.projectId, createdAt: value.createdAt }),
      );
      const ops: RecoveryOp[] = backupsToPrune(backups, this.now()).flatMap((key) => [
        { store: "backups" as const, key },
        { store: "backupCharts" as const, key },
      ]);
      const heads = (await this.backend.entries<RecoveryHead>("heads")).map((e) => e.value);
      for (const projectId of headsToEvict(heads, keep)) {
        ops.push({ store: "heads", key: projectId }, { store: "media", key: projectId });
        for (const key of await this.backend.keys("diffs", projectPrefix(projectId))) {
          ops.push({ store: "diffs", key });
        }
        this.written.delete(projectId);
      }
      if (ops.length) await this.backend.commit(ops);
    });
  }
}

/** Test seam: forget which blobs have been seen, as a fresh session would. */
export function resetMediaIdentity(): void {
  blobIds = new WeakMap();
  nextBlobId = 1;
}

/** An in-memory backend, for tests and for browsers without IndexedDB. */
export function memoryRecoveryBackend(): RecoveryBackend {
  const stores = new Map<RecoveryStoreName, Map<string, unknown>>();
  const store = (name: RecoveryStoreName) => {
    let found = stores.get(name);
    if (!found) {
      found = new Map();
      stores.set(name, found);
    }
    return found;
  };
  const matching = (name: RecoveryStoreName, prefix?: string) =>
    [...store(name).entries()]
      .filter(([key]) => !prefix || key.startsWith(prefix))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    async get<T>(name: RecoveryStoreName, key: string) {
      return store(name).get(key) as T | undefined;
    },
    async entries<T>(name: RecoveryStoreName, prefix?: string) {
      return matching(name, prefix).map(([key, value]) => ({ key, value: value as T }));
    },
    async keys(name: RecoveryStoreName, prefix?: string) {
      return matching(name, prefix).map(([key]) => key);
    },
    async commit(ops: RecoveryOp[]) {
      for (const op of ops) {
        if (op.value === undefined) store(op.store).delete(op.key);
        else store(op.store).set(op.key, op.value);
      }
    },
  };
}

const DB_NAME = "cascade-recovery";
const DB_VERSION = 2;
const STORES: RecoveryStoreName[] = ["heads", "diffs", "media", "backups", "backupCharts"];

function openRecoveryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
      // Version 1 kept each backup's chart inside its summary; move them out
      // so listing backups stops reading every chart.
      if (event.oldVersion === 1 && req.transaction) {
        const backups = req.transaction.objectStore("backups");
        const charts = req.transaction.objectStore("backupCharts");
        backups.openCursor().onsuccess = function () {
          const cursor = this.result;
          if (!cursor) return;
          const { chart, ...summary } = cursor.value as BackupRecord;
          if (chart) {
            charts.put(chart, cursor.key);
            cursor.update(summary);
          }
          cursor.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open recovery storage."));
    req.onblocked = () => reject(new Error("Recovery storage is blocked by another tab."));
  });
}

/** The IndexedDB backend the editor uses. */
export function indexedDbRecoveryBackend(): RecoveryBackend {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => {
    if (!dbPromise) {
      dbPromise = openRecoveryDb().then(
        (opened) => {
          opened.onclose = () => {
            dbPromise = null;
          };
          opened.onversionchange = () => {
            dbPromise = null;
            opened.close();
          };
          return opened;
        },
        (error) => {
          dbPromise = null;
          throw error;
        },
      );
    }
    return dbPromise;
  };
  const range = (prefix?: string) =>
    prefix ? IDBKeyRange.bound(prefix, `${prefix}￿`) : undefined;
  const request = <T>(
    names: RecoveryStoreName | RecoveryStoreName[],
    mode: IDBTransactionMode,
    run: (tx: IDBTransaction) => IDBRequest | void,
  ) =>
    db().then(
      (opened) =>
        new Promise<T>((resolve, reject) => {
          const tx = opened.transaction(names, mode);
          const req = run(tx);
          tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
          tx.onerror = () => reject(tx.error ?? new Error("Recovery storage failed."));
          tx.onabort = () => reject(tx.error ?? new Error("Recovery storage was aborted."));
        }),
    );
  return {
    get<T>(name: RecoveryStoreName, key: string) {
      return request<T | undefined>(name, "readonly", (tx) => tx.objectStore(name).get(key));
    },
    async entries<T>(name: RecoveryStoreName, prefix?: string) {
      // Keys and values come from one transaction, so they always pair up.
      let values: T[] = [];
      const keys = await request<IDBValidKey[]>(name, "readonly", (tx) => {
        const store = tx.objectStore(name);
        const valuesReq = store.getAll(range(prefix));
        valuesReq.onsuccess = () => {
          values = valuesReq.result as T[];
        };
        return store.getAllKeys(range(prefix));
      });
      return keys.map((key, i) => ({ key: String(key), value: values[i] }));
    },
    async keys(name: RecoveryStoreName, prefix?: string) {
      const keys = await request<IDBValidKey[]>(name, "readonly", (tx) =>
        tx.objectStore(name).getAllKeys(range(prefix)),
      );
      return keys.map(String);
    },
    async commit(ops: RecoveryOp[]) {
      if (!ops.length) return;
      const names = [...new Set(ops.map((op) => op.store))];
      await request<void>(names, "readwrite", (tx) => {
        for (const op of ops) {
          const store = tx.objectStore(op.store);
          if (op.value === undefined) store.delete(op.key);
          else store.put(op.value, op.key);
        }
      });
    },
  };
}

let shared: RecoveryRecorder | null = null;

/** The recorder the app shares; null where IndexedDB is unavailable. */
export function recoveryRecorder(): RecoveryRecorder | null {
  if (shared) return shared;
  if (typeof indexedDB === "undefined") return null;
  shared = new RecoveryRecorder(indexedDbRecoveryBackend());
  return shared;
}
