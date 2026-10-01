import { beforeEach, describe, expect, it } from "vitest";
import {
  BACKUP_INTERVAL_MS,
  RecoveryRecorder,
  backupsToPrune,
  formatRecoveryTime,
  headsToEvict,
  memoryRecoveryBackend,
  recoverableHeads,
  resetMediaIdentity,
  sameChartContent,
  sanitizeChart,
  type RecoveryBackend,
  type RecoveryChart,
  type RecoveryMedia,
  type RecoveryOp,
  type RecoveryState,
} from "./recovery";
import { DEFAULT_SONG_META, makeDifficulty, makeRedPoint, type Difficulty } from "../types";

const noMedia: RecoveryMedia = {
  audioFiles: [],
  backgroundFiles: [],
  videoFiles: [],
  sampleFiles: [],
};

function chartWith(difficulties: Difficulty[]): RecoveryChart {
  return {
    meta: { ...DEFAULT_SONG_META, title: "Song" },
    timingPoints: [makeRedPoint(0, 120)],
    difficulties,
    activeId: difficulties[0].id,
    bgScope: "mapset",
  };
}

function withNotes(name: string, count: number): Difficulty {
  return {
    ...makeDifficulty(name, 4),
    notes: Array.from({ length: count }, (_, i) => ({
      id: `${name}-${i}`,
      column: i % 4,
      startTime: i * 100,
    })),
  };
}

/** Wraps a backend so a test can see which records each commit touched. */
function spying(backend: RecoveryBackend) {
  const commits: RecoveryOp[][] = [];
  return {
    commits,
    backend: {
      ...backend,
      commit: (ops: RecoveryOp[]) => {
        commits.push(ops);
        return backend.commit(ops);
      },
    } satisfies RecoveryBackend,
  };
}

let clock = 1_000_000;
const now = () => clock;

beforeEach(() => {
  clock = 1_000_000;
  resetMediaIdentity();
});

describe("RecoveryRecorder.persist", () => {
  it("rewrites only the difficulties whose object changed", async () => {
    const { backend, commits } = spying(memoryRecoveryBackend());
    const recorder = new RecoveryRecorder(backend, now);
    const easy = withNotes("Easy", 10);
    const hard = withNotes("Hard", 5000);
    const chart = chartWith([easy, hard]);
    expect(await recorder.persist({ projectId: "p", chart, media: noMedia }, clock)).toBe(2);

    const editedEasy = { ...easy, notes: easy.notes.slice(1) };
    const next = { ...chart, difficulties: [editedEasy, hard] };
    expect(await recorder.persist({ projectId: "p", chart: next, media: noMedia }, clock)).toBe(1);
    const diffWrites = commits[1].filter((op) => op.store === "diffs");
    expect(diffWrites.map((op) => op.key)).toEqual([`p|${easy.id}`]);
  });

  it("removes the record of a deleted difficulty", async () => {
    const backend = memoryRecoveryBackend();
    const recorder = new RecoveryRecorder(backend, now);
    const a = withNotes("A", 3);
    const b = withNotes("B", 3);
    await recorder.persist({ projectId: "p", chart: chartWith([a, b]), media: noMedia }, clock);
    await recorder.persist({ projectId: "p", chart: chartWith([a]), media: noMedia }, clock);
    expect(await backend.keys("diffs", "p|")).toEqual([`p|${a.id}`]);
  });

  it("rebuilds the project it wrote, in difficulty order", async () => {
    const recorder = new RecoveryRecorder(memoryRecoveryBackend(), now);
    const a = withNotes("A", 3);
    const b = withNotes("B", 7);
    const chart = { ...chartWith([b, a]), activeId: a.id };
    await recorder.persist({ projectId: "p", chart, media: noMedia }, clock);
    const loaded = await recorder.load("p");
    expect(loaded?.chart.difficulties.map((d) => d.name)).toEqual(["B", "A"]);
    expect(loaded?.chart.activeId).toBe(a.id);
    expect(loaded?.head.noteCount).toBe(10);
  });

  it("keeps media only while the work is unsaved, and writes it once", async () => {
    const { backend, commits } = spying(memoryRecoveryBackend());
    const recorder = new RecoveryRecorder(backend, now);
    const media: RecoveryMedia = {
      ...noMedia,
      audioFiles: [{ name: "audio.mp3", blob: new Blob(["abc"]) }],
    };
    const chart = chartWith([withNotes("A", 2)]);
    await recorder.persist({ projectId: "p", chart, media }, clock);
    await recorder.persist({ projectId: "p", chart, media }, clock);
    const mediaWrites = commits.flat().filter((op) => op.store === "media" && op.value);
    expect(mediaWrites).toHaveLength(1);
    expect((await recorder.load("p"))?.media?.audioFiles[0].name).toBe("audio.mp3");

    await recorder.markSaved("p");
    expect(await backend.get("media", "p")).toBeUndefined();
    expect((await recorder.load("p"))?.media).toBeNull();
  });

  it("does not store media for a clean project", async () => {
    const backend = memoryRecoveryBackend();
    const recorder = new RecoveryRecorder(backend, now);
    const media: RecoveryMedia = {
      ...noMedia,
      audioFiles: [{ name: "audio.mp3", blob: new Blob(["abc"]) }],
    };
    await recorder.persist({ projectId: "p", chart: chartWith([withNotes("A", 2)]), media }, null);
    expect(await backend.get("media", "p")).toBeUndefined();
  });
});

describe("recoverable work", () => {
  it("lists unsaved heads newest first and drops saved ones", async () => {
    const recorder = new RecoveryRecorder(memoryRecoveryBackend(), now);
    await recorder.persist({ projectId: "old", chart: chartWith([withNotes("A", 1)]), media: noMedia }, clock);
    clock += 1000;
    await recorder.persist({ projectId: "new", chart: chartWith([withNotes("B", 1)]), media: noMedia }, clock);
    clock += 1000;
    await recorder.persist({ projectId: "clean", chart: chartWith([withNotes("C", 1)]), media: noMedia }, null);
    expect((await recorder.recoverable()).map((h) => h.projectId)).toEqual(["new", "old"]);

    await recorder.markSaved("new");
    expect((await recorder.recoverable()).map((h) => h.projectId)).toEqual(["old"]);
  });

  it("counts a head as unsaved exactly while it carries a pending edit", () => {
    expect(
      recoverableHeads([
        { editedAt: 5, updatedAt: 20, closedAt: null },
        { editedAt: null, updatedAt: 30, closedAt: null },
        { editedAt: 8, updatedAt: 40, closedAt: null },
      ]),
    ).toEqual([
      { editedAt: 8, updatedAt: 40, closedAt: null },
      { editedAt: 5, updatedAt: 20, closedAt: null },
    ]);
  });

  it("keeps closed work out of the startup prompt but still lists it as unsaved", async () => {
    const recorder = new RecoveryRecorder(memoryRecoveryBackend(), now);
    const state = { projectId: "p", chart: chartWith([withNotes("A", 2)]), media: noMedia };
    await recorder.persist(state, clock, { closed: true });
    expect(await recorder.recoverable()).toEqual([]);
    expect((await recorder.unsaved()).map((h) => h.projectId)).toEqual(["p"]);

    await recorder.persist(state, clock);
    expect((await recorder.recoverable()).map((h) => h.projectId)).toEqual(["p"]);
    await recorder.close("p");
    expect(await recorder.recoverable()).toEqual([]);
  });

  it("remembers a save made before the head was first written", async () => {
    const recorder = new RecoveryRecorder(memoryRecoveryBackend(), now);
    await recorder.markSaved("p", 500);
    const state = { projectId: "p", chart: chartWith([withNotes("A", 2)]), media: noMedia };
    await recorder.persist(state, null);
    expect((await recorder.load("p"))?.head.savedAt).toBe(500);
  });

  it("forgets a project's live state but keeps its backups", async () => {
    const backend = memoryRecoveryBackend();
    const recorder = new RecoveryRecorder(backend, now);
    const state: RecoveryState = { projectId: "p", chart: chartWith([withNotes("A", 2)]), media: noMedia };
    await recorder.persist(state, clock);
    await recorder.backup(state, "manual");
    await recorder.forget("p");
    expect(await recorder.load("p")).toBeNull();
    expect(await backend.keys("diffs")).toEqual([]);
    expect(await recorder.backups("p")).toHaveLength(1);
  });
});

describe("backups", () => {
  it("takes interval backups at most every few minutes, and only after a change", async () => {
    const recorder = new RecoveryRecorder(memoryRecoveryBackend(), now);
    const chart = chartWith([withNotes("A", 4)]);
    const state = { projectId: "p", chart, media: noMedia };
    expect(await recorder.backup(state, "interval")).toBe(true);
    clock += 1000;
    const edited = { ...state, chart: { ...chart, difficulties: [withNotes("A", 5)] } };
    expect(await recorder.backup(edited, "interval")).toBe(false);
    clock += BACKUP_INTERVAL_MS;
    expect(await recorder.backup(edited, "interval")).toBe(true);
    clock += BACKUP_INTERVAL_MS;
    expect(await recorder.backup(edited, "interval")).toBe(false);
  });

  it("always backs up before the chart is replaced", async () => {
    const recorder = new RecoveryRecorder(memoryRecoveryBackend(), now);
    const state = { projectId: "p", chart: chartWith([withNotes("A", 4)]), media: noMedia };
    expect(await recorder.backup(state, "interval")).toBe(true);
    expect(await recorder.backup(state, "replaced")).toBe(true);
    const list = await recorder.backups("p");
    expect(list.map((b) => b.reason)).toEqual(["replaced", "interval"]);
  });

  it("skips automatic backups of an empty chart", async () => {
    const recorder = new RecoveryRecorder(memoryRecoveryBackend(), now);
    const state = { projectId: "p", chart: chartWith([makeDifficulty()]), media: noMedia };
    expect(await recorder.backup(state, "replaced")).toBe(false);
    expect(await recorder.backup(state, "manual")).toBe(true);
  });

  it("loads a backup with its whole chart", async () => {
    const recorder = new RecoveryRecorder(memoryRecoveryBackend(), now);
    const chart = chartWith([withNotes("A", 4), withNotes("B", 2)]);
    await recorder.backup({ projectId: "p", chart, media: noMedia }, "manual");
    const [summary] = await recorder.backups();
    expect(summary).toMatchObject({ projectId: "p", noteCount: 6, difficultyCount: 2 });
    expect("chart" in summary).toBe(false);
    const record = await recorder.loadBackup(summary.key);
    expect(record?.chart.difficulties).toHaveLength(2);
  });
});

describe("backupsToPrune", () => {
  const day = 24 * 60 * 60_000;
  const entry = (projectId: string, createdAt: number) => ({
    key: `${projectId}@${createdAt}`,
    projectId,
    createdAt,
  });

  it("caps each project and keeps the newest", () => {
    const entries = Array.from({ length: 6 }, (_, i) => entry("p", i));
    const doomed = backupsToPrune(entries, 10, {
      perProject: 4,
      keepNewest: 2,
      maxAgeMs: Infinity,
      maxProjects: 10,
    });
    expect(doomed.sort()).toEqual(["p@0", "p@1"]);
  });

  it("ages out old backups but never the newest few", () => {
    const now = 100 * day;
    const entries = [entry("p", 1 * day), entry("p", 2 * day), entry("p", 3 * day), entry("q", 99 * day)];
    const doomed = backupsToPrune(entries, now, {
      perProject: 10,
      keepNewest: 2,
      maxAgeMs: 30 * day,
      maxProjects: 10,
    });
    expect(doomed).toEqual([`p@${1 * day}`]);
  });

  it("drops every backup of projects past the cap, least recent first", () => {
    const entries = [entry("a", 1), entry("b", 5), entry("c", 3)];
    const doomed = backupsToPrune(entries, 10, {
      perProject: 10,
      keepNewest: 1,
      maxAgeMs: Infinity,
      maxProjects: 2,
    });
    expect(doomed).toEqual(["a@1"]);
  });
});

describe("headsToEvict", () => {
  it("evicts clean heads before unsaved work and spares the open project", () => {
    const heads = [
      { projectId: "dirty-old", updatedAt: 1, editedAt: 1 },
      { projectId: "clean-old", updatedAt: 2, editedAt: null },
      { projectId: "open", updatedAt: 0, editedAt: null },
      { projectId: "clean-new", updatedAt: 9, editedAt: null },
    ];
    expect(headsToEvict(heads, "open", 2)).toEqual(["clean-old", "clean-new"]);
    expect(headsToEvict(heads, "open", 1)).toEqual(["clean-old", "clean-new", "dirty-old"]);
    expect(headsToEvict(heads, "open", 4)).toEqual([]);
  });

  it("is applied by prune", async () => {
    const backend = memoryRecoveryBackend();
    const recorder = new RecoveryRecorder(backend, now);
    for (let i = 0; i < 14; i++) {
      clock += 1;
      await recorder.persist({ projectId: `p${i}`, chart: chartWith([withNotes("A", 1)]), media: noMedia }, null);
    }
    await recorder.prune("p0");
    const heads = await backend.keys("heads");
    expect(heads).toHaveLength(12);
    expect(heads).toContain("p0");
    expect(heads).not.toContain("p1");
  });
});

describe("sanitizeChart", () => {
  it("drops notes with impossible times or lanes and repairs bad holds", () => {
    const d = {
      ...makeDifficulty("X", 4),
      notes: [
        { id: "ok", column: 1, startTime: 100 },
        { id: "nan", column: 1, startTime: Number.NaN },
        { id: "lane", column: 9, startTime: 100 },
        { id: "hold", column: 2, startTime: 500, endTime: 400 },
        { column: 0, startTime: 1 },
      ],
    } as unknown as Difficulty;
    const chart = sanitizeChart(chartWith([d]));
    expect(chart?.difficulties[0].notes).toEqual([
      { id: "ok", column: 1, startTime: 100 },
      { id: "hold", column: 2, startTime: 500 },
    ]);
  });

  it("drops difficulties it cannot read and gives up when none are left", () => {
    const good = withNotes("Good", 1);
    const bad = { ...withNotes("Bad", 1), keyCount: 0 };
    expect(sanitizeChart(chartWith([bad, good]))?.difficulties.map((d) => d.name)).toEqual(["Good"]);
    expect(sanitizeChart(chartWith([bad]))).toBeNull();
    expect(sanitizeChart(null)).toBeNull();
    expect(sanitizeChart({ difficulties: [good] })).toBeNull();
  });

  it("points the active difficulty at one that survived", () => {
    const good = withNotes("Good", 1);
    const chart = { ...chartWith([good]), activeId: "gone" };
    expect(sanitizeChart(chart)?.activeId).toBe(good.id);
  });
});

describe("sameChartContent", () => {
  it("compares the map, not which difficulty is open", () => {
    const a = withNotes("A", 3);
    const b = withNotes("B", 2);
    const chart = chartWith([a, b]);
    const otherTab: RecoveryChart = { ...chart, activeId: b.id };
    expect(sameChartContent(chart, otherTab)).toBe(true);
    expect(sameChartContent(chart, chartWith([a]))).toBe(false);
    const moved = { ...a, notes: a.notes.map((n, i) => (i ? n : { ...n, startTime: 5 })) };
    expect(sameChartContent(chart, chartWith([moved, b]))).toBe(false);
  });
});

describe("formatRecoveryTime", () => {
  it("shows only the clock time for today and adds the date before that", () => {
    const now = new Date(2026, 9, 1, 15, 0).getTime();
    const earlier = new Date(2026, 9, 1, 10, 42).getTime();
    const yesterday = new Date(2026, 8, 30, 10, 42).getTime();
    expect(formatRecoveryTime(earlier, "en-GB", now)).toBe("10:42");
    const older = formatRecoveryTime(yesterday, "en-GB", now);
    expect(older).toMatch(/^30 \S+ 10:42$/);
  });
});
