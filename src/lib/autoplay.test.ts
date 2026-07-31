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
    slipChance: 0,
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

  it("throws mostly late outliers when the slip chance is high", () => {
    const byId = new Map(many.map((n) => [n.id, n]));
    const errors = plan(many, { ...human, slipChance: 1 }).events
      .filter((e) => e.action === "press")
      .map((e) => e.atMs - byId.get(e.noteId)!.startTime);
    const outliers = errors.filter((e) => Math.abs(e) > 3 * human.jitterMs);
    expect(outliers.length).toBeGreaterThan(errors.length * 0.4);
    const late = outliers.filter((e) => e > 0).length;
    expect(late).toBeGreaterThan(outliers.length * 0.6);
  });

  it("leaves the core tight while the slip chance grows", () => {
    const byId = new Map(many.map((n) => [n.id, n]));
    const coreSpread = (settings: HumanizeSettings) => {
      const errors = plan(many, settings).events
        .filter((e) => e.action === "press")
        .map((e) => e.atMs - byId.get(e.noteId)!.startTime)
        .sort((a, b) => a - b);
      const at = (p: number) => errors[Math.round((errors.length - 1) * p)];
      return at(0.75) - at(0.25);
    };
    const tight = coreSpread({ ...human, slipChance: 0 });
    const slippy = coreSpread({ ...human, slipChance: 0.15 });
    expect(slippy).toBeLessThan(tight * 1.5);
  });

  it("keeps a slip inside the miss window", () => {
    const byId = new Map(many.map((n) => [n.id, n]));
    const errors = plan(many, { ...human, jitterMs: 60, slipChance: 1 }).events
      .filter((e) => e.action === "press")
      .map((e) => e.atMs - byId.get(e.noteId)!.startTime);
    expect(Math.max(...errors.map(Math.abs))).toBeLessThanOrEqual(windows.miss);
    expect(errors.some((e) => Math.abs(e) > windows.hit50)).toBe(true);
  });

  it("moves notes of one chord together", () => {
    const chords = Array.from({ length: 300 }, (_, i) => i).flatMap((i) =>
      [0, 1, 2, 3].map((column) =>
        note(`c${i}-${column}`, column, 1000 + i * 200),
      ),
    );
    const byId = new Map(chords.map((n) => [n.id, n]));
    const { events } = planAutoplay(chords, {
      humanize: human,
      windows,
      releaseWindows,
      keyCount: 4,
    });
    const groups = new Map<number, number[]>();
    for (const e of events) {
      const target = byId.get(e.noteId)!;
      const list = groups.get(target.startTime) ?? [];
      list.push(e.atMs - target.startTime);
      groups.set(target.startTime, list);
    }
    const spread = [...groups.values()].map(
      (errs) => Math.max(...errs) - Math.min(...errs),
    );
    const all = [...groups.values()].flat();
    const total =
      Math.sqrt(
        all.reduce((s, e) => s + e * e, 0) / all.length -
          (all.reduce((s, e) => s + e, 0) / all.length) ** 2,
      ) * 2;
    const meanSpread = spread.reduce((s, e) => s + e, 0) / spread.length;
    expect(meanSpread).toBeLessThan(total);
  });

  it("lets the centre of the error drift over a run", () => {
    const long = Array.from({ length: 4000 }, (_, i) =>
      note(`d${i}`, i % 4, 1000 + i * 50),
    );
    const byId = new Map(long.map((n) => [n.id, n]));
    const errors = plan(long, human).events
      .filter((e) => e.action === "press")
      .map((e) => e.atMs - byId.get(e.noteId)!.startTime);
    const window = 200;
    const means: number[] = [];
    for (let i = 0; i + window <= errors.length; i += window) {
      const slice = errors.slice(i, i + window);
      means.push(slice.reduce((s, e) => s + e, 0) / slice.length);
    }
    const mean = means.reduce((s, e) => s + e, 0) / means.length;
    const driftSd = Math.sqrt(
      means.reduce((s, e) => s + (e - mean) ** 2, 0) / means.length,
    );
    expect(driftSd).toBeGreaterThan(human.jitterMs / window ** 0.5);
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
        slipChance: 0,
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

describe("humanised error distribution", () => {
  const notes = Array.from({ length: 12000 }, (_, i) =>
    note(`h${i}`, (i * 3) % 4, 1000 + Math.round(i * 45)),
  );
  const byId = new Map(notes.map((n) => [n.id, n]));

  function errors(seed: number) {
    const { events } = planAutoplay(notes, {
      humanize: { ...DEFAULT_HUMANIZE, enabled: true, missChance: 0, seed },
      windows,
      releaseWindows,
      keyCount: 4,
    });
    return events
      .filter((e) => e.action === "press")
      .map((e) => e.atMs - byId.get(e.noteId)!.startTime)
      .sort((a, b) => a - b);
  }

  const sample = errors(20260731);
  const at = (p: number) =>
    sample[Math.min(sample.length - 1, Math.round((sample.length - 1) * p))];
  const median = at(0.5);
  const core = (at(0.75) - at(0.25)) / 1.349;
  const mean = sample.reduce((s, e) => s + e, 0) / sample.length;
  const sd = Math.sqrt(
    sample.reduce((s, e) => s + (e - mean) ** 2, 0) / sample.length,
  );

  it("keeps the core near the configured scatter", () => {
    expect(core).toBeGreaterThan(DEFAULT_HUMANIZE.jitterMs * 0.8);
    expect(core).toBeLessThan(DEFAULT_HUMANIZE.jitterMs * 1.4);
  });

  it("spreads far wider than the core, as real runs do", () => {
    expect(sd / core).toBeGreaterThan(1.2);
    expect(sd / core).toBeLessThan(1.9);
  });

  it("puts a few percent of hits past three sigma", () => {
    const late = sample.filter((e) => e - median > 3 * core).length;
    expect(late / sample.length).toBeGreaterThan(0.02);
    expect(late / sample.length).toBeLessThan(0.06);
  });

  it("throws far more late outliers than early ones", () => {
    const late = sample.filter((e) => e - median > 3 * core).length;
    const early = sample.filter((e) => e - median < -3 * core).length;
    expect(late).toBeGreaterThan(early * 2.5);
  });

  it("reaches five to ten sigma at the 99th percentile", () => {
    const p99 = (at(0.99) - median) / core;
    expect(p99).toBeGreaterThan(5);
    expect(p99).toBeLessThan(10);
  });

  it("lands the judgement mix a strong player would score", () => {
    const counts = { max: 0, rest: 0 };
    for (const e of sample) {
      if (judgeHitError(e, windows) === "max") counts.max += 1;
      else counts.rest += 1;
    }
    const share = counts.max / sample.length;
    expect(share).toBeGreaterThan(0.7);
    expect(share).toBeLessThan(0.88);
  });

  it("holds that shape across seeds", () => {
    for (const seed of [7, 4242, 99991]) {
      const other = errors(seed);
      const pick = (p: number) =>
        other[Math.min(other.length - 1, Math.round((other.length - 1) * p))];
      const otherCore = (pick(0.75) - pick(0.25)) / 1.349;
      expect(otherCore).toBeGreaterThan(DEFAULT_HUMANIZE.jitterMs * 0.8);
      expect(otherCore).toBeLessThan(DEFAULT_HUMANIZE.jitterMs * 1.4);
    }
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
