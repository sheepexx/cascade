import { supabase } from "./supabase";
import {
  createProjectAssetUrls,
  deleteProjectAsset,
  deleteProjectWithAssets,
  downloadProjectAsset,
  uploadProjectAsset,
} from "./storage";
import type {
  BackgroundScope,
  Difficulty,
  SongMeta,
  TimingPoint,
  ViewState,
} from "../types";

export type CloudProjectData = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
  activeId: string;
  view: ViewState;
  bgScope: BackgroundScope;
};

export type CloudAsset = { name: string; blob: Blob };

export type CloudSyncStamp = {
  revision: number | null;
  mutationId: string;
  updatedBy: string | null;
};

/** Videos are intentionally local/export-only and must not leave dangling cloud references. */
export function cloudSafeProjectData(data: CloudProjectData): CloudProjectData {
  return {
    ...data,
    difficulties: data.difficulties.map(({ videoFilename: _video, videoOffsetMs: _offset, ...d }) => d),
  };
}

export type CloudProjectSummary = {
  id: string;
  owner: string;
  title: string;
  artist: string;
  creator: string;
  updated_at: string;
};

const PROJECT_BYTE_LIMIT = 60 * 1024 * 1024;

type SaveParams = {
  ownerId: string;
  projectId: string | null;
  data: CloudProjectData;
  audioFiles: CloudAsset[];
  bgFiles: CloudAsset[];
  mutationId?: string;
};

export async function saveProjectCloud(params: SaveParams): Promise<string> {
  const { ownerId, projectId, audioFiles, bgFiles } = params;
  const data = cloudSafeProjectData(params.data);
  const mutationId = params.mutationId ?? crypto.randomUUID();

  const assets = [
    ...audioFiles.map((a) => ({ ...a, kind: "audio" as const })),
    ...bgFiles.map((a) => ({ ...a, kind: "bg" as const })),
  ];
  const totalBytes = assets.reduce((sum, a) => sum + a.blob.size, 0);
  if (totalBytes > PROJECT_BYTE_LIMIT) {
    throw new Error(
      `Project assets are ${(totalBytes / 1048576).toFixed(0)} MB, over the ` +
        `${PROJECT_BYTE_LIMIT / 1048576} MB limit.`,
    );
  }

  const prepared: {
    kind: "audio" | "bg";
    name: string;
    blob: Blob;
    sha: string;
    ext: string;
  }[] = [];
  for (const asset of assets) {
    let sha: string;
    try {
      sha = await sha256Hex(asset.blob);
    } catch {
      throw new Error(
        `Couldn't read "${asset.name}" from disk. The file may have moved ` +
          `or changed since it was added. Re-add it and save again.`,
      );
    }
    const ext = extensionOf(asset.name);
    prepared.push({ ...asset, sha, ext });
  }

  const row = {
    title: data.meta.title,
    artist: data.meta.artist,
    creator: data.meta.creator,
    data,
  };

  let id = projectId;
  if (!id) {
    const { data: inserted, error } = await supabase
      .from("projects")
      .insert({ ...row, owner: ownerId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    id = inserted.id as string;
  }

  const uploadedPaths: string[] = [];
  try {
    const assetRows: {
      project_id: string;
      kind: "audio" | "bg";
      filename: string;
      storage_path: string;
      sha256: string;
      bytes: number;
    }[] = [];

    for (const asset of prepared) {
      const storagePath = `${id}/${asset.sha}.${asset.ext}`;
      await uploadProjectAsset(id, storagePath, asset.blob);
      uploadedPaths.push(storagePath);
      assetRows.push({
        project_id: id,
        kind: asset.kind,
        filename: asset.name,
        storage_path: storagePath,
        sha256: asset.sha,
        bytes: asset.blob.size,
      });
    }

    let obsolete: { obsolete_path: string | null }[] | null = null;
    if (projectId) {
      const combined = await supabase.rpc("save_project_with_assets", {
        p_project: id,
        p_assets: assetRows,
        p_data: data,
        p_mutation_id: mutationId,
      });
      const missingCombined =
        combined.error?.code === "PGRST202" ||
        (combined.error &&
          /could not find (?:the )?function .*save_project_with_assets/i.test(
            combined.error.message,
          ));
      if (combined.error && !missingCombined) throw new Error(combined.error.message);
      if (missingCombined) {
        const replaced = await supabase.rpc("replace_project_assets", {
          p_project: id,
          p_assets: assetRows,
        });
        if (replaced.error) throw new Error(replaced.error.message);
        obsolete = replaced.data as { obsolete_path: string | null }[] | null;
        await saveProjectDataCloud(id, data, mutationId);
      } else {
        obsolete = combined.data as { obsolete_path: string | null }[] | null;
      }
    } else {
      const replaced = await supabase.rpc("replace_project_assets", {
        p_project: id,
        p_assets: assetRows,
      });
      if (replaced.error) throw new Error(replaced.error.message);
      obsolete = replaced.data as { obsolete_path: string | null }[] | null;
    }

    for (const row of obsolete ?? []) {
      if (row.obsolete_path) await deleteProjectAsset(id, row.obsolete_path);
    }
  } catch (err) {
    if (!projectId) {
      try {
        await deleteProjectWithAssets(id);
      } catch {
      }
    } else {
      await Promise.allSettled(
        uploadedPaths.map((path) => deleteProjectAsset(id, path)),
      );
    }
    throw err;
  }

  return id;
}

export async function saveProjectDataCloud(
  projectId: string,
  data: CloudProjectData,
  mutationId: string = crypto.randomUUID(),
): Promise<CloudSyncStamp> {
  const safeData = cloudSafeProjectData(data);
  const { data: saved, error: rpcError } = await supabase.rpc(
    "save_project_snapshot",
    {
      p_project: projectId,
      p_data: safeData,
      p_mutation_id: mutationId,
    },
  );
  if (!rpcError) {
    const row = (saved as unknown as {
      revision?: number | string;
      last_mutation_id?: string;
      updated_by?: string | null;
    }[] | null)?.[0];
    return {
      revision: row?.revision == null ? null : Number(row.revision),
      mutationId: row?.last_mutation_id ?? mutationId,
      updatedBy: row?.updated_by ?? null,
    };
  }

  // Rolling-deploy compatibility: old databases can keep saving until migration
  // 0033 is applied. Other RPC failures must not be hidden by a direct update.
  const missingRpc =
    rpcError.code === "PGRST202" ||
    /could not find (?:the )?function .*save_project_snapshot/i.test(rpcError.message);
  if (!missingRpc) throw new Error(rpcError.message);
  const { error } = await supabase
    .from("projects")
    .update({
      title: safeData.meta.title,
      artist: safeData.meta.artist,
      creator: safeData.meta.creator,
      data: safeData,
    })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
  return { revision: null, mutationId, updatedBy: null };
}

export type CloudChartSnapshot = CloudSyncStamp & { data: CloudProjectData };

export async function loadProjectChartCloud(
  id: string,
): Promise<CloudChartSnapshot> {
  const rich = await supabase
    .from("projects")
    .select("data,revision,last_mutation_id,updated_by")
    .eq("id", id)
    .single();
  if (!rich.error) {
    const row = rich.data as unknown as {
      data: CloudProjectData;
      revision: number | string;
      last_mutation_id: string | null;
      updated_by: string | null;
    };
    return {
      data: cloudSafeProjectData(row.data),
      revision: Number(row.revision),
      mutationId: row.last_mutation_id ?? "",
      updatedBy: row.updated_by,
    };
  }

  const missingColumns =
    rich.error.code === "42703" ||
    /revision|last_mutation_id|updated_by/i.test(rich.error.message);
  if (!missingColumns) throw new Error(rich.error.message);
  const legacy = await supabase
    .from("projects")
    .select("data")
    .eq("id", id)
    .single();
  if (legacy.error) throw new Error(legacy.error.message);
  return {
    data: cloudSafeProjectData(legacy.data.data as CloudProjectData),
    revision: null,
    mutationId: "",
    updatedBy: null,
  };
}

export async function listProjectsCloud(): Promise<CloudProjectSummary[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id,owner,title,artist,creator,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CloudProjectSummary[];
}

export type ProjectParticipant = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  role: "owner" | "editor" | "viewer";
};

export type CloudProjectDifficulty = {
  name: string;
  keyCount: number;
};

export type CloudProjectRich = {
  id: string;
  owner: string;
  title: string;
  artist: string;
  creator: string;
  updated_at: string;
  bg_path: string | null;
  participants: ProjectParticipant[];
  archived: boolean;
  tags?: string | null;
  difficulties?: CloudProjectDifficulty[] | null;
};

export async function listMyProjectsRich(): Promise<CloudProjectRich[]> {
  const { data, error } = await supabase.rpc("list_my_projects");
  if (error) throw new Error(error.message);
  return (data ?? []) as CloudProjectRich[];
}

export async function signedThumbUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  return createProjectAssetUrls(unique);
}

export type LoadedCloudProject = {
  id: string;
  owner: string;
  data: CloudProjectData;
  audio: CloudAsset[];
  bg: CloudAsset[];
};

export async function loadProjectCloud(id: string): Promise<LoadedCloudProject> {
  const { data: project, error } = await supabase
    .from("projects")
    .select("id,owner,data")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);

  const { data: assets, error: aErr } = await supabase
    .from("project_assets")
    .select("kind,filename,storage_path")
    .eq("project_id", id);
  if (aErr) throw new Error(aErr.message);

  const audio: CloudAsset[] = [];
  const bg: CloudAsset[] = [];
  const rows = assets ?? [];
  let nextAsset = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, rows.length) }, async () => {
      for (;;) {
        const index = nextAsset++;
        const asset = rows[index];
        if (!asset) return;
        const blob = await downloadProjectAsset(id, asset.storage_path as string);
        const entry = { name: asset.filename as string, blob };
        if (asset.kind === "audio") audio.push(entry);
        else bg.push(entry);
      }
    }),
  );

  return {
    id: project.id as string,
    owner: project.owner as string,
    data: cloudSafeProjectData(project.data as CloudProjectData),
    audio,
    bg,
  };
}

export async function publishProjectAsset(
  projectId: string,
  kind: "audio" | "bg",
  asset: CloudAsset,
): Promise<void> {
  const sha = await sha256Hex(asset.blob);
  const ext = extensionOf(asset.name);
  const storagePath = `${projectId}/${sha}.${ext}`;
  await uploadProjectAsset(projectId, storagePath, asset.blob);
  const { data: obsolete, error } = await supabase.rpc("replace_project_asset", {
    p_project: projectId,
    p_kind: kind,
    p_filename: asset.name,
    p_storage_path: storagePath,
    p_sha256: sha,
    p_bytes: asset.blob.size,
  });
  if (error) {
    await deleteProjectAsset(projectId, storagePath).catch(() => {});
    throw new Error(error.message);
  }
  for (const row of (obsolete ?? []) as { obsolete_path: string }[]) {
    await deleteProjectAsset(projectId, row.obsolete_path);
  }
}

export async function loadProjectAssets(
  projectId: string,
  filenames: string[],
): Promise<(CloudAsset & { kind: "audio" | "bg" })[]> {
  if (!filenames.length) return [];
  const { data: rows, error } = await supabase
    .from("project_assets")
    .select("kind,filename,storage_path")
    .eq("project_id", projectId)
    .in("filename", filenames);
  if (error) throw new Error(error.message);

  const out: (CloudAsset & { kind: "audio" | "bg" })[] = [];
  for (const a of rows ?? []) {
    const blob = await downloadProjectAsset(
      projectId,
      a.storage_path as string,
    ).catch(() => null);
    if (!blob) continue;
    out.push({ name: a.filename as string, blob, kind: a.kind as "audio" | "bg" });
  }
  return out;
}

export async function deleteProjectCloud(id: string): Promise<void> {
  await deleteProjectWithAssets(id);
}

export async function setProjectArchived(
  projectId: string,
  archived: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("set_project_archived", {
    p_project: projectId,
    p_archived: archived,
  });
  if (error) throw new Error(error.message);
}

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const extension = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,8}$/.test(extension) ? extension : "bin";
}
