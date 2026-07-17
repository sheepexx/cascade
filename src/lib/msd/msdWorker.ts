import wasmUrl from "./minacalc.wasm?url";
import { loadMinacalc, type Minacalc, type MsdRow } from "./minacalc";

export type MsdWorkerRequest = {
  id: number;
  rows: MsdRow[];
  keyCount: number;
};

export type MsdWorkerResponse = {
  id: number;
  rating: import("./minacalc").MsdRating | null;
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
  const { id, rows, keyCount } = event.data;
  void getCalc()
    .then((calc) => {
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
