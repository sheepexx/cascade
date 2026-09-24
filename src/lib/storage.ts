import { sessionAuthHeaders } from "./auth";
import { t } from "./i18n/core";

const WORKER = (import.meta.env.VITE_WORKER_URL ?? "").replace(/\/+$/, "");

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

export type UserSkinStorageRow = {
  id: string;
  slot: number;
  filename: string;
  storage_path: string;
  sha256: string;
  bytes: number | string;
  updated_at: string;
};

export type UserMenuBackgroundStorageRow = {
  id: string;
  filename: string;
  storage_path: string;
  sha256: string;
  bytes: number | string;
  width: number;
  height: number;
  updated_at: string;
};

export type MapCardStorageRow = {
  slug: string;
  map_key: string;
  bytes: number | string;
  width: number;
  height: number;
  version: number;
  updated_at: string;
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
    throw new Error(t("lib.assetVerify"));
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

export async function uploadUserSkin(
  slot: 1 | 2,
  sha256: string,
  filename: string,
  blob: Blob,
): Promise<UserSkinStorageRow> {
  const result = await workerJson<{ skin: UserSkinStorageRow }>(
    `/storage/users/skins/${slot}/${sha256}.osk?filename=${encodeURIComponent(filename)}`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(),
        "Content-Type": blob.type || "application/octet-stream",
      },
      body: blob,
    },
  );
  if (result.skin.sha256 !== sha256 || Number(result.skin.bytes) !== blob.size) {
    throw new Error(t("lib.skinVerify"));
  }
  return result.skin;
}

export async function downloadUserSkin(slot: 1 | 2): Promise<Blob> {
  const response = await workerFetch(`/storage/users/skins/${slot}`, {
    method: "GET",
    headers: sessionAuthHeaders(),
  });
  if (!response.ok) throw await responseError(response);
  return response.blob();
}

export async function deleteUserSkin(slot: 1 | 2): Promise<void> {
  await workerJson<DeleteResult>(`/storage/users/skins/${slot}`, {
    method: "DELETE",
    headers: sessionAuthHeaders(),
  });
}

export async function uploadUserMenuBackground(
  sha256: string,
  filename: string,
  width: number,
  height: number,
  blob: Blob,
): Promise<UserMenuBackgroundStorageRow> {
  const query = new URLSearchParams({
    filename,
    width: String(width),
    height: String(height),
  });
  const result = await workerJson<{ background: UserMenuBackgroundStorageRow }>(
    `/storage/users/menu-background/${sha256}.jpg?${query}`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(),
        "Content-Type": blob.type || "image/jpeg",
      },
      body: blob,
    },
  );
  if (
    result.background.sha256 !== sha256 ||
    Number(result.background.bytes) !== blob.size
  ) {
    throw new Error(t("lib.menuBgVerify"));
  }
  return result.background;
}

export async function downloadUserMenuBackground(): Promise<Blob> {
  const response = await workerFetch("/storage/users/menu-background", {
    method: "GET",
    headers: sessionAuthHeaders(),
  });
  if (!response.ok) throw await responseError(response);
  return response.blob();
}

export async function deleteUserMenuBackground(): Promise<void> {
  await workerJson<DeleteResult>("/storage/users/menu-background", {
    method: "DELETE",
    headers: sessionAuthHeaders(),
  });
}

export async function uploadMapCard(
  mapKey: string,
  blob: Blob,
): Promise<MapCardStorageRow> {
  const result = await workerJson<{ card: MapCardStorageRow }>(
    `/storage/cards?key=${encodeURIComponent(mapKey)}`,
    {
      method: "PUT",
      headers: {
        ...sessionAuthHeaders(),
        "Content-Type": "image/png",
      },
      body: blob,
    },
  );
  if (result.card.map_key !== mapKey || Number(result.card.bytes) !== blob.size) {
    throw new Error(t("mapCard.errVerify"));
  }
  return result.card;
}

export async function deleteMapCard(slug: string): Promise<void> {
  await workerJson<DeleteResult>(`/storage/cards/${encodeURIComponent(slug)}`, {
    method: "DELETE",
    headers: sessionAuthHeaders(),
  });
}

export async function uploadSharedAsset(
  slug: string,
  relativePath: string,
  blob: Blob,
  projectId: string,
): Promise<string> {
  const query = `?projectId=${encodeURIComponent(projectId)}`;
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
  if (result.bytes !== blob.size) throw new Error(t("lib.sharedVerify"));
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
    throw new Error(t("lib.invalidPath"));
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
  return new Error(t("lib.storageFailed", { status: response.status }));
}
