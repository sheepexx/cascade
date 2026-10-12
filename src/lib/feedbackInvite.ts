/**
 * When Cascade may invite someone to share feedback on its own. Everything
 * here stays on this device: the dates someone mapped, whether they exported,
 * and how they answered. Nothing is sent anywhere.
 *
 * The invitation waits for a mapper who knows the editor (a week since first
 * use, three days of editing, an export) and then asks rarely: showing it
 * puts the next one a month off, "Not now" twice ends them, "Don't ask again"
 * ends them for good, and sent feedback buys three months. The feedback
 * dialog itself is always available, whatever was answered here.
 *
 * While some of the 1-10 questions (lib/feedbackRatings) haven't been asked,
 * the invitation is one of them instead: each is asked once at most, here or
 * on any device of the same account, and the next waits two months.
 *
 * When the record can't be read or written, the invitation isn't shown:
 * forgetting an answer would mean asking again.
 */

import { RATING_QUESTIONS, type RatingQuestionId } from "./feedbackRatings";

export type FeedbackInviteRecord = {
  firstUsedAt: number;
  /** Local dates (YYYY-MM-DD) with an edit; only the first few are kept. */
  activeDays: string[];
  exported: boolean;
  /** No invitation before this time. */
  quietUntil: number | null;
  dismissals: number;
  optedOut: boolean;
  lastFeedbackAt: number | null;
  /** Rating questions shown on this device, answered or not. */
  askedRatings: string[];
};

const KEY = "cascade:feedback-invite";
const DAY_MS = 24 * 60 * 60_000;
export const INVITE_AFTER_FIRST_USE_MS = 7 * DAY_MS;
export const INVITE_ACTIVE_DAYS = 3;
export const INVITE_QUIET_MS = 30 * DAY_MS;
export const INVITE_AFTER_FEEDBACK_MS = 90 * DAY_MS;
export const INVITE_MAX_DISMISSALS = 2;
export const INVITE_AFTER_RATING_MS = 60 * DAY_MS;

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function localDay(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const fresh = (now: number): FeedbackInviteRecord => ({
  firstUsedAt: now,
  activeDays: [],
  exported: false,
  quietUntil: null,
  dismissals: 0,
  optedOut: false,
  lastFeedbackAt: null,
  askedRatings: [],
});

/**
 * The stored record, a new one when there is none yet, or null when storage
 * is unavailable or holds something unreadable.
 */
export function loadFeedbackInvite(
  now = Date.now(),
  store: StorageLike | null = browserStorage(),
): FeedbackInviteRecord | null {
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === null) return fresh(now);
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof FeedbackInviteRecord, unknown>>;
    const time = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
    const firstUsedAt = time(v.firstUsedAt);
    if (firstUsedAt === null) return null;
    return {
      firstUsedAt,
      activeDays: Array.isArray(v.activeDays)
        ? v.activeDays.filter((d): d is string => typeof d === "string").slice(0, INVITE_ACTIVE_DAYS)
        : [],
      exported: v.exported === true,
      quietUntil: time(v.quietUntil),
      dismissals: time(v.dismissals) ?? 0,
      optedOut: v.optedOut === true,
      lastFeedbackAt: time(v.lastFeedbackAt),
      askedRatings: Array.isArray(v.askedRatings)
        ? v.askedRatings.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return null;
  }
}

/** Writes the record and reads it back; false when it didn't stick. */
function save(record: FeedbackInviteRecord, store: StorageLike | null): boolean {
  if (!store) return false;
  try {
    const value = JSON.stringify(record);
    store.setItem(KEY, value);
    return store.getItem(KEY) === value;
  } catch {
    return false;
  }
}

function update(
  change: (record: FeedbackInviteRecord) => FeedbackInviteRecord | null,
  now: number,
  store: StorageLike | null,
): boolean {
  const record = loadFeedbackInvite(now, store);
  if (!record) return false;
  const next = change(record);
  return next === null || save(next, store);
}

/** Whether the editor may invite feedback now. */
export function mayInviteFeedback(record: FeedbackInviteRecord | null, now: number): boolean {
  if (!record || record.optedOut) return false;
  if (record.dismissals >= INVITE_MAX_DISMISSALS) return false;
  if (now - record.firstUsedAt < INVITE_AFTER_FIRST_USE_MS) return false;
  if (record.activeDays.length < INVITE_ACTIVE_DAYS || !record.exported) return false;
  if (record.quietUntil !== null && now < record.quietUntil) return false;
  if (record.lastFeedbackAt !== null && now - record.lastFeedbackAt < INVITE_AFTER_FEEDBACK_MS) {
    return false;
  }
  return true;
}

let lastUseDay: string | null = null;

/** Someone edited a map. Writes at most once a day, and stops once enough days are known. */
export function recordFeedbackUse(now = Date.now(), store = browserStorage()): void {
  const day = localDay(now);
  if (day === lastUseDay) return;
  lastUseDay = day;
  update(
    (record) =>
      record.activeDays.includes(day) || record.activeDays.length >= INVITE_ACTIVE_DAYS
        ? null
        : { ...record, activeDays: [...record.activeDays, day] },
    now,
    store,
  );
}

export function recordFeedbackExport(now = Date.now(), store = browserStorage()): void {
  update((record) => (record.exported ? null : { ...record, exported: true }), now, store);
}

/**
 * The rating question to ask next: the first this device hasn't shown and
 * the account hasn't answered. `answered` is null when the account's answers
 * couldn't be checked, and then no question is asked.
 */
export function nextRatingQuestion(
  record: FeedbackInviteRecord,
  answered: ReadonlySet<string> | null,
): RatingQuestionId | null {
  if (!answered) return null;
  return (
    RATING_QUESTIONS.find((q) => !record.askedRatings.includes(q.id) && !answered.has(q.id))?.id ??
    null
  );
}

/**
 * The invitation, or the rating question `rating`, is about to show. It
 * counts as asked even if it is never answered, so it can't return for a
 * month (two after a rating question, which is never asked again); when that
 * can't be stored it mustn't show at all.
 */
export function recordFeedbackInviteShown(
  now = Date.now(),
  store = browserStorage(),
  rating: RatingQuestionId | null = null,
): boolean {
  return update(
    (record) => ({
      ...record,
      quietUntil: now + (rating ? INVITE_AFTER_RATING_MS : INVITE_QUIET_MS),
      askedRatings: rating ? [...record.askedRatings, rating] : record.askedRatings,
    }),
    now,
    store,
  );
}

export function recordFeedbackInviteDismissed(now = Date.now(), store = browserStorage()): void {
  update(
    (record) => ({
      ...record,
      dismissals: record.dismissals + 1,
      quietUntil: Math.max(record.quietUntil ?? 0, now + INVITE_QUIET_MS),
    }),
    now,
    store,
  );
}

export function recordFeedbackOptOut(now = Date.now(), store = browserStorage()): void {
  update((record) => ({ ...record, optedOut: true }), now, store);
}

/** Feedback went out, from the invitation or from the menu. */
export function recordFeedbackSent(now = Date.now(), store = browserStorage()): void {
  update((record) => ({ ...record, lastFeedbackAt: now }), now, store);
}

/** For tests: forget which day was last recorded. */
export function resetFeedbackUseDay(): void {
  lastUseDay = null;
}

/** Quiet time after a finished task, with nothing going on, before the invitation. */
export const INVITE_IDLE_MS = 15_000;

type Clock = {
  setTimeout: (run: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
};

/**
 * Decides the moment: after a task finished (an export or a save), once the
 * editor has been left alone for INVITE_IDLE_MS. Anything that keeps the
 * mapper busy (editing, playback, playtest, an import or export, recovery, a
 * dialog) holds the wait and restarts it when it ends. A failure (a crash
 * restored, a save that didn't go through) ends the chance for the session,
 * and it is offered at most once a session.
 */
export class FeedbackInviteTimer {
  private pending = false;
  private busy = true;
  private troubled = false;
  private done = false;
  private timer: number | null = null;

  constructor(
    private readonly clock: Clock,
    /**
     * Last checks when the wait ends: "shown" when the invitation went up,
     * "skip" when it may not show (not eligible, storage failing), and
     * "wait" when something the timer can't see is still open.
     */
    private readonly offer: () => "shown" | "skip" | "wait",
    private readonly idleMs = INVITE_IDLE_MS,
  ) {}

  taskSucceeded(): void {
    if (this.done || this.troubled) return;
    this.pending = true;
    this.restart();
  }

  /** Something kept the mapper busy or ended; edits and input count. */
  setBusy(busy: boolean): void {
    this.busy = busy;
    this.restart();
  }

  /** An edit or a key press: the idle wait starts over. */
  activity(): void {
    if (this.timer !== null) this.restart();
  }

  trouble(): void {
    this.troubled = true;
    this.cancel();
  }

  dispose(): void {
    this.cancel();
  }

  private cancel(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private restart(): void {
    this.cancel();
    if (!this.pending || this.busy || this.troubled || this.done) return;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      if (!this.pending || this.busy || this.troubled || this.done) return;
      const outcome = this.offer();
      if (outcome === "wait") {
        this.restart();
        return;
      }
      this.pending = false;
      if (outcome === "shown") this.done = true;
    }, this.idleMs);
  }
}
