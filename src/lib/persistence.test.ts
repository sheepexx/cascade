import { afterEach, describe, expect, it, vi } from "vitest";

type OpenRequest = {
  result: unknown;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
  onupgradeneeded: (() => void) | null;
};

function fakeDb(records: Record<string, unknown>) {
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
      const finish = () => {
        queueMicrotask(() => (tx.oncomplete as (() => void) | null)?.());
      };
      tx.objectStore = () => ({
        get: (key: string) => {
          const req: Record<string, unknown> = {
            result: records[key],
            onsuccess: null,
            onerror: null,
          };
          queueMicrotask(() => {
            (req.onsuccess as (() => void) | null)?.();
            finish();
          });
          return req;
        },
        put: vi.fn(finish),
        delete: vi.fn(finish),
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

async function freshPersistence() {
  vi.resetModules();
  return import("./persistence");
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
    const db = fakeDb({ current: { version: 1, meta: {} } });
    const open = installIdb((req) => {
      req.result = db;
      req.onsuccess?.();
    });
    const { loadProject } = await freshPersistence();
    await loadProject();
    await loadProject();
    await loadProject();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("reopens after a failed open instead of caching the failure", async () => {
    let firstCall = true;
    const db = fakeDb({ current: { version: 1, meta: {} } });
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
    await expect(loadProject()).resolves.toEqual({ version: 1, meta: {} });
    expect(open).toHaveBeenCalledTimes(2);
  });
});
