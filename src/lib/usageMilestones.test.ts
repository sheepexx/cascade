import { describe, expect, it } from "vitest";
import { createUsageTracker, daysSince, isoWeek, localDay } from "./usageMilestones";

function store() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const day = (d: number, h = 12) => new Date(2026, 9, d, h);

describe("calendar helpers", () => {
  it("counts calendar days, not 24-hour spans", () => {
    expect(daysSince("2026-10-01", new Date(2026, 9, 1, 23, 59))).toBe(0);
    expect(daysSince("2026-10-01", new Date(2026, 9, 2, 0, 1))).toBe(1);
    expect(daysSince("2026-10-01", new Date(2026, 9, 31))).toBe(30);
    expect(localDay(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("names ISO weeks across the new year", () => {
    expect(isoWeek(new Date(2026, 9, 1))).toBe("2026-W40");
    expect(isoWeek(new Date(2027, 0, 1))).toBe("2026-W53");
    expect(isoWeek(new Date(2027, 0, 4))).toBe("2027-W01");
  });
});

describe("usage tracker", () => {
  it("reports a first open once, then day 1, 7 and 30 returns once each", () => {
    const s = store();
    const tracker = createUsageTracker({ store: s, isExistingInstall: false });
    expect(tracker.opened(day(1))).toEqual([{ event: "first_open", cohortDay: "2026-10-01" }]);
    expect(tracker.opened(day(1, 18))).toEqual([]);
    expect(tracker.opened(day(2))).toEqual([{ event: "retained_d1", cohortDay: "2026-10-01" }]);
    expect(tracker.opened(day(2, 20))).toEqual([]);
    expect(tracker.opened(day(5))).toEqual([]);
    expect(tracker.opened(day(8))).toEqual([{ event: "retained_d7", cohortDay: "2026-10-01" }]);
    expect(tracker.opened(day(31))).toEqual([{ event: "retained_d30", cohortDay: "2026-10-01" }]);
  });

  it("remembers across reloads", () => {
    const s = store();
    createUsageTracker({ store: s, isExistingInstall: false }).opened(day(1));
    const again = createUsageTracker({ store: s, isExistingInstall: false });
    expect(again.opened(day(1))).toEqual([]);
    expect(again.reached("created")).toEqual([{ event: "funnel_created", cohortDay: "2026-10-01" }]);
    expect(createUsageTracker({ store: s, isExistingInstall: false }).reached("created")).toEqual([]);
  });

  it("reports the weekly mapper at most once a week", () => {
    const tracker = createUsageTracker({ store: store(), isExistingInstall: false });
    tracker.opened(day(1));
    expect(tracker.mapped(day(1))).toEqual([{ event: "mapper_active_week", cohortDay: null }]);
    expect(tracker.mapped(day(4))).toEqual([]);
    expect(tracker.mapped(day(5))).toEqual([{ event: "mapper_active_week", cohortDay: null }]);
  });

  it("keeps installs from before milestones out of cohorts but counts their mapping", () => {
    const tracker = createUsageTracker({ store: store(), isExistingInstall: true });
    expect(tracker.opened(day(1))).toEqual([]);
    expect(tracker.reached("exported")).toEqual([]);
    expect(tracker.mapped(day(1))).toEqual([{ event: "mapper_active_week", cohortDay: null }]);
  });
});
