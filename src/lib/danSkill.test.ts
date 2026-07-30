import { describe, expect, it } from "vitest";
import {
  DAN_LADDERS,
  DAN_LADDER_IDS,
  DAN_CLEAR_MARGIN,
  DEFAULT_DAN_SELECTIONS,
  combineDans,
  danSelectionForKeyCount,
  danForSkill,
  laddersForKeyCount,
  lnLevelForSkill,
  regularLevelForSkill,
  resolveSkillForKeyCount,
  skillForDan,
  type DanLadderId,
} from "./danSkill";
import { computeSkillProfile } from "./playerSkill";
import { DEFAULT_SKILL, type ManiaNote } from "../types";

describe("dan ladders", () => {
  it("covers 4K and 7K, regular and long note", () => {
    expect(DAN_LADDER_IDS).toEqual(["4k-regular", "4k-ln", "7k-regular", "7k-ln"]);
    expect(DAN_LADDERS["4k-regular"].keyCount).toBe(4);
    expect(DAN_LADDERS["7k-ln"].keyCount).toBe(7);
    expect(DAN_LADDERS["4k-ln"].longNote).toBe(true);
    expect(DAN_LADDERS["4k-regular"].longNote).toBe(false);
  });

  it("has levels in every ladder", () => {
    for (const id of DAN_LADDER_IDS) {
      expect(DAN_LADDERS[id].levels.length).toBeGreaterThan(5);
    }
  });

  it("names the boss levels", () => {
    const labels = (id: DanLadderId) => DAN_LADDERS[id].levels.map((l) => l.label);
    expect(labels("4k-regular")).toContain("Epsilon");
    expect(labels("4k-regular")).toContain("Eta");
    expect(labels("7k-regular")).toContain("Zenith");
    expect(labels("7k-ln")).toContain("Azimuth");
    expect(labels("4k-ln")).toContain("15th");
  });

  it("excludes the fake Omega course", () => {
    for (const id of DAN_LADDER_IDS) {
      expect(DAN_LADDERS[id].levels.map((l) => l.label)).not.toContain("Omega");
    }
  });

  it.each(DAN_LADDER_IDS)("%s gets strictly harder every level", (id) => {
    const levels = DAN_LADDERS[id].levels;
    for (let i = 1; i < levels.length; i++) {
      const prev = levels[i - 1].skill;
      const cur = levels[i].skill;
      expect(cur.handNps).toBeGreaterThan(prev.handNps);
      expect(cur.jackNps).toBeGreaterThan(prev.jackNps);
      expect(cur.lnSkill).toBeGreaterThanOrEqual(prev.lnSkill);
      expect(cur.recoverySec).toBeLessThanOrEqual(prev.recoverySec);
    }
  });

  it.each(DAN_LADDER_IDS)("%s holds plausible values", (id) => {
    for (const level of DAN_LADDERS[id].levels) {
      const s = level.skill;
      expect(s.jackNps).toBeGreaterThan(0);
      expect(s.handNps).toBeGreaterThan(s.jackNps);
      expect(s.lnSkill).toBeGreaterThanOrEqual(0);
      expect(s.lnSkill).toBeLessThanOrEqual(1);
      expect(s.chordSize).toBeGreaterThanOrEqual(1);
      expect(s.chordSize).toBeLessThanOrEqual(DAN_LADDERS[id].keyCount);
      expect(s.staminaSec).toBeGreaterThan(0);
      expect(s.recoverySec).toBeGreaterThan(0);
    }
  });

  it("ends the 4K regular ladder at Eta", () => {
    const levels = DAN_LADDERS["4k-regular"].levels;
    expect(levels[levels.length - 1].label).toBe("Eta");
  });
});

describe("skillForDan", () => {
  it("returns an enabled capability", () => {
    const skill = skillForDan("7k-regular", 0);
    expect(skill?.enabled).toBe(true);
    expect(skill?.handNps).toBeGreaterThan(0);
  });

  it("returns null for an unknown level", () => {
    expect(skillForDan("4k-ln", 999)).toBeNull();
    expect(skillForDan("nope" as DanLadderId, 0)).toBeNull();
  });
});

describe("danForSkill", () => {
  it("round-trips every calibrated level", () => {
    for (const ladder of DAN_LADDER_IDS) {
      const levels = DAN_LADDERS[ladder].levels;
      for (let level = 0; level < levels.length; level++) {
        const skill = skillForDan(ladder, level)!;
        expect(danForSkill(skill)).toEqual({ ladder, level });
      }
    }
  });

  it("returns null for hand-tuned values", () => {
    const skill = skillForDan("4k-regular", 3)!;
    expect(danForSkill({ ...skill, handNps: skill.handNps + 0.37 })).toBeNull();
  });
});

describe("DEFAULT_SKILL", () => {
  it("keeps default key-mode selections aligned", () => {
    expect(DEFAULT_SKILL.danSelections).toEqual(DEFAULT_DAN_SELECTIONS);
  });

  it("mirrors what combineDans produces, so the pickers open on a real dan", () => {
    const regular = DAN_LADDERS["4k-regular"].levels.findIndex(
      (l) => l.label === "5th",
    );
    expect(
      combineDans(4, regular, 0, DEFAULT_SKILL.danSelections),
    ).toEqual({
      ...DEFAULT_SKILL,
      enabled: true,
    });
  });

  it("reads back to the levels it was built from", () => {
    const skill = { ...DEFAULT_SKILL, enabled: true };
    const ladders = laddersForKeyCount(4);
    const regular = regularLevelForSkill(ladders.regular, skill);
    expect(DAN_LADDERS[ladders.regular].levels[regular].label).toBe("5th");
    expect(lnLevelForSkill(ladders.ln, skill.lnProfile!.lnSkill)).toBe(0);
  });
});

describe("combineDans", () => {
  it("takes rice from the regular dan and holds from the LN dan", () => {
    const combined = combineDans(4, 10, 5);
    const regular = DAN_LADDERS["4k-regular"].levels[10].skill;
    const ln = DAN_LADDERS["4k-ln"].levels[5].skill;
    expect(combined.handNps).toBe(regular.handNps);
    expect(combined.jackNps).toBe(regular.jackNps);
    expect(combined.staminaSec).toBe(regular.staminaSec);
    expect(combined.lnSkill).toBe(regular.lnSkill);
    expect(combined.lnProfile).toEqual(ln);
    expect(combined.enabled).toBe(true);
  });

  it("lets the two axes move independently", () => {
    const lowLn = combineDans(7, 8, 0);
    const highLn = combineDans(7, 8, 12);
    expect(lowLn.handNps).toBe(highLn.handNps);
    expect(highLn.lnProfile!.lnSkill).toBeGreaterThan(
      lowLn.lnProfile!.lnSkill,
    );
  });

  it("clamps out-of-range levels to the top of the ladder", () => {
    const top = combineDans(4, 999, 999);
    const levels = DAN_LADDERS["4k-regular"].levels;
    expect(top.handNps).toBe(levels[levels.length - 1].skill.handNps);
  });
});

describe("key-specific dan selections", () => {
  it("keeps 4K and 7K ranks independent", () => {
    const alpha = DAN_LADDERS["4k-regular"].levels.findIndex(
      (level) => level.label === "Alpha",
    );
    const selected = combineDans(
      4,
      alpha,
      0,
      DEFAULT_SKILL.danSelections,
    );
    const sevenKey = resolveSkillForKeyCount(selected, 7);
    const expected = DAN_LADDERS["7k-regular"].levels[5].skill;
    expect(sevenKey.jackNps).toBe(expected.jackNps * DAN_CLEAR_MARGIN);
    expect(sevenKey.handNps).toBe(expected.handNps * DAN_CLEAR_MARGIN);
    expect(danSelectionForKeyCount(selected, 4)?.regularLevel).toBe(alpha);
    expect(danSelectionForKeyCount(selected, 7)?.regularLevel).toBe(5);
  });

  it("leaves custom capabilities unchanged", () => {
    const custom = {
      ...DEFAULT_SKILL,
      danSelections: {},
      lnProfile: undefined,
    };
    expect(resolveSkillForKeyCount(custom, 7)).toBe(custom);
  });

  it("falls back to the default rank when saved selections are partial", () => {
    const partial = {
      ...DEFAULT_SKILL,
      danSelections: {
        "4": { regularLevel: 13, lnLevel: 2 },
      },
    };
    expect(danSelectionForKeyCount(partial, 7)).toEqual(
      DEFAULT_DAN_SELECTIONS["7"],
    );
    const resolved = resolveSkillForKeyCount(partial, 7);
    expect(resolved.handNps).toBe(
      DAN_LADDERS["7k-regular"].levels[5].skill.handNps * DAN_CLEAR_MARGIN,
    );
  });

  it("adds a clear margin to calibrated regular and LN profiles", () => {
    const raw = combineDans(4, 13, 4);
    const resolved = resolveSkillForKeyCount(raw, 4);
    expect(resolved.jackNps).toBe(raw.jackNps * DAN_CLEAR_MARGIN);
    expect(resolved.handNps).toBe(raw.handNps * DAN_CLEAR_MARGIN);
    expect(resolved.lnProfile!.jackNps).toBe(
      raw.lnProfile!.jackNps * DAN_CLEAR_MARGIN,
    );
    expect(resolved.recoverySec).toBe(
      raw.recoverySec / DAN_CLEAR_MARGIN,
    );
  });
});

describe("laddersForKeyCount", () => {
  it("uses the 4K ladders for narrow layouts and 7K for wide", () => {
    expect(laddersForKeyCount(4)).toEqual({
      regular: "4k-regular",
      ln: "4k-ln",
    });
    expect(laddersForKeyCount(5)).toEqual({
      regular: "4k-regular",
      ln: "4k-ln",
    });
    expect(laddersForKeyCount(7)).toEqual({
      regular: "7k-regular",
      ln: "7k-ln",
    });
    expect(laddersForKeyCount(10)).toEqual({
      regular: "7k-regular",
      ln: "7k-ln",
    });
  });
});

describe("dan capability against a chart", () => {
  function jack(nps: number, count: number): ManiaNote[] {
    const gap = 1000 / nps;
    return Array.from({ length: count }, (_, i) => ({
      id: `j${i}`,
      column: 0,
      startTime: Math.round(i * gap),
    }));
  }

  it("strains a low dan more than a high one on the same chart", () => {
    const chart = jack(12, 120);
    const low = computeSkillProfile(chart, 4, skillForDan("4k-regular", 3)!);
    const high = computeSkillProfile(chart, 4, skillForDan("4k-regular", 18)!);
    expect(low.meanLoad).toBeGreaterThan(high.meanLoad);
  });

  it("gives long-note ladders real LN tolerance", () => {
    const bottom = skillForDan("7k-ln", 0)!;
    const top = skillForDan("7k-ln", DAN_LADDERS["7k-ln"].levels.length - 1)!;
    expect(top.lnSkill).toBeGreaterThan(bottom.lnSkill);
  });
});
