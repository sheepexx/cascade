import type {
  ManiaNote,
  SkillCapability,
  SkillSettings,
} from "../types";

const CHORD_WINDOW_MS = 10;

const HAND_WINDOW_MS = 1000;

const JACK_WEIGHT = 1;
const HAND_WEIGHT = 0.7;
const CHORD_WEIGHT = 0.5;
const HAND_ACTIVE_INTERVALS = 1.5;

const FATIGUE_WEIGHT = 0.9;
const REGULAR_LN_RATIO = 0.1;
const FULL_LN_RATIO = 0.5;
const COMFORTABLE_MEAN_LOAD = 0.07;
const COMFORTABLE_P99_LOAD = 0.4;
const COMFORTABLE_PEAK_LOAD = 1;

const STRAIN_SLOPE = 1.5;

export type NoteLoad = {
  load: number;
  jack: number;
  hand: number;
  chord: number;
  heldOnHand: number;
  fatigue: number;
};

export type SkillProfile = {
  loads: Map<string, NoteLoad>;
  peakLoad: number;
  meanLoad: number;
  strained: number;
};

export const EMPTY_PROFILE: SkillProfile = {
  loads: new Map(),
  peakLoad: 0,
  meanLoad: 0,
  strained: 0,
};

export const STRAIN_THRESHOLD = 0.35;

function handOf(column: number, keyCount: number): number {
  if (keyCount <= 1) return 0;
  const half = keyCount / 2;
  return column < Math.floor(half) ? 0 : 1;
}

function computeCapabilityProfile(
  notes: ManiaNote[],
  keyCount: number,
  skill: SkillCapability,
  rate: number,
): SkillProfile {
  if (notes.length === 0) return EMPTY_PROFILE;

  const timeRate = Math.max(0.25, Math.min(4, rate));
  const jackGapMs = 1000 / Math.max(0.5, skill.jackNps);
  const handCapacity = Math.max(0.5, skill.handNps);
  const chordCap = Math.max(1, skill.chordSize);
  const staminaSec = Math.max(1, skill.staminaSec);
  const recoverySec = Math.max(0.5, skill.recoverySec);

  const ordered = [...notes].sort(
    (a, b) => a.startTime - b.startTime || a.column - b.column,
  );

  const lastByColumn = new Map<number, number>();
  const handTimes: number[][] = [[], []];
  const loads = new Map<string, NoteLoad>();
  const holds = new Map<number, number>();
  const fingersPerHand = Math.max(1, Math.ceil(Math.max(1, keyCount) / 2));
  const lnSkill = Math.max(0, Math.min(1, skill.lnSkill));

  let fatigue = 0;
  let prevTime = ordered[0].startTime / timeRate;
  let sum = 0;
  let peak = 0;
  let strained = 0;

  for (let i = 0; i < ordered.length; i++) {
    const note = ordered[i];
    const time = note.startTime / timeRate;

    let chordCount = 1;
    for (let j = i + 1; j < ordered.length; j++) {
      if (
        (ordered[j].startTime - note.startTime) / timeRate >
        CHORD_WINDOW_MS
      ) {
        break;
      }
      chordCount += 1;
    }
    for (let j = i - 1; j >= 0; j--) {
      if (
        (note.startTime - ordered[j].startTime) / timeRate >
        CHORD_WINDOW_MS
      ) {
        break;
      }
      chordCount += 1;
    }

    const prevSame = lastByColumn.get(note.column);
    const gap = prevSame === undefined ? Infinity : time - prevSame;
    const jack =
      gap === Infinity
        ? 0
        : STRAIN_SLOPE * Math.max(0, jackGapMs / Math.max(1, gap) - 1);

    const hand = handOf(note.column, keyCount);

    for (const [column, end] of holds) {
      if (end <= time) holds.delete(column);
    }
    let heldOnHand = 0;
    for (const [column] of holds) {
      if (column !== note.column && handOf(column, keyCount) === hand) {
        heldOnHand += 1;
      }
    }
    const occupancy = Math.min(1, heldOnHand / fingersPerHand);
    const usable = Math.max(0.15, 1 - (1 - lnSkill) * occupancy);

    const times = handTimes[hand];
    const previousHandTime = times[times.length - 1];
    times.push(time);
    while (times.length && time - times[0] > HAND_WINDOW_MS) times.shift();
    const handNps = (times.length * 1000) / HAND_WINDOW_MS;
    const effectiveCapacity = handCapacity * usable;
    const handActive =
      previousHandTime !== undefined &&
      time - previousHandTime <=
        (HAND_ACTIVE_INTERVALS * 1000) / effectiveCapacity;
    const handStrain =
      handActive
        ? STRAIN_SLOPE * Math.max(0, handNps / effectiveCapacity - 1)
        : 0;

    const chordStrain = Math.max(0, (chordCount - chordCap) / chordCap);

    const instant =
      JACK_WEIGHT * jack + HAND_WEIGHT * handStrain + CHORD_WEIGHT * chordStrain;

    const dtSec = Math.max(0, time - prevTime) / 1000;
    prevTime = time;

    const loadRatio = handActive ? handNps / effectiveCapacity : 0;
    if (loadRatio >= 1) {
      fatigue = Math.min(1, fatigue + (loadRatio * loadRatio * dtSec) / staminaSec);
    } else {
      const drain = (loadRatio * loadRatio * dtSec) / staminaSec;
      const rest = ((1 - loadRatio) * dtSec) / recoverySec;
      fatigue = Math.max(0, Math.min(1, fatigue + drain - rest));
    }

    const load = instant * (1 + FATIGUE_WEIGHT * fatigue);
    loads.set(note.id, {
      load,
      jack,
      hand: handStrain,
      chord: chordStrain,
      heldOnHand,
      fatigue,
    });
    lastByColumn.set(note.column, time);
    if (note.endTime !== undefined && note.endTime > note.startTime) {
      holds.set(note.column, note.endTime / timeRate);
    }

    sum += load;
    if (load > peak) peak = load;
    if (load >= STRAIN_THRESHOLD) strained += 1;
  }

  return {
    loads,
    peakLoad: peak,
    meanLoad: sum / ordered.length,
    strained,
  };
}

function absorbComfortableProfile(profile: SkillProfile): SkillProfile {
  if (profile.loads.size === 0) return profile;
  const values = [...profile.loads.values()]
    .map((entry) => entry.load)
    .sort((a, b) => a - b);
  const p99 = values[Math.floor((values.length - 1) * 0.99)];
  if (
    profile.meanLoad > COMFORTABLE_MEAN_LOAD ||
    p99 > COMFORTABLE_P99_LOAD ||
    profile.peakLoad > COMFORTABLE_PEAK_LOAD
  ) {
    return profile;
  }
  return {
    loads: new Map(
      [...profile.loads].map(([id, entry]) => [
        id,
        { ...entry, load: 0 },
      ]),
    ),
    peakLoad: 0,
    meanLoad: 0,
    strained: 0,
  };
}

export function computeSkillProfile(
  notes: ManiaNote[],
  keyCount: number,
  skill: SkillSettings,
  rate = 1,
): SkillProfile {
  const regular = computeCapabilityProfile(notes, keyCount, skill, rate);
  if (!skill.lnProfile || !notes.some((note) => note.endTime !== undefined)) {
    return absorbComfortableProfile(regular);
  }

  const lnRatio =
    notes.filter((note) => note.endTime !== undefined).length / notes.length;
  const lnWeight = Math.max(
    0,
    Math.min(1, (lnRatio - REGULAR_LN_RATIO) / (FULL_LN_RATIO - REGULAR_LN_RATIO)),
  );
  if (lnWeight === 0) return absorbComfortableProfile(regular);

  const hold = computeCapabilityProfile(
    notes,
    keyCount,
    skill.lnProfile,
    rate,
  );
  const intervals = notes
    .filter(
      (note) =>
        note.endTime !== undefined && note.endTime > note.startTime,
    )
    .map((note) => [note.startTime, note.endTime!] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && interval[0] <= previous[1]) {
      previous[1] = Math.max(previous[1], interval[1]);
    } else {
      merged.push([...interval]);
    }
  }

  const loads = new Map<string, NoteLoad>();
  const ordered = [...notes].sort(
    (a, b) => a.startTime - b.startTime || a.column - b.column,
  );
  let intervalIndex = 0;
  let sum = 0;
  let peak = 0;
  let strained = 0;
  for (const note of ordered) {
    while (
      intervalIndex < merged.length &&
      merged[intervalIndex][1] < note.startTime
    ) {
      intervalIndex += 1;
    }
    const interval = merged[intervalIndex];
    const inLnSection =
      interval !== undefined &&
      interval[0] <= note.startTime &&
      note.startTime <= interval[1];
    const regularLoad = regular.loads.get(note.id)!;
    const holdLoad = hold.loads.get(note.id)!;
    const load =
      !inLnSection || lnWeight === 0
        ? regularLoad
        : lnWeight === 1
          ? holdLoad
          : {
              load:
                regularLoad.load +
                (holdLoad.load - regularLoad.load) * lnWeight,
              jack:
                regularLoad.jack +
                (holdLoad.jack - regularLoad.jack) * lnWeight,
              hand:
                regularLoad.hand +
                (holdLoad.hand - regularLoad.hand) * lnWeight,
              chord:
                regularLoad.chord +
                (holdLoad.chord - regularLoad.chord) * lnWeight,
              heldOnHand: holdLoad.heldOnHand,
              fatigue:
                regularLoad.fatigue +
                (holdLoad.fatigue - regularLoad.fatigue) * lnWeight,
            };
    loads.set(note.id, load);
    sum += load.load;
    peak = Math.max(peak, load.load);
    if (load.load >= STRAIN_THRESHOLD) strained += 1;
  }

  return absorbComfortableProfile({
    loads,
    peakLoad: peak,
    meanLoad: sum / ordered.length,
    strained,
  });
}

const MISS_DEAD_ZONE = 0.25;
const MISS_SCALE = 4.5;
const MISS_CURVE = 2.6;

export function missChanceFromLoad(load: number): number {
  if (load <= MISS_DEAD_ZONE) return 0;
  const over = (load - MISS_DEAD_ZONE) / MISS_SCALE;
  return Math.min(0.95, Math.pow(over, MISS_CURVE));
}

const LOAD_JITTER_MS = 4;

export function loadJitterMs(load: number): number {
  if (load <= 0) return 0;
  return LOAD_JITTER_MS * load;
}
