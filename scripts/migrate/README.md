# Supabase → VPS data migration

For the separate Supabase Storage to Cloudflare R2 rollout, use
[`../../docs/R2_MIGRATION.md`](../../docs/R2_MIGRATION.md).

Moves your **data** (Postgres rows + Storage objects) from the hosted Supabase
project to the self-hosted Supabase running on the VPS. It does **not** create
schema - apply `supabase/migrations/*.sql` on the VPS first, which builds the
tables, RLS, functions, the `maps` bucket, and realtime.

These scripts only touch data, so they're safe to re-run.

## Prerequisites

- The VPS Supabase stack is up and `supabase/migrations/*.sql` are applied to it,
  leaving its `public` tables **empty**.
- `postgresql-client` >= 15 installed where you run the DB script
  (`sudo apt install postgresql-client-15`). Easiest to run on the VPS.
- Node >= 20.6 (for `--env-file`) with this repo's `node_modules` installed
  (the storage script imports `@supabase/supabase-js`).
- `cp scripts/migrate/.env.example scripts/migrate/.env` and fill it in.
  **Do not commit `.env`** - it holds service-role keys and DB passwords
  (already gitignored).

## Order of operations

```bash
# 1. Database rows: public schema, data only.
bash scripts/migrate/dump-db.sh

# 2. Storage objects: the maps bucket (audio + backgrounds).
#    --dry-run first to see the count, then for real.
node --env-file=scripts/migrate/.env scripts/migrate/copy-storage.mjs --dry-run
node --env-file=scripts/migrate/.env scripts/migrate/copy-storage.mjs
```

Run the DB step before storage: the project rows must exist on the destination
so `project_assets.storage_path` lines up with the objects being copied (same
paths are preserved on both sides).

## What each script does

| Script | Moves | How |
|---|---|---|
| `dump-db.sh` | `public.*` rows (users, projects, project_assets, presets, collab, feedback) | `pg_dump --data-only --schema=public --disable-triggers` from source → `psql` into dest (must be the postgres **superuser**, which bypasses RLS and lets the trigger-disable run). |
| `copy-storage.mjs` | `maps` bucket objects | Lists `storage.objects` on the source (service role), downloads each, re-uploads to the dest at the same path. Idempotent (`upsert`); `--skip-existing` resumes. |

## Flags (copy-storage.mjs)

- `--dry-run` - list what would be copied, transfer nothing.
- `--skip-existing` - skip objects already on the destination (fast re-runs /
  resume after a partial failure). Exit code is non-zero if any object failed.

## After migrating

- Repoint the Worker (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and rebuild
  the frontend (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) at the VPS.
- Verify: sign in, open **My Maps** (reads rows + signed thumbnails), open a map
  (downloads audio/bg from Storage), and a second session for realtime collab.
- Keep the hosted project read-only until you've confirmed the VPS copy, then
  decommission it.
