import { sessionAuthHeaders } from "./auth";

const WORKER = import.meta.env.VITE_WORKER_URL.replace(/\/+$/, "");

type UploadResult = {
  path: string;
  bytes: number;
  etag: string;
};

type DeleteResult = {
  deleted: boolean;
  referenced?: boolean;
  warnings?: string[];
};

export type StorageUsage = {
  bytes: number;
  objects: number;
};

export type AdminStorageStats = {
  totalBytes: number;
  cloudflare: StorageUsage & {
    allowanceBytes: number;
    buckets: {
      projects: StorageUsage;
      shared: StorageUsage;
    };
  };
  supabase: StorageUsage & {
    allowanceBytes: number;
    buckets: {
      maps: StorageUsage;
      shared: StorageUsage;
    };
  };
};

export async function getAdminStorageStats(): Promise<AdminStorageStats> {
  return workerJson<AdminStorageStats>("/storage/admin/stats", {
    method: "GET",
    headers: sessionAuthHeaders(),
  });
}

export async function uploadProjectAsset(
  projectId: string,
  storagePath: string,
  blob: Blob,
): Promise<void> {
  const relativePath = projectRelativePath(projectId, storagePath);
  const result = await workerJson<UploadResult>(
    `/storage/projects/${encodeURIComponent(projectId)}/${encodeObjectPath(relativePath)}`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(),
        "Content-Type": blob.type || "application/octet-stream",
      },
      body: blob,
    },
  );
  if (result.path !== storagePath || result.bytes !== blob.size) {
    throw new Error("Asset upload verification failed.");
  }
}

export async function downloadProjectAsset(
  projectId: string,
  storagePath: string,
): Promise<Blob> {
  const relativePath = projectRelativePath(projectId, storagePath);
  const response = await workerFetch(
    `/storage/projects/${encodeURIComponent(projectId)}/${encodeObjectPath(relativePath)}`,
    { headers: sessionAuthHeaders() },
  );
  if (!response.ok) throw await responseError(response);
  return response.blob();
}

export async function deleteProjectAsset(
  projectId: string,
  storagePath: string,
): Promise<DeleteResult> {
  const relativePath = projectRelativePath(projectId, storagePath);
  return workerJson<DeleteResult>(
    `/storage/projects/${encodeURIComponent(projectId)}/${encodeObjectPath(relativePath)}`,
    { method: "DELETE", headers: sessionAuthHeaders() },
  );
}

export async function createProjectAssetUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const grouped = new Map<string, string[]>();
  for (const path of new Set(paths.filter(Boolean))) {
    const projectId = path.split("/", 1)[0];
    if (!projectId) continue;
    const group = grouped.get(projectId) ?? [];
    group.push(path);
    grouped.set(projectId, group);
  }
  const entries = await Promise.all(
    [...grouped].map(async ([projectId, projectPaths]) => {
      const result = await workerJson<{ urls: Record<string, string> }>(
        `/storage/projects/${encodeURIComponent(projectId)}/signed-urls`,
        {
          method: "POST",
          headers: {
            ...sessionAuthHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ paths: projectPaths }),
        },
      );
      return Object.entries(result.urls);
    }),
  );
  return Object.fromEntries(entries.flat());
}

export async function deleteProjectWithAssets(projectId: string): Promise<void> {
  await workerJson<DeleteResult>(
    `/storage/projects/${encodeURIComponent(projectId)}`,
    { method: "DELETE", headers: sessionAuthHeaders() },
  );
}

export async function uploadSharedAsset(
  slug: string,
  relativePath: string,
  blob: Blob,
  projectId: string | null,
): Promise<string> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const result = await workerJson<UploadResult>(
    `/storage/shared/${encodeURIComponent(slug)}/${encodeObjectPath(relativePath)}${query}`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(),
        "Content-Type": blob.type || "application/octet-stream",
      },
      body: blob,
    },
  );
  if (result.bytes !== blob.size) throw new Error("Shared asset upload verification failed.");
  return result.path;
}

export function getSharedAssetUrl(path: string | null): string | null {
  if (!path) return null;
  return `${WORKER}/storage/shared/${encodeObjectPath(path)}`;
}

export async function deleteSharedAssets(slug: string): Promise<void> {
  await workerJson<DeleteResult>(`/storage/shared/${encodeURIComponent(slug)}`, {
    method: "DELETE",
    headers: sessionAuthHeaders(),
  });
}

export async function deleteSharedUpload(slug: string): Promise<void> {
  await workerJson<DeleteResult>(
    `/storage/shared/${encodeURIComponent(slug)}?uploadOnly=true`,
    { method: "DELETE", headers: sessionAuthHeaders() },
  );
}

function projectRelativePath(projectId: string, storagePath: string): string {
  const prefix = `${projectId}/`;
  if (!storagePath.startsWith(prefix) || storagePath.length === prefix.length) {
    throw new Error("Invalid project asset path.");
  }
  return storagePath.slice(prefix.length);
}

function encodeObjectPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function workerFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${WORKER}${path}`, { ...init, credentials: "include" });
}

async function workerJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await workerFetch(path, init);
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
}

async function responseError(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string") return new Error(payload.error);
  } catch {
  }
  return new Error(`Storage request failed (${response.status}).`);
}
