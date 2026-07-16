#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const {
  SOURCE_SUPABASE_URL,
  SOURCE_SERVICE_ROLE_KEY,
  DEST_SUPABASE_URL,
  DEST_SERVICE_ROLE_KEY,
  BUCKET = "maps",
} = process.env;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipExisting = args.has("--skip-existing");

for (const [name, val] of Object.entries({
  SOURCE_SUPABASE_URL,
  SOURCE_SERVICE_ROLE_KEY,
  DEST_SUPABASE_URL,
  DEST_SERVICE_ROLE_KEY,
})) {
  if (!val) {
    console.error(`Missing required env: ${name} (see scripts/migrate/.env.example)`);
    process.exit(1);
  }
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const src = createClient(SOURCE_SUPABASE_URL, SOURCE_SERVICE_ROLE_KEY, opts);
const dest = createClient(DEST_SUPABASE_URL, DEST_SERVICE_ROLE_KEY, opts);

const PAGE = 1000;

const MIME = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
};
function guessType(name, fallback) {
  const ext = name.split(".").pop()?.toLowerCase();
  return (ext && MIME[ext]) || fallback || "application/octet-stream";
}

async function listObjectNames(client, label) {
  try {
    const names = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .schema("storage")
        .from("objects")
        .select("name")
        .eq("bucket_id", BUCKET)
        .order("name")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      for (const r of data) if (r.name) names.push(r.name);
      if (data.length < PAGE) break;
    }
    return names;
  } catch (e) {
    console.warn(
      `[${label}] storage.objects not readable (${e.message}); ` +
        `falling back to project_assets.storage_path`,
    );
    const names = new Set();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from("project_assets")
        .select("storage_path")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`${label} project_assets list failed: ${error.message}`);
      if (!data?.length) break;
      for (const r of data) if (r.storage_path) names.add(r.storage_path);
      if (data.length < PAGE) break;
    }
    return [...names];
  }
}

async function main() {
  console.log(`Bucket "${BUCKET}"${dryRun ? "  (dry run)" : ""}`);
  console.log(`  source: ${SOURCE_SUPABASE_URL}`);
  console.log(`  dest:   ${DEST_SUPABASE_URL}\n`);

  const srcNames = await listObjectNames(src, "source");
  console.log(`Source objects: ${srcNames.length}`);

  let existing = new Set();
  if (skipExisting) {
    try {
      existing = new Set(await listObjectNames(dest, "dest"));
      console.log(`Dest already has: ${existing.size}`);
    } catch (e) {
      console.warn(`Could not list dest objects (${e.message}); copying all.`);
    }
  }

  let copied = 0;
  let skipped = 0;
  const failures = [];

  for (const name of srcNames) {
    if (skipExisting && existing.has(name)) {
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`would copy ${name}`);
      copied++;
      continue;
    }
    try {
      const dl = await src.storage.from(BUCKET).download(name);
      if (dl.error || !dl.data) {
        throw new Error(dl.error?.message ?? "download returned no data");
      }
      const buf = Buffer.from(await dl.data.arrayBuffer());
      const up = await dest.storage.from(BUCKET).upload(name, buf, {
        upsert: true,
        contentType: guessType(name, dl.data.type),
      });
      if (up.error) throw new Error(up.error.message);
      copied++;
      if (copied % 25 === 0) console.log(`  ${copied}/${srcNames.length} ...`);
    } catch (err) {
      failures.push({ name, error: err.message });
      console.error(`FAIL ${name}: ${err.message}`);
    }
  }

  console.log(`\nCopied ${copied}, skipped ${skipped}, failed ${failures.length}`);
  if (failures.length) {
    console.error("Some objects failed — re-run with --skip-existing to retry only the rest.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
