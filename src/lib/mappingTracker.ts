/**
 * Active mapping time, decided second by second on the device and reported
 * about once a minute (migration 0042 decides what it credits).
 *
 * A second counts only while a map is open in the editor, the window is
 * visible and focused, and nothing unrelated (settings, the social overlay,
 * the main menu) is in front. Within that:
 *
 * - playtesting counts while the playtest is running and the player pressed a
 *   key in the last 30 seconds;
 * - editing counts for a minute after any editor input (placing or deleting
 *   notes, timing, SV, selecting, scrolling, shortcuts);
 * - reviewing counts while the song plays in the editor and the mapper did
 *   something in the last five minutes.
 *
 * Leaving the window or opening something unrelated forgets the last input,
 * so coming back counts only from the next one. Ten idle minutes start a new
 * session. Counters (notes placed, exports, ...) ride along with the time.
 */

export type ActivityKind = "edit" | "playtest" | "review";

export type MappingContext = {
  projectKey: string;
  projectTitle: string;
  projectArtist: string;
  beatmapsetId: number | null;
  difficultyKey: string | null;
  difficultyName: string | null;
};

export type TrackerState = {
  /** A map is open, the window is visible and focused, nothing unrelated is open. */
  eligible: boolean;
  playtesting: boolean;
  /** The song is playing in the editor. */
  playing: boolean;
};

export type CounterKey =
  | "notes_placed"
  | "notes_deleted"
  | "timing_changes"
  | "sv_changes"
  | "playtests"
  | "exports"
  | "maps_created"
  | "difficulties_created";

export type MappingEntry = {
  day: string;
  project_key: string;
  project_title: string;
  project_artist: string;
  beatmapset_id: number | null;
  difficulty_key: string | null;
  difficulty_name: string | null;
  edit: number;
  playtest: number;
  review: number;
} & Partial<Record<CounterKey, number>>;

export type MappingReport = {
  session: string;
  from: string;
  to: string;
  entries: MappingEntry[];
};

type Bucket = {
  entry: MappingEntry;
  /** Milliseconds not yet whole seconds. */
  ms: Record<ActivityKind, number>;
};

export const EDIT_IDLE_MS = 60_000;
export const PLAYTEST_IDLE_MS = 30_000;
export const REVIEW_IDLE_MS = 5 * 60_000;
export const SESSION_GAP_MS = 10 * 60_000;
/** A tick never credits more than this, however late it runs. */
const MAX_TICK_MS = 1_500;
/** A tick this long after the previous one (sleep, a throttled timer) only resyncs. */
const RESYNC_MS = 5_000;
const MAX_ENTRIES = 32;

export function localDay(at: number): string {
  const d = new Date(at);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function newSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "00000000-0000-4000-8000-" + Math.floor(Math.random() * 1e12).toString(16).padStart(12, "0");
}

export class MappingTracker {
  private context: MappingContext | null = null;
  private lastInput = Number.NEGATIVE_INFINITY;
  private lastTick: number | null = null;
  private lastActive = Number.NEGATIVE_INFINITY;
  private session: string;
  private buckets = new Map<string, Bucket>();
  private spanFrom: number | null = null;
  private spanTo: number | null = null;
  private sealed: MappingReport[] = [];

  constructor(private readonly makeSession: () => string = newSessionId) {
    this.session = makeSession();
  }

  setContext(context: MappingContext | null): void {
    this.context = context;
  }

  /** Any meaningful input in the editor or a running playtest. */
  input(at: number): void {
    this.lastInput = at;
  }

  count(counter: CounterKey, at: number, amount = 1): void {
    if (!this.context || amount <= 0) return;
    const bucket = this.bucket(at);
    bucket.entry[counter] = (bucket.entry[counter] ?? 0) + amount;
  }

  /** Which kind of time the moment `at` is, if any. */
  classify(state: TrackerState, at: number): ActivityKind | null {
    if (!state.eligible || !this.context) return null;
    const sinceInput = at - this.lastInput;
    if (state.playtesting) return sinceInput <= PLAYTEST_IDLE_MS ? "playtest" : null;
    if (sinceInput <= EDIT_IDLE_MS) return "edit";
    if (state.playing && sinceInput <= REVIEW_IDLE_MS) return "review";
    return null;
  }

  /** Called about once a second; credits the time since the previous tick. */
  tick(state: TrackerState, at: number): ActivityKind | null {
    const previous = this.lastTick;
    this.lastTick = at;
    if (!state.eligible) {
      this.lastInput = Number.NEGATIVE_INFINITY;
      return null;
    }
    const kind = this.classify(state, at);
    if (!kind || previous === null) return kind;
    const gap = at - previous;
    if (gap <= 0 || gap > RESYNC_MS) return kind;
    const delta = Math.min(gap, MAX_TICK_MS);

    if (at - this.lastActive > SESSION_GAP_MS && this.lastActive !== Number.NEGATIVE_INFINITY) {
      this.seal();
      this.session = this.makeSession();
    }
    this.lastActive = at;

    const bucket = this.bucket(at);
    bucket.ms[kind] += delta;
    const whole = Math.floor(bucket.ms[kind] / 1000);
    if (whole > 0) {
      bucket.ms[kind] -= whole * 1000;
      bucket.entry[kind] += whole;
    }
    this.spanFrom ??= at - delta;
    this.spanTo = at;
    return kind;
  }

  /** Everything counted so far, as reports ready to send; clears it. */
  drain(): MappingReport[] {
    this.seal();
    const out = this.sealed;
    this.sealed = [];
    return out;
  }

  private bucket(at: number): Bucket {
    const ctx = this.context!;
    const day = localDay(at);
    const key = `${day}|${ctx.projectKey}|${ctx.difficultyKey ?? ""}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= MAX_ENTRIES) this.seal();
      bucket = {
        entry: {
          day,
          project_key: ctx.projectKey,
          project_title: ctx.projectTitle,
          project_artist: ctx.projectArtist,
          beatmapset_id: ctx.beatmapsetId,
          difficulty_key: ctx.difficultyKey,
          difficulty_name: ctx.difficultyName,
          edit: 0,
          playtest: 0,
          review: 0,
        },
        ms: { edit: 0, playtest: 0, review: 0 },
      };
      this.buckets.set(key, bucket);
    } else {
      bucket.entry.project_title = ctx.projectTitle;
      bucket.entry.project_artist = ctx.projectArtist;
      bucket.entry.beatmapset_id = ctx.beatmapsetId;
      bucket.entry.difficulty_name = ctx.difficultyName;
    }
    return bucket;
  }

  private seal(): void {
    const entries = [...this.buckets.values()]
      .map((b) => b.entry)
      .filter(
        (e) =>
          e.edit + e.playtest + e.review > 0 ||
          COUNTERS.some((counter) => (e[counter] ?? 0) > 0),
      );
    this.buckets.clear();
    if (entries.length) {
      const to = this.spanTo ?? Date.now();
      const from = this.spanFrom ?? to;
      this.sealed.push({
        session: this.session,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        entries,
      });
    }
    this.spanFrom = null;
    this.spanTo = null;
  }
}

const COUNTERS: CounterKey[] = [
  "notes_placed",
  "notes_deleted",
  "timing_changes",
  "sv_changes",
  "playtests",
  "exports",
  "maps_created",
  "difficulties_created",
];

/**
 * Sends reports in order and keeps the ones that failed, in memory and in
 * storage, so a dropped connection or a closed tab loses nothing that is
 * less than two days old (the database refuses anything older).
 */
export class MappingReporter {
  private queue: MappingReport[] = [];
  private sending = false;

  constructor(
    private readonly send: (report: MappingReport) => Promise<void>,
    private readonly storage: {
      load: () => MappingReport[];
      save: (reports: MappingReport[]) => void;
    },
    private readonly now: () => number = Date.now,
  ) {
    this.queue = this.fresh(storage.load());
  }

  enqueue(reports: MappingReport[]): void {
    if (!reports.length) return;
    this.queue = this.fresh([...this.queue, ...reports]).slice(-50);
    this.storage.save(this.queue);
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Tries to send everything queued; stops at the first failure. */
  async flush(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.queue.length) {
        const next = this.queue[0];
        await this.send(next);
        this.queue.shift();
        this.storage.save(this.queue);
      }
    } catch {
      // Kept for the next flush.
    } finally {
      this.sending = false;
    }
  }

  private fresh(reports: MappingReport[]): MappingReport[] {
    const cutoff = this.now() - 2 * 86_400_000;
    return reports.filter((r) => {
      const to = Date.parse(r.to);
      return Number.isFinite(to) && to > cutoff && Array.isArray(r.entries);
    });
  }
}

/** "12h 34m", "34m", "45s" or "0m". */
export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return total > 0 ? `${total}s` : "0m";
}
