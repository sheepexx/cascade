#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const confirmed = args.has("--confirm=DELETE_ORPHANS");
const bucketArg = [...args].find((arg) => arg.startsWith("--bucket="));
const bucketChoice = bucketArg?.slice("--bucket=".length) ?? "all";

if (!new Set(["all", "maps", "shared"]).has(bucketChoice)) {
  console.error("--bucket must be all, maps, or shared");
  process.exit(1);
}
if (execute && !confirmed) {
  console.error("Execution requires both --execute and --confirm=DELETE_ORPHANS");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.SOURCE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SOURCE_SERVICE_ROLE_KEY;

for (const [name, value] of Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
})) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
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
  const maps = new Set();
  const shared = new Set();
  const projectRows = await allRows("project_assets", "id,storage_path");
  for (const row of projectRows) if (row.storage_path) maps.add(row.storage_path);
  const sharedRows = await allRows(
    "shared_maps",
    "id,owner,slug,audio_path,audio_paths,bg_path,card_path",
  );
  for (const row of sharedRows) {
    for (const path of [row.audio_path, row.bg_path, row.card_path]) {
      if (path) shared.add(path);
    }
    for (const path of Object.values(row.audio_paths ?? {})) {
      if (path) shared.add(path);
    }
    if (row.owner && row.slug) shared.add(`${row.owner}/${row.slug}/preview.mp3`);
  }
  return { maps, shared };
}

async function listObjects(bucket) {
  const objects = [];
  const pending = [""];
  let visited = 0;
  while (pending.length) {
    const folder = pending.shift();
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase.storage.from(bucket).list(folder, {
        limit: PAGE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`${bucket} list failed: ${error.message}`);
      for (const entry of data ?? []) {
        const path = folder ? `${folder}/${entry.name}` : entry.name;
        if (entry.id) {
          const metadata = entry.metadata ?? {};
          objects.push({ path, bytes: Number(metadata.size) || 0 });
        } else {
          pending.push(path);
        }
        visited += 1;
        if (visited > 1_000_000) throw new Error(`${bucket} traversal limit exceeded`);
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return objects;
}

async function auditBucket(bucket, referenced) {
  const objects = await listObjects(bucket);
  const orphaned = objects.filter((object) => !referenced.has(object.path));
  const referencedBytes = objects
    .filter((object) => referenced.has(object.path))
    .reduce((sum, object) => sum + object.bytes, 0);
  const orphanedBytes = orphaned.reduce((sum, object) => sum + object.bytes, 0);

  console.log(`\n${bucket}${execute ? " execute" : " dry run"}`);
  console.log(`object count: ${objects.length}`);
  console.log(`referenced bytes: ${referencedBytes}`);
  console.log(`orphaned bytes: ${orphanedBytes}`);
  console.log(`orphaned paths: ${orphaned.length}`);
  for (const object of orphaned) console.log(`${execute ? "remove" : "would remove"} ${object.path}`);

  if (execute) {
    for (let index = 0; index < orphaned.length; index += 100) {
      const paths = orphaned.slice(index, index + 100).map((object) => object.path);
      if (!paths.length) continue;
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) throw new Error(`${bucket} delete failed: ${error.message}`);
    }
  }

  return {
    bucket,
    objectCount: objects.length,
    referencedBytes,
    orphanedBytes,
    orphanedCount: orphaned.length,
  };
}

async function main() {
  const refs = await references();
  const summary = [];
  if (bucketChoice === "all" || bucketChoice === "maps") {
    summary.push(await auditBucket("maps", refs.maps));
  }
  if (bucketChoice === "all" || bucketChoice === "shared") {
    summary.push(await auditBucket("shared", refs.shared));
  }
  console.log(`\n${JSON.stringify(summary, null, 2)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
