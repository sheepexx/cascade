import { localDay } from "./mappingTracker";

/**
 * Shapes for the Activity section of a profile (get_mapping_stats in
 * migration 0042), and the sums and grids drawn from it.
 */

export type CalendarDay = {
  day: string;
  level: number;
  /** Seconds, or null when the mapper keeps their time private. */
  edit: number | null;
  playtest: number | null;
  review: number | null;
};

export type MappingProject = {
  project_key: string;
  project_id: string | null;
  title: string;
  artist: string;
  beatmapset_id: number | null;
  created_in_cascade: boolean;
  first_active_at: string;
  last_active_at: string;
  shared_slug: string | null;
  edit: number | null;
  playtest: number | null;
  review: number | null;
  notes_placed: number;
  difficulties: { key: string; name: string; edit: number; playtest: number; review: number }[] | null;
};

export type MappingStats = {
  /** The caller sees private parts only because they are an admin (0044). */
  admin_override?: boolean;
  visible: { mapping_stats: boolean; mapping_time: boolean; project_time: boolean; projects: boolean };
  counters: {
    notes_placed: number;
    notes_deleted: number;
    timing_changes: number;
    sv_changes: number;
    playtests: number;
    exports: number;
    maps_created: number;
    difficulties_created: number;
    active_days: number;
    maps_edited: number;
    first_day: string | null;
  } | null;
  totals: { edit: number; playtest: number; review: number; longest_session: number } | null;
  calendar: CalendarDay[] | null;
  projects: MappingProject[] | null;
  map_times: { beatmapset_id: number; edit: number; playtest: number; review: number; last_active_at: string }[] | null;
};

function dayTotal(day: CalendarDay): number {
  return (day.edit ?? 0) + (day.playtest ?? 0) + (day.review ?? 0);
}

function shiftDay(day: string, offset: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + offset, 12).getTime());
}

/**
 * Editing time today, over the last seven days and this calendar month, in
 * the mapper's own days. Null when their time is private.
 */
export function periodTotals(
  calendar: readonly CalendarDay[] | null,
  today: string,
): { today: number; week: number; month: number } | null {
  if (!calendar || calendar.some((d) => d.edit === null)) return null;
  const weekStart = shiftDay(today, -6);
  const monthStart = `${today.slice(0, 7)}-01`;
  let todaySum = 0;
  let week = 0;
  let month = 0;
  for (const d of calendar) {
    const total = d.edit ?? 0;
    if (d.day === today) todaySum += total;
    if (d.day >= weekStart && d.day <= today) week += total;
    if (d.day >= monthStart && d.day <= today) month += total;
  }
  return { today: todaySum, week, month };
}

export type CalendarCell = { day: string; level: number; seconds: number | null; future: boolean };

/**
 * The activity calendar: `weeks` columns of Monday-to-Sunday cells ending
 * with the week that holds `today`.
 */
export function calendarGrid(
  calendar: readonly CalendarDay[] | null,
  today: string,
  weeks = 53,
): CalendarCell[][] {
  const byDay = new Map((calendar ?? []).map((d) => [d.day, d]));
  const [y, m, d] = today.split("-").map(Number);
  const weekday = (new Date(y, m - 1, d, 12).getDay() + 6) % 7;
  const firstDay = shiftDay(today, -weekday - (weeks - 1) * 7);
  const columns: CalendarCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const day = shiftDay(firstDay, w * 7 + i);
      const entry = byDay.get(day);
      column.push({
        day,
        level: entry?.level ?? 0,
        seconds: entry && entry.edit !== null ? dayTotal(entry) : entry ? null : 0,
        future: day > today,
      });
    }
    columns.push(column);
  }
  return columns;
}

/** Active time per week for the last `weeks` weeks (oldest first), or null when private. */
export function weeklyTotals(
  calendar: readonly CalendarDay[] | null,
  today: string,
  weeks = 12,
): { start: string; seconds: number }[] | null {
  if (!calendar || calendar.some((d) => d.edit === null)) return null;
  const grid = calendarGrid(calendar, today, weeks);
  return grid.map((column) => ({
    start: column[0].day,
    seconds: column.reduce((sum, cell) => sum + (cell.seconds ?? 0), 0),
  }));
}

/** Longest run of consecutive active days ending today or yesterday. */
export function currentStreak(calendar: readonly CalendarDay[] | null, today: string): number {
  if (!calendar?.length) return 0;
  const active = new Set(calendar.filter((d) => d.level > 0).map((d) => d.day));
  let day = active.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (active.has(day)) {
    streak += 1;
    day = shiftDay(day, -1);
  }
  return streak;
}
