import { describe, expect, it } from "vitest";
import {
  DEFAULT_HUMANIZE,
  DEFAULT_SKILL,
  SKILL_PRESETS,
  type HumanizeSettings,
  type ManiaNote,
} from "../types";
import {
  createRng,
  findUnplayableNotes,
  planAutoplay,
  summarizePlan,
} from "./autoplay";
import { computeSkillProfile } from "./playerSkill";
import {
  judgeHitError,
  maniaJudgementWindows,
  maniaReleaseWindows,
  scaleWindows,
} from "./playtestJudgements";

const windows = maniaJudgementWindows(8);
const releaseWindows = maniaReleaseWindows(8);

function note(
  id: string,
  column: number,
  startTime: number,
  endTime?: number,
): ManiaNote {
  return { id, column, startTime, ...(endTime === undefined ? {} : { endTime }) };
}

function plan(notes: ManiaNote[], humanize: HumanizeSettings) {
  return planAutoplay(notes, { humanize, windows, releaseWindows });
}

const perfect: HumanizeSettings = { ...DEFAULT_HUMANIZE, enabled: false };

describe("findUnplayableNotes", () => {
  it("keeps a lone note playable", () => {
    expect(findUnplayableNotes([note("a", 0, 1000)]).size).toBe(0);
  });

  it("marks the second of two notes stacked in one column", () => {
    const found = findUnplayableNotes([note("a", 0, 1000), note("b", 0, 1000)]);
    expect(found.get("b")).toBe("stacked");
    expect(found.has("a")).toBe(false);
  });

  it("leaves a chord across different columns playable", () => {
    const found = findUnplayableNotes([note("a", 0, 1000), note("b", 1, 1000)]);
    expect(found.size).toBe(0);
  });

  it("marks a note landing inside a long note on the same column", () => {
    const found = findUnplayableNotes([
      note("ln", 0, 1000, 2000),
      note("inner", 0, 1500),
    ]);
    expect(found.get("inner")).toBe("inside-ln");
  });

  it("leaves a note inside a long note on another column playable", () => {
    const found = findUnplayableNotes([
      note("ln", 0, 1000, 2000),
      note("other", 1, 1500),
    ]);
    expect(found.size).toBe(0);
  });

  it("treats a note exactly on the long note tail as unplayable", () => {
    const found = findUnplayableNotes([
      note("ln", 0, 1000, 2000),
      note("tail", 0, 2000),
    ]);
    expect(found.get("tail")).toBe("inside-ln");
  });

  it("leaves a note after the tail playable", () => {
    const found = findUnplayableNotes([
      note("ln", 0, 1000, 2000),
      note("after", 0, 2001),
    ]);
    expect(found.size).toBe(0);
  });

  it("marks a long note nested in another long note", () => {
    const found = findUnplayableNotes([
      note("outer", 0, 1000, 3000),
      note("nested", 0, 1500, 2000),
    ]);
    expect(found.get("nested")).toBe("inside-ln");
  });

  it("is deterministic about which stacked note survives", () => {
    const notes = [note("b", 0, 1000), note("a", 0, 1000)];
    const first = findUnplayableNotes(notes);
    const second = findUnplayableNotes([...notes].reverse());
    expect([...first.keys()]).toEqual([...second.keys()]);
  });
});

describe("planAutoplay without humanize", () => {
  it("presses every playable note exactly on time", () => {
    const notes = [note("a", 0, 1000), note("b", 1, 1500)];
    const { events } = plan(notes, perfect);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ atMs: 1000, column: 0, action: "press" });
    expect(events[1]).toMatchObject({ atMs: 1500, column: 1, action: "press" });
  });

  it("judges every press as max", () => {
    const notes = [note("a", 0, 1000), note("b", 1, 1500, 2500)];
    const { events } = plan(notes, perfect);
    const byId = new Map(notes.map((n) => [n.id, n]));
    for (const e of events.filter((x) => x.action === "press")) {
      const target = byId.get(e.noteId)!;
      expect(judgeHitError(e.atMs - target.startTime, windows)).toBe("max");
    }
  });

  it("emits a release for long notes at the tail", () => {
    const { events } = plan([note("ln", 0, 1000, 2000)], perfect);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ atMs: 2000, action: "release", noteId: "ln" });
  });

  it("emits no release for rice notes", () => {
    const { events } = plan([note("a", 0, 1000)], perfect);
    expect(events.filter((e) => e.action === "release")).toHaveLength(0);
  });

  it("schedules no press for unplayable notes", () => {
    const notes = [
      note("ln", 0, 1000, 2000),
      note("inner", 0, 1500),
      note("dup", 1, 1000),
      note("dup2", 1, 1000),
    ];
    const { events, unplayable } = plan(notes, perfect);
    const pressed = events.filter((e) => e.action === "press").map((e) => e.noteId);
    expect(pressed).not.toContain("inner");
    expect(unplayable.size).toBe(2);
    expect(pressed).toHaveLength(2);
  });

  it("returns events sorted by time", () => {
    const notes = [note("c", 0, 3000), note("a", 1, 1000), note("b", 2, 2000)];
    const { events } = plan(notes, perfect);
    const times = events.map((e) => e.atMs);
    expect(times).toEqual([...times].sort((x, y) => x - y));
  });

  it("plans nothing for an empty chart", () => {
    expect(plan([], perfect).events).toHaveLength(0);
  });
});

describe("planAutoplay with humanize", () => {
  const human: HumanizeSettings = {
    ...DEFAULT_HUMANIZE,
    enabled: true,
    jitterMs: 14,
    missChance: 0,
    greatChance: 0,
    seed: 12345,
  };

  const many = Array.from({ length: 400 }, (_, i) =>
    note(`n${i}`, i % 4, 1000 + i * 200),
  );

  it("is reproducible for a given seed", () => {
    const a = plan(many, human).events.map((e) => e.atMs);
    const b = plan(many, human).events.map((e) => e.atMs);
    expect(a).toEqual(b);
  });

  it("produces different timings for different seeds", () => {
    const a = plan(many, human).events.map((e) => e.atMs);
    const b = plan(many, { ...human, seed: 999 }).events.map((e) => e.atMs);
    expect(a).not.toEqual(b);
  });

  it("spreads hit errors instead of landing them all on zero", () => {
    const { events } = plan(many, human);
    const byId = new Map(many.map((n) => [n.id, n]));
    const errors = events
      .filter((e) => e.action === "press")
      .map((e) => e.atMs - byId.get(e.noteId)!.startTime);
    const distinct = new Set(errors.map((e) => Math.round(e)));
    expect(distinct.size).toBeGreaterThan(10);
    const nonZero = errors.filter((e) => Math.abs(e) > 0.5);
    expect(nonZero.length).toBeGreaterThan(errors.length * 0.5);
  });

  it("keeps every humanized press inside a scoring window", () => {
    const { events } = plan(many, { ...human, jitterMs: 400 });
    const byId = new Map(many.map((n) => [n.id, n]));
    for (const e of events.filter((x) => x.action === "press")) {
      const error = e.atMs - byId.get(e.noteId)!.startTime;
      expect(judgeHitError(error, windows)).not.toBeNull();
    }
  });

  it("shifts the mean error when a bias is set", () => {
    const byId = new Map(many.map((n) => [n.id, n]));
    const meanFor = (settings: HumanizeSettings) => {
      const errors = plan(many, settings).events
        .filter((e) => e.action === "press")
        .map((e) => e.atMs - byId.get(e.noteId)!.startTime);
      return errors.reduce((s, e) => s + e, 0) / errors.length;
    };
    const tolerance = (3 * human.jitterMs) / Math.sqrt(many.length);
    expect(Math.abs(meanFor({ ...human, biasMs: 0 }))).toBeLessThan(tolerance);
    expect(meanFor({ ...human, biasMs: 20 })).toBeGreaterThan(20 - tolerance);
  });

  it("keeps timing scatter constant in real time across rates", () => {
    const settings = { ...human, jitterMs: 5, biasMs: 3 };
    const normal = planAutoplay(many, {
      humanize: settings,
      windows,
      releaseWindows,
      rate: 1,
    });
    const rate = 1.5;
    const faster = planAutoplay(many, {
      humanize: settings,
      windows: scaleWindows(windows, rate),
      releaseWindows: scaleWindows(releaseWindows, rate),
      rate,
    });
    const byId = new Map(many.map((entry) => [entry.id, entry]));
    const normalPresses = normal.events.filter(
      (event) => event.action === "press",
    );
    const fasterPresses = faster.events.filter(
      (event) => event.action === "press",
    );
    for (let i = 0; i < normalPresses.length; i++) {
      const note = byId.get(normalPresses[i].noteId)!;
      const normalError = normalPresses[i].atMs - note.startTime;
      const fasterError = fasterPresses[i].atMs - note.startTime;
      expect(fasterError).toBeCloseTo(normalError * rate, 8);
    }
  });

  it("drops roughly missChance of the notes", () => {
    const { plannedMisses, events } = plan(many, {
      ...human,
      missChance: 0.1,
    });
    expect(plannedMisses.size).toBeGreaterThan(20);
    expect(plannedMisses.size).toBeLessThan(70);
    for (const id of plannedMisses) {
      expect(events.some((e) => e.noteId === id)).toBe(false);
    }
  });

  it("pushes notes out of the max window when greatChance is high", () => {
    const byId = new Map(many.map((n) => [n.id, n]));
    const { events } = plan(many, {
      ...human,
      jitterMs: 0,
      greatChance: 1,
    });
    const judgements = events
      .filter((e) => e.action === "press")
      .map((e) => judgeHitError(e.atMs - byId.get(e.noteId)!.startTime, windows));
    expect(judgements.every((j) => j !== "max")).toBe(true);
    expect(judgements.every((j) => j === "300")).toBe(true);
  });

  it("never releases a long note before its head press", () => {
    const lns = Array.from({ length: 60 }, (_, i) =>
      note(`ln${i}`, i % 4, 1000 + i * 500, 1000 + i * 500 + 30),
    );
    const { events } = plan(lns, { ...human, releaseJitterMs: 300 });
    const press = new Map<string, number>();
    for (const e of events) {
      if (e.action === "press") press.set(e.noteId, e.atMs);
      else expect(e.atMs).toBeGreaterThan(press.get(e.noteId)!);
    }
  });
});

describe("planAutoplay with physical limits", () => {
  const skill = { ...DEFAULT_SKILL, enabled: true };

  function chart(nps: number, count: number, columns: number): ManiaNote[] {
    const gap = 1000 / nps;
    return Array.from({ length: count }, (_, i) =>
      note(`n${i}`, i % columns, Math.round(i * gap)),
    );
  }

  function playWithSkill(notes: ManiaNote[], keyCount = 4, s = skill) {
    const profile = computeSkillProfile(notes, keyCount, s);
    return planAutoplay(notes, {
      humanize: { ...perfect, seed: 777 },
      windows,
      releaseWindows,
      profile,
    });
  }

  it("leaves a comfortable chart untouched", () => {
    const notes = chart(4, 200, 4);
    const { plannedMisses, events } = playWithSkill(notes);
    expect(plannedMisses.size).toBe(0);
    expect(events).toHaveLength(200);
    const byId = new Map(notes.map((n) => [n.id, n]));
    for (const e of events) {
      expect(e.atMs).toBe(byId.get(e.noteId)!.startTime);
    }
  });

  it("keeps humanized outright misses inside strained sections", () => {
    const notes = chart(4, 200, 4);
    const profile = computeSkillProfile(notes, 4, skill);
    const { plannedMisses } = planAutoplay(notes, {
      humanize: {
        ...perfect,
        enabled: true,
        missChance: 1,
        jitterMs: 0,
        greatChance: 0,
      },
      windows,
      releaseWindows,
      profile,
    });
    expect(plannedMisses.size).toBe(0);
  });

  it("breaks down on jacks far past the finger limit", () => {
    const notes = chart(30, 300, 1);
    const { plannedMisses } = playWithSkill(notes);
    expect(plannedMisses.size).toBeGreaterThan(notes.length * 0.6);
  });

  it("still plays a rate it can handle once spread across columns", () => {
    const jacked = playWithSkill(chart(14, 300, 1));
    const spread = playWithSkill(chart(14, 300, 4));
    expect(jacked.plannedMisses.size).toBeGreaterThan(150);
    expect(spread.plannedMisses.size).toBe(0);
  });

  it("misses more as the skill level drops", () => {
    const notes = chart(14, 300, 4);
    const beginner = playWithSkill(notes, 4, {
      enabled: true,
      ...SKILL_PRESETS.beginner,
    });
    const superhuman = playWithSkill(notes, 4, {
      enabled: true,
      ...SKILL_PRESETS.superhuman,
    });
    expect(beginner.plannedMisses.size).toBeGreaterThan(
      superhuman.plannedMisses.size,
    );
  });

  it("scatters timing on the notes it does reach", () => {
    const notes = chart(20, 300, 1);
    const { events } = playWithSkill(notes);
    const byId = new Map(notes.map((n) => [n.id, n]));
    const errors = events.map((e) => e.atMs - byId.get(e.noteId)!.startTime);
    expect(errors.some((e) => Math.abs(e) > 1)).toBe(true);
  });

  it("keeps every scattered press inside a scoring window", () => {
    const notes = chart(40, 300, 1);
    const { events } = playWithSkill(notes);
    const byId = new Map(notes.map((n) => [n.id, n]));
    for (const e of events.filter((x) => x.action === "press")) {
      const error = e.atMs - byId.get(e.noteId)!.startTime;
      expect(judgeHitError(error, windows)).not.toBeNull();
    }
  });

  it("does nothing when no profile is supplied", () => {
    const notes = chart(40, 200, 1);
    const { plannedMisses, events } = planAutoplay(notes, {
      humanize: perfect,
      windows,
      releaseWindows,
    });
    expect(plannedMisses.size).toBe(0);
    expect(events).toHaveLength(200);
  });

  it("stays reproducible for a seed", () => {
    const notes = chart(25, 300, 2);
    const a = playWithSkill(notes).plannedMisses;
    const b = playWithSkill(notes).plannedMisses;
    expect([...a].sort()).toEqual([...b].sort());
  });
});

describe("summarizePlan", () => {
  it("counts events and reasons", () => {
    const notes = [
      note("ln", 0, 1000, 2000),
      note("inner", 0, 1500),
      note("a", 1, 1000),
      note("dup", 1, 1000),
    ];
    const summary = summarizePlan(plan(notes, perfect));
    expect(summary).toMatchObject({
      presses: 2,
      releases: 1,
      unplayable: 2,
      stacked: 1,
      insideLn: 1,
      plannedMisses: 0,
    });
  });
});

describe("createRng", () => {
  it("is deterministic for a seed", () => {
    const a = Array.from({ length: 5 }, createRng(42));
    const b = Array.from({ length: 5 }, createRng(42));
    expect(a).toEqual(b);
  });

  it("stays in [0,1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
