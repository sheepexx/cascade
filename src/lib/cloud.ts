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
  owner: string;
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
    // Project-scoped path so collaborators (not just the owner) can read it;
    // storage RLS gates these on can_view_project / can_edit_project.
    const storagePath = `${id}/${sha}.${ext}`;
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

/**
 * Lightweight live save: update only the chart row (`projects.data` + the
 * denormalised title/artist/creator), without touching Storage assets. Used for
 * the Google-Docs-style auto-save on every edit, so it's cheap to call often.
 * Assets are still (re)uploaded by the full `saveProjectCloud`.
 */
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

/**
 * Load just the chart JSON for a project (no Storage asset downloads). Used by
 * the live collab refresh: a structural change saves the chart to the cloud and
 * pings peers, who pull the fresh chart here — the asset reconciler fetches any
 * newly referenced audio/background bytes separately. Cheap, so safe to call on
 * every structural ping.
 */
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

/** List every project the user can see (owned + shared), newest first. */
export async function listProjectsCloud(): Promise<CloudProjectSummary[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id,owner,title,artist,creator,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CloudProjectSummary[];
}

/** A project participant (owner or invited collaborator) shown in the start menu. */
export type ProjectParticipant = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  role: "owner" | "editor" | "viewer";
};

/** A project the user can view, enriched with a thumbnail + participant avatars. */
export type CloudProjectRich = {
  id: string;
  owner: string;
  title: string;
  artist: string;
  creator: string;
  updated_at: string;
  /** Storage path of a background to use as the card thumbnail, or null. */
  bg_path: string | null;
  /** Owner first, then collaborators. */
  participants: ProjectParticipant[];
  /** The caller's own archived flag (only meaningful for shared/invited maps). */
  archived: boolean;
};

/**
 * List every project the caller can view (owned + shared) with a background
 * thumbnail path and the participants' avatars, in one round trip. Backed by the
 * `list_my_projects` RPC (migration 0007), which is SECURITY DEFINER so it can
 * surface collaborators' avatars that the `users` RLS would otherwise hide.
 */
export async function listMyProjectsRich(): Promise<CloudProjectRich[]> {
  const { data, error } = await supabase.rpc("list_my_projects");
  if (error) throw new Error(error.message);
  return (data ?? []) as CloudProjectRich[];
}

/**
 * Create short-lived signed URLs for private background thumbnails, keyed by
 * storage path. Paths that can't be signed are simply omitted from the result.
 */
export async function signedThumbUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await supabase.storage
    .from(MAPS_BUCKET)
    .createSignedUrls(unique, 60 * 60); // 1 hour
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) out[row.path] = row.signedUrl;
  }
  return out;
}

export type LoadedCloudProject = {
  id: string;
  owner: string;
  data: CloudProjectData;
  audio: CloudAsset[];
  bg: CloudAsset[];
};

/** Load a project's chart and download its asset blobs from Storage. */
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
    owner: project.owner as string,
    data: project.data as CloudProjectData,
    audio,
    bg,
  };
}

/**
 * Publish a single asset to Storage + `project_assets` without disturbing the
 * project's other assets. Used during a live co-op session so a newly added
 * audio/background reaches collaborators immediately — the full
 * `saveProjectCloud` (which rewrites every asset row) only runs on an explicit
 * "Save to cloud". Content-addressed + upsert, so re-publishing identical bytes
 * just overwrites the same object.
 */
export async function publishProjectAsset(
  projectId: string,
  kind: "audio" | "bg",
  asset: CloudAsset,
): Promise<void> {
  const sha = await sha256Hex(asset.blob);
  const ext = asset.name.includes(".")
    ? asset.name.slice(asset.name.lastIndexOf(".") + 1).toLowerCase()
    : "bin";
  const storagePath = `${projectId}/${sha}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(MAPS_BUCKET)
    .upload(storagePath, asset.blob, {
      upsert: true,
      contentType: asset.blob.type || undefined,
    });
  if (upErr) throw new Error(upErr.message);

  // Replace any existing row for this filename (the file's content may have
  // changed) so peers resolve it to the current object, then record this one.
  await supabase
    .from("project_assets")
    .delete()
    .eq("project_id", projectId)
    .eq("filename", asset.name);
  const { error } = await supabase.from("project_assets").insert({
    project_id: projectId,
    kind,
    filename: asset.name,
    storage_path: storagePath,
    sha256: sha,
    bytes: asset.blob.size,
  });
  if (error) throw new Error(error.message);
}

/**
 * Download specific assets (by filename) from a project's Storage. Used to pull
 * in audio/background a collaborator added mid-session that this client doesn't
 * have locally yet. Files not (yet) present are simply omitted — the caller can
 * retry, since the producer's upload may still be in flight.
 */
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
    const { data: blob, error: dErr } = await supabase.storage
      .from(MAPS_BUCKET)
      .download(a.storage_path as string);
    if (dErr || !blob) continue; // not ready yet / removed — caller may retry
    out.push({ name: a.filename as string, blob, kind: a.kind as "audio" | "bg" });
  }
  return out;
}

export async function deleteProjectCloud(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Archive or un-archive an invited (shared) project for the current user only,
 * hiding it from their start menu without affecting the owner or their access.
 * Backed by the `set_project_archived` RPC (migration 0008).
 */
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
