import { SignJWT, jwtVerify } from "jose";

export type WorkerEnv = Env & {
  CLIENT_SECRET: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  COOKIE_SECRET: string;
};

export type StorageAuthContext = {
  uid: string;
  isAdmin: boolean;
  supabaseToken: string;
};

type StorageAuthenticator = () => Promise<StorageAuthContext | null>;

type SharedMapStorageRow = {
  id: string;
  owner: string;
};

type StorageListEntry = {
  id?: string | null;
  name?: string;
  metadata?: {
    size?: number | string | null;
  } | null;
};

type StorageUsage = {
  bytes: number;
  objects: number;
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID}$`, "i");
const SLUG_RE = /^[a-z0-9]{4,32}$/i;
const MAX_SIGNED_PATHS = 100;
const SIGNED_URL_TTL = "1h";
const STORAGE_TOKEN_ISSUER = "cascade-storage";

export async function handleStorageRoute(
  req: Request,
  url: URL,
  env: WorkerEnv,
  authenticate: StorageAuthenticator,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/storage/")) return null;

  if (/^\/storage\/admin\/stats\/?$/i.test(url.pathname)) {
    if (req.method !== "GET") {
      return storageJson({ error: "method not allowed" }, 405, env);
    }
    const auth = await authenticate();
    if (!auth) return storageJson({ error: "unauthorized" }, 401, env);
    if (!auth.isAdmin) return storageJson({ error: "forbidden" }, 403, env);
    return adminStorageStats(env);
  }

  const projectRoot = url.pathname.match(
    new RegExp(`^/storage/projects/(${UUID})/?$`, "i"),
  );
  if (projectRoot && req.method === "DELETE") {
    const auth = await authenticate();
    if (!auth) return storageJson({ error: "unauthorized" }, 401, env);
    return deleteProject(projectRoot[1], auth, env);
  }

  const signedUrls = url.pathname.match(
    new RegExp(`^/storage/projects/(${UUID})/signed-urls/?$`, "i"),
  );
  if (signedUrls && req.method === "POST") {
    const auth = await authenticate();
    if (!auth) return storageJson({ error: "unauthorized" }, 401, env);
    return createSignedProjectUrls(req, url, signedUrls[1], auth, env);
  }

  const projectObject = url.pathname.match(
    new RegExp(`^/storage/projects/(${UUID})/(.+)$`, "i"),
  );
  if (projectObject) {
    const projectId = projectObject[1];
    const relativePath = decodeSafePath(projectObject[2]);
    if (!relativePath) return storageJson({ error: "invalid object path" }, 400, env);
    const key = `${projectId}/${relativePath}`;
    if (req.method === "GET" || req.method === "HEAD") {
      return getPrivateProjectObject(req, url, projectId, key, env, authenticate);
    }
    const auth = await authenticate();
    if (!auth) return storageJson({ error: "unauthorized" }, 401, env);
    if (!(await projectAllowed(env, auth.supabaseToken, projectId, "can_edit_project"))) {
      return storageJson({ error: "forbidden" }, 403, env);
    }
    if (req.method === "PUT") {
      return uploadObject(req, env.PROJECT_ASSETS, key, false, auth.uid, env);
    }
    if (req.method === "DELETE") {
      if (await projectPathReferenced(env, projectId, key)) {
        return storageJson({ deleted: false, referenced: true }, 200, env);
      }
      const warnings = await deleteObjectEverywhere(env.PROJECT_ASSETS, "maps", key, env);
      return storageJson({ deleted: true, warnings }, 200, env);
    }
    return storageJson({ error: "method not allowed" }, 405, env);
  }

  const sharedRoot = url.pathname.match(/^\/storage\/shared\/([a-z0-9]{4,32})\/?$/i);
  if (sharedRoot && req.method === "DELETE") {
    const auth = await authenticate();
    if (!auth) return storageJson({ error: "unauthorized" }, 401, env);
    return deleteSharedMap(
      sharedRoot[1],
      auth,
      env,
      url.searchParams.get("uploadOnly") === "true",
    );
  }

  if (req.method === "PUT") {
    const sharedUpload = url.pathname.match(
      /^\/storage\/shared\/([a-z0-9]{4,32})\/(.+)$/i,
    );
    if (sharedUpload) {
      const auth = await authenticate();
      if (!auth) return storageJson({ error: "unauthorized" }, 401, env);
      if (await fetchSharedMapStorageRow(sharedUpload[1], env)) {
        return storageJson({ error: "shared slug already exists" }, 409, env);
      }
      const relativePath = decodeSafePath(sharedUpload[2]);
      if (!relativePath) return storageJson({ error: "invalid object path" }, 400, env);
      const projectId = url.searchParams.get("projectId");
      if (projectId) {
        if (!UUID_RE.test(projectId)) {
          return storageJson({ error: "invalid project id" }, 400, env);
        }
        if (!(await projectOwnedBy(env, auth.supabaseToken, projectId, auth.uid))) {
          return storageJson({ error: "only the project owner can publish" }, 403, env);
        }
      }
      const key = `${auth.uid}/${sharedUpload[1]}/${relativePath}`;
      return uploadObject(req, env.SHARED_ASSETS, key, true, auth.uid, env);
    }
  }

  if (req.method === "GET" || req.method === "HEAD") {
    const encodedKey = url.pathname.slice("/storage/shared/".length);
    const key = decodeSafePath(encodedKey);
    if (!key || !validSharedKey(key)) {
      return storageJson({ error: "invalid object path" }, 400, env, true);
    }
    const response = await serveR2Object(env.SHARED_ASSETS, key, req, env, true);
    if (response) return response;
    if (fallbackEnabled(env)) {
      const fallback = await serveSupabaseObject("shared", key, req, env, true);
      if (fallback) return fallback;
    }
    return storageJson({ error: "not found" }, 404, env, true);
  }

  return storageJson({ error: "not found" }, 404, env);
}

async function adminStorageStats(env: WorkerEnv): Promise<Response> {
  const [projects, r2Shared, maps, supabaseShared] = await Promise.all([
    r2BucketUsage(env.PROJECT_ASSETS),
    r2BucketUsage(env.SHARED_ASSETS),
    supabaseBucketUsage("maps", env),
    supabaseBucketUsage("shared", env),
  ]);
  const cloudflare = addStorageUsage(projects, r2Shared);
  const supabase = addStorageUsage(maps, supabaseShared);
  const response = storageJson(
    {
      totalBytes: cloudflare.bytes + supabase.bytes,
      cloudflare: {
        ...cloudflare,
        allowanceBytes: configuredBytes(env.R2_STORAGE_ALLOWANCE_BYTES),
        buckets: { projects, shared: r2Shared },
      },
      supabase: {
        ...supabase,
        allowanceBytes: configuredBytes(env.SUPABASE_STORAGE_ALLOWANCE_BYTES),
        buckets: { maps, shared: supabaseShared },
      },
    },
    200,
    env,
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function r2BucketUsage(bucket: R2Bucket): Promise<StorageUsage> {
  const usage: StorageUsage = { bytes: 0, objects: 0 };
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const object of page.objects) {
      usage.bytes += object.size;
      usage.objects += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return usage;
}

async function supabaseBucketUsage(
  bucket: "maps" | "shared",
  env: WorkerEnv,
): Promise<StorageUsage> {
  const usage: StorageUsage = { bytes: 0, objects: 0 };
  const pending = [""];
  let visited = 0;
  while (pending.length) {
    const folder = pending.shift();
    if (folder === undefined) continue;
    for (let offset = 0; ; offset += 1000) {
      const response = await fetch(
        `${env.SUPABASE_URL}/storage/v1/object/list/${bucket}`,
        {
          method: "POST",
          headers: {
            ...serviceHeaders(env),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prefix: folder,
            limit: 1000,
            offset,
            sortBy: { column: "name", order: "asc" },
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`Supabase Storage list failed with ${response.status}`);
      }
      const entries = (await response.json()) as StorageListEntry[];
      for (const entry of entries) {
        if (!entry.name) continue;
        const path = folder ? `${folder}/${entry.name}` : entry.name;
        if (entry.id) {
          usage.bytes += storageEntryBytes(entry);
          usage.objects += 1;
        } else {
          pending.push(path);
        }
        visited += 1;
        if (visited > 100_000) {
          throw new Error("Supabase Storage stats scan limit exceeded");
        }
      }
      if (entries.length < 1000) break;
    }
  }
  return usage;
}

function storageEntryBytes(entry: StorageListEntry): number {
  const bytes = Number(entry.metadata?.size ?? 0);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
}

function addStorageUsage(a: StorageUsage, b: StorageUsage): StorageUsage {
  return { bytes: a.bytes + b.bytes, objects: a.objects + b.objects };
}

function configuredBytes(value: string): number {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
}

async function getPrivateProjectObject(
  req: Request,
  url: URL,
  projectId: string,
  key: string,
  env: WorkerEnv,
  authenticate: StorageAuthenticator,
): Promise<Response> {
  const token = url.searchParams.get("token");
  let allowed = token ? await verifyProjectAssetToken(token, projectId, key, env) : false;
  if (!allowed) {
    const auth = await authenticate();
    allowed = !!auth && (await projectAllowed(env, auth.supabaseToken, projectId, "can_view_project"));
  }
  if (!allowed) return storageJson({ error: "forbidden" }, 403, env);

  const response = await serveR2Object(env.PROJECT_ASSETS, key, req, env, false);
  if (response) return response;
  if (fallbackEnabled(env)) {
    const fallback = await serveSupabaseObject("maps", key, req, env, false);
    if (fallback) return fallback;
  }
  return storageJson({ error: "not found" }, 404, env);
}

async function createSignedProjectUrls(
  req: Request,
  url: URL,
  projectId: string,
  auth: StorageAuthContext,
  env: WorkerEnv,
): Promise<Response> {
  if (!(await projectAllowed(env, auth.supabaseToken, projectId, "can_view_project"))) {
    return storageJson({ error: "forbidden" }, 403, env);
  }
  const contentLength = Number(req.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 16 * 1024) {
    return storageJson({ error: "request too large" }, 413, env);
  }
  const payload = (await req.json()) as { paths?: unknown };
  if (!Array.isArray(payload.paths) || payload.paths.length > MAX_SIGNED_PATHS) {
    return storageJson({ error: "invalid paths" }, 400, env);
  }
  const paths = [...new Set(payload.paths.filter((path): path is string => typeof path === "string"))];
  const urls: Record<string, string> = {};
  for (const path of paths) {
    if (!path.startsWith(`${projectId}/`) || !decodeSafePath(path)) continue;
    const token = await new SignJWT({
      purpose: "project-asset",
      projectId,
      key: path,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(STORAGE_TOKEN_ISSUER)
      .setIssuedAt()
      .setExpirationTime(SIGNED_URL_TTL)
      .sign(new TextEncoder().encode(env.COOKIE_SECRET));
    const relative = path.slice(projectId.length + 1);
    urls[path] = `${url.origin}/storage/projects/${projectId}/${encodeObjectPath(relative)}?token=${encodeURIComponent(token)}`;
  }
  return storageJson({ urls }, 200, env);
}

async function verifyProjectAssetToken(
  token: string,
  projectId: string,
  key: string,
  env: WorkerEnv,
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.COOKIE_SECRET), {
      algorithms: ["HS256"],
      issuer: STORAGE_TOKEN_ISSUER,
    });
    return (
      payload.purpose === "project-asset" &&
      payload.projectId === projectId &&
      payload.key === key
    );
  } catch {
    return false;
  }
}

async function uploadObject(
  req: Request,
  bucket: R2Bucket,
  key: string,
  isPublic: boolean,
  uid: string,
  env: WorkerEnv,
): Promise<Response> {
  const rawLength = req.headers.get("Content-Length");
  if (!rawLength || !/^\d+$/.test(rawLength)) {
    return storageJson({ error: "content length required" }, 411, env);
  }
  const size = Number(rawLength);
  const max = Number(env.MAX_ASSET_BYTES);
  if (!Number.isSafeInteger(size) || size < 0) {
    return storageJson({ error: "invalid content length" }, 400, env);
  }
  if (size > max) return storageJson({ error: "asset exceeds size limit" }, 413, env);
  if (!req.body) return storageJson({ error: "request body required" }, 400, env);
  const contentType = normalizedContentType(req.headers.get("Content-Type"));
  if (!allowedContentType(contentType)) {
    return storageJson({ error: "unsupported content type" }, 415, env);
  }
  const checksum = isPublic ? null : checksumFromProjectKey(key);
  const object = await bucket.put(key, req.body, {
    httpMetadata: {
      contentType,
      cacheControl: isPublic
        ? "public, max-age=31536000, immutable"
        : "private, no-store",
    },
    customMetadata: {
      uploadedBy: uid,
      ...(checksum ? { sha256: checksum.hex } : {}),
    },
    ...(checksum ? { sha256: checksum.bytes } : {}),
  });
  if (object.size !== size) {
    return storageJson({ error: "uploaded size did not match" }, 502, env);
  }
  return storageJson({ path: key, bytes: object.size, etag: object.httpEtag }, 200, env);
}

async function serveR2Object(
  bucket: R2Bucket,
  key: string,
  req: Request,
  env: WorkerEnv,
  isPublic: boolean,
): Promise<Response | null> {
  if (req.method === "HEAD") {
    const object = await bucket.head(key);
    if (!object) return null;
    const headers = objectHeaders(env, isPublic);
    object.writeHttpMetadata(headers);
    headers.set("Content-Length", String(object.size));
    headers.set("ETag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    return new Response(null, { status: 200, headers });
  }

  const range = req.headers.has("Range") ? { range: req.headers } : undefined;
  const object = await bucket.get(key, range);
  if (!object) return null;
  const headers = objectHeaders(env, isPublic);
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  const resolvedRange = object.range ? resolveRange(object.range, object.size) : null;
  if (resolvedRange) {
    headers.set("Content-Length", String(resolvedRange.length));
    headers.set(
      "Content-Range",
      `bytes ${resolvedRange.offset}-${resolvedRange.offset + resolvedRange.length - 1}/${object.size}`,
    );
  } else {
    headers.set("Content-Length", String(object.size));
  }
  return new Response(object.body, {
    status: resolvedRange ? 206 : 200,
    headers,
  });
}

export function resolveRange(
  range: R2Range,
  size: number,
): { offset: number; length: number } | null {
  const suffix = "suffix" in range ? range.suffix : undefined;
  if (typeof suffix === "number") {
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const offset =
    "offset" in range && typeof range.offset === "number" ? range.offset : 0;
  const requestedLength =
    "length" in range && typeof range.length === "number"
      ? range.length
      : size - offset;
  const length = Math.min(requestedLength, size - offset);
  return length > 0 ? { offset, length } : null;
}

async function serveSupabaseObject(
  bucket: "maps" | "shared",
  key: string,
  req: Request,
  env: WorkerEnv,
  isPublic: boolean,
): Promise<Response | null> {
  const headers = new Headers(serviceHeaders(env));
  const range = req.headers.get("Range");
  if (range) headers.set("Range", range);
  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${bucket}/${encodeObjectPath(key)}`,
    { method: req.method, headers },
  );
  if (response.status === 404) return null;
  if (!response.ok && response.status !== 206) {
    throw new Error(`Supabase Storage fallback failed with ${response.status}`);
  }
  const outputHeaders = objectHeaders(env, isPublic);
  for (const name of [
    "Content-Type",
    "Content-Length",
    "Content-Range",
    "ETag",
    "Last-Modified",
    "Accept-Ranges",
  ]) {
    const value = response.headers.get(name);
    if (value) outputHeaders.set(name, value);
  }
  return new Response(req.method === "HEAD" ? null : response.body, {
    status: response.status,
    headers: outputHeaders,
  });
}

async function deleteProject(
  projectId: string,
  auth: StorageAuthContext,
  env: WorkerEnv,
): Promise<Response> {
  const projectResponse = await supabaseRest(
    env,
    `/projects?id=eq.${projectId}&select=id,owner`,
    { headers: serviceHeaders(env) },
  );
  if (!projectResponse.ok) throw new Error("could not read project");
  const projects = (await projectResponse.json()) as {
    id: string;
    owner: string;
  }[];
  const project = projects[0];
  if (!project) return storageJson({ error: "project not found" }, 404, env);
  if (project.owner !== auth.uid && !auth.isAdmin) {
    return storageJson({ error: "forbidden" }, 403, env);
  }

  const rowsResponse = await supabaseRest(
    env,
    `/project_assets?project_id=eq.${projectId}&select=storage_path`,
    { headers: serviceHeaders(env) },
  );
  if (!rowsResponse.ok) throw new Error("could not read project assets");
  const rows = (await rowsResponse.json()) as { storage_path: string }[];

  const warnings: string[] = [];
  const known = rows
    .map((row) => row.storage_path)
    .filter((path) => path.startsWith(`${projectId}/`));
  const cleanup = await Promise.allSettled([
    deleteR2Prefix(env.PROJECT_ASSETS, `${projectId}/`),
    deleteSupabasePrefix("maps", projectId, env, known),
  ]);
  for (const result of cleanup) {
    if (result.status === "rejected") warnings.push(errorMessage(result.reason));
  }
  if (warnings.length) {
    reportCleanupWarnings("project", projectId, warnings);
    return storageJson(
      {
        error: "Project was not deleted because its files could not be fully removed. Try again.",
      },
      502,
      env,
    );
  }

  const deleteResponse = await supabaseRest(
    env,
    `/projects?id=eq.${projectId}&select=id`,
    {
      method: "DELETE",
      headers: {
        ...serviceHeaders(env),
        Prefer: "return=representation",
      },
    },
  );
  if (!deleteResponse.ok) throw new Error("project deletion failed");
  const deleted = (await deleteResponse.json()) as { id: string }[];
  if (!deleted.length) return storageJson({ error: "project not found" }, 404, env);

  return storageJson({ deleted: true }, 200, env);
}

async function deleteSharedMap(
  slug: string,
  auth: StorageAuthContext,
  env: WorkerEnv,
  uploadOnly: boolean,
): Promise<Response> {
  const row = await fetchSharedMapStorageRow(slug, env);
  let owner = auth.uid;
  if (uploadOnly && row?.owner === auth.uid) {
    return storageJson({ error: "published assets are still referenced" }, 409, env);
  }
  if (row && !uploadOnly) {
    owner = row.owner;
    if (owner !== auth.uid && !auth.isAdmin) {
      return storageJson({ error: "forbidden" }, 403, env);
    }
    const deleteResponse = await supabaseRest(
      env,
      `/shared_maps?slug=eq.${encodeURIComponent(slug)}&select=id`,
      {
        method: "DELETE",
        headers: {
          ...userHeaders(env, auth.supabaseToken),
          Prefer: "return=representation",
        },
      },
    );
    if (!deleteResponse.ok) throw new Error("shared map deletion failed");
    const deleted = (await deleteResponse.json()) as { id: string }[];
    if (!deleted.length) return storageJson({ error: "forbidden" }, 403, env);
  }

  const prefix = `${owner}/${slug}`;
  const warnings: string[] = [];
  try {
    await deleteR2Prefix(env.SHARED_ASSETS, `${prefix}/`);
  } catch (error) {
    warnings.push(errorMessage(error));
  }
  try {
    await deleteSupabasePrefix("shared", prefix, env);
  } catch (error) {
    warnings.push(errorMessage(error));
  }
  reportCleanupWarnings("shared map", slug, warnings);
  return storageJson({ deleted: true, warnings }, 200, env);
}

async function deleteObjectEverywhere(
  r2: R2Bucket,
  supabaseBucket: "maps" | "shared",
  key: string,
  env: WorkerEnv,
): Promise<string[]> {
  const warnings: string[] = [];
  try {
    await r2.delete(key);
  } catch (error) {
    warnings.push(errorMessage(error));
  }
  try {
    await removeSupabaseObjects(supabaseBucket, [key], env);
  } catch (error) {
    warnings.push(errorMessage(error));
  }
  reportCleanupWarnings("object", key, warnings);
  return warnings;
}

async function deleteR2Prefix(bucket: R2Bucket, prefix: string): Promise<void> {
  for (;;) {
    const page = await bucket.list({ prefix, limit: 1000 });
    if (!page.objects.length) return;
    await bucket.delete(page.objects.map((object) => object.key));
  }
}

async function deleteSupabasePrefix(
  bucket: "maps" | "shared",
  prefix: string,
  env: WorkerEnv,
  known: string[] = [],
): Promise<void> {
  const paths = new Set(known);
  const pending = [prefix];
  let visited = 0;
  while (pending.length) {
    const folder = pending.shift();
    if (!folder) continue;
    for (let offset = 0; ; offset += 1000) {
      const response = await fetch(
        `${env.SUPABASE_URL}/storage/v1/object/list/${bucket}`,
        {
          method: "POST",
          headers: {
            ...serviceHeaders(env),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prefix: folder,
            limit: 1000,
            offset,
            sortBy: { column: "name", order: "asc" },
          }),
        },
      );
      if (!response.ok) throw new Error(`Supabase Storage list failed with ${response.status}`);
      const entries = (await response.json()) as StorageListEntry[];
      for (const entry of entries) {
        if (!entry.name) continue;
        const path = `${folder}/${entry.name}`;
        if (entry.id) paths.add(path);
        else pending.push(path);
        visited += 1;
        if (visited > 100_000) throw new Error("Supabase Storage cleanup limit exceeded");
      }
      if (entries.length < 1000) break;
    }
  }
  await removeSupabaseObjects(bucket, [...paths], env);
}

async function removeSupabaseObjects(
  bucket: "maps" | "shared",
  paths: string[],
  env: WorkerEnv,
): Promise<void> {
  for (let index = 0; index < paths.length; index += 100) {
    const prefixes = paths.slice(index, index + 100);
    if (!prefixes.length) continue;
    const response = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: {
        ...serviceHeaders(env),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes }),
    });
    if (!response.ok) throw new Error(`Supabase Storage delete failed with ${response.status}`);
  }
}

async function projectAllowed(
  env: WorkerEnv,
  supabaseToken: string,
  projectId: string,
  permission: "can_view_project" | "can_edit_project",
): Promise<boolean> {
  const response = await supabaseRest(env, `/rpc/${permission}`, {
    method: "POST",
    headers: {
      ...userHeaders(env, supabaseToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pid: projectId }),
  });
  if (!response.ok) return false;
  return (await response.json()) === true;
}

async function projectOwnedBy(
  env: WorkerEnv,
  supabaseToken: string,
  projectId: string,
  uid: string,
): Promise<boolean> {
  const params = new URLSearchParams({
    id: `eq.${projectId}`,
    owner: `eq.${uid}`,
    select: "id",
  });
  const response = await supabaseRest(env, `/projects?${params}`, {
    headers: userHeaders(env, supabaseToken),
  });
  if (!response.ok) return false;
  const rows = (await response.json()) as { id: string }[];
  return rows.length === 1;
}

async function projectPathReferenced(
  env: WorkerEnv,
  projectId: string,
  key: string,
): Promise<boolean> {
  const params = new URLSearchParams({
    project_id: `eq.${projectId}`,
    storage_path: `eq.${key}`,
    select: "id",
    limit: "1",
  });
  const response = await supabaseRest(env, `/project_assets?${params}`, {
    headers: serviceHeaders(env),
  });
  if (!response.ok) throw new Error("could not verify asset references");
  const rows = (await response.json()) as { id: string }[];
  return rows.length > 0;
}

async function fetchSharedMapStorageRow(
  slug: string,
  env: WorkerEnv,
): Promise<SharedMapStorageRow | null> {
  const params = new URLSearchParams({
    slug: `eq.${slug}`,
    select: "id,owner",
    limit: "1",
  });
  const response = await supabaseRest(env, `/shared_maps?${params}`, {
    headers: serviceHeaders(env),
  });
  if (!response.ok) throw new Error("could not read shared map");
  const rows = (await response.json()) as SharedMapStorageRow[];
  return rows[0] ?? null;
}

function supabaseRest(
  env: WorkerEnv,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, init);
}

function serviceHeaders(env: WorkerEnv): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

function userHeaders(env: WorkerEnv, token: string): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${token}`,
  };
}

function decodeSafePath(encoded: string): string | null {
  try {
    const path = decodeURIComponent(encoded);
    if (!path || path.startsWith("/") || path.endsWith("/") || path.includes("\\")) {
      return null;
    }
    if (new TextEncoder().encode(path).byteLength > 1024) return null;
    const segments = path.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
      return null;
    }
    if (/[%\u0000-\u001f\u007f]/.test(path)) return null;
    return path;
  } catch {
    return null;
  }
}

function validSharedKey(key: string): boolean {
  const [owner, slug, ...rest] = key.split("/");
  return UUID_RE.test(owner) && SLUG_RE.test(slug) && rest.length > 0;
}

function encodeObjectPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function normalizedContentType(value: string | null): string {
  return value?.split(";", 1)[0].trim().toLowerCase() || "application/octet-stream";
}

function allowedContentType(contentType: string): boolean {
  return (
    contentType.startsWith("audio/") ||
    contentType.startsWith("image/") ||
    contentType === "application/octet-stream" ||
    contentType === "application/ogg" ||
    contentType === "application/zip" ||
    contentType === "application/x-zip-compressed"
  );
}

function checksumFromProjectKey(
  key: string,
): { hex: string; bytes: ArrayBuffer } | null {
  const filename = key.slice(key.lastIndexOf("/") + 1);
  const match = /^([0-9a-f]{64})\.[a-z0-9]{1,8}$/i.exec(filename);
  if (!match) return null;
  const hex = match[1].toLowerCase();
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return { hex, bytes: bytes.buffer };
}

function fallbackEnabled(env: WorkerEnv): boolean {
  return env.SUPABASE_STORAGE_FALLBACK.toLowerCase() === "true";
}

function objectHeaders(env: WorkerEnv, isPublic: boolean): Headers {
  const headers = new Headers(storageCors(env, isPublic));
  headers.set(
    "Cache-Control",
    isPublic ? "public, max-age=31536000, immutable" : "private, no-store",
  );
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function storageCors(env: WorkerEnv, isPublic: boolean): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": isPublic ? "*" : env.FRONTEND_URL,
    "Access-Control-Allow-Methods": "GET,HEAD,PUT,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Range, If-None-Match",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, ETag, Accept-Ranges",
    ...(isPublic
      ? {}
      : { "Access-Control-Allow-Credentials": "true", Vary: "Origin" }),
  };
}

function storageJson(
  body: unknown,
  status: number,
  env: WorkerEnv,
  isPublic = false,
): Response {
  const headers = new Headers(storageCors(env, isPublic));
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

function reportCleanupWarnings(kind: string, id: string, warnings: string[]): void {
  if (!warnings.length) return;
  console.error(JSON.stringify({ message: "storage cleanup incomplete", kind, id, warnings }));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
