import { isDesktopApp } from "./pwa";
import type { SavedProject } from "./persistence";

/**
 * Mirrors projects onto the real filesystem on desktop.
 *
 * IndexedDB stays the source of truth. This writes a browsable copy beside it —
 * `Documents/Cascade/Projects/<map>/` — so a project can be backed up, synced or
 * opened by hand, and keeps a rolling history of chart snapshots so a bad edit
 * that got autosaved is recoverable.
 *
 * Every function here is a no-op on the web build.
 */

export type VaultEntry = {
  /** Epoch milliseconds, and the snapshot's name on disk. */
  stamp: string;
  savedAt: number;
  bytes: number;
};

type MediaFile = { name: string; blob: Blob };

const MEDIA_FIELDS = [
  "audioFiles",
  "audio",
  "backgroundFiles",
  "videoFiles",
  "background",
  "skin",
] as const;

export const CHART_FILE = "project.json";

async function invoker() {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

/** Names a project's folder after the map, the way the user would. */
export function vaultFolderName(project: SavedProject): string {
  const parts = [project.meta?.artist, project.meta?.title]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" - ") : "Cascade map";
}

/** Every media blob in the project, flattened and de-duplicated by name. */
export function mediaFiles(project: SavedProject): MediaFile[] {
  const files = new Map<string, Blob>();
  for (const field of MEDIA_FIELDS) {
    const value = project[field];
    if (!value) continue;
    for (const file of Array.isArray(value) ? value : [value]) {
      if (file?.name && file.blob) files.set(file.name, file.blob);
    }
  }
  // The chart is written separately, so a media file may not shadow it.
  files.delete(CHART_FILE);
  return [...files].map(([name, blob]) => ({ name, blob }));
}

/** The project without its blobs — what gets written and snapshotted. */
export function chartOnly(project: SavedProject): string {
  const chart: Record<string, unknown> = { ...project };
  for (const field of MEDIA_FIELDS) delete chart[field];
  return JSON.stringify(chart);
}

/**
 * Writes the project folder.
 *
 * `mediaChanged` decides whether the archive carries the media too. A
 * minute-by-minute autosave leaves it false, so the audio is neither recopied
 * nor mistaken for media the project dropped.
 */
export async function mirrorProject(
  project: SavedProject,
  localId: string,
  mediaChanged: boolean,
): Promise<string | null> {
  if (!isDesktopApp()) return null;

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file(CHART_FILE, chartOnly(project));
  if (mediaChanged) {
    for (const file of mediaFiles(project)) zip.file(file.name, file.blob);
  }

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const invoke = await invoker();
  return await invoke<string>("vault_save", bytes, {
    headers: {
      "x-cascade-project": encodeURIComponent(localId),
      "x-cascade-name": encodeURIComponent(vaultFolderName(project)),
      "x-cascade-media": mediaChanged ? "1" : "0",
    },
  });
}

/** The snapshots kept for a project, newest first. */
export async function projectHistory(localId: string): Promise<VaultEntry[]> {
  if (!isDesktopApp()) return [];
  try {
    const invoke = await invoker();
    return await invoke<VaultEntry[]>("vault_history", { id: localId });
  } catch {
    return [];
  }
}

/** Reads one snapshot back, as the chart half of a saved project. */
export async function restoreSnapshot(
  localId: string,
  stamp: string,
): Promise<SavedProject> {
  if (!isDesktopApp()) throw new Error("Snapshots only exist in the Cascade app.");
  const invoke = await invoker();
  const bytes = await invoke<ArrayBuffer | Uint8Array | number[]>(
    "vault_restore",
    { id: localId, stamp },
  );
  const source =
    bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : Array.isArray(bytes)
        ? new Uint8Array(bytes)
        : bytes;
  return JSON.parse(new TextDecoder().decode(source)) as SavedProject;
}

/** Opens the project's folder, or the projects folder, in the file manager. */
export async function revealProject(localId?: string): Promise<void> {
  if (!isDesktopApp()) return;
  const invoke = await invoker();
  await invoke("vault_reveal", { id: localId ?? null });
}
