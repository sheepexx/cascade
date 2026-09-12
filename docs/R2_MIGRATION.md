# Cloudflare R2 storage

Cascade keeps Supabase Auth-compatible JWTs, PostgreSQL, RLS, Realtime, collaboration, users, project metadata, presets, and published-map metadata. Only binary project and published assets live in Cloudflare R2.

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
- `SUPABASE_STORAGE_FALLBACK=false`
- `SUPABASE_STORAGE_ALLOWANCE_BYTES=1073741824`
- `R2_STORAGE_ALLOWANCE_BYTES=10737418240`
- `MAX_ASSET_BYTES=62914560`

The allowance values power the progress meters in **Admin → Stats**. They default
to the Supabase Free storage quota and R2 Standard's monthly included storage;
update them if the project's plans change.

Validate and deploy only when ready:

```powershell
cd worker
npm install
npm run types
npm run typecheck
npx wrangler deploy --dry-run
npx wrangler deploy
```

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

## Permission behavior

Private object reads call the existing `can_view_project` RPC, so owners, editors, viewers, and admins retain the same viewing access. Private uploads and individual cleanup call `can_edit_project`, so viewers and unrelated users cannot write. Full project deletion still goes through the existing owner/admin project-delete RLS policy.

Shared uploads are stored under the authenticated user's ID. Publishing a cloud project additionally verifies that the authenticated user owns that project. Published downloads are public; private project objects never use the public route.

Short-lived, object-specific signed URLs are used for private thumbnails. Long-lived session tokens and privileged credentials are never placed in asset URLs.
