import { beforeEach, describe, expect, it } from "vitest";
import {
  FeedbackInviteTimer,
  INVITE_IDLE_MS,
  loadFeedbackInvite,
  mayInviteFeedback,
  nextRatingQuestion,
  recordFeedbackExport,
  recordFeedbackInviteDismissed,
  recordFeedbackInviteShown,
  recordFeedbackOptOut,
  recordFeedbackSent,
  recordFeedbackUse,
  resetFeedbackUseDay,
  type StorageLike,
} from "./feedbackInvite";

const DAY = 24 * 60 * 60_000;
const START = new Date(2026, 0, 5, 12).getTime();

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

/** A mapper who used Cascade on three days a week apart and exported once. */
function regular(store: StorageLike) {
  for (const day of [0, 3, 6]) {
    resetFeedbackUseDay();
    recordFeedbackUse(START + day * DAY, store);
  }
  recordFeedbackExport(START + 6 * DAY, store);
}

const eligible = (store: StorageLike, at: number) => mayInviteFeedback(loadFeedbackInvite(at, store), at);

beforeEach(() => resetFeedbackUseDay());

describe("feedback invitation eligibility", () => {
  it("waits for a week since first use, three days of editing and an export", () => {
    const store = memory();
    regular(store);
    expect(eligible(store, START + 6 * DAY)).toBe(false);
    expect(eligible(store, START + 7 * DAY)).toBe(true);
  });

  it("doesn't count one long day, or edits without an export", () => {
    const store = memory();
    for (let hour = 0; hour < 10; hour++) {
      resetFeedbackUseDay();
      recordFeedbackUse(START + hour * 60 * 60_000, store);
    }
    recordFeedbackExport(START, store);
    expect(eligible(store, START + 30 * DAY)).toBe(false);

    const noExport = memory();
    for (const day of [0, 1, 2]) {
      resetFeedbackUseDay();
      recordFeedbackUse(START + day * DAY, noExport);
    }
    expect(eligible(noExport, START + 30 * DAY)).toBe(false);
  });

  it("counts the week from the first thing it recorded, an export included", () => {
    const store = memory();
    recordFeedbackExport(START, store);
    for (const day of [8, 9, 10]) {
      resetFeedbackUseDay();
      recordFeedbackUse(START + day * DAY, store);
    }
    expect(loadFeedbackInvite(START, store)?.firstUsedAt).toBe(START);
    expect(eligible(store, START + 10 * DAY)).toBe(true);
  });
});

describe("answers to the invitation", () => {
  const ready = START + 7 * DAY;

  it("being shown puts the next invitation a month off, answered or not", () => {
    const store = memory();
    regular(store);
    expect(recordFeedbackInviteShown(ready, store)).toBe(true);
    expect(eligible(store, ready + 29 * DAY)).toBe(false);
    expect(eligible(store, ready + 30 * DAY)).toBe(true);
  });

  it("Not now waits at least 30 days, and a second one ends the invitations", () => {
    const store = memory();
    regular(store);
    recordFeedbackInviteShown(ready, store);
    recordFeedbackInviteDismissed(ready, store);
    expect(eligible(store, ready + 29 * DAY)).toBe(false);
    expect(eligible(store, ready + 30 * DAY)).toBe(true);
    recordFeedbackInviteShown(ready + 30 * DAY, store);
    recordFeedbackInviteDismissed(ready + 30 * DAY, store);
    expect(eligible(store, ready + 400 * DAY)).toBe(false);
  });

  it("Don't ask again ends them for good", () => {
    const store = memory();
    regular(store);
    recordFeedbackOptOut(ready, store);
    expect(eligible(store, ready + 5000 * DAY)).toBe(false);
  });

  it("sent feedback waits 90 days, whether it came from the invitation or the menu", () => {
    const store = memory();
    regular(store);
    recordFeedbackSent(ready, store);
    expect(eligible(store, ready + 89 * DAY)).toBe(false);
    expect(eligible(store, ready + 90 * DAY)).toBe(true);
  });
});

describe("when storage fails", () => {
  it("doesn't invite without storage", () => {
    expect(loadFeedbackInvite(START, null)).toBeNull();
    expect(mayInviteFeedback(null, START)).toBe(false);
    expect(recordFeedbackInviteShown(START, null)).toBe(false);
  });

  it("doesn't invite when the record is unreadable", () => {
    const store = memory();
    store.data.set("cascade:feedback-invite", "{not json");
    expect(loadFeedbackInvite(START, store)).toBeNull();
    store.data.set("cascade:feedback-invite", JSON.stringify({ activeDays: ["x"] }));
    expect(loadFeedbackInvite(START, store)).toBeNull();
  });

  it("doesn't show an invitation whose showing can't be remembered", () => {
    const store = memory();
    regular(store);
    const full: StorageLike = {
      getItem: (key) => store.getItem(key),
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    expect(eligible(full, START + 7 * DAY)).toBe(true);
    expect(recordFeedbackInviteShown(START + 7 * DAY, full)).toBe(false);
  });

  it("treats a store that throws on read as unavailable", () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {},
    };
    expect(loadFeedbackInvite(START, broken)).toBeNull();
    expect(() => recordFeedbackUse(START, broken)).not.toThrow();
  });
});

/** A clock the test advances by hand. */
function fakeClock() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    setTimeout: (run: () => void, ms: number) => {
      timers.set(next, { at: now + ms, run });
      return next++;
    },
    clearTimeout: (id: number) => void timers.delete(id),
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = end;
    },
  };
}

describe("FeedbackInviteTimer", () => {
  function setup(outcomes: ("shown" | "skip" | "wait")[] = []) {
    const clock = fakeClock();
    let offers = 0;
    const timer = new FeedbackInviteTimer(clock, () => {
      offers += 1;
      return outcomes.shift() ?? "shown";
    });
    return { clock, timer, offers: () => offers };
  }

  it("waits for a finished task and then a quiet spell", () => {
    const { clock, timer, offers } = setup();
    timer.setBusy(false);
    clock.advance(10 * INVITE_IDLE_MS);
    expect(offers()).toBe(0);
    timer.taskSucceeded();
    clock.advance(INVITE_IDLE_MS - 1);
    expect(offers()).toBe(0);
    clock.advance(1);
    expect(offers()).toBe(1);
  });

  it("holds while the mapper is busy and starts over once the interruption ends", () => {
    const { clock, timer, offers } = setup();
    timer.setBusy(false);
    timer.taskSucceeded();
    clock.advance(INVITE_IDLE_MS / 2);
    // Playback starts, then a dialog, for a long time.
    timer.setBusy(true);
    clock.advance(10 * INVITE_IDLE_MS);
    expect(offers()).toBe(0);
    timer.setBusy(false);
    clock.advance(INVITE_IDLE_MS - 1);
    expect(offers()).toBe(0);
    clock.advance(1);
    expect(offers()).toBe(1);
  });

  it("restarts the wait on every edit or key press", () => {
    const { clock, timer, offers } = setup();
    timer.setBusy(false);
    timer.taskSucceeded();
    for (let i = 0; i < 5; i++) {
      clock.advance(INVITE_IDLE_MS - 1000);
      timer.activity();
    }
    expect(offers()).toBe(0);
    clock.advance(INVITE_IDLE_MS);
    expect(offers()).toBe(1);
  });

  it("waits longer when a dialog it can't see is open", () => {
    const { clock, timer, offers } = setup(["wait", "wait", "shown"]);
    timer.setBusy(false);
    timer.taskSucceeded();
    clock.advance(3 * INVITE_IDLE_MS);
    expect(offers()).toBe(3);
  });

  it("offers at most once, and never after trouble", () => {
    const { clock, timer, offers } = setup();
    timer.setBusy(false);
    timer.taskSucceeded();
    clock.advance(INVITE_IDLE_MS);
    timer.taskSucceeded();
    clock.advance(10 * INVITE_IDLE_MS);
    expect(offers()).toBe(1);

    const troubled = setup();
    troubled.timer.setBusy(false);
    troubled.timer.taskSucceeded();
    troubled.timer.trouble();
    troubled.timer.taskSucceeded();
    troubled.clock.advance(10 * INVITE_IDLE_MS);
    expect(troubled.offers()).toBe(0);
  });

  it("doesn't retry by itself when the mapper isn't eligible", () => {
    const { clock, timer, offers } = setup(["skip"]);
    timer.setBusy(false);
    timer.taskSucceeded();
    clock.advance(10 * INVITE_IDLE_MS);
    expect(offers()).toBe(1);
  });
});

describe("rating questions", () => {
  const ready = START + 7 * DAY;

  it("asks them in order, each once, and waits two months after one", () => {
    const store = memory();
    regular(store);
    const record = () => loadFeedbackInvite(ready, store)!;
    expect(nextRatingQuestion(record(), new Set())).toBe("recommend");
    expect(recordFeedbackInviteShown(ready, store, "recommend")).toBe(true);
    expect(eligible(store, ready + 59 * DAY)).toBe(false);
    expect(eligible(store, ready + 60 * DAY)).toBe(true);
    expect(nextRatingQuestion(record(), new Set())).toBe("reliability");
  });

  it("counts a question as asked even when it was dismissed", () => {
    const store = memory();
    regular(store);
    recordFeedbackInviteShown(ready, store, "recommend");
    recordFeedbackInviteDismissed(ready, store);
    expect(loadFeedbackInvite(ready, store)!.askedRatings).toEqual(["recommend"]);
    expect(nextRatingQuestion(loadFeedbackInvite(ready, store)!, new Set())).toBe("reliability");
  });

  it("skips questions the account answered on another device", () => {
    const store = memory();
    regular(store);
    const record = loadFeedbackInvite(ready, store)!;
    expect(nextRatingQuestion(record, new Set(["recommend", "reliability"]))).toBe("workflow");
  });

  it("asks none while the account's answers are unknown, and none once all were asked", () => {
    const store = memory();
    regular(store);
    expect(nextRatingQuestion(loadFeedbackInvite(ready, store)!, null)).toBeNull();
    for (const id of ["recommend", "reliability", "workflow", "missing"] as const) {
      recordFeedbackInviteShown(ready, store, id);
    }
    expect(nextRatingQuestion(loadFeedbackInvite(ready, store)!, new Set())).toBeNull();
  });

  it("still respects Don't ask again and two dismissals", () => {
    const store = memory();
    regular(store);
    recordFeedbackOptOut(ready, store);
    expect(eligible(store, ready + 500 * DAY)).toBe(false);
  });
});
