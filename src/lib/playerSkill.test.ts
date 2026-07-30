import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKILL,
  SKILL_PRESETS,
  type ManiaNote,
  type SkillSettings,
} from "../types";
import {
  STRAIN_THRESHOLD,
  computeSkillProfile,
  loadJitterMs,
  missChanceFromLoad,
} from "./playerSkill";

const skill: SkillSettings = { ...DEFAULT_SKILL, enabled: true };

function note(id: string, column: number, startTime: number, endTime?: number): ManiaNote {
  return { id, column, startTime, ...(endTime === undefined ? {} : { endTime }) };
}

function jack(nps: number, count: number, column = 0): ManiaNote[] {
  const gap = 1000 / nps;
  return Array.from({ length: count }, (_, i) =>
    note(`j${i}`, column, Math.round(i * gap)),
  );
}

function spread(nps: number, count: number, columns: number): ManiaNote[] {
  const gap = 1000 / nps;
  return Array.from({ length: count }, (_, i) =>
    note(`s${i}`, i % columns, Math.round(i * gap)),
  );
}

function meanLoad(notes: ManiaNote[], keyCount = 4, s = skill) {
  return computeSkillProfile(notes, keyCount, s).meanLoad;
}

describe("computeSkillProfile", () => {
  it("returns an empty profile for no notes", () => {
    const profile = computeSkillProfile([], 4, skill);
    expect(profile.loads.size).toBe(0);
    expect(profile.peakLoad).toBe(0);
  });

  it("leaves a comfortable chart at zero load", () => {
    const profile = computeSkillProfile(spread(4, 60, 4), 4, skill);
    expect(profile.peakLoad).toBe(0);
    expect(profile.strained).toBe(0);
  });

  it("scores a jack far above a trill at the same note rate", () => {
    const rate = 20;
    const jackLoad = meanLoad(jack(rate, 60));
    const trillLoad = meanLoad(spread(rate, 60, 4));
    expect(jackLoad).toBeGreaterThan(trillLoad * 3);
  });

  it("keeps a spread pattern playable while the same rate jacked is not", () => {
    const rate = 14;
    expect(meanLoad(spread(rate, 80, 4))).toBeLessThan(STRAIN_THRESHOLD);
    expect(meanLoad(jack(rate, 80))).toBeGreaterThan(1);
  });

  it("breaks down on a spread pattern too, once it is absurd", () => {
    expect(meanLoad(spread(40, 120, 4))).toBeGreaterThan(1);
  });

  it("scales jack load with how far past the finger limit it is", () => {
    const atLimit = meanLoad(jack(skill.jackNps, 40));
    const double = meanLoad(jack(skill.jackNps * 2, 40));
    const quadruple = meanLoad(jack(skill.jackNps * 4, 40));
    expect(atLimit).toBeLessThan(0.05);
    expect(double).toBeGreaterThan(0.8);
    expect(quadruple).toBeGreaterThan(double * 2);
  });

  it("charges chords past the hand size", () => {
    const small = [note("a", 0, 0), note("b", 1, 0)];
    const wide = Array.from({ length: 6 }, (_, c) => note(`c${c}`, c, 0));
    const narrowSkill = { ...skill, chordSize: 2 };
    expect(computeSkillProfile(small, 6, narrowSkill).peakLoad).toBe(0);
    expect(computeSkillProfile(wide, 6, narrowSkill).peakLoad).toBeGreaterThan(0.5);
  });

  it("accumulates fatigue through a sustained overload", () => {
    const long = spread(skill.handNps * 2.4, 900, 4);
    const profile = computeSkillProfile(long, 4, long.length ? skill : skill);
    const entries = [...profile.loads.values()];
    const early = entries[10].fatigue;
    const late = entries[entries.length - 10].fatigue;
    expect(late).toBeGreaterThan(early);
    expect(late).toBeGreaterThan(0.3);
  });

  it("recovers fatigue across a rest", () => {
    const burst = spread(skill.handNps * 2.5, 200, 4);
    const restStart = burst[burst.length - 1].startTime + 20_000;
    const after = Array.from({ length: 20 }, (_, i) =>
      note(`after${i}`, i % 4, restStart + i * 250),
    );
    const profile = computeSkillProfile([...burst, ...after], 4, skill);
    const burstPeak = Math.max(
      ...burst.map((n) => profile.loads.get(n.id)!.fatigue),
    );
    const afterFatigue = profile.loads.get(after[after.length - 1].id)!.fatigue;
    expect(burstPeak).toBeGreaterThan(0.2);
    expect(afterFatigue).toBeLessThan(burstPeak / 2);
  });

  it("does not carry burst hand strain into an easy recovery section", () => {
    const recoverySkill = {
      ...skill,
      jackNps: 50,
      handNps: 8,
      staminaSec: 20,
    };
    const burst = Array.from({ length: 30 }, (_, i) =>
      note(`burst${i}`, i % 2, i * 40),
    );
    const recoveryStart = burst[burst.length - 1].startTime + 300;
    const recovery = Array.from({ length: 12 }, (_, i) =>
      note(`recovery${i}`, i % 2, recoveryStart + i * 250),
    );
    const profile = computeSkillProfile(
      [...burst, ...recovery],
      4,
      recoverySkill,
    );
    for (const current of recovery) {
      expect(profile.loads.get(current.id)!.load).toBe(0);
    }
    expect(profile.loads.get(recovery[0].id)!.fatigue).toBeLessThan(
      profile.loads.get(burst[burst.length - 1].id)!.fatigue,
    );
  });

  it("rates a harder preset as less strained than an easier one", () => {
    const chart = jack(12, 80);
    const beginner = computeSkillProfile(chart, 4, {
      enabled: true,
      ...SKILL_PRESETS.beginner,
    });
    const superhuman = computeSkillProfile(chart, 4, {
      enabled: true,
      ...SKILL_PRESETS.superhuman,
    });
    expect(superhuman.meanLoad).toBeLessThan(beginner.meanLoad);
    expect(superhuman.strained).toBeLessThan(beginner.strained);
  });

  it("splits hands so each is charged for its own columns", () => {
    const left = Array.from({ length: 80 }, (_, i) =>
      note(`l${i}`, i % 2, Math.round(i * (1000 / 22))),
    );
    const both = Array.from({ length: 80 }, (_, i) =>
      note(`b${i}`, i % 4, Math.round(i * (1000 / 22))),
    );
    expect(meanLoad(left)).toBeGreaterThan(meanLoad(both));
  });

  it("is deterministic", () => {
    const chart = jack(18, 50);
    const a = computeSkillProfile(chart, 4, skill);
    const b = computeSkillProfile(chart, 4, skill);
    expect([...a.loads.values()].map((l) => l.load)).toEqual(
      [...b.loads.values()].map((l) => l.load),
    );
  });

  it("uses a separate LN capability while holds are active", () => {
    const chart = [
      ...Array.from({ length: 24 }, (_, i) =>
        note(`inside${i}`, i % 2, i * 100, i * 100 + 400),
      ),
      note("outside", 1, 5000),
    ];
    const regular = {
      enabled: true,
      jackNps: 20,
      handNps: 30,
      chordSize: 4,
      lnSkill: 1,
      staminaSec: 100,
      recoverySec: 1,
    };
    const split = {
      ...regular,
      lnProfile: {
        jackNps: 2,
        handNps: 4,
        chordSize: 2,
        lnSkill: 0.1,
        staminaSec: 8,
        recoverySec: 6,
      },
    };
    const regularProfile = computeSkillProfile(chart, 4, regular);
    const splitProfile = computeSkillProfile(chart, 4, split);
    expect(splitProfile.meanLoad).toBeGreaterThan(regularProfile.meanLoad);
    expect(splitProfile.loads.get("inside12")!.load).toBeGreaterThan(1);
    expect(splitProfile.loads.get("outside")!.load).toBe(
      regularProfile.loads.get("outside")!.load,
    );
  });

  it("keeps sparse simple holds on the regular capability", () => {
    const chart = Array.from({ length: 100 }, (_, i) =>
      note(`sparse${i}`, i % 4, i * 100, i === 0 ? 500 : undefined),
    );
    const regular = {
      enabled: true,
      jackNps: 20,
      handNps: 30,
      chordSize: 4,
      lnSkill: 1,
      staminaSec: 100,
      recoverySec: 1,
    };
    const split = {
      ...regular,
      lnProfile: {
        jackNps: 2,
        handNps: 4,
        chordSize: 2,
        lnSkill: 0.1,
        staminaSec: 8,
        recoverySec: 6,
      },
    };
    expect(computeSkillProfile(chart, 4, split)).toEqual(
      computeSkillProfile(chart, 4, regular),
    );
  });

  it("accounts for playback rate in physical strain", () => {
    const chart = spread(skill.handNps * 1.8, 300, 4);
    const normal = computeSkillProfile(chart, 4, skill, 1);
    const faster = computeSkillProfile(chart, 4, skill, 1.4);
    expect(faster.meanLoad).toBeGreaterThan(normal.meanLoad);
    expect(faster.strained).toBeGreaterThan(normal.strained);
  });

  it("absorbs isolated strain in an otherwise comfortable chart", () => {
    const easy = spread(4, 1200, 4);
    const burstStart = easy[easy.length - 1].startTime + 5000;
    const burst = Array.from({ length: 8 }, (_, i) =>
      note(`burst${i}`, 0, burstStart + i * 125),
    );
    const profile = computeSkillProfile([...easy, ...burst], 4, skill);
    expect(profile.meanLoad).toBe(0);
    expect(profile.peakLoad).toBe(0);
    expect(profile.strained).toBe(0);
  });
});

describe("missChanceFromLoad", () => {
  it("never drops a comfortable note", () => {
    expect(missChanceFromLoad(0)).toBe(0);
    expect(missChanceFromLoad(-1)).toBe(0);
  });

  it("absorbs load inside the dead zone", () => {
    expect(missChanceFromLoad(0.1)).toBe(0);
    expect(missChanceFromLoad(0.25)).toBe(0);
    expect(missChanceFromLoad(0.3)).toBeLessThan(0.01);
  });

  it("rises with load and saturates below certainty", () => {
    expect(missChanceFromLoad(1)).toBeGreaterThan(0.1);
    expect(missChanceFromLoad(1)).toBeLessThan(0.3);
    expect(missChanceFromLoad(2)).toBeGreaterThan(0.5);
    expect(missChanceFromLoad(5)).toBeGreaterThan(0.9);
    expect(missChanceFromLoad(1000)).toBeLessThanOrEqual(0.95);
  });

  it("is monotonic", () => {
    let prev = -1;
    for (let load = 0; load <= 10; load += 0.25) {
      const p = missChanceFromLoad(load);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});

describe("loadJitterMs", () => {
  it("adds nothing at zero load", () => {
    expect(loadJitterMs(0)).toBe(0);
    expect(loadJitterMs(-2)).toBe(0);
  });

  it("grows with load", () => {
    expect(loadJitterMs(1)).toBeGreaterThan(loadJitterMs(0.5));
  });
});
