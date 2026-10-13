import { describe, expect, it } from "vitest";
import {
  EDIT_IDLE_MS,
  MappingReporter,
  MappingTracker,
  REVIEW_IDLE_MS,
  SESSION_GAP_MS,
  formatDuration,
  localDay,
  type MappingContext,
  type MappingReport,
  type TrackerState,
} from "./mappingTracker";

const CONTEXT: MappingContext = {
  projectKey: "local:abc",
  projectTitle: "Song",
  projectArtist: "Artist",
  beatmapsetId: null,
  difficultyKey: "d1",
  difficultyName: "Hard",
};

const ACTIVE: TrackerState = { eligible: true, playtesting: false, playing: false };
const T0 = new Date(2026, 9, 13, 12, 0, 0).getTime();

function tracker() {
  let n = 0;
  const t = new MappingTracker(() => `session-${++n}`);
  t.setContext(CONTEXT);
  return t;
}

/** Ticks once a second from `from` for `seconds`, with the given state. */
function run(t: MappingTracker, from: number, seconds: number, state: TrackerState = ACTIVE) {
  for (let i = 0; i <= seconds; i++) t.tick(state, from + i * 1000);
}

function seconds(reports: MappingReport[]) {
  const sum = { edit: 0, playtest: 0, review: 0 };
  for (const r of reports) {
    for (const e of r.entries) {
      sum.edit += e.edit;
      sum.playtest += e.playtest;
      sum.review += e.review;
    }
  }
  return sum;
}

describe("MappingTracker", () => {
  it("counts editing for a minute after the last input, then stops", () => {
    const t = tracker();
    t.input(T0);
    run(t, T0, 180);
    expect(seconds(t.drain())).toEqual({ edit: EDIT_IDLE_MS / 1000, playtest: 0, review: 0 });
  });

  it("keeps counting while input keeps coming", () => {
    const t = tracker();
    for (let i = 0; i <= 120; i++) {
      if (i % 20 === 0) t.input(T0 + i * 1000);
      t.tick(ACTIVE, T0 + i * 1000);
    }
    expect(seconds(t.drain()).edit).toBe(120);
  });

  it("counts nothing while idle, in the background or with no map open", () => {
    const t = tracker();
    run(t, T0, 30);
    t.input(T0 + 31_000);
    run(t, T0 + 31_000, 30, { ...ACTIVE, eligible: false });
    expect(seconds(t.drain()).edit).toBe(0);

    const noMap = new MappingTracker();
    noMap.input(T0);
    run(noMap, T0, 30);
    expect(noMap.drain()).toEqual([]);
  });

  it("forgets the last input after leaving the window", () => {
    const t = tracker();
    t.input(T0);
    run(t, T0, 10);
    t.tick({ ...ACTIVE, eligible: false }, T0 + 11_000);
    run(t, T0 + 12_000, 30);
    expect(seconds(t.drain()).edit).toBe(10);
  });

  it("never credits more than a moment for a late tick", () => {
    const t = tracker();
    t.input(T0);
    t.tick(ACTIVE, T0);
    t.tick(ACTIVE, T0 + 50_000);
    expect(t.drain()).toEqual([]);
  });

  it("separates playtesting and reviewing from editing", () => {
    const t = tracker();
    t.input(T0);
    run(t, T0, 20, { ...ACTIVE, playtesting: true });
    // Song playing with the last input a little over a minute ago: reviewing.
    t.input(T0 + 21_000);
    run(t, T0 + 21_000 + EDIT_IDLE_MS + 1000, 30, { ...ACTIVE, playing: true });
    const sum = seconds(t.drain());
    expect(sum.playtest).toBe(20);
    expect(sum.review).toBe(30);
    expect(sum.edit).toBe(0);
  });

  it("stops reviewing after five minutes without input", () => {
    const t = tracker();
    t.input(T0);
    expect(t.classify({ ...ACTIVE, playing: true }, T0 + REVIEW_IDLE_MS - 1)).toBe("review");
    expect(t.classify({ ...ACTIVE, playing: true }, T0 + REVIEW_IDLE_MS + 1)).toBeNull();
  });

  it("stops counting a playtest nobody is playing", () => {
    const t = tracker();
    t.input(T0);
    expect(t.classify({ ...ACTIVE, playtesting: true }, T0 + 29_000)).toBe("playtest");
    expect(t.classify({ ...ACTIVE, playtesting: true }, T0 + 31_000)).toBeNull();
  });

  it("splits time by project, difficulty and day, with counters alongside", () => {
    const t = tracker();
    t.input(T0);
    run(t, T0, 10);
    t.count("notes_placed", T0 + 10_000, 3);
    t.setContext({ ...CONTEXT, difficultyKey: "d2", difficultyName: "Insane" });
    t.input(T0 + 11_000);
    run(t, T0 + 11_000, 5);
    const [report] = t.drain();
    expect(report.entries).toEqual([
      expect.objectContaining({ difficulty_key: "d1", edit: 10, notes_placed: 3, day: localDay(T0) }),
      // The second between the last tick on d1 and the first on d2 goes to d2.
      expect.objectContaining({ difficulty_key: "d2", difficulty_name: "Insane", edit: 6 }),
    ]);
    expect(report.session).toBe("session-1");
    expect(Date.parse(report.to) - Date.parse(report.from)).toBe(16_000);
  });

  it("starts a new session after ten idle minutes", () => {
    const t = tracker();
    t.input(T0);
    run(t, T0, 5);
    const later = T0 + SESSION_GAP_MS + 60_000;
    t.input(later);
    run(t, later, 5);
    const reports = t.drain();
    expect(reports.map((r) => r.session)).toEqual(["session-1", "session-2"]);
    expect(reports.map((r) => r.entries[0].edit)).toEqual([5, 5]);
  });

  it("drains each second only once", () => {
    const t = tracker();
    t.input(T0);
    run(t, T0, 10);
    expect(seconds(t.drain()).edit).toBe(10);
    expect(t.drain()).toEqual([]);
  });
});

describe("MappingReporter", () => {
  function storage(initial: MappingReport[] = []) {
    let saved = initial;
    return {
      load: () => saved,
      save: (reports: MappingReport[]) => {
        saved = reports;
      },
      get saved() {
        return saved;
      },
    };
  }

  const report = (to: number, edit = 60): MappingReport => ({
    session: "s",
    from: new Date(to - edit * 1000).toISOString(),
    to: new Date(to).toISOString(),
    entries: [
      {
        day: localDay(to),
        project_key: "local:a",
        project_title: "",
        project_artist: "",
        beatmapset_id: null,
        difficulty_key: null,
        difficulty_name: null,
        edit,
        playtest: 0,
        review: 0,
      },
    ],
  });

  it("sends in order and keeps what failed for later", async () => {
    const sent: number[] = [];
    let online = false;
    const store = storage();
    const reporter = new MappingReporter(
      async (r) => {
        if (!online) throw new Error("offline");
        sent.push(r.entries[0].edit);
      },
      store,
      () => T0,
    );
    reporter.enqueue([report(T0 - 2000, 1), report(T0 - 1000, 2)]);
    await reporter.flush();
    expect(sent).toEqual([]);
    expect(store.saved).toHaveLength(2);
    online = true;
    await reporter.flush();
    expect(sent).toEqual([1, 2]);
    expect(store.saved).toEqual([]);
  });

  it("picks up reports a closed tab left behind, but not stale ones", async () => {
    const sent: number[] = [];
    const store = storage([report(T0 - 3 * 86_400_000, 9), report(T0 - 60_000, 4)]);
    const reporter = new MappingReporter(async (r) => void sent.push(r.entries[0].edit), store, () => T0);
    expect(reporter.pending).toBe(1);
    await reporter.flush();
    expect(sent).toEqual([4]);
  });
});

describe("formatDuration", () => {
  it("reads like the rest of the interface", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(60 * 34)).toBe("34m");
    expect(formatDuration(3600 * 12 + 60 * 34 + 10)).toBe("12h 34m");
    expect(formatDuration(7200)).toBe("2h");
    expect(formatDuration(null)).toBe("0m");
  });
});
