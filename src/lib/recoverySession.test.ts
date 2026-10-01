import { describe, expect, it } from "vitest";
import {
  RecoveryRecorder,
  memoryRecoveryBackend,
  type RecoveryChart,
  type RecoveryMedia,
} from "./recovery";
import {
  FLUSH_DELAY_MS,
  FLUSH_MAX_WAIT_MS,
  RecoverySession,
  type SessionClock,
  type TrackedState,
} from "./recoverySession";
import { DEFAULT_SONG_META, makeDifficulty, type Difficulty } from "../types";

const noMedia: RecoveryMedia = {
  audioFiles: [],
  backgroundFiles: [],
  videoFiles: [],
  sampleFiles: [],
};

function fakeClock() {
  let now = 1_000;
  let nextId = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  const clock: SessionClock = {
    now: () => now,
    setTimeout: (run, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    clearTimeout: (id) => {
      if (id !== undefined) timers.delete(id);
    },
  };
  return {
    clock,
    /** Moves time on, firing timers that come due. */
    advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = until;
    },
    pending: () => timers.size,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function project(id: string, title: string, notes: number): TrackedState {
  const difficulty: Difficulty = {
    ...makeDifficulty("D", 4),
    notes: Array.from({ length: notes }, (_, i) => ({ id: `${id}-${i}`, column: i % 4, startTime: i * 10 })),
  };
  const chart: RecoveryChart = {
    meta: { ...DEFAULT_SONG_META, title },
    timingPoints: [],
    difficulties: [difficulty],
    activeId: difficulty.id,
    bgScope: "mapset",
  };
  return { projectId: id, chart, media: noMedia, enabled: true };
}

function setup() {
  const time = fakeClock();
  const recorder = new RecoveryRecorder(memoryRecoveryBackend(), time.clock.now);
  const closed: string[] = [];
  const session = new RecoverySession(recorder, time.clock, (title) => closed.push(title));
  return { time, recorder, session, closed };
}

describe("RecoverySession", () => {
  it("writes once editing pauses", async () => {
    const { time, recorder, session } = setup();
    session.track(project("p", "Song", 3));
    session.noteEdit();
    time.advance(FLUSH_DELAY_MS - 1);
    await settle();
    expect(await recorder.load("p")).toBeNull();
    time.advance(1);
    await settle();
    expect((await recorder.recoverable()).map((h) => h.projectId)).toEqual(["p"]);
  });

  it("does not let steady editing put the write off for ever", async () => {
    const { time, recorder, session } = setup();
    session.track(project("p", "Song", 3));
    for (let elapsed = 0; elapsed < FLUSH_MAX_WAIT_MS + FLUSH_DELAY_MS; elapsed += 500) {
      session.noteEdit();
      time.advance(500);
    }
    await settle();
    expect(await recorder.load("p")).not.toBeNull();
  });

  it("writes nothing for a project that was only opened", async () => {
    const { time, recorder, session } = setup();
    session.track(project("p", "Song", 3));
    time.advance(FLUSH_MAX_WAIT_MS * 2);
    await session.flushPending();
    expect(await recorder.heads()).toEqual([]);
  });

  it("keeps and announces unsaved work when another project replaces it", async () => {
    const { recorder, session, closed } = setup();
    session.track(project("a", "First", 4));
    session.noteEdit();
    session.track(project("b", "Second", 2));
    await settle();
    await settle();
    expect(closed).toEqual(["First"]);
    expect((await recorder.unsaved()).map((h) => h.projectId)).toEqual(["a"]);
    // Replaced work is not crash work, so the startup prompt leaves it alone.
    expect(await recorder.recoverable()).toEqual([]);
    expect((await recorder.backups("a")).map((b) => b.reason)).toContain("replaced");
  });

  it("says nothing when the replaced project was saved", async () => {
    const { session, closed } = setup();
    session.track(project("a", "First", 4));
    session.noteEdit();
    await session.markSaved("a", session.saveToken());
    session.track(project("b", "Second", 2));
    expect(closed).toEqual([]);
  });

  it("keeps a project dirty when it was edited while a save ran", async () => {
    const { recorder, session } = setup();
    session.track(project("p", "Song", 3));
    session.noteEdit();
    const token = session.saveToken();
    session.noteEdit();
    await session.markSaved("p", token);
    expect(session.dirty).toBe(true);
    await session.flush();
    expect((await recorder.recoverable()).map((h) => h.projectId)).toEqual(["p"]);
  });

  it("writes pending work straight away on the way out", async () => {
    const { recorder, session } = setup();
    session.track(project("p", "Song", 3));
    session.noteEdit();
    await session.flushPending();
    expect((await recorder.recoverable()).map((h) => h.projectId)).toEqual(["p"]);
  });

  it("writes a restored project that arrives with edits pending", async () => {
    const { time, recorder, session } = setup();
    session.track(project("a", "Open", 1));
    session.noteEdit("restored");
    session.track(project("restored", "Back", 5));
    time.advance(FLUSH_DELAY_MS);
    await settle();
    expect((await recorder.recoverable()).map((h) => h.projectId)).toEqual(["restored"]);
  });

  it("ignores edits before a project is open", async () => {
    const { session } = setup();
    session.noteEdit();
    expect(session.dirty).toBe(false);
  });
});
