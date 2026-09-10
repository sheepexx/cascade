import { afterEach, describe, expect, it, vi } from "vitest";
import { eraseLocalData, listLocalDatabases } from "./resetLocalData";

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    key: (index: number) => [...map.keys()][index] ?? null,
  } as Storage;
}

function fakeIndexedDb(names: string[] | null, deleted: string[]) {
  return {
    databases: names
      ? () => Promise.resolve(names.map((name) => ({ name })))
      : undefined,
    deleteDatabase: (name: string) => {
      const request = { onsuccess: () => {}, onerror: () => {}, onblocked: () => {} };
      queueMicrotask(() => {
        deleted.push(name);
        request.onsuccess();
      });
      return request as unknown as IDBOpenDBRequest;
    },
  };
}

describe("listLocalDatabases", () => {
  it("always includes the editor's own database", async () => {
    vi.stubGlobal("indexedDB", fakeIndexedDb([], []));
    expect(await listLocalDatabases()).toEqual(["mania-editor"]);
  });

  it("adds whatever else the browser reports, without duplicates", async () => {
    vi.stubGlobal(
      "indexedDB",
      fakeIndexedDb(["mania-editor", "keyval-store"], []),
    );
    expect(await listLocalDatabases()).toEqual(["mania-editor", "keyval-store"]);
  });

  it("falls back to the known names when databases() is missing", async () => {
    vi.stubGlobal("indexedDB", fakeIndexedDb(null, []));
    expect(await listLocalDatabases()).toEqual(["mania-editor"]);
  });
});

describe("eraseLocalData", () => {
  it("clears storage, databases, caches and service workers", async () => {
    const deleted: string[] = [];
    const local = fakeStorage({ a: "1", b: "2" });
    const session = fakeStorage({ c: "3" });
    const dropped: string[] = [];
    const unregistered = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    vi.stubGlobal("indexedDB", fakeIndexedDb(["mania-editor", "other"], deleted));
    vi.stubGlobal("caches", {
      keys: () => Promise.resolve(["assets-v1", "pages-v1"]),
      delete: (name: string) => {
        dropped.push(name);
        return Promise.resolve(true);
      },
    });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistrations: () => Promise.resolve([{ unregister: unregistered }]),
      },
    });

    const result = await eraseLocalData();

    expect(local.length).toBe(0);
    expect(session.length).toBe(0);
    expect(result.keys).toBe(3);
    expect(deleted).toEqual(["mania-editor", "other"]);
    expect(result.databases).toEqual(["mania-editor", "other"]);
    expect(dropped).toEqual(["assets-v1", "pages-v1"]);
    expect(result.caches).toEqual(["assets-v1", "pages-v1"]);
    expect(result.serviceWorkers).toBe(1);
    expect(unregistered).toHaveBeenCalledOnce();
  });

  it("survives a browser with none of the optional APIs", async () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("sessionStorage", undefined);
    vi.stubGlobal("indexedDB", fakeIndexedDb(null, []));
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("navigator", {});

    const result = await eraseLocalData();

    expect(result.keys).toBe(0);
    expect(result.caches).toEqual([]);
    expect(result.serviceWorkers).toBe(0);
    expect(result.databases).toEqual(["mania-editor"]);
  });

  it("does not throw when storage access is blocked", async () => {
    vi.stubGlobal("localStorage", {
      get length(): number {
        throw new Error("blocked");
      },
      clear: () => {},
    });
    vi.stubGlobal("sessionStorage", undefined);
    vi.stubGlobal("indexedDB", fakeIndexedDb(null, []));
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("navigator", {});

    await expect(eraseLocalData()).resolves.toMatchObject({ keys: 0 });
  });
});
