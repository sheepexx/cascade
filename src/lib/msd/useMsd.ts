import { useEffect, useRef, useState } from "react";
import type { Difficulty, ManiaNote } from "../../types";
import {
  msdSupportsKeyCount,
  notesToMsdRows,
  type MsdRating,
} from "./minacalc";
import type { MsdWorkerRequest, MsdWorkerResponse } from "./msdWorker";

const DEBOUNCE_MS = 600;

type Pending = { resolve: (rating: MsdRating | null) => void };

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./msdWorker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<MsdWorkerResponse>) => {
        const entry = pending.get(event.data.id);
        if (!entry) return;
        pending.delete(event.data.id);
        entry.resolve(event.data.rating);
      };
      worker.onerror = () => {
        workerFailed = true;
        for (const entry of pending.values()) entry.resolve(null);
        pending.clear();
        worker?.terminate();
        worker = null;
      };
    } catch {
      workerFailed = true;
      return null;
    }
  }
  return worker;
}

export function requestMsd(
  notes: ManiaNote[],
  keyCount: number,
): Promise<MsdRating | null> {
  if (!msdSupportsKeyCount(keyCount)) return Promise.resolve(null);
  const rows = notesToMsdRows(notes, keyCount);
  if (rows.length <= 1) return Promise.resolve(null);
  const w = getWorker();
  if (!w) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, { resolve });
    w.postMessage({ id, rows, keyCount } satisfies MsdWorkerRequest);
  });
}

type CacheEntry = {
  notes: ManiaNote[];
  keyCount: number;
  rating: MsdRating | null;
};

export function useMsdRatings(
  difficulties: Difficulty[],
): Record<string, MsdRating | null> {
  const [ratings, setRatings] = useState<Record<string, MsdRating | null>>(
    {},
  );
  const cacheRef = useRef(new Map<string, CacheEntry>());

  useEffect(() => {
    const cache = cacheRef.current;
    const liveIds = new Set(difficulties.map((d) => d.id));
    for (const id of cache.keys()) {
      if (!liveIds.has(id)) cache.delete(id);
    }

    const stale = difficulties.filter((d) => {
      const entry = cache.get(d.id);
      return (
        !entry || entry.notes !== d.notes || entry.keyCount !== d.keyCount
      );
    });
    if (stale.length === 0) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      for (const d of stale) {
        const notes = d.notes;
        const keyCount = d.keyCount;
        void requestMsd(notes, keyCount).then((rating) => {
          if (cancelled) return;
          cache.set(d.id, { notes, keyCount, rating });
          setRatings((prev) =>
            prev[d.id] === rating ? prev : { ...prev, [d.id]: rating },
          );
        });
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [difficulties]);

  return ratings;
}
