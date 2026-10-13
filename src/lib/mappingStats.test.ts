import { describe, expect, it } from "vitest";
import { calendarGrid, currentStreak, periodTotals, weeklyTotals, type CalendarDay } from "./mappingStats";

const day = (d: string, edit: number | null, level = edit ? 2 : 0): CalendarDay => ({
  day: d,
  level,
  edit,
  playtest: edit === null ? null : 0,
  review: edit === null ? null : 0,
});

describe("periodTotals", () => {
  it("sums editing time today, over seven days and this month", () => {
    const calendar = [day("2026-09-30", 100), day("2026-10-01", 50), day("2026-10-07", 10), day("2026-10-13", 5)];
    expect(periodTotals(calendar, "2026-10-13")).toEqual({ today: 5, week: 15, month: 65 });
  });

  it("is unknown when the mapper keeps their time private", () => {
    expect(periodTotals([day("2026-10-13", null, 3)], "2026-10-13")).toBeNull();
    expect(periodTotals(null, "2026-10-13")).toBeNull();
    expect(periodTotals([], "2026-10-13")).toEqual({ today: 0, week: 0, month: 0 });
  });
});

describe("calendarGrid", () => {
  it("lays out Monday-to-Sunday weeks ending with this week", () => {
    // 2026-10-13 is a Tuesday.
    const grid = calendarGrid([day("2026-10-12", 60, 4)], "2026-10-13", 2);
    expect(grid).toHaveLength(2);
    expect(grid[0][0].day).toBe("2026-10-05");
    expect(grid[1][0]).toEqual({ day: "2026-10-12", level: 4, seconds: 60, future: false });
    expect(grid[1][2].future).toBe(true);
    expect(grid[1][6].day).toBe("2026-10-18");
  });

  it("keeps only levels when time is private", () => {
    const grid = calendarGrid([day("2026-10-13", null, 3)], "2026-10-13", 1);
    expect(grid[0][1]).toMatchObject({ level: 3, seconds: null });
  });
});

describe("weeklyTotals and streaks", () => {
  it("sums each week", () => {
    const totals = weeklyTotals([day("2026-10-06", 30), day("2026-10-12", 60), day("2026-10-13", 15)], "2026-10-13", 2);
    expect(totals).toEqual([
      { start: "2026-10-05", seconds: 30 },
      { start: "2026-10-12", seconds: 75 },
    ]);
  });

  it("counts consecutive active days up to today or yesterday", () => {
    const calendar = [day("2026-10-10", 5), day("2026-10-11", 5), day("2026-10-12", 5)];
    expect(currentStreak(calendar, "2026-10-13")).toBe(3);
    expect(currentStreak(calendar, "2026-10-15")).toBe(0);
  });
});
