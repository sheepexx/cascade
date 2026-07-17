# Backend setup: accounts, cloud maps, presets, admin

The editor is a static SPA on Vercel. Auth + storage are added via:

- **Cloudflare Worker** (`worker/`) - handles osu! OAuth, holds secrets, mints a
  Supabase JWT. Already deployed at `https://mania-editor.noahcraft01.workers.dev/`.
- **Supabase** - Postgres (data) + Storage (audio/bg) + Realtime (future co-op).

There is **no Supabase Auth user**. The Worker mints a Supabase-compatible JWT whose
`sub` is a row id in `public.users`; Row-Level Security reads it as `auth.uid()`.

## 1. Create the Supabase project

1. Create a free project at supabase.com.
2. Open the **SQL editor**, paste the contents of
   [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql), run it.
   This creates the tables, RLS policies, the `is_admin()` helper, and the private
   `maps` storage bucket.
3. Collect these from **Project Settings**:
   - `Project URL` → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `anon` key (API) → `VITE_SUPABASE_ANON_KEY`
   - `service_role` key (API) → `SUPABASE_SERVICE_ROLE_KEY` (server only!)
   - `JWT Secret` (API → JWT Settings) → `SUPABASE_JWT_SECRET`

## 2. Configure the Worker

From `worker/`, set the remaining secrets (the osu! ones already exist):

```sh
cd worker
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SUPABASE_JWT_SECRET
npx wrangler secret put COOKIE_SECRET        # any long random string
# already set by you: CLIENT_ID, CLIENT_SECRET, FRONTEND_URL, OSU_REDIRECT_URI
npx wrangler deploy
```

- `FRONTEND_URL` must be your Vercel origin (e.g. `https://your-app.vercel.app`), no
  trailing slash. It's used for the post-login redirect and CORS.
- `OSU_REDIRECT_URI` must be
  `https://mania-editor.noahcraft01.workers.dev/auth/osu/callback` and must match the
  redirect URI registered in your osu! OAuth application.

## 3. Configure the SPA (Vercel)

Set these **Environment Variables** in the Vercel project (and `.env.local` for local
dev - see [`.env.example`](../.env.example)):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_WORKER_URL=https://mania-editor.noahcraft01.workers.dev
```

Redeploy the Vercel app so the vars are baked into the build.

## 4. Make yourself an admin

Log in once via the app (creates your `users` row), then in the Supabase SQL editor:

```sql
update public.users set is_admin = true where osu_id = <your osu! id>;
```

Reload the app - an **Admin** entry appears in the account menu.

## How it fits together

- **Login**: account button → Worker `/auth/osu/login` → osu! consent → Worker
  `/auth/osu/callback` (upserts user, sets signed session cookie) → back to the app.
- **Session**: the app calls Worker `/auth/session` (with credentials) on load and
  periodically; it returns the user + a fresh 1h Supabase token, applied to supabase-js.
- **Cloud maps**: chart JSON in `projects.data`, audio/bg blobs in the `maps` bucket
  (deduped by SHA-256), tracked in `project_assets`.
- **Presets**: copy notes in the editor → "Save as preset…" → `pending`; an admin
  approves it in the Admin panel; approved presets show in the Preset browser for all.

> **Cross-site cookie caveat:** the app (`*.vercel.app`) and Worker (`*.workers.dev`)
> are different sites, so the session cookie is `SameSite=None; Secure` and browsers
> with third-party-cookie blocking (Safari, Brave, strict modes) drop it. The login
> flow therefore also hands the session JWT to the SPA: the OAuth callback appends it
> as a `#session=` URL fragment, the SPA stores it in localStorage and sends it as an
> `Authorization: Bearer` header to `/auth/session`, which accepts either transport
> and returns a rotated `sessionToken` on every call. The cookie remains as a
> fallback for browsers that still allow it.

## Future: real-time co-op

The schema (`projects.id`) + Supabase Realtime (broadcast of note ops + presence) is the
intended path. The current single-snapshot `data` + undo model will need op-based
merging (CRDT or an authoritative server) before two editors can share one document. No
schema change is required to begin.
