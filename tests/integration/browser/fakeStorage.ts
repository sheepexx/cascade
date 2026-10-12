/**
 * Replaces the asset-storage calls cloud.ts makes (R2 through the Worker in
 * production) with an in-memory store, so a save with audio runs its real
 * database path without the Worker. Everything else storage.ts exports is
 * the real module.
 */
export * from "../../../src/lib/storage";

const objects = new Map<string, Blob>();

export async function uploadProjectAsset(_projectId: string, path: string, blob: Blob): Promise<void> {
  objects.set(path, blob);
}

export async function downloadProjectAsset(_projectId: string, path: string): Promise<Blob> {
  return objects.get(path) ?? new Blob();
}

export async function deleteProjectAsset(_projectId: string, path: string): Promise<void> {
  objects.delete(path);
}

export async function deleteProjectWithAssets(): Promise<void> {}

export async function createProjectAssetUrls(paths: string[]): Promise<Record<string, string>> {
  return Object.fromEntries(paths.map((path) => [path, `memory:${path}`]));
}
