import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  RecoveryRecorder,
  indexedDbRecoveryBackend,
  type RecoveryChart,
  type RecoveryMedia,
} from "./recovery";
import { DEFAULT_SONG_META, makeDifficulty, makeRedPoint, type Difficulty } from "../types";

// The same recorder as recovery.test.ts, over a real IndexedDB implementation,
// so transactions, key ranges and structured cloning of blobs are exercised.

const noMedia: RecoveryMedia = {
  audioFiles: [],
  backgroundFiles: [],
  videoFiles: [],
  sampleFiles: [],
};

function diff(name: string, count: number): Difficulty {
  return {
    ...makeDifficulty(name, 7),
    notes: Array.from({ length: count }, (_, i) => ({
      id: `${name}-${i}`,
      column: i % 7,
      startTime: i * 50,
      ...(i % 5 === 0 ? { endTime: i * 50 + 200 } : {}),
    })),
  };
}

function chart(difficulties: Difficulty[]): RecoveryChart {
  return {
    meta: { ...DEFAULT_SONG_META, title: "IDB" },
    timingPoints: [makeRedPoint(0, 180)],
    difficulties,
    activeId: difficulties[0].id,
    bgScope: "mapset",
  };
}

describe("indexedDbRecoveryBackend", () => {
  it("round-trips a project, its media and its backups", async () => {
    const recorder = new RecoveryRecorder(indexedDbRecoveryBackend());
    const a = diff("A", 3000);
    const b = diff("B", 10);
    const media: RecoveryMedia = {
      ...noMedia,
      audioFiles: [{ name: "song.mp3", blob: new Blob([new Uint8Array([1, 2, 3])]) }],
    };
    await recorder.persist({ projectId: "local-1", chart: chart([a, b]), media }, 123);
    await recorder.backup({ projectId: "local-1", chart: chart([a, b]), media }, "manual");

    const loaded = await recorder.load("local-1");
    expect(loaded?.chart.difficulties.map((d) => d.notes.length)).toEqual([3000, 10]);
    expect(loaded?.chart.difficulties[0].notes[5]).toEqual(a.notes[5]);
    expect(loaded?.media?.audioFiles[0].name).toBe("song.mp3");
    expect((await recorder.recoverable()).map((h) => h.projectId)).toContain("local-1");

    const [summary] = await recorder.backups("local-1");
    expect((await recorder.loadBackup(summary.key))?.chart.difficulties).toHaveLength(2);
  });

  it("keeps projects whose ids share a prefix apart", async () => {
    const recorder = new RecoveryRecorder(indexedDbRecoveryBackend());
    await recorder.persist({ projectId: "local-2", chart: chart([diff("X", 2)]), media: noMedia }, 1);
    await recorder.persist({ projectId: "local-20", chart: chart([diff("Y", 4)]), media: noMedia }, 1);
    await recorder.forget("local-2");
    expect(await recorder.load("local-2")).toBeNull();
    expect((await recorder.load("local-20"))?.head.noteCount).toBe(4);
  });
});

describe("recovery storage from version 1", () => {
  it("moves backup charts out of their summaries", async () => {
    const name = "cascade-recovery";
    await new Promise<void>((resolve, reject) => {
      const del = indexedDB.deleteDatabase(name);
      del.onsuccess = () => resolve();
      del.onerror = () => reject(del.error);
    });
    const chartV1 = chart([diff("Old", 4)]);
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => {
        for (const store of ["heads", "diffs", "media", "backups"]) open.result.createObjectStore(store);
      };
      open.onsuccess = () => {
        const tx = open.result.transaction("backups", "readwrite");
        tx.objectStore("backups").put(
          { key: "p|1|0", projectId: "p", createdAt: 1, reason: "manual", title: "T", artist: "A", difficultyCount: 1, noteCount: 4, chart: chartV1 },
          "p|1|0",
        );
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
    const backend = indexedDbRecoveryBackend();
    const recorder = new RecoveryRecorder(backend);
    const [summary] = await recorder.backups("p");
    const migrated = await backend.get<Record<string, unknown>>("backups", "p|1|0");
    expect(migrated && "chart" in migrated).toBe(false);
    expect(await backend.keys("backupCharts")).toEqual(["p|1|0"]);
    expect(summary).toMatchObject({ key: "p|1|0", noteCount: 4 });
    expect((await recorder.loadBackup("p|1|0"))?.chart.difficulties[0].notes).toHaveLength(4);
  });
});
