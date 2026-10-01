import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { HANDOFF_DB, HANDOFF_KEY, HANDOFF_STORE, takeHandedOffFiles } from "./fileHandoff";

function park(record: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDOFF_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HANDOFF_STORE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(HANDOFF_STORE, "readwrite");
      tx.objectStore(HANDOFF_STORE).put(record, HANDOFF_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

describe("taking handed-off files", () => {
  it("reads the parked files, then clears them so they open once", async () => {
    await park({
      at: Date.now(),
      files: [{ name: "map.osz", type: "application/zip", blob: new Blob(["zip bytes"]) }],
    });
    const files = await takeHandedOffFiles();
    expect(files.map((f) => f.name)).toEqual(["map.osz"]);
    expect(await files[0].text()).toBe("zip bytes");
    expect(await takeHandedOffFiles()).toEqual([]);
  });

  it("ignores and clears a stale handoff", async () => {
    await park({ at: Date.now() - 60 * 60_000, files: [{ name: "old.osz", type: "", blob: new Blob(["x"]) }] });
    expect(await takeHandedOffFiles()).toEqual([]);
    await park({ at: Date.now(), files: [] });
    expect(await takeHandedOffFiles()).toEqual([]);
  });
});
