import { describe, expect, it } from "vitest";
import {
  ACTIVITY_LIMIT,
  ACTIVITY_REPEAT_MS,
  ACTIVITY_STORAGE_KEY,
  createActivityLog,
  sanitizeActivity,
} from "./activityLog";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

function setup(start = 1_000_000) {
  let clock = start;
  let ids = 0;
  const storage = memoryStorage();
  const log = createActivityLog({
    storage,
    now: () => clock,
    makeId: () => `id${++ids}`,
  });
  return {
    log,
    storage,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("activity log", () => {
  it("keeps the newest entry first and starts unread", () => {
    const { log, advance } = setup();
    log.add({ tone: "error", title: "Save failed" });
    advance(60_000);
    log.add({ tone: "warning", title: "Export check" });
    expect(log.list().map((e) => e.title)).toEqual(["Export check", "Save failed"]);
    expect(log.list().every((e) => e.readAt === null)).toBe(true);
  });

  it("can record an entry the user has already seen", () => {
    const { log } = setup();
    log.add({ tone: "success", title: "Saved", read: true });
    expect(log.list()[0].readAt).not.toBeNull();
  });

  it("folds a quick repeat into the existing entry and makes it unread again", () => {
    const { log, advance } = setup();
    const first = log.add({ tone: "error", title: "Save failed", body: "Quota" });
    log.markRead(first);
    advance(ACTIVITY_REPEAT_MS - 1);
    const second = log.add({ tone: "error", title: "Save failed", body: "Quota" });
    expect(second).toBe(first);
    expect(log.list()).toHaveLength(1);
    expect(log.list()[0].readAt).toBeNull();
    advance(ACTIVITY_REPEAT_MS);
    log.add({ tone: "error", title: "Save failed", body: "Quota" });
    expect(log.list()).toHaveLength(2);
  });

  it("marks entries read, unread and all read", () => {
    const { log } = setup();
    const a = log.add({ tone: "info", title: "A" });
    log.add({ tone: "info", title: "B" });
    log.markRead(a);
    expect(log.list().find((e) => e.id === a)?.readAt).not.toBeNull();
    log.markUnread(a);
    expect(log.list().find((e) => e.id === a)?.readAt).toBeNull();
    log.markAllRead();
    expect(log.list().every((e) => e.readAt !== null)).toBe(true);
  });

  it("dismisses entries and keeps at most the limit", () => {
    const { log, advance } = setup();
    for (let i = 0; i < ACTIVITY_LIMIT + 5; i++) {
      log.add({ tone: "info", title: `n${i}` });
      advance(1);
    }
    expect(log.list()).toHaveLength(ACTIVITY_LIMIT);
    expect(log.list()[0].title).toBe(`n${ACTIVITY_LIMIT + 4}`);
    const id = log.list()[0].id;
    log.dismiss(id);
    expect(log.list().some((e) => e.id === id)).toBe(false);
  });

  it("survives a reload through storage", () => {
    const { log, storage } = setup();
    log.add({ tone: "warning", title: "Export check", details: "path: message" });
    const reloaded = createActivityLog({ storage });
    expect(reloaded.list()).toEqual(log.list());
    expect(storage.data.has(ACTIVITY_STORAGE_KEY)).toBe(true);
  });

  it("notifies subscribers on every change and stops after unsubscribing", () => {
    const { log } = setup();
    let calls = 0;
    const stop = log.subscribe(() => calls++);
    const id = log.add({ tone: "info", title: "A" });
    log.markRead(id);
    log.markRead(id);
    stop();
    log.dismiss(id);
    expect(calls).toBe(3);
  });

  it("keeps working when storage throws", () => {
    const log = createActivityLog({
      storage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("full");
        },
      },
    });
    log.add({ tone: "error", title: "Still recorded" });
    expect(log.list()).toHaveLength(1);
  });
});

describe("sanitizeActivity", () => {
  it("drops malformed entries and clips long text", () => {
    const long = "x".repeat(1000);
    const out = sanitizeActivity([
      { id: "a", tone: "error", title: long, createdAt: 1, readAt: null },
      { id: "b", tone: "shout", title: "bad tone", createdAt: 1 },
      { id: 3, tone: "info", title: "bad id", createdAt: 1 },
      { id: "c", tone: "info", title: "", createdAt: 1 },
      null,
      { id: "d", tone: "info", title: "ok", createdAt: 2, readAt: "yes" },
    ]);
    expect(out.map((e) => e.id)).toEqual(["a", "d"]);
    expect(out[0].title.length).toBeLessThanOrEqual(300);
    expect(out[1].readAt).toBeNull();
    expect(sanitizeActivity("nope")).toEqual([]);
  });
});
