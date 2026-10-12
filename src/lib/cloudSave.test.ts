import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VIEW, makeDifficulty } from "../types";
import type { CloudProjectData } from "./cloud";

/**
 * Every way cloud.ts writes a chart over an existing project names the
 * revision it was edited from, including the fallbacks for a database the
 * deploy hasn't migrated yet. These tests stand in for Supabase and record
 * what each path sends.
 */

type Result = { data?: unknown; error?: { code?: string; message: string } | null };

const calls: { kind: string; name: string; args: unknown }[] = [];
let rpcResults: Record<string, Result[]> = {};
let tableResults: Result[] = [];

function next(list: Result[] | undefined): Result {
  const result = list?.shift();
  if (!result) throw new Error("unexpected call");
  return { data: result.data ?? null, error: result.error ?? null };
}

/** A PostgREST query builder: chains record what was asked, awaiting answers. */
function query(table: string) {
  const steps: unknown[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "update", "insert", "eq", "in", "order", "single"]) {
    builder[method] = (...args: unknown[]) => {
      steps.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: Result) => void, reject: (error: unknown) => void) => {
    calls.push({ kind: "table", name: table, args: steps });
    try {
      resolve(next(tableResults));
    } catch (error) {
      reject(error);
    }
  };
  return builder;
}

const fakeClient = {
  rpc: async (name: string, args: unknown) => {
    calls.push({ kind: "rpc", name, args });
    return next(rpcResults[name]);
  },
  from: (table: string) => query(table),
};

vi.mock("./supabase", () => ({
  getSupabase: async () => fakeClient,
}));

const uploads: string[] = [];
vi.mock("./storage", () => ({
  uploadProjectAsset: async (_id: string, path: string) => {
    uploads.push(path);
  },
  deleteProjectAsset: async () => {},
  deleteProjectWithAssets: async () => {},
  downloadProjectAsset: async () => new Blob(),
  createProjectAssetUrls: async () => ({}),
}));

const { RevisionConflictError, saveProjectCloud, saveProjectDataCloud } = await import("./cloud");

const PROJECT = "11111111-1111-4111-8111-111111111111";

function data(): CloudProjectData {
  return {
    meta: { title: "Song", artist: "Artist", creator: "Mapper" },
    timingPoints: [],
    difficulties: [{ ...makeDifficulty("Hard", 4), id: "d1", notes: [] }],
    activeId: "d1",
    view: DEFAULT_VIEW,
    bgScope: "mapset",
  };
}

const missing = (name: string) => ({
  error: { code: "PGRST202", message: `Could not find the function public.${name}(...) in the schema cache` },
});

beforeEach(() => {
  calls.length = 0;
  uploads.length = 0;
  rpcResults = {};
  tableResults = [];
});

describe("saveProjectDataCloud", () => {
  it("sends the revision the chart was edited from", async () => {
    rpcResults.save_project_snapshot = [{ data: [{ revision: 8, last_mutation_id: "m" }] }];
    const stamp = await saveProjectDataCloud(PROJECT, data(), "m", 7);
    expect(stamp.revision).toBe(8);
    expect(calls[0].args).toMatchObject({ p_project: PROJECT, p_expected_revision: 7 });
  });

  it("turns the database's refusal into a RevisionConflictError", async () => {
    rpcResults.save_project_snapshot = [{ error: { code: "PT409", message: "project revision conflict" } }];
    await expect(saveProjectDataCloud(PROJECT, data(), "m", 7)).rejects.toBeInstanceOf(RevisionConflictError);
  });

  it("won't save without knowing the revision", async () => {
    await expect(saveProjectDataCloud(PROJECT, data(), "m", null)).rejects.toThrow(/won't save over it/);
    expect(calls).toHaveLength(0);
  });

  it("falls back, before migration 0038, to an update guarded by the same revision", async () => {
    rpcResults.save_project_snapshot = [missing("save_project_snapshot")];
    tableResults = [{ data: [{ revision: 8, last_mutation_id: "m" }] }];
    const stamp = await saveProjectDataCloud(PROJECT, data(), "m", 7);
    expect(stamp.revision).toBe(8);
    expect(calls[1].args).toContainEqual(["eq", "revision", 7]);
    expect(calls[1].args).toContainEqual(["eq", "id", PROJECT]);
  });

  it("reports a conflict when the guarded update matches nothing", async () => {
    rpcResults.save_project_snapshot = [missing("save_project_snapshot")];
    tableResults = [{ data: [] }];
    await expect(saveProjectDataCloud(PROJECT, data(), "m", 7)).rejects.toBeInstanceOf(RevisionConflictError);
  });

  it("refuses to save on a database too old to check revisions", async () => {
    rpcResults.save_project_snapshot = [missing("save_project_snapshot")];
    tableResults = [{ error: { code: "42703", message: "column projects.revision does not exist" } }];
    await expect(saveProjectDataCloud(PROJECT, data(), "m", 7)).rejects.toThrow(/missing an update/);
  });

  it("passes other errors through instead of falling back", async () => {
    rpcResults.save_project_snapshot = [{ error: { code: "P0001", message: "project edit access required" } }];
    await expect(saveProjectDataCloud(PROJECT, data(), "m", 7)).rejects.toThrow("project edit access required");
    expect(calls).toHaveLength(1);
  });
});

describe("saveProjectCloud over an existing project", () => {
  const audio = [{ name: "audio.mp3", blob: new Blob(["x"]) }];

  it("refuses before uploading anything when the revision is unknown", async () => {
    await expect(
      saveProjectCloud({ ownerId: "u", projectId: PROJECT, data: data(), audioFiles: audio, bgFiles: [] }),
    ).rejects.toThrow(/won't save over it/);
    expect(uploads).toHaveLength(0);
  });

  it("sends the revision with the assets and the chart together", async () => {
    rpcResults.save_project_with_assets = [{ data: [{ obsolete_path: null, revision: 4 }] }];
    const saved = await saveProjectCloud({
      ownerId: "u",
      projectId: PROJECT,
      data: data(),
      audioFiles: audio,
      bgFiles: [],
      expectedRevision: 3,
    });
    expect(saved).toEqual({ id: PROJECT, revision: 4 });
    expect(calls[0].args).toMatchObject({ p_expected_revision: 3 });
  });

  it("turns a refused save into a RevisionConflictError", async () => {
    rpcResults.save_project_with_assets = [{ error: { code: "PT409", message: "project revision conflict" } }];
    await expect(
      saveProjectCloud({ ownerId: "u", projectId: PROJECT, data: data(), audioFiles: [], bgFiles: [], expectedRevision: 3 }),
    ).rejects.toBeInstanceOf(RevisionConflictError);
  });

  it("before migration 0038, checks the revision before replacing the manifest", async () => {
    rpcResults.save_project_with_assets = [missing("save_project_with_assets")];
    tableResults = [{ data: { revision: 5 } }];
    await expect(
      saveProjectCloud({ ownerId: "u", projectId: PROJECT, data: data(), audioFiles: [], bgFiles: [], expectedRevision: 3 }),
    ).rejects.toBeInstanceOf(RevisionConflictError);
    expect(calls.some((call) => call.name === "replace_project_assets")).toBe(false);
  });

  it("before migration 0038, replaces the manifest and saves the chart guarded", async () => {
    rpcResults.save_project_with_assets = [missing("save_project_with_assets")];
    rpcResults.replace_project_assets = [{ data: [] }];
    rpcResults.save_project_snapshot = [{ data: [{ revision: 4 }] }];
    tableResults = [{ data: { revision: 3 } }];
    const saved = await saveProjectCloud({
      ownerId: "u",
      projectId: PROJECT,
      data: data(),
      audioFiles: [],
      bgFiles: [],
      expectedRevision: 3,
    });
    expect(saved.revision).toBe(4);
    expect(calls.find((call) => call.name === "save_project_snapshot")?.args).toMatchObject({
      p_expected_revision: 3,
    });
  });
});
