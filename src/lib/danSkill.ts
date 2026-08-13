import type {
  DanSelection,
  DanSelections,
  SkillCapability,
  SkillSettings,
} from "../types";

export type DanLadderId = "4k-regular" | "4k-ln" | "7k-regular" | "7k-ln";

export type DanLevel = {
  label: string;
  skill: SkillCapability;
};

export type DanLadder = {
  keyCount: number;
  longNote: boolean;
  levels: DanLevel[];
};

export const DAN_LADDERS: Record<DanLadderId, DanLadder> = {
  "4k-regular": {
    keyCount: 4,
    longNote: false,
    levels: [
      { label: "Intro 1st", skill: { jackNps: 1.93, handNps: 3.04, chordSize: 2, lnSkill: 0.14, staminaSec: 8.94, recoverySec: 6.38 } },
      { label: "Intro 2nd", skill: { jackNps: 2.62, handNps: 4.21, chordSize: 2, lnSkill: 0.21, staminaSec: 12.66, recoverySec: 5.92 } },
      { label: "Intro 3rd", skill: { jackNps: 3.57, handNps: 5.78, chordSize: 3, lnSkill: 0.31, staminaSec: 17.71, recoverySec: 5.29 } },
      { label: "1st", skill: { jackNps: 3.9, handNps: 6.33, chordSize: 3, lnSkill: 0.34, staminaSec: 19.46, recoverySec: 5.07 } },
      { label: "2nd", skill: { jackNps: 4.22, handNps: 6.87, chordSize: 3, lnSkill: 0.37, staminaSec: 21.47, recoverySec: 4.85 } },
      { label: "3rd", skill: { jackNps: 4.3, handNps: 7.01, chordSize: 3, lnSkill: 0.38, staminaSec: 22.03, recoverySec: 4.8 } },
      { label: "4th", skill: { jackNps: 4.88, handNps: 7.96, chordSize: 4, lnSkill: 0.44, staminaSec: 25.85, recoverySec: 4.41 } },
      { label: "5th", skill: { jackNps: 5.44, handNps: 8.91, chordSize: 4, lnSkill: 0.49, staminaSec: 29.63, recoverySec: 4.04 } },
      { label: "6th", skill: { jackNps: 5.76, handNps: 9.52, chordSize: 4, lnSkill: 0.52, staminaSec: 31.91, recoverySec: 3.87 } },
      { label: "7th", skill: { jackNps: 5.96, handNps: 9.91, chordSize: 4, lnSkill: 0.54, staminaSec: 33.43, recoverySec: 3.77 } },
      { label: "8th", skill: { jackNps: 6.27, handNps: 10.54, chordSize: 4, lnSkill: 0.57, staminaSec: 35.77, recoverySec: 3.62 } },
      { label: "9th", skill: { jackNps: 6.43, handNps: 10.87, chordSize: 4, lnSkill: 0.58, staminaSec: 37, recoverySec: 3.53 } },
      { label: "10th", skill: { jackNps: 6.66, handNps: 11.31, chordSize: 4, lnSkill: 0.6, staminaSec: 38.68, recoverySec: 3.42 } },
      { label: "Alpha", skill: { jackNps: 7.02, handNps: 12.03, chordSize: 4, lnSkill: 0.64, staminaSec: 41.36, recoverySec: 3.24 } },
      { label: "Beta", skill: { jackNps: 7.08, handNps: 12.17, chordSize: 4, lnSkill: 0.64, staminaSec: 41.88, recoverySec: 3.21 } },
      { label: "Gamma", skill: { jackNps: 7.4, handNps: 12.8, chordSize: 4, lnSkill: 0.67, staminaSec: 44.25, recoverySec: 3.05 } },
      { label: "Delta", skill: { jackNps: 8.16, handNps: 13.95, chordSize: 4, lnSkill: 0.72, staminaSec: 53.53, recoverySec: 2.81 } },
      { label: "Epsilon", skill: { jackNps: 8.99, handNps: 15.13, chordSize: 4, lnSkill: 0.77, staminaSec: 64.14, recoverySec: 2.57 } },
      { label: "Zeta", skill: { jackNps: 9.43, handNps: 15.76, chordSize: 4, lnSkill: 0.79, staminaSec: 69.87, recoverySec: 2.45 } },
      { label: "Eta", skill: { jackNps: 10.61, handNps: 17.44, chordSize: 4, lnSkill: 0.86, staminaSec: 84.94, recoverySec: 2.11 } },
    ],
  },
  "4k-ln": {
    keyCount: 4,
    longNote: true,
    levels: [
      { label: "5th", skill: { jackNps: 4.55, handNps: 7.42, chordSize: 3, lnSkill: 0.41, staminaSec: 23.67, recoverySec: 4.63 } },
      { label: "6th", skill: { jackNps: 4.85, handNps: 7.92, chordSize: 4, lnSkill: 0.43, staminaSec: 25.66, recoverySec: 4.43 } },
      { label: "7th", skill: { jackNps: 5.27, handNps: 8.62, chordSize: 4, lnSkill: 0.48, staminaSec: 28.49, recoverySec: 4.15 } },
      { label: "8th", skill: { jackNps: 5.28, handNps: 8.63, chordSize: 4, lnSkill: 0.48, staminaSec: 28.49, recoverySec: 4.15 } },
      { label: "9th", skill: { jackNps: 5.48, handNps: 8.97, chordSize: 4, lnSkill: 0.5, staminaSec: 29.89, recoverySec: 4.01 } },
      { label: "10th", skill: { jackNps: 5.74, handNps: 9.48, chordSize: 4, lnSkill: 0.52, staminaSec: 31.81, recoverySec: 3.88 } },
      { label: "11th", skill: { jackNps: 6.16, handNps: 10.32, chordSize: 4, lnSkill: 0.56, staminaSec: 34.96, recoverySec: 3.67 } },
      { label: "12th", skill: { jackNps: 6.33, handNps: 10.66, chordSize: 4, lnSkill: 0.57, staminaSec: 36.23, recoverySec: 3.58 } },
      { label: "13th", skill: { jackNps: 6.82, handNps: 11.64, chordSize: 4, lnSkill: 0.62, staminaSec: 39.9, recoverySec: 3.34 } },
      { label: "14th", skill: { jackNps: 7.19, handNps: 12.39, chordSize: 4, lnSkill: 0.65, staminaSec: 42.71, recoverySec: 3.15 } },
      { label: "15th", skill: { jackNps: 7.43, handNps: 12.86, chordSize: 4, lnSkill: 0.67, staminaSec: 44.49, recoverySec: 3.03 } },
    ],
  },
  "7k-regular": {
    keyCount: 7,
    longNote: false,
    levels: [
      { label: "0th", skill: { jackNps: 4.54, handNps: 7.41, chordSize: 3, lnSkill: 0.4, staminaSec: 23.63, recoverySec: 4.64 } },
      { label: "1st", skill: { jackNps: 4.69, handNps: 7.66, chordSize: 3, lnSkill: 0.42, staminaSec: 24.62, recoverySec: 4.54 } },
      { label: "2nd", skill: { jackNps: 5.31, handNps: 8.68, chordSize: 4, lnSkill: 0.48, staminaSec: 28.72, recoverySec: 4.13 } },
      { label: "3rd", skill: { jackNps: 5.9, handNps: 9.81, chordSize: 4, lnSkill: 0.54, staminaSec: 33.03, recoverySec: 3.8 } },
      { label: "4th", skill: { jackNps: 6, handNps: 9.99, chordSize: 4, lnSkill: 0.54, staminaSec: 33.72, recoverySec: 3.75 } },
      { label: "5th", skill: { jackNps: 6.18, handNps: 10.35, chordSize: 4, lnSkill: 0.56, staminaSec: 35.08, recoverySec: 3.66 } },
      { label: "6th", skill: { jackNps: 6.43, handNps: 10.86, chordSize: 4, lnSkill: 0.58, staminaSec: 36.96, recoverySec: 3.54 } },
      { label: "7th", skill: { jackNps: 6.69, handNps: 11.39, chordSize: 5, lnSkill: 0.61, staminaSec: 38.95, recoverySec: 3.4 } },
      { label: "8th", skill: { jackNps: 7.21, handNps: 12.42, chordSize: 5, lnSkill: 0.65, staminaSec: 42.82, recoverySec: 3.15 } },
      { label: "9th", skill: { jackNps: 7.57, handNps: 13.1, chordSize: 5, lnSkill: 0.68, staminaSec: 45.92, recoverySec: 2.98 } },
      { label: "10th", skill: { jackNps: 7.85, handNps: 13.51, chordSize: 5, lnSkill: 0.7, staminaSec: 49.55, recoverySec: 2.9 } },
      { label: "Gamma", skill: { jackNps: 8.7, handNps: 14.71, chordSize: 5, lnSkill: 0.75, staminaSec: 60.37, recoverySec: 2.66 } },
      { label: "Azimuth", skill: { jackNps: 8.87, handNps: 14.95, chordSize: 5, lnSkill: 0.76, staminaSec: 62.57, recoverySec: 2.61 } },
      { label: "Zenith", skill: { jackNps: 9.97, handNps: 16.53, chordSize: 6, lnSkill: 0.82, staminaSec: 76.8, recoverySec: 2.29 } },
    ],
  },
  "7k-ln": {
    keyCount: 7,
    longNote: true,
    levels: [
      { label: "0th", skill: { jackNps: 3.33, handNps: 5.39, chordSize: 3, lnSkill: 0.28, staminaSec: 16.45, recoverySec: 5.44 } },
      { label: "1st", skill: { jackNps: 3.34, handNps: 5.4, chordSize: 3, lnSkill: 0.28, staminaSec: 16.45, recoverySec: 5.44 } },
      { label: "2nd", skill: { jackNps: 4.03, handNps: 6.56, chordSize: 3, lnSkill: 0.35, staminaSec: 20.22, recoverySec: 4.98 } },
      { label: "3rd", skill: { jackNps: 4.67, handNps: 7.61, chordSize: 3, lnSkill: 0.42, staminaSec: 24.45, recoverySec: 4.55 } },
      { label: "4th", skill: { jackNps: 4.75, handNps: 7.75, chordSize: 4, lnSkill: 0.43, staminaSec: 25, recoverySec: 4.5 } },
      { label: "5th", skill: { jackNps: 5.44, handNps: 8.9, chordSize: 4, lnSkill: 0.49, staminaSec: 29.61, recoverySec: 4.04 } },
      { label: "6th", skill: { jackNps: 5.91, handNps: 9.83, chordSize: 4, lnSkill: 0.54, staminaSec: 33.11, recoverySec: 3.79 } },
      { label: "7th", skill: { jackNps: 6.08, handNps: 10.16, chordSize: 4, lnSkill: 0.55, staminaSec: 34.37, recoverySec: 3.71 } },
      { label: "8th", skill: { jackNps: 6.15, handNps: 10.31, chordSize: 4, lnSkill: 0.56, staminaSec: 34.91, recoverySec: 3.67 } },
      { label: "9th", skill: { jackNps: 6.37, handNps: 10.74, chordSize: 4, lnSkill: 0.58, staminaSec: 36.52, recoverySec: 3.57 } },
      { label: "10th", skill: { jackNps: 6.92, handNps: 11.83, chordSize: 5, lnSkill: 0.63, staminaSec: 40.62, recoverySec: 3.29 } },
      { label: "Gamma", skill: { jackNps: 7.59, handNps: 13.13, chordSize: 5, lnSkill: 0.69, staminaSec: 46.17, recoverySec: 2.97 } },
      { label: "Azimuth", skill: { jackNps: 7.93, handNps: 13.61, chordSize: 5, lnSkill: 0.7, staminaSec: 50.46, recoverySec: 2.88 } },
      { label: "Zenith", skill: { jackNps: 8.72, handNps: 14.74, chordSize: 5, lnSkill: 0.75, staminaSec: 60.69, recoverySec: 2.65 } },
    ],
  },
};

export const DAN_LADDER_IDS = Object.keys(DAN_LADDERS) as DanLadderId[];

export const DEFAULT_DAN_SELECTIONS: Record<"4" | "7", DanSelection> = {
  "4": { regularLevel: 13, lnLevel: 0 },
  "7": { regularLevel: 5, lnLevel: 5 },
};

export const DAN_CLEAR_MARGIN = 1.02;

export function skillForDan(
  ladder: DanLadderId,
  level: number,
): SkillSettings | null {
  const entry = DAN_LADDERS[ladder]?.levels[level];
  if (!entry) return null;
  return { enabled: true, ...entry.skill };
}

export function laddersForKeyCount(keyCount: number): {
  regular: DanLadderId;
  ln: DanLadderId;
} {
  return keyCount <= 5
    ? { regular: "4k-regular", ln: "4k-ln" }
    : { regular: "7k-regular", ln: "7k-ln" };
}

export function danKeyForKeyCount(keyCount: number): "4" | "7" {
  return keyCount <= 5 ? "4" : "7";
}

export function danSelectionForKeyCount(
  skill: SkillSettings,
  keyCount: number,
): DanSelection | null {
  const key = danKeyForKeyCount(keyCount);
  const selected = skill.danSelections?.[key];
  if (selected) return selected;
  if (skill.danSelections && Object.keys(skill.danSelections).length > 0) {
    return DEFAULT_DAN_SELECTIONS[key];
  }
  return null;
}

export function combineDans(
  keyCount: number,
  regularLevel: number,
  lnLevel: number,
  previousSelections: DanSelections = {},
): SkillSettings {
  const ids = laddersForKeyCount(keyCount);
  const regular = DAN_LADDERS[ids.regular].levels;
  const ln = DAN_LADDERS[ids.ln].levels;
  const base = (regular[regularLevel] ?? regular[regular.length - 1]).skill;
  const hold = (ln[lnLevel] ?? ln[ln.length - 1]).skill;
  const key = danKeyForKeyCount(keyCount);
  return {
    enabled: true,
    ...base,
    lnProfile: { ...hold },
    danSelections: {
      ...DEFAULT_DAN_SELECTIONS,
      ...previousSelections,
      [key]: { regularLevel, lnLevel },
    },
  };
}

export function resolveSkillForKeyCount(
  skill: SkillSettings,
  keyCount: number,
): SkillSettings {
  const selection = danSelectionForKeyCount(skill, keyCount);
  if (!selection) return skill;
  const resolved = {
    ...combineDans(
      keyCount,
      selection.regularLevel,
      selection.lnLevel,
      skill.danSelections,
    ),
    enabled: skill.enabled,
  };
  return {
    ...resolved,
    jackNps: resolved.jackNps * DAN_CLEAR_MARGIN,
    handNps: resolved.handNps * DAN_CLEAR_MARGIN,
    staminaSec: resolved.staminaSec * DAN_CLEAR_MARGIN,
    recoverySec: resolved.recoverySec / DAN_CLEAR_MARGIN,
    lnProfile: resolved.lnProfile
      ? {
          ...resolved.lnProfile,
          jackNps: resolved.lnProfile.jackNps * DAN_CLEAR_MARGIN,
          handNps: resolved.lnProfile.handNps * DAN_CLEAR_MARGIN,
          staminaSec: resolved.lnProfile.staminaSec * DAN_CLEAR_MARGIN,
          recoverySec: resolved.lnProfile.recoverySec / DAN_CLEAR_MARGIN,
        }
      : undefined,
  };
}

export function lnLevelForSkill(ladder: DanLadderId, lnSkill: number): number {
  const levels = DAN_LADDERS[ladder].levels;
  let best = 0;
  let bestGap = Infinity;
  for (let i = 0; i < levels.length; i++) {
    const gap = Math.abs(levels[i].skill.lnSkill - lnSkill);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return best;
}

export function regularLevelForSkill(
  ladder: DanLadderId,
  skill: SkillSettings,
): number {
  const levels = DAN_LADDERS[ladder].levels;
  let best = 0;
  let bestGap = Infinity;
  for (let i = 0; i < levels.length; i++) {
    const gap =
      Math.abs(levels[i].skill.handNps - skill.handNps) +
      Math.abs(levels[i].skill.jackNps - skill.jackNps);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return best;
}

export function danForSkill(
  skill: SkillSettings,
): { ladder: DanLadderId; level: number } | null {
  for (const ladder of DAN_LADDER_IDS) {
    const levels = DAN_LADDERS[ladder].levels;
    for (let level = 0; level < levels.length; level++) {
      const s = levels[level].skill;
      if (
        s.jackNps === skill.jackNps &&
        s.handNps === skill.handNps &&
        s.chordSize === skill.chordSize &&
        s.lnSkill === skill.lnSkill &&
        s.staminaSec === skill.staminaSec &&
        s.recoverySec === skill.recoverySec
      ) {
        return { ladder, level };
      }
    }
  }
  return null;
}
