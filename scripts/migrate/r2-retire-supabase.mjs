#!/usr/bin/env node

import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const confirmed = args.has("--confirm=DELETE_MIGRATED_SUPABASE_OBJECTS");
const kindArg = [...args].find((arg) => arg.startsWith("--kind="));
const kind = kindArg?.slice("--kind=".length) ?? "all";

if (!new Set(["all", "projects", "shared"]).has(kind)) {
  console.error("--kind must be all, projects, or shared");
  process.exit(1);
}
if (execute && !confirmed) {
  console.error(
    "Execution requires both --execute and --confirm=DELETE_MIGRATED_SUPABASE_OBJECTS",
  );
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.SOURCE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SOURCE_SERVICE_ROLE_KEY;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const PROJECT_R2_BUCKET = process.env.PROJECT_R2_BUCKET ?? "cascade-projects";
const SHARED_R2_BUCKET = process.env.SHARED_R2_BUCKET ?? "cascade-shared";

for (const [name, value] of Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CLOUDFLARE_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
})) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});
const PAGE = 1000;

async function allRows(table, columns) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} query failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function references() {
  const refs = new Map();
  if (kind === "all" || kind === "projects") {
    for (const row of await allRows(
      "project_assets",
      "id,storage_path,sha256,bytes",
    )) {
      if (!row.storage_path) continue;
      refs.set(`maps:${row.storage_path}`, {
        sourceBucket: "maps",
        targetBucket: PROJECT_R2_BUCKET,
        key: row.storage_path,
        expectedSha256: row.sha256 || null,
        expectedBytes: Number(row.bytes) || null,
        optional: false,
      });
    }
  }
  if (kind === "all" || kind === "shared") {
    const add = (key, optional = false) => {
      if (!key) return;
      refs.set(`shared:${key}`, {
        sourceBucket: "shared",
        targetBucket: SHARED_R2_BUCKET,
        key,
        expectedSha256: null,
        expectedBytes: null,
        optional,
      });
    };
    for (const row of await allRows(
      "shared_maps",
      "id,owner,slug,audio_path,audio_paths,bg_path,card_path",
    )) {
      add(row.audio_path);
      add(row.bg_path);
      add(row.card_path);
      for (const path of Object.values(row.audio_paths ?? {})) add(path);
      if (row.owner && row.slug) add(`${row.owner}/${row.slug}/preview.mp3`, true);
    }
  }
  return [...refs.values()];
}

function sourceUrl(ref) {
  const encoded = ref.key.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/${ref.sourceBucket}/${encoded}`;
}

async function sourceInfo(ref) {
  const { data, error } = await supabase.storage
    .from(ref.sourceBucket)
    .info(ref.key);
  if (error || !data) {
    if (ref.optional) return null;
    throw new Error(error?.message ?? "source object missing");
  }
  return { size: Number(data.size) };
}

async function sourceHash(ref) {
  const response = await fetch(sourceUrl(ref), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Supabase download failed with ${response.status}`);
  }
  const hash = createHash("sha256");
  for await (const chunk of response.body) hash.update(chunk);
  return hash.digest("hex");
}

async function targetHead(ref) {
  try {
    return await r2.send(
      new HeadObjectCommand({ Bucket: ref.targetBucket, Key: ref.key }),
    );
  } catch (error) {
    if (
      error?.$metadata?.httpStatusCode === 404 ||
      error?.name === "NotFound" ||
      error?.name === "NoSuchKey"
    ) {
      return null;
    }
    throw error;
  }
}

async function targetHash(ref) {
  const result = await r2.send(
    new GetObjectCommand({ Bucket: ref.targetBucket, Key: ref.key }),
  );
  if (!result.Body) throw new Error("R2 returned no object body");
  const hash = createHash("sha256");
  for await (const chunk of result.Body) hash.update(chunk);
  return hash.digest("hex");
}

async function removeSource(bucket, paths) {
  for (let index = 0; index < paths.length; index += 100) {
    const batch = paths.slice(index, index + 100);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw new Error(`${bucket} delete failed: ${error.message}`);
  }
}

async function main() {
  const refs = await references();
  const approved = { maps: [], shared: [] };
  let verifiedBytes = 0;
  let optionalMissing = 0;
  let failed = 0;

  console.log(
    `Supabase retirement ${execute ? "execute" : "dry run"}: ${refs.length} referenced paths`,
  );
  for (const ref of refs) {
    try {
      const info = await sourceInfo(ref);
      if (!info) {
        optionalMissing += 1;
        continue;
      }
      if (ref.expectedBytes != null && ref.expectedBytes !== info.size) {
        throw new Error("source size differs from database metadata");
      }
      const head = await targetHead(ref);
      if (!head) throw new Error("R2 object missing");
      if (Number(head.ContentLength) !== info.size) throw new Error("R2 size differs");
      const [sourceSha256, targetSha256] = await Promise.all([
        sourceHash(ref),
        targetHash(ref),
      ]);
      if (ref.expectedSha256 && sourceSha256 !== ref.expectedSha256) {
        throw new Error("Supabase object hash differs from database metadata");
      }
      if (sourceSha256 !== targetSha256) throw new Error("R2 hash differs");
      approved[ref.sourceBucket].push(ref.key);
      verifiedBytes += info.size;
      console.log(`${execute ? "verified" : "would remove"} ${ref.sourceBucket}/${ref.key}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${ref.sourceBucket}/${ref.key}: ${error.message}`);
    }
  }

  if (execute && failed === 0) {
    await removeSource("maps", approved.maps);
    await removeSource("shared", approved.shared);
  } else if (execute && failed > 0) {
    console.error("No source objects were deleted because verification had failures.");
  }

  console.log(
    JSON.stringify(
      {
        referenced: refs.length,
        verified: approved.maps.length + approved.shared.length,
        verifiedBytes,
        optionalMissing,
        failed,
        deleted: execute && failed === 0,
      },
      null,
      2,
    ),
  );
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
