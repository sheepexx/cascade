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
};

export async function saveProjectCloud(params: SaveParams): Promise<string> {
  const { ownerId, projectId, data, audioFiles, bgFiles } = params;

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

    const { data: obsolete, error: replaceError } = await supabase.rpc(
      "replace_project_assets",
      { p_project: id, p_assets: assetRows },
    );
    if (replaceError) throw new Error(replaceError.message);

    // For an existing collaborative project, publish the assets first and the
    // chart reference last. Peers can never observe a new filename before its
    // blob and project_assets row are ready to download.
    if (projectId) {
      const { error } = await supabase
        .from("projects")
        .update(row)
        .eq("id", id);
      if (error) throw new Error(error.message);
    }

    for (const row of (obsolete ?? []) as { obsolete_path: string }[]) {
      await deleteProjectAsset(id, row.obsolete_path);
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
): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({
      title: data.meta.title,
      artist: data.meta.artist,
      creator: data.meta.creator,
      data,
    })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
}

export async function loadProjectChartCloud(
  id: string,
): Promise<CloudProjectData> {
  const { data, error } = await supabase
    .from("projects")
    .select("data")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data.data as CloudProjectData;
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
  for (const a of assets ?? []) {
    const blob = await downloadProjectAsset(id, a.storage_path as string);
    const entry = { name: a.filename as string, blob };
    if (a.kind === "audio") audio.push(entry);
    else bg.push(entry);
  }

  return {
    id: project.id as string,
    owner: project.owner as string,
    data: project.data as CloudProjectData,
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
