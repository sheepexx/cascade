# Backend setup: accounts, cloud maps, presets, admin

The editor is a static SPA on Vercel. Auth + storage are added via:

- **Cloudflare Worker** (`worker/`) - handles osu! OAuth, holds secrets, mints a
  Supabase JWT. Already deployed at `https://mania-editor.noahcraft01.workers.dev/`.
- **Supabase** - Postgres (data) + Realtime collaboration.
- **Cloudflare R2** - private project assets and public shared-map assets. See
  [`R2_MIGRATION.md`](./R2_MIGRATION.md) for setup.

There is **no Supabase Auth user**. The Worker mints a Supabase-compatible JWT whose
`sub` is a row id in `public.users`; Row-Level Security reads it as `auth.uid()`.

## 1. Create the Supabase project

1. Create a free project at supabase.com.
2. Apply every file in [`supabase/migrations`](../supabase/migrations) in numeric
   order (with the Supabase CLI, or by pasting each file into the SQL editor).
   These create the tables, RLS policies, migration-era Storage buckets,
   collaboration channel authorization, and Realtime publications.
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
- **Cloud maps**: chart JSON stays in `projects.data`; audio/background blobs use
  the private `cascade-projects` R2 bucket and remain tracked in `project_assets`.
- **Account sync**: preferences stay in `user_settings`; the two optional account
  skin slots keep metadata in `user_skins` and binaries under the private
  `cascade-projects` R2 binding. Cloud skin files are fetched only on request.
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

## Realtime collaboration checks

Collaboration uses private `project:<uuid>` channels for low-latency operations and
Supabase Presence, plus Postgres Changes on `projects` and `project_assets` as a
durable reconnect/fallback path. Existing projects must apply
[`0011_collab_durable_sync.sql`](../supabase/migrations/0011_collab_durable_sync.sql).
Its verification query must return both `projects` and `project_assets`.

If a channel stays offline, re-run
[`0004_realtime_enable.sql`](../supabase/migrations/0004_realtime_enable.sql) and
confirm its four verification rows as well. In **Realtime Settings**, disable
**Allow public access** so the private-channel RLS policies are enforced. No presence
table is needed; presence is ephemeral channel state.
