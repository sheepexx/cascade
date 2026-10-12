import { describe, expect, it, vi } from "vitest";
import { DEFAULT_VIEW, makeDifficulty, makeRedPoint, type ManiaNote } from "../types";
import type { CloudChartSnapshot, CloudProjectData } from "./cloud";
import { RevisionConflictError } from "./cloud";
import { InvalidChartDataError } from "./chartValidation";
import { mergeCharts, type MergeableChart } from "./chartMerge";
import { CloudSync, normalizedChart, type Persist } from "./cloudSync";
import { applyOp, type NoteOp } from "./ops";

/** The cloud copy, with the same rule as migration 0038: a save names its revision. */
class FakeCloud {
  revision = 0;
  data: CloudProjectData;
  saves = 0;
  failNext: Error | null = null;

  constructor(data: CloudProjectData) {
    this.data = clone(data);
  }

  persist: Persist = async (data, expectedRevision, mutationId) => {
    await Promise.resolve();
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    if (expectedRevision !== this.revision) throw new RevisionConflictError();
    this.data = clone(data);
    this.revision += 1;
    this.saves += 1;
    return { revision: this.revision, mutationId, updatedBy: null };
  };

  load = async (): Promise<CloudChartSnapshot> => {
    await Promise.resolve();
    return { data: clone(this.data), revision: this.revision, mutationId: "", updatedBy: null };
  };
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const note = (id: string, column: number, startTime: number): ManiaNote => ({ id, column, startTime });

function startingData(notes: ManiaNote[]): CloudProjectData {
  return {
    meta: { title: "Song", artist: "Artist", creator: "Mapper" },
    timingPoints: [{ ...makeRedPoint(0, 120), id: "tp" }],
    difficulties: [{ ...makeDifficulty("Hard", 4), id: "d1", timingPoints: [], notes }],
    activeId: "d1",
    view: DEFAULT_VIEW,
    bgScope: "mapset",
  };
}

/** One editor window: its chart, its edit counter and its CloudSync. */
function window(cloud: FakeCloud, opened: CloudProjectData, revision: number) {
  let chart: MergeableChart = normalizedChart(clone(opened));
  let editVersion = 0;
  const keptCopies: number[] = [];
  const sync = new CloudSync(
    {
      read: () => ({
        chart,
        extra: { activeId: "d1", view: DEFAULT_VIEW, bgScope: "mapset" },
        editVersion,
      }),
      // The editor merges into its newest state, as the hook's updaters do.
      apply: ({ base, remote, local, merged }) => {
        chart = chart === local ? merged : mergeCharts(base, chart, remote).value;
      },
      keepLocalCopy: async (conflicts) => {
        keptCopies.push(conflicts);
      },
    },
    () => cloud.load(),
  );
  sync.reset(chart, revision, 0);
  const notes = () => chart.difficulties[0].notes;
  return {
    sync,
    keptCopies,
    notes,
    find: (id: string) => notes().find((n) => n.id === id),
    get editVersion() {
      return editVersion;
    },
    /** A local edit: applied, counted, and returned for broadcasting. */
    edit(op: NoteOp) {
      chart = { ...chart, difficulties: applyOp(chart.difficulties, op) };
      editVersion += 1;
      return op;
    },
    /** A collaborator's broadcast op arriving. */
    receive(op: NoteOp) {
      chart = { ...chart, difficulties: applyOp(chart.difficulties, op) };
    },
    save: () => sync.save(cloud.persist),
  };
}

const move = (from: ManiaNote, startTime: number): NoteOp => ({
  t: "note.update",
  diffId: "d1",
  before: [from],
  after: [{ ...from, startTime }],
});

const a = note("a", 0, 1000);
const b = note("b", 1, 2000);

function twoWindows() {
  const cloud = new FakeCloud(startingData([a, b]));
  const alice = window(cloud, cloud.data, cloud.revision);
  const bob = window(cloud, cloud.data, cloud.revision);
  return { cloud, alice, bob };
}

const reopen = (cloud: FakeCloud) => cloud.data.difficulties[0].notes;

describe("CloudSync with two windows", () => {
  it("keeps both edits when the second save was made from a stale copy", async () => {
    const { cloud, alice, bob } = twoWindows();
    alice.edit(move(a, 1100));
    bob.edit(move(b, 2200));
    await alice.save();
    // Bob saves without having seen Alice's save or op.
    await bob.save();
    expect(cloud.saves).toBe(2);
    expect(reopen(cloud)).toEqual([{ ...a, startTime: 1100 }, { ...b, startTime: 2200 }]);
    expect(bob.notes()).toEqual(reopen(cloud));
    await alice.sync.refresh({ revision: cloud.revision, mutationId: null });
    expect(alice.notes()).toEqual(reopen(cloud));
  });

  it.each([
    ["broadcast before either save", ["receive-b", "receive-a", "save-a", "save-b"]],
    ["broadcast between the saves", ["save-a", "receive-a", "receive-b", "save-b"]],
    ["broadcast after both saves", ["save-a", "save-b", "receive-a", "receive-b"]],
    ["the later save first, broadcasts delayed", ["save-b", "save-a", "receive-b", "receive-a"]],
    ["one broadcast lost", ["save-b", "receive-b", "save-a"]],
  ])("ends with both edits whatever the order: %s", async (_name, steps) => {
    const { cloud, alice, bob } = twoWindows();
    const aliceOp = alice.edit(move(a, 1100));
    const bobOp = bob.edit({ t: "note.add", diffId: "d1", notes: [note("c", 3, 1500)] });
    for (const step of steps) {
      if (step === "save-a") await alice.save();
      if (step === "save-b") await bob.save();
      if (step === "receive-a") bob.receive(aliceOp);
      if (step === "receive-b") alice.receive(bobOp);
    }
    for (const w of [alice, bob]) await w.sync.refresh({ revision: cloud.revision, mutationId: null });
    const expected = [{ ...a, startTime: 1100 }, note("c", 3, 1500), b];
    expect(reopen(cloud)).toEqual(expected);
    expect(alice.notes()).toEqual(expected);
    expect(bob.notes()).toEqual(expected);
  });

  it("lets the saved value win a same-field conflict and keeps the local copy first", async () => {
    const { cloud, alice, bob } = twoWindows();
    alice.edit(move(a, 1100));
    bob.edit(move(a, 1300));
    await alice.save();
    await bob.save();
    expect(bob.keptCopies).toEqual([1]);
    expect(bob.find("a")?.startTime).toBe(1100);
    expect(reopen(cloud).find((n) => n.id === "a")?.startTime).toBe(1100);
  });

  it("counts an edit as saved only once the cloud has it", async () => {
    const { cloud, alice } = twoWindows();
    alice.edit(move(a, 1100));
    expect(alice.sync.isSaved(alice.editVersion)).toBe(false);
    const saving = alice.save();
    expect(alice.sync.isSaved(alice.editVersion)).toBe(false);
    await saving;
    expect(alice.sync.isSaved(alice.editVersion)).toBe(true);
    expect(cloud.revision).toBe(1);
  });

  it("keeps the edit unsaved and in the editor when a save fails", async () => {
    const { cloud, alice } = twoWindows();
    alice.edit(move(a, 1100));
    cloud.failNext = new Error("offline");
    await expect(alice.save()).rejects.toThrow("offline");
    expect(alice.sync.isSaved(alice.editVersion)).toBe(false);
    expect(alice.find("a")?.startTime).toBe(1100);
    expect(reopen(cloud)[0]).toEqual(a);
    await alice.save();
    expect(reopen(cloud)[0].startTime).toBe(1100);
    expect(alice.sync.isSaved(alice.editVersion)).toBe(true);
  });

  it("doesn't save when nothing changed, unless asked", async () => {
    const { cloud, alice } = twoWindows();
    expect(await alice.save()).toBeNull();
    expect(cloud.saves).toBe(0);
    await alice.sync.save(cloud.persist, { force: true });
    expect(cloud.saves).toBe(1);
  });

  it("refuses a newer snapshot that fails its checks and keeps local work", async () => {
    const { cloud, alice } = twoWindows();
    alice.edit(move(a, 1100));
    cloud.revision += 1;
    const load = vi.spyOn(cloud, "load").mockRejectedValue(new InvalidChartDataError("bad", [], 1));
    await expect(alice.save()).rejects.toBeInstanceOf(InvalidChartDataError);
    expect(alice.find("a")?.startTime).toBe(1100);
    expect(alice.sync.isSaved(alice.editVersion)).toBe(false);
    load.mockRestore();
  });

  it("gives up after repeated conflicts without losing the edit", async () => {
    const { cloud, alice } = twoWindows();
    alice.edit(move(a, 1100));
    const persist: Persist = async () => {
      cloud.revision += 1;
      throw new RevisionConflictError();
    };
    await expect(alice.sync.save(persist)).rejects.toThrow(/kept saving this map/);
    expect(alice.find("a")?.startTime).toBe(1100);
    expect(alice.sync.isSaved(alice.editVersion)).toBe(false);
  });

  it("skips its own save's change notice and older revisions", async () => {
    const { cloud, alice } = twoWindows();
    const load = vi.spyOn(cloud, "load");
    alice.edit(move(a, 1100));
    const stamp = await alice.save();
    await alice.sync.refresh({ revision: stamp!.revision, mutationId: stamp!.mutationId });
    await alice.sync.refresh({ revision: 0, mutationId: null });
    expect(load).not.toHaveBeenCalled();
  });

  it("drops work queued for a map that was closed", async () => {
    const { cloud, alice } = twoWindows();
    alice.edit(move(a, 1100));
    const pending = alice.save();
    alice.sync.reset(null, null);
    await expect(pending).rejects.toThrow();
    expect(cloud.saves).toBe(0);
  });
});
