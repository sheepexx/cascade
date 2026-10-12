import type { CloudChartSnapshot, CloudProjectData, CloudSyncStamp } from "./cloud";
import { RevisionConflictError } from "./cloud";
import { mergeCharts, type MergeableChart } from "./chartMerge";
import { t } from "./i18n/core";
import { normalizeTimingPoints } from "../types";

/** How many times one save merges and retries before giving up for now. */
const MAX_SAVE_ATTEMPTS = 5;

export type EditorCopy = {
  chart: MergeableChart;
  /** The parts of a cloud save that aren't the chart: per-window choices. */
  extra: Omit<CloudProjectData, keyof MergeableChart>;
  /** Counts local edits; saving acknowledges every edit up to this one. */
  editVersion: number;
};

export type CloudSyncHost = {
  /** The chart as the editor holds it right now. */
  read(): EditorCopy;
  /**
   * Puts a collaborator's newer snapshot into the editor, merged with what
   * the editor holds. `merged` is the result against `local`; the editor may
   * have moved on by the time it applies, so it merges `base` and `remote`
   * into its newest state again.
   */
  apply(update: {
    base: MergeableChart | null;
    remote: MergeableChart;
    local: MergeableChart;
    merged: MergeableChart;
  }): void;
  /**
   * Called before a merge replaces some of this window's values with a
   * collaborator's (both changed the same thing), so this window's copy can
   * be kept somewhere the user can get it back from.
   */
  keepLocalCopy(conflicts: number): Promise<void>;
};

/** Writes the chart if the cloud copy is still at `expectedRevision`. */
export type Persist = (
  data: CloudProjectData,
  expectedRevision: number,
  mutationId: string,
) => Promise<CloudSyncStamp>;

/**
 * Keeps one open cloud map in step with its saved copy.
 *
 * It remembers the snapshot the editor's copy is based on (`base`) and that
 * snapshot's revision. Every save says which revision it was edited from, and
 * the database refuses it when someone saved since (migration 0038). Then the
 * newer snapshot is loaded and merged with this window's copy (lib/chartMerge):
 * edits on both sides survive, and where both changed the same value the saved
 * copy wins after this window's version is kept recoverable. The merged chart
 * goes into the editor and is saved against the new revision.
 *
 * Saves and merges run one at a time, in order. A save resolves only once the
 * cloud holds it; until then the edits it carries still count as unsaved, so a
 * failed or refused save leaves them in the editor and in recovery.
 */
export class CloudSync {
  private base: MergeableChart | null = null;
  private baseRevision: number | null = null;
  private savedVersion = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private ownMutations = new Set<string>();
  private generation = 0;

  constructor(
    private readonly host: CloudSyncHost,
    private readonly loadLatest: () => Promise<CloudChartSnapshot>,
  ) {}

  /** A map was opened (or first saved): its chart and the revision it is. */
  reset(base: MergeableChart | null, revision: number | null, editVersion = 0): void {
    this.generation += 1;
    this.base = base;
    this.baseRevision = revision;
    this.savedVersion = editVersion;
    this.ownMutations.clear();
  }

  get revision(): number | null {
    return this.baseRevision;
  }

  /** Whether edits up to `editVersion` are all in the cloud. */
  isSaved(editVersion: number): boolean {
    return editVersion <= this.savedVersion;
  }

  /** A save this window made, so its change notice needs no merge. */
  isOwnMutation(mutationId: string | null | undefined): boolean {
    return !!mutationId && this.ownMutations.has(mutationId);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    const run = this.queue.catch(() => {}).then(() => {
      // Work queued for a map that has since been closed is dropped.
      if (generation !== this.generation) throw new Error("cloud sync was reset");
      return task();
    });
    this.queue = run;
    return run;
  }

  /**
   * Saves the editor's chart with `persist`, merging in a collaborator's
   * newer save and trying again when the cloud copy moved on. Resolves with
   * the stamp of the save that went through, or null when there was nothing
   * unsaved; `force` saves anyway, for an explicit save that also carries
   * audio and backgrounds.
   */
  save(persist: Persist, options: { force?: boolean } = {}): Promise<CloudSyncStamp | null> {
    return this.enqueue(async () => {
      const generation = this.generation;
      let copy: EditorCopy = this.host.read();
      if (!options.force && this.isSaved(copy.editVersion) && this.base) return null;
      for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
        if (this.baseRevision === null) {
          copy = (await this.pull()) ?? copy;
          if (this.baseRevision === null) throw new Error(t("cloud.databaseTooOld"));
        }
        const mutationId = crypto.randomUUID();
        this.remember(mutationId);
        try {
          const data = { ...copy.extra, ...copy.chart };
          const stamp = await persist(data, this.baseRevision, mutationId);
          if (generation !== this.generation) return stamp;
          this.base = copy.chart;
          this.baseRevision = stamp.revision ?? this.baseRevision + 1;
          this.savedVersion = Math.max(this.savedVersion, copy.editVersion);
          return stamp;
        } catch (error) {
          this.ownMutations.delete(mutationId);
          if (!(error instanceof RevisionConflictError) || generation !== this.generation) throw error;
          copy = (await this.pull({ force: true })) ?? copy;
        }
      }
      throw new Error(t("cloud.keptConflicting"));
    });
  }

  /**
   * A collaborator saved (or something asked to check): merge their snapshot
   * in if it is newer than the one the editor's copy is based on.
   */
  refresh(change?: { revision: number | null; mutationId: string | null }): Promise<void> {
    if (this.isOwnMutation(change?.mutationId)) return Promise.resolve();
    return this.enqueue(async () => {
      if (
        change?.revision != null &&
        this.baseRevision !== null &&
        change.revision <= this.baseRevision
      ) {
        return;
      }
      await this.pull();
    });
  }

  private remember(mutationId: string): void {
    this.ownMutations.add(mutationId);
    if (this.ownMutations.size > 1_000) {
      const oldest = this.ownMutations.values().next().value;
      if (oldest !== undefined) this.ownMutations.delete(oldest);
    }
  }

  /**
   * Loads the newest snapshot and merges it into the editor. Returns the
   * editor's copy as merged, to save next, or null when there was nothing
   * newer.
   */
  private async pull(options: { force?: boolean } = {}): Promise<EditorCopy | null> {
    const generation = this.generation;
    const latest = await this.loadLatest();
    if (generation !== this.generation) return null;
    if (
      !options.force &&
      latest.revision !== null &&
      this.baseRevision !== null &&
      latest.revision <= this.baseRevision
    ) {
      return null;
    }
    let local = this.host.read();
    let result = mergeCharts(this.base, local.chart, latest.data);
    if (result.conflicts > 0) {
      await this.host.keepLocalCopy(result.conflicts);
      if (generation !== this.generation) return null;
      // Keeping the copy can take a moment; merge what the editor holds now.
      local = this.host.read();
      result = mergeCharts(this.base, local.chart, latest.data);
    }
    this.host.apply({ base: this.base, remote: latest.data, local: local.chart, merged: result.value });
    this.base = latest.data;
    this.baseRevision = latest.revision;
    return { ...local, chart: result.value };
  }
}

/**
 * A chart with its timing points' fields filled in, as the editor holds them
 * once a map is open, so a merge compares like with like. No point is made
 * up: a generated one would get a new id on every load and pile up.
 */
export function normalizedChart(chart: MergeableChart): MergeableChart {
  return {
    meta: chart.meta,
    timingPoints: normalizeTimingPoints(chart.timingPoints),
    difficulties: chart.difficulties.map((d) => ({
      ...d,
      timingPoints: normalizeTimingPoints(d.timingPoints),
    })),
  };
}
