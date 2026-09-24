import { makeWasiStubs } from "./wasi";

export const MSD_KEYCOUNTS = [4, 6, 7] as const;

export const MSD_SKILLSET_KEYS = [
  "overall",
  "stream",
  "jumpstream",
  "handstream",
  "stamina",
  "jackspeed",
  "chordjack",
  "technical",
] as const;

export type MsdRating = Record<(typeof MSD_SKILLSET_KEYS)[number], number>;

export type MsdRow = { mask: number; timeSec: number };

type MinacalcExports = {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  msd_version: () => number;
  msd_create: () => number;
  msd_destroy: (calc: number) => void;
  msd_compute: (
    calc: number,
    masksPtr: number,
    timesPtr: number,
    numRows: number,
    keycount: number,
    musicRate: number,
    outPtr: number,
  ) => number;
  malloc: (size: number) => number;
  free: (ptr: number) => void;
};

export type Minacalc = {
  version: number;
  compute: (rows: MsdRow[], keyCount: number, rate?: number) => MsdRating;
};

export function msdSupportsKeyCount(keyCount: number): boolean {
  return (MSD_KEYCOUNTS as readonly number[]).includes(keyCount);
}

export async function loadMinacalc(
  wasmBytes: BufferSource,
): Promise<Minacalc> {
  let memory: WebAssembly.Memory | null = null;
  const { instance } = await WebAssembly.instantiate(wasmBytes, {
    wasi_snapshot_preview1: makeWasiStubs(() => memory!),
  });
  const ex = instance.exports as unknown as MinacalcExports;
  memory = ex.memory;
  ex._initialize?.();

  const calc = ex.msd_create();

  const compute = (
    rows: MsdRow[],
    keyCount: number,
    rate = 1,
  ): MsdRating => {
    const n = rows.length;
    const masksPtr = ex.malloc(Math.max(4, n * 4));
    const timesPtr = ex.malloc(Math.max(4, n * 4));
    const outPtr = ex.malloc(8 * 4);
    try {
      const masks = new Uint32Array(ex.memory.buffer, masksPtr, n);
      const times = new Float32Array(ex.memory.buffer, timesPtr, n);
      for (let i = 0; i < n; i++) {
        masks[i] = rows[i].mask;
        times[i] = rows[i].timeSec;
      }
      ex.msd_compute(calc, masksPtr, timesPtr, n, keyCount, rate, outPtr);
      const out = new Float32Array(ex.memory.buffer, outPtr, 8);
      const rating = {} as MsdRating;
      MSD_SKILLSET_KEYS.forEach((key, i) => {
        const v = out[i];
        rating[key] = Number.isFinite(v) ? Math.max(0, v) : 0;
      });
      return rating;
    } finally {
      ex.free(masksPtr);
      ex.free(timesPtr);
      ex.free(outPtr);
    }
  };

  return { version: ex.msd_version(), compute };
}

export function notesToMsdRows(
  notes: { column: number; startTime: number }[],
  keyCount: number,
): MsdRow[] {
  const byTime = new Map<number, number>();
  for (const note of notes) {
    if (note.column < 0 || note.column >= keyCount) continue;
    const ms = Math.round(note.startTime);
    byTime.set(ms, (byTime.get(ms) ?? 0) | (1 << note.column));
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ms, mask]) => ({ mask, timeSec: ms / 1000 }));
}

/** The skillsets the timeline graph shows; overall and stamina need a whole song. */
export const SKILLSET_GRAPH_KEYS = [
  "stream",
  "jumpstream",
  "handstream",
  "jackspeed",
  "chordjack",
  "technical",
] as const;

export type SkillsetGraphKey = (typeof SKILLSET_GRAPH_KEYS)[number];

export type SkillsetWindow = { startSec: number; endSec: number; rows: MsdRow[] };

export type SkillsetPoint = {
  startSec: number;
  endSec: number;
  values: Record<SkillsetGraphKey, number>;
};

/**
 * Overlapping slices of a chart for rating each moment on its own. Every
 * window is `windowSec` long and starts `stepSec` after the last; its rows are
 * shifted to start at zero so MinaCalc rates it like a short chart. A window
 * is reported over the middle `stepSec` of its span, so neighbours tile the
 * song without overlapping on the graph.
 */
export function skillsetWindows(
  rows: MsdRow[],
  windowSec = 6,
  stepSec = 1.5,
  minRows = 4,
): SkillsetWindow[] {
  if (rows.length < minRows) return [];
  const first = rows[0].timeSec;
  const last = rows[rows.length - 1].timeSec;
  const windows: SkillsetWindow[] = [];
  let from = 0;
  for (let start = first - (windowSec - stepSec) / 2; start <= last; start += stepSec) {
    const end = start + windowSec;
    while (from < rows.length && rows[from].timeSec < start) from++;
    let to = from;
    while (to < rows.length && rows[to].timeSec < end) to++;
    const middle = start + (windowSec - stepSec) / 2;
    if (to - from >= minRows) {
      windows.push({
        startSec: Math.max(0, middle),
        endSec: middle + stepSec,
        rows: rows.slice(from, to).map((row) => ({
          mask: row.mask,
          timeSec: row.timeSec - start,
        })),
      });
    }
  }
  return windows;
}
