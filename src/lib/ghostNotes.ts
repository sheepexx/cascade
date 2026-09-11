import type { ManiaNote, TimingPoint } from "../types";
import type { AudioOnset } from "./bpmDetect";
import { activeTimingAt, snapIntervalAt, snapTime } from "./timing";
import { repeatPeriod, rollLengthAt, ROLL_MIN_STEPS, toRows } from "./patternRows";
import modelData from "./mappingModel.json";

export type GhostNote = ManiaNote & { strength: number; sourceTime: number };

type KeyModel = {
  move: number[][][];
  column: number[];
  overlap: number[];
  chord: number[][][];
  shapes: Record<string, [number, number][]>;
};

const model = modelData as unknown as { npsEdges: number[]; intervalEdges: number[]; keys: Record<string, KeyModel> };

const ROW_GAP_MS = 25;
const HOLD_GAP_MS = 30;
const ACCENT_WINDOW_MS = 2000;
const LN_MIN_BEATS = 0.5;
const LN_MAX_BEATS = 8;
const LN_RELEASE_BEATS = 0.25;
const ROWS_TO_NOTES = 1.25;
const REPEAT_PENALTY = 0.2;
const ROLL_PENALTY = 0.3;
const FAST_JACK_PENALTY = 0.005;
const LN_MAX_CHORD = 2;

const fallbacks = new Map<number, KeyModel>();
const combos = new Map<string, [number, number][]>();

function keyModel(keyCount: number): KeyModel {
  const known = model.keys[keyCount];
  if (known) return known;
  let fallback = fallbacks.get(keyCount);
  if (!fallback) {
    const classes = model.intervalEdges.length + 1;
    const chord = [0.85, 0.12, 0.03, 0, 0].slice(0, Math.min(keyCount, 5));
    fallback = {
      move: Array.from({ length: classes }, (_, ic) => Array.from({ length: keyCount }, (_, p) =>
        Array.from({ length: keyCount }, (_, c) => (c === p ? (ic === 0 ? 0.02 : 0.2) : 1)))),
      column: new Array<number>(keyCount).fill(1),
      overlap: [0.04, 0.25, 0.3, 0.3],
      chord: model.npsEdges.map(() => [chord, chord, chord]),
      shapes: {},
    };
    fallbacks.set(keyCount, fallback);
  }
  return fallback;
}

const popcount = (mask: number) => { let n = 0; for (let m = mask; m; m &= m - 1) n++; return n; };
const columnsOf = (mask: number) => { const out: number[] = []; for (let c = 0; mask >> c; c++) if (mask >> c & 1) out.push(c); return out; };

function shapesFor(km: KeyModel, keyCount: number, size: number): [number, number][] {
  if (size === 1) return km.column.map((w, c) => [1 << c, w]);
  const known = km.shapes[size];
  if (known?.length) return known;
  const key = `${keyCount}:${size}`;
  let list = combos.get(key);
  if (!list) {
    list = [];
    for (let m = 1; m < 1 << keyCount; m++) if (popcount(m) === size) list.push([m, 1]);
    combos.set(key, list);
  }
  return list;
}

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const classOf = (edges: number[], value: number) => { let i = 0; while (i < edges.length && value > edges[i]) i++; return i; };
const bandOf = (nps: number) => { for (let i = model.npsEdges.length - 1; i >= 0; i--) if (nps >= model.npsEdges[i]) return i; return 0; };

function pickMask(options: {
  km: KeyModel; keyCount: number; size: number; free: number; prev: number; ic: number;
  history: number[]; rand: () => number;
}): number {
  const { km, keyCount, size, free, prev, ic, history, rand } = options;
  const candidates = shapesFor(km, keyCount, size).filter(([m]) => (m & ~free) === 0);
  if (!candidates.length) return 0;
  if (ic === 0 && prev && candidates.every(([m]) => m & prev)) return 0;
  const single = size === 1 && popcount(prev) === 1;
  let hitMass = 0, missMass = 0;
  for (const [m, w] of candidates) if (m & prev) hitMass += w; else missMass += w;
  const overlap = km.overlap[ic] ?? 0.2;
  const weights = candidates.map(([m, w]) => {
    let weight = single
      ? km.move[ic][Math.log2(prev)][Math.log2(m)]
      : !prev ? w
      : m & prev ? (hitMass > 0 ? (w / hitMass) * overlap : 0)
      : (missMass > 0 ? (w / missMass) * (1 - overlap) : 0);
    if (ic === 0 && m & prev) weight *= FAST_JACK_PENALTY;
    history.push(m);
    const last = history.length - 1;
    if (repeatPeriod(history, last)) weight *= REPEAT_PENALTY;
    if (rollLengthAt(history, last, keyCount) >= ROLL_MIN_STEPS - 2) weight *= ROLL_PENALTY;
    history.pop();
    return weight;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return candidates[Math.floor(rand() * candidates.length)][0];
  let r = rand() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i][0];
  }
  return candidates[candidates.length - 1][0];
}

export function suggestGhostNotes(onsets: AudioOnset[], options: {
  notes: ManiaNote[]; timingPoints: TimingPoint[]; snapDivisor: number;
  timeScale: number; keyCount: number; threshold: number; start: number; end: number;
}): GhostNote[] {
  const { notes, timingPoints, snapDivisor, timeScale, keyCount, threshold, start, end } = options;
  if (keyCount < 1 || !timingPoints.some((p) => p.uninherited)) return [];
  const km = keyModel(keyCount);
  const pool = onsets
    .map((onset) => ({ onset, time: Math.round(snapTime(onset.timeMs / timeScale, timingPoints, snapDivisor)) }))
    .filter(({ onset, time }) => onset.strength >= threshold && time >= start && time <= end)
    .sort((a, b) => a.time - b.time || b.onset.strength - a.onset.strength)
    .filter((c, i, list) => i === 0 || c.time !== list[i - 1].time);

  let lo = 0, hi = 0;
  const accents = pool.map((c) => {
    while (pool[lo].time < c.time - ACCENT_WINDOW_MS) lo++;
    while (hi < pool.length && pool[hi].time <= c.time + ACCENT_WINDOW_MS) hi++;
    let lower = 0;
    for (let j = lo; j < hi; j++) if (pool[j].onset.strength < c.onset.strength) lower++;
    return hi - lo > 1 ? lower / (hi - lo - 1) : 0;
  });

  const existing = toRows(notes, keyCount);
  let probe = 0;
  const open = pool.map(({ time }) => {
    while (probe < existing.length && existing[probe].time < time - ROW_GAP_MS) probe++;
    return !(probe < existing.length && Math.abs(existing[probe].time - time) <= ROW_GAP_MS);
  });
  const inRange = existing.filter((r) => r.time >= start && r.time <= end);
  const times = [...inRange.map((r) => r.time), ...pool.filter((_, i) => open[i]).map((c) => c.time)];
  const span = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;
  const band = Math.min(model.npsEdges.length - 1, bandOf(span > 0 ? (times.length * ROWS_TO_NOTES * 1000) / span : 0));

  const lanes = Array.from({ length: keyCount }, (_, c) => notes.filter((n) => n.column === c).sort((a, b) => a.startTime - b.startTime));
  const cursors = new Array<number>(keyCount).fill(0);
  const busyUntil = new Array<number>(keyCount).fill(-Infinity);
  const history: number[] = [];
  const result: GhostNote[] = [];
  let prevTime = -Infinity;
  let next = 0;
  for (let i = 0; i < pool.length; i++) {
    const { onset, time } = pool[i];
    while (next < existing.length && existing[next].time < time - ROW_GAP_MS) {
      history.push(existing[next].mask);
      prevTime = existing[next].time;
      next++;
    }
    const placed = !open[i] && next < existing.length && Math.abs(existing[next].time - time) <= ROW_GAP_MS ? existing[next] : null;
    if (!open[i] && !placed) continue;
    let free = 0;
    const upcoming: (ManiaNote | undefined)[] = [];
    for (let c = 0; c < keyCount; c++) {
      const lane = lanes[c];
      while (cursors[c] < lane.length && (lane[cursors[c]].endTime ?? lane[cursors[c]].startTime) < time - HOLD_GAP_MS) cursors[c]++;
      let k = cursors[c];
      while (k < lane.length && placed?.notes.includes(lane[k])) k++;
      upcoming[c] = lane[k];
      if ((!lane[k] || lane[k].startTime > time + HOLD_GAP_MS) && busyUntil[c] <= time) free |= 1 << c;
    }
    if (!free) continue;

    const tp = activeTimingAt(time, timingPoints);
    const beat = 60000 / tp.bpm;
    const prev = history[history.length - 1] ?? 0;
    const ic = prev ? classOf(model.intervalEdges, (time - prevTime) / beat) : model.intervalEdges.length;
    const phase = ((((time - tp.time) / beat) % 1) + 1) % 1;
    const position = phase < 0.03 || phase > 0.97 ? 0 : Math.abs(phase - 0.5) < 0.03 ? 1 : 2;
    const dist = km.chord[band]?.[position] ?? [1];
    let size = 1, tail = 0;
    for (let s = dist.length; s >= 2; s--) {
      tail += dist[s - 1];
      if (accents[i] > 1 - tail) { size = s; break; }
    }
    const sustain = (onset.sustainMs ?? 0) / timeScale;
    const holds = sustain >= LN_MIN_BEATS * beat;
    size = Math.min(size, popcount(free), holds ? LN_MAX_CHORD : size);

    const rand = random(Math.imul(time, 2654435761) ^ Math.imul(prev + 1, 40503));
    let mask = 0;
    for (let s = size; s >= 1 && !mask; s--) mask = pickMask({ km, keyCount, size: s, free, prev, ic, history, rand });
    if (!mask || (placed && placed.mask & ~mask)) continue;
    const columns = columnsOf(mask);

    let endTime: number | undefined;
    if (holds) {
      let limit = Math.min(end, time + Math.min(sustain, LN_MAX_BEATS * beat));
      for (const c of columns) {
        const after = upcoming[c];
        if (after) limit = Math.min(limit, after.startTime - LN_RELEASE_BEATS * beat);
      }
      let tailTime = snapTime(limit, timingPoints, snapDivisor);
      if (tailTime > limit) tailTime -= snapIntervalAt(limit, timingPoints, snapDivisor);
      if (tailTime - time >= LN_MIN_BEATS * beat) endTime = Math.round(tailTime);
    }
    for (const c of columns) {
      busyUntil[c] = endTime !== undefined ? endTime + LN_RELEASE_BEATS * beat : time + 1;
      if (placed && (placed.mask >> c) & 1) continue;
      result.push({
        id: `ghost_${time}_${c}`, column: c, startTime: time,
        ...(endTime !== undefined ? { endTime } : {}),
        sourceTime: onset.timeMs, strength: onset.strength,
      });
    }
    history.push(mask);
    prevTime = time;
    if (placed) next++;
  }
  return result;
}
