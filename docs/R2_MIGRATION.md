# Cloudflare R2 migration

Cascade keeps Supabase Auth-compatible JWTs, PostgreSQL, RLS, Realtime, collaboration, users, project metadata, presets, and published-map metadata. Only binary project and published assets move to Cloudflare R2.

## Rollout order

Use this order so existing maps continue loading:

1. Create the two R2 buckets.
2. Apply `supabase/migrations/0022_r2_storage_metadata.sql`.
3. Configure the existing Worker secrets and deploy the Worker.
4. Redeploy the Vercel frontend.
5. Run the R2 copy in dry-run mode, execute it, and verify it.
6. Leave `SUPABASE_STORAGE_FALLBACK` set to `true` while monitoring the migration.
7. After every referenced object verifies in R2, change the flag to `false`, redeploy the Worker, and monitor again.
8. Retire the old Supabase copies only after the rollback window has passed.

Do not empty or delete either Supabase Storage bucket during the initial rollout.

## Cloudflare dashboard

### Create the buckets

1. Open Cloudflare Dashboard.
2. Go to **R2 Object Storage**.
3. Create a bucket named exactly `cascade-projects`.
4. Create a bucket named exactly `cascade-shared`.
5. Keep `cascade-projects` private. Never enable its `r2.dev` URL or attach a public domain.
6. `cascade-shared` can also stay private. The Worker exposes only its public download route, so no custom domain or `r2.dev` URL is required.

The bindings are already declared in `worker/wrangler.jsonc`:

| Binding | Bucket |
|---|---|
| `PROJECT_ASSETS` | `cascade-projects` |
| `SHARED_ASSETS` | `cascade-shared` |

### Confirm Worker secrets

The following remain encrypted Worker secrets and must already exist in the production Worker:

```powershell
cd worker
npx wrangler secret put CLIENT_SECRET
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SUPABASE_JWT_SECRET
npx wrangler secret put COOKIE_SECRET
```

Enter values only in Wrangler's interactive prompt. Do not put them in `wrangler.jsonc`, Vercel variables, source code, or shell command arguments.

These non-secret values are already in `worker/wrangler.jsonc`:

- `SUPABASE_URL`
- `FRONTEND_URL`
- `OSU_REDIRECT_URI`
- `SUPABASE_STORAGE_FALLBACK=true`
- `MAX_ASSET_BYTES=62914560`

Validate and deploy only when ready:

```powershell
cd worker
npm install
npm run types
npm run typecheck
npx wrangler deploy --dry-run
npx wrangler deploy
```

### Create a migration API token

The offline migration scripts use R2's S3-compatible API. In **R2 Object Storage → Manage R2 API Tokens**, create a token with Object Read & Write access scoped only to `cascade-projects` and `cascade-shared`.

Record:

- Cloudflare account ID
- R2 access key ID
- R2 secret access key

These values belong only in `scripts/migrate/.env`, which is gitignored. They are not Worker secrets and must never be added to the frontend.

## Supabase dashboard

Apply `supabase/migrations/0022_r2_storage_metadata.sql` in the SQL Editor or with the Supabase CLI. It adds:

- transactional RPCs for replacing project asset metadata;
- `asset_count` and `asset_bytes` metadata on `shared_maps`;
- an admin summary function that reads those metadata columns instead of Supabase Storage internals.

The migration backfills published-map storage totals from the existing `shared` bucket. It does not delete or move objects.

Leave all of these untouched:

- users, projects, collaborators, comments, notifications, presets, and shared-map rows;
- all RLS policies and `can_view_project` / `can_edit_project` functions;
- Realtime publications and private collaboration channels;
- the existing `maps` and `shared` Storage buckets during the fallback window.

No existing `storage_path` values change.

## Vercel frontend

No new browser secret or R2 credential is required. Keep the existing variables:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_WORKER_URL=https://YOUR_WORKER.workers.dev
```

Redeploy after the Worker is live. The frontend now sends binary operations through `VITE_WORKER_URL`. The Content Security Policy allows media from the Worker.

## Local development

Create local Worker secrets without committing them:

```powershell
Copy-Item worker/.dev.vars.example worker/.dev.vars
```

Fill in `worker/.dev.vars`, then run:

```powershell
cd worker
npm install
npm run types
npm run dev
```

Wrangler uses local R2 persistence by default. Point the frontend's local `VITE_WORKER_URL` at the Wrangler URL, normally `http://localhost:8787`, and run the frontend:

```powershell
npm install
npm run dev
```

Before a real deployment, run:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
cd worker
npm run typecheck
npx wrangler deploy --dry-run
```

## Migration commands

Create the ignored migration environment file:

```powershell
Copy-Item scripts/migrate/.env.r2.example scripts/migrate/.env
```

Fill in every value in `scripts/migrate/.env`.

### 1. Audit current Supabase orphans

This is always a dry run unless both destructive flags are supplied:

```powershell
node --env-file=scripts/migrate/.env scripts/migrate/storage-orphans.mjs
```

It prints object count, referenced bytes, orphaned bytes, and every orphan path for both `maps` and `shared`.

If the report has been reviewed and the listed paths are definitely disposable:

```powershell
node --env-file=scripts/migrate/.env scripts/migrate/storage-orphans.mjs --execute --confirm=DELETE_ORPHANS
```

### 2. Dry-run the R2 copy

```powershell
node --env-file=scripts/migrate/.env scripts/migrate/r2-copy.mjs
```

The script reads database references, checks the source object, checks R2, compares sizes, and uses the stored SHA-256 for project assets. It does not copy without `--execute`.

### 3. Copy referenced objects to R2

```powershell
node --env-file=scripts/migrate/.env scripts/migrate/r2-copy.mjs --execute
```

The copy is idempotent and resumable. Identical objects are skipped, failures are reported individually, and Supabase objects are never deleted.

To limit a run:

```powershell
node --env-file=scripts/migrate/.env scripts/migrate/r2-copy.mjs --execute --kind=projects
node --env-file=scripts/migrate/.env scripts/migrate/r2-copy.mjs --execute --kind=shared
```

### 4. Verify R2

```powershell
node --env-file=scripts/migrate/.env scripts/migrate/r2-copy.mjs --verify-only
```

The command exits non-zero if an R2 object is absent or different. Run it again after fixing any reported failures.

### 5. Eventually retire the old Supabase copies

First disable the fallback, deploy, and observe production through an agreed rollback window. Then run the retirement dry run. It streams and hashes both copies and refuses all deletion if any verification fails:

```powershell
node --env-file=scripts/migrate/.env scripts/migrate/r2-retire-supabase.mjs
```

Only after reviewing that output should the old referenced copies be deleted:

```powershell
node --env-file=scripts/migrate/.env scripts/migrate/r2-retire-supabase.mjs --execute --confirm=DELETE_MIGRATED_SUPABASE_OBJECTS
```

Keep the empty Supabase buckets until the migration is fully closed out. Bucket deletion is a separate manual decision.

## Permission behavior

Private object reads call the existing `can_view_project` RPC, so owners, editors, viewers, and admins retain the same viewing access. Private uploads and individual cleanup call `can_edit_project`, so viewers and unrelated users cannot write. Full project deletion still goes through the existing owner/admin project-delete RLS policy.

Shared uploads are stored under the authenticated user's ID. Publishing a cloud project additionally verifies that the authenticated user owns that project. Published downloads are public; private project objects never use the public route.

Short-lived, object-specific signed URLs are used for private thumbnails. Long-lived session tokens and privileged credentials are never placed in asset URLs.

## Rollback

While `SUPABASE_STORAGE_FALLBACK=true` and the old Supabase files remain present, reads try R2 first and then Supabase. To roll back the frontend/Worker code, redeploy the previous versions; database paths have not changed. Do not run the retirement script until that rollback option is no longer needed.
