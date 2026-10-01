import wasmUrl from "./minacalc.wasm?url";
import {
  SKILLSET_GRAPH_KEYS,
  loadMinacalc,
  skillsetWindows,
  unpackMsdRows,
  type Minacalc,
  type PackedMsdRows,
  type SkillsetPoint,
} from "./minacalc";

export type MsdWorkerRequest = {
  id: number;
  /** Transferred, not copied: a 100k-note map's rows cost a copy a long task. */
  rows: PackedMsdRows;
  keyCount: number;
  /** "timeline" rates overlapping slices for the skillset graph. */
  kind?: "rating" | "timeline";
};

export type MsdWorkerResponse = {
  id: number;
  rating: import("./minacalc").MsdRating | null;
  timeline?: SkillsetPoint[];
  error?: string;
};

let calcPromise: Promise<Minacalc> | null = null;

function getCalc(): Promise<Minacalc> {
  if (!calcPromise) {
    calcPromise = fetch(wasmUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`wasm fetch failed (${res.status})`);
        return res.arrayBuffer();
      })
      .then(loadMinacalc);
  }
  return calcPromise;
}

self.onmessage = (event: MessageEvent<MsdWorkerRequest>) => {
  const { id, keyCount, kind } = event.data;
  const rows = unpackMsdRows(event.data.rows);
  void getCalc()
    .then((calc) => {
      if (kind === "timeline") {
        const timeline = skillsetWindows(rows).map((window) => {
          const rating = calc.compute(window.rows, keyCount);
          const values = {} as SkillsetPoint["values"];
          for (const key of SKILLSET_GRAPH_KEYS) values[key] = rating[key];
          return { startSec: window.startSec, endSec: window.endSec, values };
        });
        self.postMessage({ id, rating: null, timeline } satisfies MsdWorkerResponse);
        return;
      }
      const rating = calc.compute(rows, keyCount);
      self.postMessage({ id, rating } satisfies MsdWorkerResponse);
    })
    .catch((err: unknown) => {
      calcPromise = null;
      self.postMessage({
        id,
        rating: null,
        error: err instanceof Error ? err.message : "msd computation failed",
      } satisfies MsdWorkerResponse);
    });
};
