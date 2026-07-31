import type { HumanizeSettings, ManiaNote } from "../types";
import type { JudgementWindows } from "./playtestJudgements";
import {
  loadJitterMs,
  missChanceFromLoad,
  type SkillProfile,
} from "./playerSkill";

export type UnplayableReason = "stacked" | "inside-ln";

export type AutoplayAction = "press" | "release";

export type AutoplayEvent = {
  atMs: number;
  column: number;
  action: AutoplayAction;
  noteId: string;
};

export type AutoplayPlan = {
  events: AutoplayEvent[];
  unplayable: Map<string, UnplayableReason>;
  plannedMisses: Set<string>;
};

export const EMPTY_PLAN: AutoplayPlan = {
  events: [],
  unplayable: new Map(),
  plannedMisses: new Set(),
};

const STACK_EPSILON_MS = 1;

export const CHORD_GROUP_MS = 10;

export const CHORD_VARIANCE_SHARE = 0.41;
export const HAND_VARIANCE_SHARE = 0.28;
export const NOTE_VARIANCE_SHARE = 0.31;

export const DRIFT_SHARE = 0.35;
export const DRIFT_TAU_MS = 4000;

export const SLIP_CEILING = 0.35;
export const SLIP_LOAD_SCALE = 1.1;
export const SLIP_LATE_SIGMAS = 4.2;
export const SLIP_EARLY_SIGMAS = 3;
export const SLIP_EARLY_FRACTION = 0.23;

const MISS_ECHO_MS = 200;
const MISS_ECHO_GAIN = 6;

export function createRng(seed: number): () => number {
  let a = (seed | 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-3, Math.min(3, z));
}

function exponential(rng: () => number): number {
  return -Math.log(Math.max(1e-12, 1 - rng()));
}

function orderNotes(notes: ManiaNote[]): ManiaNote[] {
  return [...notes].sort(
    (a, b) => a.startTime - b.startTime || a.column - b.column ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function handOf(column: number, keyCount: number): number {
  if (keyCount <= 1) return 0;
  return column < Math.floor(keyCount / 2) ? 0 : 1;
}

export function findUnplayableNotes(
  notes: ManiaNote[],
): Map<string, UnplayableReason> {
  const unplayable = new Map<string, UnplayableReason>();
  const byColumn = new Map<number, ManiaNote[]>();
  for (const n of notes) {
    const list = byColumn.get(n.column);
    if (list) list.push(n);
    else byColumn.set(n.column, [n]);
  }

  for (const list of byColumn.values()) {
    const ordered = orderNotes(list);
    for (let i = 0; i < ordered.length; i++) {
      const note = ordered[i];
      if (unplayable.has(note.id)) continue;

      for (let j = i + 1; j < ordered.length; j++) {
        const other = ordered[j];
        if (other.startTime - note.startTime > STACK_EPSILON_MS) break;
        if (!unplayable.has(other.id)) unplayable.set(other.id, "stacked");
      }

      const end = note.endTime;
      if (end === undefined || end <= note.startTime) continue;
      for (let j = i + 1; j < ordered.length; j++) {
        const other = ordered[j];
        if (other.startTime > end) break;
        if (other.startTime <= note.startTime) continue;
        if (!unplayable.has(other.id)) unplayable.set(other.id, "inside-ln");
      }
    }
  }

  return unplayable;
}

export function slipChanceForLoad(base: number, load: number): number {
  const floor = Math.max(0, Math.min(1, base));
  if (load <= 0) return floor;
  const room = Math.max(0, SLIP_CEILING - floor);
  return floor + room * (1 - Math.exp(-load / SLIP_LOAD_SCALE));
}

function slipError(
  rng: () => number,
  sigma: number,
  chance: number,
): number {
  if (sigma <= 0 || chance <= 0 || rng() >= chance) return 0;
  return rng() < SLIP_EARLY_FRACTION
    ? -sigma * SLIP_EARLY_SIGMAS * exponential(rng)
    : sigma * SLIP_LATE_SIGMAS * exponential(rng);
}

function makeDrift(rng: () => number): (atMs: number) => number {
  let value = gaussian(rng);
  let last: number | null = null;
  return (atMs) => {
    if (last === null) {
      last = atMs;
      return value;
    }
    const decay = Math.exp(-Math.max(0, atMs - last) / DRIFT_TAU_MS);
    last = atMs;
    value =
      value * decay + gaussian(rng) * Math.sqrt(Math.max(0, 1 - decay * decay));
    return value;
  };
}

function clampError(error: number, limit: number): number {
  const bound = Math.max(0, limit);
  return Math.max(-bound, Math.min(bound, error));
}

export function planAutoplay(
  notes: ManiaNote[],
  {
    humanize,
    windows,
    releaseWindows,
    profile = null,
    rate = 1,
    keyCount = 0,
  }: {
    humanize: HumanizeSettings;
    windows: JudgementWindows;
    releaseWindows: JudgementWindows;
    profile?: SkillProfile | null;
    rate?: number;
    keyCount?: number;
  },
): AutoplayPlan {
  const unplayable = findUnplayableNotes(notes);
  const plannedMisses = new Set<string>();
  const events: AutoplayEvent[] = [];

  const seed = humanize.seed || ((Math.random() * 0xffffffff) | 0) || 1;
  const rng = createRng(seed);
  const human = humanize.enabled;
  const timingScale = Math.max(0.25, Math.min(4, rate));
  const localizeHumanMisses = (profile?.loads.size ?? 0) > 0;
  const drift = makeDrift(rng);

  let columns = keyCount;
  if (columns <= 0) {
    for (const note of notes) columns = Math.max(columns, note.column + 1);
  }

  const playable = orderNotes(notes).filter((note) => !unplayable.has(note.id));
  let lastMissAt = -Infinity;

  for (let index = 0; index < playable.length; ) {
    const chordStart = playable[index].startTime;
    let end = index;
    while (
      end < playable.length &&
      playable[end].startTime - chordStart <= CHORD_GROUP_MS
    ) {
      end += 1;
    }
    const chord = playable.slice(index, end);
    index = end;

    const loads = chord.map((note) => profile?.loads.get(note.id)?.load ?? 0);
    const sigmas = loads.map(
      (load) => (human ? humanize.jitterMs : 0) + loadJitterMs(load),
    );
    const chordSigma = sigmas.reduce((sum, s) => sum + s, 0) / sigmas.length;

    const driftUnit = drift(chordStart);
    const chordOffset =
      driftUnit * chordSigma * DRIFT_SHARE +
      gaussian(rng) * chordSigma * Math.sqrt(CHORD_VARIANCE_SHARE);
    const handOffsets = new Map<number, number>();

    for (let k = 0; k < chord.length; k++) {
      const note = chord[k];
      const load = loads[k];

      const physicalMiss = missChanceFromLoad(load);
      const baseMiss =
        human && (!localizeHumanMisses || physicalMiss > 0)
          ? humanize.missChance
          : 0;
      let missChance = 1 - (1 - baseMiss) * (1 - physicalMiss);
      if (missChance > 0) {
        const sinceMiss = (note.startTime - lastMissAt) / timingScale;
        if (sinceMiss < MISS_ECHO_MS) {
          missChance = Math.min(
            0.95,
            missChance *
              (1 + MISS_ECHO_GAIN * (1 - Math.max(0, sinceMiss) / MISS_ECHO_MS)),
          );
        }
      }
      if (missChance > 0 && rng() < missChance) {
        plannedMisses.add(note.id);
        lastMissAt = note.startTime;
        continue;
      }

      const sigma = sigmas[k];
      const hand = handOf(note.column, columns);
      let handOffset = handOffsets.get(hand);
      if (handOffset === undefined) {
        handOffset = gaussian(rng) * chordSigma * Math.sqrt(HAND_VARIANCE_SHARE);
        handOffsets.set(hand, handOffset);
      }

      const error = clampError(
        ((human ? humanize.biasMs : 0) +
          chordOffset +
          handOffset +
          gaussian(rng) * sigma * Math.sqrt(NOTE_VARIANCE_SHARE) +
          slipError(
            rng,
            sigma,
            slipChanceForLoad(human ? humanize.slipChance : 0, load),
          )) *
          timingScale,
        windows.miss,
      );
      events.push({
        atMs: note.startTime + error,
        column: note.column,
        action: "press",
        noteId: note.id,
      });

      if (note.endTime !== undefined && note.endTime > note.startTime) {
        const releaseSigma =
          (human ? humanize.releaseJitterMs : 0) + loadJitterMs(load);
        const releaseError = clampError(
          ((human ? humanize.biasMs : 0) +
            driftUnit * releaseSigma * DRIFT_SHARE +
            gaussian(rng) * releaseSigma) *
            timingScale,
          releaseWindows.miss,
        );
        events.push({
          atMs: Math.max(
            note.endTime + releaseError,
            note.startTime + error + 1,
          ),
          column: note.column,
          action: "release",
          noteId: note.id,
        });
      }
    }
  }

  events.sort((a, b) => a.atMs - b.atMs);
  return { events, unplayable, plannedMisses };
}

export type AutoplayPlanSummary = {
  presses: number;
  releases: number;
  unplayable: number;
  stacked: number;
  insideLn: number;
  plannedMisses: number;
};

export function summarizePlan(plan: AutoplayPlan): AutoplayPlanSummary {
  let stacked = 0;
  let insideLn = 0;
  for (const reason of plan.unplayable.values()) {
    if (reason === "stacked") stacked += 1;
    else insideLn += 1;
  }
  let presses = 0;
  let releases = 0;
  for (const event of plan.events) {
    if (event.action === "press") presses += 1;
    else releases += 1;
  }
  return {
    presses,
    releases,
    unplayable: plan.unplayable.size,
    stacked,
    insideLn,
    plannedMisses: plan.plannedMisses.size,
  };
}
