import { afterEach, describe, expect, it, vi } from "vitest";
import { makeGreenPoint, makeRedPoint } from "../types";
import type { SavedProject } from "./persistence";

type OpenRequest = {
  result: unknown;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
  onupgradeneeded: (() => void) | null;
};

type Req = { result: unknown; onsuccess: (() => void) | null; onerror: unknown };

function fakeDb(data: Map<string, unknown>, puts: string[]) {
  return {
    objectStoreNames: { contains: () => true },
    close: vi.fn(),
    onclose: null as unknown,
    onversionchange: null as unknown,
    transaction: () => {
      const tx: Record<string, unknown> = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
      };
      let queued = 0;
      const enqueue = (work: () => void) => {
        queued += 1;
        queueMicrotask(() => {
          work();
          queued -= 1;
          if (queued === 0) {
            queueMicrotask(() => (tx.oncomplete as (() => void) | null)?.());
          }
        });
      };
      tx.objectStore = () => ({
        get: (key: string) => {
          const req: Req = { result: undefined, onsuccess: null, onerror: null };
          enqueue(() => {
            req.result = data.get(key);
            req.onsuccess?.();
          });
          return req;
        },
        getAllKeys: () => {
          const req: Req = { result: [], onsuccess: null, onerror: null };
          enqueue(() => {
            req.result = [...data.keys()];
            req.onsuccess?.();
          });
          return req;
        },
        put: (value: unknown, key: string) => {
          puts.push(key);
          enqueue(() => data.set(key, value));
        },
        delete: (key: string) => enqueue(() => data.delete(key)),
      });
      return tx;
    },
  };
}

function installIdb(handle: (req: OpenRequest) => void) {
  const open = vi.fn(() => {
    const req: OpenRequest = {
      result: null,
      error: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
      onupgradeneeded: null,
    };
    queueMicrotask(() => handle(req));
    return req;
  });
  (globalThis as unknown as { indexedDB: unknown }).indexedDB = { open };
  return open;
}

function installStore(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const puts: string[] = [];
  const db = fakeDb(data, puts);
  const open = installIdb((req) => {
    req.result = db;
    req.onsuccess?.();
  });
  return { data, puts, open };
}

async function freshPersistence() {
  vi.resetModules();
  return import("./persistence");
}

const bytes = (n: number) => new Blob([new Uint8Array(n)]);

function project(overrides: Partial<SavedProject> = {}): SavedProject {
  return {
    version: 2,
    savedAt: 1,
    meta: { title: "t", artist: "a", creator: "c" },
    timingPoints: [],
    difficulties: [{ id: "d1" }],
    activeId: "d1",
    view: {},
    appSettings: {},
    bgScope: "difficulty",
    ...overrides,
  } as unknown as SavedProject;
}

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
});

describe("openDb", () => {
  it("rejects instead of hanging when the open is blocked", async () => {
    installIdb((req) => req.onblocked?.());
    const { loadProject } = await freshPersistence();
    await expect(loadProject()).rejects.toThrow(/blocked/i);
  });

  it("rejects instead of hanging when the open never settles", async () => {
    vi.useFakeTimers();
    installIdb(() => {});
    const { loadProject } = await freshPersistence();
    const pending = loadProject();
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });

  it("surfaces an open error rather than resolving empty", async () => {
    installIdb((req) => {
      req.error = Object.assign(new Error("nope"), { name: "UnknownError" });
      req.onerror?.();
    });
    const { loadProject } = await freshPersistence();
    await expect(loadProject()).rejects.toThrow(/nope/);
  });

  it("reuses one connection across operations", async () => {
    const { open } = installStore();
    const { loadProject } = await freshPersistence();
    await loadProject();
    await loadProject();
    await loadProject();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("reopens after a failed open instead of caching the failure", async () => {
    let firstCall = true;
    const data = new Map<string, unknown>();
    const db = fakeDb(data, []);
    const open = installIdb((req) => {
      if (firstCall) {
        firstCall = false;
        req.onblocked?.();
        return;
      }
      req.result = db;
      req.onsuccess?.();
    });
    const { loadProject } = await freshPersistence();
    await expect(loadProject()).rejects.toThrow(/blocked/i);
    await expect(loadProject()).resolves.toBeNull();
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe("project media records", () => {
  it("keeps media out of the chart record", async () => {
    const { data } = installStore();
    const { saveProject } = await freshPersistence();
    const audio = bytes(64);

    await saveProject(project({ audioFiles: [{ name: "a.mp3", blob: audio }] }));

    const chart = data.get("current") as Record<string, unknown>;
    const media = data.get("media:current") as Record<string, unknown>;
    expect(chart.audioFiles).toBeUndefined();
    expect(chart.meta).toEqual({ title: "t", artist: "a", creator: "c" });
    expect(media.audioFiles).toEqual([{ name: "a.mp3", blob: audio }]);
  });

  it("rewrites only the chart record when media is unchanged", async () => {
    const { puts } = installStore();
    const { saveProject } = await freshPersistence();
    const files = [{ name: "a.mp3", blob: bytes(64) }];

    await saveProject(project({ audioFiles: files }));
    await saveProject(project({ audioFiles: files, savedAt: 2 }));
    await saveProject(project({ audioFiles: files, savedAt: 3 }));

    expect(puts.filter((k) => k === "current")).toHaveLength(3);
    expect(puts.filter((k) => k === "media:current")).toHaveLength(1);
  });

  it("rewrites media when a file changes", async () => {
    const { puts } = installStore();
    const { saveProject } = await freshPersistence();

    await saveProject(project({ audioFiles: [{ name: "a.mp3", blob: bytes(64) }] }));
    await saveProject(project({ audioFiles: [{ name: "a.mp3", blob: bytes(99) }] }));

    expect(puts.filter((k) => k === "media:current")).toHaveLength(2);
  });

  it("round-trips media through save and load", async () => {
    installStore();
    const { saveProject, loadProject } = await freshPersistence();
    const audio = bytes(64);
    const bg = bytes(8);

    await saveProject(
      project({
        audioFiles: [{ name: "a.mp3", blob: audio }],
        backgroundFiles: [{ name: "bg.png", blob: bg }],
      }),
    );
    const loaded = await loadProject();

    expect(loaded?.audioFiles).toEqual([{ name: "a.mp3", blob: audio }]);
    expect(loaded?.backgroundFiles).toEqual([{ name: "bg.png", blob: bg }]);
  });

  it("does not rewrite media on the first save after a reload", async () => {
    const store = installStore();
    const first = await freshPersistence();
    const files = [{ name: "a.mp3", blob: bytes(64) }];
    await first.saveProject(project({ audioFiles: files }));

    store.puts.length = 0;
    const reloaded = await freshPersistence();
    const loaded = await reloaded.loadProject();
    await reloaded.saveProject({ ...loaded!, savedAt: 9 });

    expect(store.puts).toEqual(["current"]);
  });

  it("still loads legacy records that inline their media", async () => {
    const audio = bytes(32);
    installStore({
      current: {
        ...project({ audioFiles: [{ name: "old.mp3", blob: audio }] }),
        version: 1,
      },
    });
    const { loadProject } = await freshPersistence();

    const loaded = await loadProject();
    expect(loaded?.version).toBe(1);
    expect(loaded?.audioFiles).toEqual([{ name: "old.mp3", blob: audio }]);
  });

  it("migrates a legacy record to split form on the next save", async () => {
    const { data } = installStore({
      current: {
        ...project({ audioFiles: [{ name: "old.mp3", blob: bytes(32) }] }),
        version: 1,
      },
    });
    const { loadProject, saveProject } = await freshPersistence();

    const loaded = await loadProject();
    await saveProject(loaded!);

    const chart = data.get("current") as Record<string, unknown>;
    expect(chart.version).toBe(2);
    expect(chart.audioFiles).toBeUndefined();
    expect(data.has("media:current")).toBe(true);
  });

  it("lists projects with a background pulled from the media record", async () => {
    installStore();
    const { saveProject, listLocalProjects } = await freshPersistence();
    const bg = bytes(8);

    await saveProject(
      project({ backgroundFiles: [{ name: "bg.png", blob: bg }] }),
      "abc",
    );
    const rows = await listLocalProjects();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("abc");
    expect(rows[0].backgroundBlob).toBe(bg);
  });

  it("clears both records for a project", async () => {
    const { data } = installStore();
    const { saveProject, clearProject } = await freshPersistence();

    await saveProject(project({ audioFiles: [{ name: "a.mp3", blob: bytes(4) }] }));
    expect(data.has("media:current")).toBe(true);

    await clearProject();
    expect(data.has("current")).toBe(false);
    expect(data.has("media:current")).toBe(false);
  });

  it("exposes the active difficulty's beat and kiai sections as a menu track", async () => {
    installStore();
    const { saveProject, listLocalTracks } = await freshPersistence();

    await saveProject(
      project({
        audioFiles: [{ name: "a.mp3", blob: bytes(16) }],
        activeId: "d2",
        difficulties: [
          { id: "d1", timingPoints: [makeRedPoint(0, 100)] },
          {
            id: "d2",
            timingPoints: [
              makeRedPoint(120, 180),
              makeGreenPoint(4000, 1, { kiai: true }),
              makeGreenPoint(9000, 1, { kiai: false }),
            ],
          },
        ],
      } as Partial<SavedProject>),
      "abc",
    );
    const rows = await listLocalTracks();

    expect(rows).toHaveLength(1);
    expect(rows[0].bpm).toBe(180);
    expect(rows[0].beatOffsetMs).toBe(120);
    expect(rows[0].kiai).toEqual([{ start: 4000, end: 9000 }]);
  });

  it("leaves the kiai section open to the end of the song", async () => {
    installStore();
    const { saveProject, listLocalTracks } = await freshPersistence();

    await saveProject(
      project({
        audioFiles: [{ name: "a.mp3", blob: bytes(16) }],
        difficulties: [
          { id: "d1", timingPoints: [makeRedPoint(0, 120, { kiai: true })] },
        ],
      } as Partial<SavedProject>),
      "abc",
    );
    const rows = await listLocalTracks();

    expect(rows[0].kiai).toEqual([{ start: 0, end: Infinity }]);
  });

  it("rewrites media after a clear so the next save is self-contained", async () => {
    const { puts } = installStore();
    const { saveProject, clearProject } = await freshPersistence();
    const files = [{ name: "a.mp3", blob: bytes(4) }];

    await saveProject(project({ audioFiles: files }));
    await clearProject();
    puts.length = 0;
    await saveProject(project({ audioFiles: files }));

    expect(puts).toContain("media:current");
  });
});
