#!/usr/bin/env node

import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const verifyOnly = args.has("--verify-only");
const kindArg = [...args].find((arg) => arg.startsWith("--kind="));
const kind = kindArg?.slice("--kind=".length) ?? "all";

if (!new Set(["all", "projects", "shared"]).has(kind)) {
  console.error("--kind must be all, projects, or shared");
  process.exit(1);
}
if (execute && verifyOnly) {
  console.error("--execute and --verify-only cannot be used together");
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

async function projectReferences() {
  const rows = await allRows("project_assets", "id,storage_path,sha256,bytes");
  const refs = new Map();
  for (const row of rows) {
    if (!row.storage_path) continue;
    refs.set(row.storage_path, {
      bucket: "maps",
      targetBucket: PROJECT_R2_BUCKET,
      key: row.storage_path,
      sha256: row.sha256 || null,
      expectedBytes: Number(row.bytes) || null,
      optional: false,
    });
  }
  return [...refs.values()];
}

async function sharedReferences() {
  const rows = await allRows(
    "shared_maps",
    "id,owner,slug,audio_path,audio_paths,bg_path,card_path",
  );
  const refs = new Map();
  const add = (key, optional = false) => {
    if (!key || refs.has(key)) return;
    refs.set(key, {
      bucket: "shared",
      targetBucket: SHARED_R2_BUCKET,
      key,
      sha256: null,
      expectedBytes: null,
      optional,
    });
  };
  for (const row of rows) {
    add(row.audio_path);
    add(row.bg_path);
    add(row.card_path);
    for (const path of Object.values(row.audio_paths ?? {})) add(path);
    if (row.owner && row.slug) add(`${row.owner}/${row.slug}/preview.mp3`, true);
  }
  return [...refs.values()];
}

async function sourceInfo(ref) {
  const { data, error } = await supabase.storage.from(ref.bucket).info(ref.key);
  if (error || !data) {
    if (ref.optional) return null;
    throw new Error(error?.message ?? "source object not found");
  }
  return {
    size: Number(data.size),
    contentType:
      data.contentType || data.metadata?.mimetype || data.metadata?.contentType || null,
  };
}

async function targetHead(ref) {
  try {
    return await r2.send(
      new HeadObjectCommand({ Bucket: ref.targetBucket, Key: ref.key }),
    );
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === "NotFound" || error?.name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

async function hashTarget(ref) {
  const result = await r2.send(
    new GetObjectCommand({ Bucket: ref.targetBucket, Key: ref.key }),
  );
  if (!result.Body) throw new Error("R2 returned no object body");
  const hash = createHash("sha256");
  for await (const chunk of result.Body) hash.update(chunk);
  return hash.digest("hex");
}

async function hashSource(ref) {
  const response = await fetch(sourceObjectUrl(ref.bucket, ref.key), {
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

async function isIdentical(ref, info, head) {
  if (!head || Number(head.ContentLength) !== info.size) return false;
  if (!ref.sha256) {
    const [sourceSha256, targetSha256] = await Promise.all([
      hashSource(ref),
      hashTarget(ref),
    ]);
    return sourceSha256 === targetSha256;
  }
  const sourceSha256 = await hashSource(ref);
  if (sourceSha256 !== ref.sha256) {
    throw new Error("source hash differs from database metadata");
  }
  if (head.Metadata?.sha256 === ref.sha256) return true;
  return (await hashTarget(ref)) === ref.sha256;
}

function sourceObjectUrl(bucket, key) {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/${bucket}/${encoded}`;
}

async function copyObject(ref, info) {
  const response = await fetch(sourceObjectUrl(ref.bucket, ref.key), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Supabase download failed with ${response.status}`);
  }
  const responseLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(responseLength) && responseLength !== info.size) {
    throw new Error(`source size changed from ${info.size} to ${responseLength}`);
  }
  const hash = createHash("sha256");
  const hashingStream = Readable.fromWeb(response.body).pipe(
    new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
  );
  await r2.send(
    new PutObjectCommand({
      Bucket: ref.targetBucket,
      Key: ref.key,
      Body: hashingStream,
      ContentLength: info.size,
      ContentType:
        response.headers.get("content-type") || info.contentType || "application/octet-stream",
      CacheControl:
        ref.bucket === "shared"
          ? "public, max-age=31536000, immutable"
          : "private, no-store",
      Metadata: ref.sha256 ? { sha256: ref.sha256 } : undefined,
    }),
  );
  const sourceSha256 = hash.digest("hex");
  if (ref.sha256 && sourceSha256 !== ref.sha256) {
    await r2.send(
      new DeleteObjectCommand({ Bucket: ref.targetBucket, Key: ref.key }),
    );
    throw new Error("source hash differs from database metadata");
  }
  const head = await targetHead(ref);
  if (!head || !(await isIdentical(ref, info, head))) {
    throw new Error("R2 verification failed after upload");
  }
}

async function main() {
  const refs = [];
  if (kind === "all" || kind === "projects") refs.push(...(await projectReferences()));
  if (kind === "all" || kind === "shared") refs.push(...(await sharedReferences()));

  console.log(
    `${verifyOnly ? "Verification" : execute ? "R2 copy" : "R2 copy dry run"}: ${refs.length} referenced paths`,
  );
  console.log(`Projects bucket: ${PROJECT_R2_BUCKET}`);
  console.log(`Shared bucket: ${SHARED_R2_BUCKET}`);

  const summary = {
    referenced: refs.length,
    referencedBytes: 0,
    copied: 0,
    wouldCopy: 0,
    identical: 0,
    optionalMissing: 0,
    failed: 0,
  };

  for (const ref of refs) {
    try {
      const info = await sourceInfo(ref);
      if (!info) {
        summary.optionalMissing += 1;
        continue;
      }
      if (ref.expectedBytes != null && ref.expectedBytes !== info.size) {
        throw new Error(
          `database size ${ref.expectedBytes} does not match source size ${info.size}`,
        );
      }
      summary.referencedBytes += info.size;
      const head = await targetHead(ref);
      if (await isIdentical(ref, info, head)) {
        summary.identical += 1;
        console.log(`identical ${ref.targetBucket}/${ref.key}`);
        continue;
      }
      if (verifyOnly) {
        throw new Error(head ? "R2 object differs" : "R2 object missing");
      }
      if (!execute) {
        summary.wouldCopy += 1;
        console.log(`would copy ${ref.bucket}/${ref.key} -> ${ref.targetBucket}/${ref.key}`);
        continue;
      }
      await copyObject(ref, info);
      summary.copied += 1;
      console.log(`copied ${ref.targetBucket}/${ref.key}`);
    } catch (error) {
      summary.failed += 1;
      console.error(`FAIL ${ref.targetBucket}/${ref.key}: ${error.message}`);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
