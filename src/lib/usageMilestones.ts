/**
 * Retention and funnel numbers without tracking anyone. Instead of an ID that
 * would tie a browser's events together, the browser keeps its own milestones
 * and reports each one once: that it came back on day 1, 7 or 30 after it
 * first opened Cascade, that it created a first map, edited one and exported
 * one, and at most once a week that someone mapped in it. Each report carries
 * only the day this browser first opened Cascade, so reports can be grouped
 * into cohorts but never linked to each other.
 */

export type MilestoneEvent =
  | "first_open"
  | "retained_d1"
  | "retained_d7"
  | "retained_d30"
  | "funnel_created"
  | "funnel_edited"
  | "funnel_exported"
  | "mapper_active_week";

export type FunnelStage = "created" | "edited" | "exported";

export type MilestoneReport = { event: MilestoneEvent; cohortDay: string | null };

export type UsageState = {
  /** Local date Cascade was first opened here; null for installs from before this existed. */
  firstDay: string | null;
  sent: MilestoneEvent[];
  /** ISO week of the last weekly-mapper report. */
  lastWeek: string | null;
};

const KEY = "cascade:usage-milestones";
export const RETENTION_DAYS = [1, 7, 30] as const;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD in local time. */
export function localDay(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Whole calendar days from `from` (YYYY-MM-DD) to the day of `at`. */
export function daysSince(from: string, at: Date): number {
  const [y, m, d] = from.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  const end = Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
  return Math.round((end - start) / 86_400_000);
}

/** ISO 8601 week, e.g. 2026-W40. */
export function isoWeek(at: Date): string {
  const d = new Date(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

export function loadUsageState(
  store: StorageLike | null,
  isExistingInstall: boolean,
): UsageState | null {
  try {
    const raw = store?.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<UsageState>;
      return {
        firstDay: typeof v.firstDay === "string" ? v.firstDay : null,
        sent: Array.isArray(v.sent) ? v.sent.filter((e): e is MilestoneEvent => typeof e === "string") : [],
        lastWeek: typeof v.lastWeek === "string" ? v.lastWeek : null,
      };
    }
  } catch {
    // Unreadable: start over below.
  }
  // Someone who used Cascade before milestones existed would otherwise count
  // as a new install; they only take part in the weekly mapper count.
  return isExistingInstall ? { firstDay: null, sent: [], lastWeek: null } : null;
}

function persist(store: StorageLike | null, state: UsageState): void {
  try {
    store?.setItem(KEY, JSON.stringify(state));
  } catch {
    // Without storage nothing is reported twice in this visit, which is enough.
  }
}

export type UsageTracker = {
  opened(at: Date): MilestoneReport[];
  reached(stage: FunnelStage): MilestoneReport[];
  mapped(at: Date): MilestoneReport[];
};

export function createUsageTracker({
  store,
  isExistingInstall,
}: {
  store: StorageLike | null;
  isExistingInstall: boolean;
}): UsageTracker {
  let state = loadUsageState(store, isExistingInstall);

  const once = (event: MilestoneEvent): MilestoneReport[] => {
    if (!state || state.sent.includes(event)) return [];
    state = { ...state, sent: [...state.sent, event] };
    persist(store, state);
    // Installs from before milestones existed have no cohort to report against.
    return state.firstDay ? [{ event, cohortDay: state.firstDay }] : [];
  };

  return {
    opened(at) {
      if (!state) {
        state = { firstDay: localDay(at), sent: ["first_open"], lastWeek: null };
        persist(store, state);
        return [{ event: "first_open", cohortDay: state.firstDay }];
      }
      if (!state.firstDay) return [];
      const day = daysSince(state.firstDay, at);
      const hit = RETENTION_DAYS.find((n) => n === day);
      return hit ? once(`retained_d${hit}`) : [];
    },
    reached(stage) {
      return once(`funnel_${stage}`);
    },
    mapped(at) {
      if (!state) return [];
      const week = isoWeek(at);
      if (state.lastWeek === week) return [];
      state = { ...state, lastWeek: week };
      persist(store, state);
      return [{ event: "mapper_active_week", cohortDay: null }];
    },
  };
}

let existingAtBoot: boolean | null = null;

/**
 * Notes, before the app writes anything, whether this browser has used
 * Cascade before. Call once at startup.
 */
export function noteInstallAtBoot(store: Pick<Storage, "length" | "key"> | null = bootStorage()): void {
  try {
    let found = false;
    for (let i = 0; store && i < store.length; i++) {
      const key = store.key(i) ?? "";
      if (key.startsWith("mania-editor:") || key.startsWith("mania:")) {
        found = true;
        break;
      }
    }
    existingAtBoot = found;
  } catch {
    existingAtBoot = null;
  }
}

/** Unknown counts as existing, so nobody is miscounted as a new install. */
export function existingInstallAtBoot(): boolean {
  return existingAtBoot ?? true;
}

function bootStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
