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

function orderNotes(notes: ManiaNote[]): ManiaNote[] {
  return [...notes].sort(
    (a, b) => a.startTime - b.startTime || a.column - b.column ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
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

function pressError(
  rng: () => number,
  humanize: HumanizeSettings,
  windows: JudgementWindows,
  jitterMs: number,
  human: boolean,
  timingScale: number,
): number {
  let error =
    (human ? humanize.biasMs * timingScale : 0) +
    gaussian(rng) * jitterMs;
  if (human && rng() < humanize.greatChance) {
    const past = windows.max + 1 + rng() * Math.max(1, windows.hit300 - windows.max - 1);
    error = error < 0 ? -past : past;
  }
  const limit = Math.max(0, windows.hit50);
  return Math.max(-limit, Math.min(limit, error));
}

function releaseError(
  rng: () => number,
  humanize: HumanizeSettings,
  releaseWindows: JudgementWindows,
  jitterMs: number,
  human: boolean,
  timingScale: number,
): number {
  const error =
    (human ? humanize.biasMs * timingScale : 0) +
    gaussian(rng) * jitterMs;
  const limit = Math.max(0, releaseWindows.hit50);
  return Math.max(-limit, Math.min(limit, error));
}

export function planAutoplay(
  notes: ManiaNote[],
  {
    humanize,
    windows,
    releaseWindows,
    profile = null,
    rate = 1,
  }: {
    humanize: HumanizeSettings;
    windows: JudgementWindows;
    releaseWindows: JudgementWindows;
    profile?: SkillProfile | null;
    rate?: number;
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

  for (const note of orderNotes(notes)) {
    if (unplayable.has(note.id)) continue;

    const load = profile?.loads.get(note.id)?.load ?? 0;
    const physicalMiss = missChanceFromLoad(load);

    const baseMiss =
      human && (!localizeHumanMisses || physicalMiss > 0)
        ? humanize.missChance
        : 0;
    const missChance = 1 - (1 - baseMiss) * (1 - physicalMiss);
    if (missChance > 0 && rng() < missChance) {
      plannedMisses.add(note.id);
      continue;
    }

    const jitter =
      ((human ? humanize.jitterMs : 0) + loadJitterMs(load)) * timingScale;
    const error =
      human || jitter > 0
        ? pressError(
            rng,
            humanize,
            windows,
            jitter,
            human,
            timingScale,
          )
        : 0;
    events.push({
      atMs: note.startTime + error,
      column: note.column,
      action: "press",
      noteId: note.id,
    });

    if (note.endTime !== undefined && note.endTime > note.startTime) {
      const relError =
        human || load > 0
          ? releaseError(
              rng,
              humanize,
              releaseWindows,
              ((human ? humanize.releaseJitterMs : 0) + loadJitterMs(load)) *
                timingScale,
              human,
              timingScale,
            )
          : 0;
      events.push({
        atMs: Math.max(note.endTime + relError, note.startTime + error + 1),
        column: note.column,
        action: "release",
        noteId: note.id,
      });
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
