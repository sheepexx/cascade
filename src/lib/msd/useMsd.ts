import { useEffect, useRef, useState } from "react";
import type { Difficulty, ManiaNote } from "../../types";
import {
  msdSupportsKeyCount,
  notesToMsdRows,
  type MsdRating,
  type SkillsetPoint,
} from "./minacalc";
import type { MsdWorkerRequest, MsdWorkerResponse } from "./msdWorker";

const DEBOUNCE_MS = 600;

type Pending = { resolve: (response: MsdWorkerResponse | null) => void };

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
        entry.resolve(event.data);
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
    pending.set(id, { resolve: (response) => resolve(response?.rating ?? null) });
    w.postMessage({ id, rows, keyCount } satisfies MsdWorkerRequest);
  });
}

/** Skillset difficulty over time for the timeline graph, or null when unrated. */
export function requestSkillsetTimeline(
  notes: ManiaNote[],
  keyCount: number,
): Promise<SkillsetPoint[] | null> {
  if (!msdSupportsKeyCount(keyCount)) return Promise.resolve(null);
  const rows = notesToMsdRows(notes, keyCount);
  if (rows.length <= 1) return Promise.resolve(null);
  const w = getWorker();
  if (!w) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, { resolve: (response) => resolve(response?.timeline ?? null) });
    w.postMessage({ id, rows, keyCount, kind: "timeline" } satisfies MsdWorkerRequest);
  });
}

/**
 * The skillset graph for one difficulty, recomputed a moment after edits stop
 * and only while the graph is switched on.
 */
export function useSkillsetTimeline(
  notes: ManiaNote[],
  keyCount: number,
  enabled: boolean,
): SkillsetPoint[] | null {
  const [timeline, setTimeline] = useState<SkillsetPoint[] | null>(null);
  useEffect(() => {
    if (!enabled) {
      setTimeline(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void requestSkillsetTimeline(notes, keyCount).then((points) => {
        if (!cancelled) setTimeline(points);
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [notes, keyCount, enabled]);
  return timeline;
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
  const timersRef = useRef(new Map<string, number>());
  const pendingRef = useRef(new Map<string, ManiaNote[]>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    const pending = pendingRef.current;
    return () => {
      mountedRef.current = false;
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
      pending.clear();
    };
  }, []);

  useEffect(() => {
    const cache = cacheRef.current;
    const timers = timersRef.current;
    const pending = pendingRef.current;
    const liveIds = new Set(difficulties.map((d) => d.id));

    for (const id of [...cache.keys()]) {
      if (!liveIds.has(id)) cache.delete(id);
    }
    for (const id of [...timers.keys()]) {
      if (!liveIds.has(id)) {
        window.clearTimeout(timers.get(id)!);
        timers.delete(id);
      }
    }
    for (const id of [...pending.keys()]) {
      if (!liveIds.has(id)) pending.delete(id);
    }

    for (const d of difficulties) {
      const id = d.id;
      const entry = cache.get(id);
      if (entry && entry.notes === d.notes && entry.keyCount === d.keyCount) {
        continue;
      }
      if (pending.get(id) === d.notes) continue;

      const existing = timers.get(id);
      if (existing) window.clearTimeout(existing);
      pending.set(id, d.notes);

      const notes = d.notes;
      const keyCount = d.keyCount;
      const timer = window.setTimeout(() => {
        timers.delete(id);
        void requestMsd(notes, keyCount).then((rating) => {
          cache.set(id, { notes, keyCount, rating });
          if (!mountedRef.current) return;
          setRatings((prev) =>
            prev[id] === rating ? prev : { ...prev, [id]: rating },
          );
        });
      }, DEBOUNCE_MS);
      timers.set(id, timer);
    }
  }, [difficulties]);

  return ratings;
}
