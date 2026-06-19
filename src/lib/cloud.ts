import { supabase, MAPS_BUCKET } from "./supabase";
import type {
  BackgroundScope,
  Difficulty,
  SongMeta,
  TimingPoint,
  ViewState,
} from "../types";

/**
 * Cloud project storage on Supabase.
 *
 * A project row keeps the editable chart in `data` (JSON); the binary audio /
 * background files live in the private `maps` Storage bucket and are tracked in
 * `project_assets`. Uploads are de-duplicated per user by content hash so the
 * same audio isn't stored twice. Everything here runs under the signed-in
 * user's minted Supabase token, so RLS scopes it to that user automatically.
 */

/** The serialisable chart payload stored in `projects.data`. */
export type CloudProjectData = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
  activeId: string;
  view: ViewState;
  bgScope: BackgroundScope;
};

/** A file (audio or background) to be uploaded with a project. */
export type CloudAsset = { name: string; blob: Blob };

/** Row shown in the "My Maps" list. */
export type CloudProjectSummary = {
  id: string;
  title: string;
  artist: string;
  creator: string;
  updated_at: string;
};

/** Per-project upload ceiling (bytes). Audio + backgrounds combined. */
const PROJECT_BYTE_LIMIT = 60 * 1024 * 1024; // 60 MB

type SaveParams = {
  ownerId: string;
  /** Existing project to overwrite, or null to create a new one. */
  projectId: string | null;
  data: CloudProjectData;
  audioFiles: CloudAsset[];
  bgFiles: CloudAsset[];
};

/** Create or update a cloud project and (re)upload its assets. Returns its id. */
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

  const row = {
    owner: ownerId,
    title: data.meta.title,
    artist: data.meta.artist,
    creator: data.meta.creator,
    data,
  };

  // Upsert the project row.
  let id = projectId;
  if (id) {
    const { error } = await supabase
      .from("projects")
      .update(row)
      .eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { data: inserted, error } = await supabase
      .from("projects")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    id = inserted.id as string;
  }

  // Upload each asset (content-addressed → automatic dedup), then rewrite the
  // project_assets rows to match the current set.
  const assetRows: {
    project_id: string;
    kind: "audio" | "bg";
    filename: string;
    storage_path: string;
    sha256: string;
    bytes: number;
  }[] = [];

  for (const asset of assets) {
    const sha = await sha256Hex(asset.blob);
    const ext = asset.name.includes(".")
      ? asset.name.slice(asset.name.lastIndexOf(".") + 1).toLowerCase()
      : "bin";
    const storagePath = `${ownerId}/${sha}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(MAPS_BUCKET)
      .upload(storagePath, asset.blob, {
        upsert: true,
        contentType: asset.blob.type || undefined,
      });
    if (upErr) throw new Error(upErr.message);
    assetRows.push({
      project_id: id,
      kind: asset.kind,
      filename: asset.name,
      storage_path: storagePath,
      sha256: sha,
      bytes: asset.blob.size,
    });
  }

  await supabase.from("project_assets").delete().eq("project_id", id);
  if (assetRows.length) {
    const { error } = await supabase.from("project_assets").insert(assetRows);
    if (error) throw new Error(error.message);
  }

  return id;
}

/** List the signed-in user's projects, newest first. */
export async function listProjectsCloud(): Promise<CloudProjectSummary[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id,title,artist,creator,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CloudProjectSummary[];
}

export type LoadedCloudProject = {
  id: string;
  data: CloudProjectData;
  audio: CloudAsset[];
  bg: CloudAsset[];
};

/** Load a project's chart and download its asset blobs from Storage. */
export async function loadProjectCloud(id: string): Promise<LoadedCloudProject> {
  const { data: project, error } = await supabase
    .from("projects")
    .select("id,data")
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
    const { data: blob, error: dErr } = await supabase.storage
      .from(MAPS_BUCKET)
      .download(a.storage_path as string);
    if (dErr || !blob) throw new Error(dErr?.message ?? "asset download failed");
    const entry = { name: a.filename as string, blob };
    if (a.kind === "audio") audio.push(entry);
    else bg.push(entry);
  }

  return {
    id: project.id as string,
    data: project.data as CloudProjectData,
    audio,
    bg,
  };
}

export async function deleteProjectCloud(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
