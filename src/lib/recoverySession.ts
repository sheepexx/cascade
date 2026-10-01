import type {
  BackupReason,
  RecoveryRecorder,
  RecoveryState,
} from "./recovery";

/** Quiet time after an edit before it is written. */
export const FLUSH_DELAY_MS = 1200;
/** Longest an edit waits while editing carries on without a pause. */
export const FLUSH_MAX_WAIT_MS = 6000;

type Pending = { editedAt: number; seq: number };

export type TrackedState = RecoveryState & { enabled: boolean };

export type SessionClock = {
  now: () => number;
  setTimeout: (run: () => void, ms: number) => number;
  clearTimeout: (id: number | undefined) => void;
  /** Runs work when the page is idle; falls back to running it straight away. */
  idle?: (run: () => void) => () => void;
};

/**
 * Decides when the open project reaches the recovery store, independent of
 * React. The editor tells it about every committed state (`track`) and every
 * local edit (`noteEdit`); the session writes once editing pauses, keeps work
 * that a project switch would drop, and stops counting a project as unsaved
 * once a save that covered its edits has finished.
 */
export class RecoverySession {
  private latest: TrackedState | null = null;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private timer: number | undefined;
  private cancelIdle: (() => void) | null = null;
  private firstPendingAt: number | null = null;

  constructor(
    private readonly recorder: RecoveryRecorder,
    private readonly clock: SessionClock,
    private readonly onClosedUnsaved?: (title: string) => void,
  ) {}

  /** Whether any project has edits that have not been written as saved. */
  get dirty(): boolean {
    return this.pending.size > 0;
  }

  private cancelScheduled(): void {
    this.clock.clearTimeout(this.timer);
    this.timer = undefined;
    this.cancelIdle?.();
    this.cancelIdle = null;
    this.firstPendingAt = null;
  }

  private write(state: TrackedState, options: { closed?: boolean } = {}): Promise<void> {
    if (!state.enabled) return Promise.resolve();
    const editedAt = this.pending.get(state.projectId)?.editedAt ?? null;
    return this.recorder
      .persist(state, editedAt, options)
      .then(() => (editedAt !== null ? this.recorder.backup(state, "interval") : false))
      .then(() => undefined)
      .catch((error: unknown) => {
        console.warn("[recovery] could not write the recovery copy", error);
      });
  }

  /** Writes the open project now. */
  flush(): Promise<void> {
    this.cancelScheduled();
    return this.latest ? this.write(this.latest) : Promise.resolve();
  }

  private schedule(): void {
    const now = this.clock.now();
    this.firstPendingAt ??= now;
    const waited = now - this.firstPendingAt;
    const delay = Math.max(0, Math.min(FLUSH_DELAY_MS, FLUSH_MAX_WAIT_MS - waited));
    this.clock.clearTimeout(this.timer);
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      if (this.clock.idle) {
        this.cancelIdle = this.clock.idle(() => {
          this.cancelIdle = null;
          void this.flush();
        });
      } else {
        void this.flush();
      }
    }, delay);
  }

  /**
   * Takes the editor's committed state. A different project id means the
   * previous project was replaced; if it had unsaved edits, its last state is
   * written as closed work and backed up before the session moves on.
   */
  track(state: TrackedState): void {
    const previous = this.latest;
    this.latest = state;
    if (!previous || previous.projectId === state.projectId) return;
    this.cancelScheduled();
    if (this.pending.has(previous.projectId) && previous.enabled) {
      void this.write(previous, { closed: true }).then(() =>
        this.recorder.backup(previous, "replaced").catch(() => false),
      );
      this.pending.delete(previous.projectId);
      this.onClosedUnsaved?.(previous.chart.meta.title);
    }
    // A project that arrives with edits already pending (a restore that
    // could not be saved) is written straight away.
    if (this.pending.has(state.projectId)) this.schedule();
  }

  /**
   * Marks a project as edited, the open one by default. Call it for every
   * local change; the write reads whatever the editor holds by then.
   */
  noteEdit(projectId?: string): void {
    const id = projectId ?? this.latest?.projectId;
    if (!id) return;
    this.seq += 1;
    const pending = this.pending.get(id);
    this.pending.set(id, {
      editedAt: pending?.editedAt ?? this.clock.now(),
      seq: this.seq,
    });
    this.schedule();
  }

  /** A token to hand back to markSaved once a save has finished. */
  saveToken(): number {
    return this.seq;
  }

  /**
   * Records a finished save. Edits made while it ran keep the project dirty,
   * since the save did not include them.
   */
  markSaved(projectId: string, token: number): Promise<void> {
    const pending = this.pending.get(projectId);
    if (pending && pending.seq <= token) this.pending.delete(projectId);
    return this.recorder.markSaved(projectId).then(() => {
      // An edit during the save re-marks the head on its next write.
      if (this.pending.has(projectId)) this.schedule();
    });
  }

  /** Keeps a copy of the open project's chart as it is right now. */
  backup(reason: BackupReason): Promise<boolean> {
    const state = this.latest;
    if (!state?.enabled) return Promise.resolve(false);
    return this.recorder.backup(state, reason).catch(() => false);
  }

  /** Writes pending work right away: the page is going, or the editor crashed. */
  flushPending(): Promise<void> {
    return this.dirty ? this.flush() : Promise.resolve();
  }

  dispose(): void {
    this.cancelScheduled();
  }
}
