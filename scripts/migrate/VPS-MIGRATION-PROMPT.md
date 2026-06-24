# VPS migration — handoff prompt

Paste this into a new Claude Code session once the VPS exists (or just say:
"Read scripts/migrate/VPS-MIGRATION-PROMPT.md and let's do it"). It captures all
the context and decisions so you don't have to re-derive them — but **verify
against the actual repo before acting; don't trust this doc over the code.**

---

## What I want

Migrate this app off **Vercel + hosted Supabase** onto a **self-hosted Ubuntu
VPS**, while keeping the **Cloudflare Worker (and all secrets) on Cloudflare**.
I now have the VPS. Help me execute the migration end-to-end. Don't change any
app features — this is infra only.

## Current architecture (verify in code)

- **Frontend:** React + Vite SPA (`src/`), currently built by Vercel. Talks to
  Supabase directly from the browser via `@supabase/supabase-js`.
- **Backend:** hosted Supabase — PostgREST (RLS), RPC functions, a private
  Storage bucket `maps`, and Realtime (co-op editing). Schema/RLS/functions/
  bucket/realtime all live in `supabase/migrations/*.sql`.
- **Auth:** a Cloudflare Worker (`worker/src/index.ts`) does osu! OAuth and mints
  a Supabase-compatible **HS256 JWT** (signed with the Supabase JWT secret;
  `sub` = `public.users.id`, read by `auth.uid()` in RLS). There is **no GoTrue
  / Supabase Auth session**; identities live in `public.users` with no
  `auth.users` FK.
- **Files to read first:** `worker/src/index.ts`, `src/lib/supabase.ts`,
  `src/lib/cloud.ts`, `src/hooks/useCollab.ts`, `supabase/migrations/*.sql`,
  `.env.example`, `vercel.json`, `vite.config.ts`, and `scripts/migrate/*`.

## Decisions already locked in

1. **Self-host the full Supabase stack via Docker Compose** (don't rewrite the
   backend). The app is deeply coupled to PostgREST + Storage + Realtime +
   `auth.uid()`, so the official compose is by far the lowest-risk path.
2. **Reuse the existing Supabase JWT secret** on the VPS, so the existing anon +
   service-role keys keep working. Cutover then = repoint two URLs. (Rotate the
   secret/keys later as a separate hardening step.)
3. **Edge/TLS = Cloudflare proxy + a Cloudflare Origin Certificate** (no new
   vendor — Cloudflare already hosts my DNS + Worker; no cert-renewal cron; hides
   the VPS IP; WebSockets pass through for Realtime).
4. **Domains:** keep the app at `cascade.sheepex.net`; add `api.sheepex.net` for
   the VPS Supabase API. (Confirm these with me — derived from `vercel.json`.)
5. **Workflow:** parallel-run with a dress rehearsal, then a short maintenance
   window for cutover, with rollback by reverting DNS + the Worker's
   `SUPABASE_URL`. Nothing on Vercel/hosted-Supabase is deleted until verified.

## Already done in this repo

- `scripts/migrate/dump-db.sh` — `pg_dump --data-only --schema=public
  --disable-triggers` from hosted Supabase → `psql` into the VPS DB.
- `scripts/migrate/copy-storage.mjs` — copies the `maps` bucket object-by-object
  through the Storage API (idempotent; `--dry-run`, `--skip-existing`).
- `scripts/migrate/.env.example` + `README.md`.

## Your tasks (in order)

**Phase 1 — stand up the stack** (rehearse locally with Docker first if I haven't)
- Produce a Supabase `docker-compose` + documented `.env`, trimmed to what this
  app uses: keep `db`, `kong`, `rest` (PostgREST), `realtime`, `storage`
  (file backend), `meta`, and `auth` (GoTrue — kept only so the `auth.*` helper
  schema exists, not exposed). Drop/disable analytics (logflare/vector),
  imgproxy, edge-functions, and external Studio to fit a small box.
- Set `JWT_SECRET`/`ANON_KEY`/`SERVICE_ROLE_KEY` to my existing values;
  `API_EXTERNAL_URL=https://api.sheepex.net`, `SITE_URL=https://cascade.sheepex.net`.
- Apply `supabase/migrations/*.sql` to the VPS DB (creates tables, RLS, RPC, the
  `maps` bucket, realtime). Confirm `realtime.messages` policies + the
  `supabase_realtime` publication applied.

**Phase 2 — nginx + TLS + frontend deploy**
- nginx: serve `dist/` for `cascade.sheepex.net` with SPA history fallback;
  reverse-proxy `api.sheepex.net` → Kong `:8000` **with WebSocket upgrade
  headers** (Realtime). Install the Cloudflare Origin Cert; set Cloudflare SSL
  mode to Full (strict).
- A build + `rsync` deploy script for the frontend (built with the VPS
  `VITE_*` envs).

**Phase 3 — migrate data** (dress rehearsal, prod still live)
- Run `scripts/migrate/dump-db.sh` then `scripts/migrate/copy-storage.mjs`.
- Smoke-test off a temporary host. **Test the riskiest path first:** sign in →
  load "My Maps" (a SELECT under RLS using a Worker-minted token). Then save,
  reopen (Storage download), and a second session (Realtime collab).

**Phase 4 — cutover + verify**
- Short write-freeze → final delta sync → flip the frontend DNS to the VPS and
  the Worker's `SUPABASE_URL`. Verify on the real domain.
- Keep Vercel + hosted Supabase untouched for a few days as rollback. Then
  (optionally) rotate keys and decommission.

## Env / secret mapping (the cutover essence)

- **Frontend** (public, baked at build): `VITE_SUPABASE_URL` → `https://api.sheepex.net`;
  `VITE_SUPABASE_ANON_KEY` → *reused*; `VITE_WORKER_URL` → unchanged.
- **Worker** (Cloudflare, secret): `SUPABASE_URL` → `https://api.sheepex.net`;
  `SUPABASE_SERVICE_ROLE_KEY` → *reused*; `SUPABASE_JWT_SECRET`, osu
  `CLIENT_ID`/`CLIENT_SECRET`, `COOKIE_SECRET`, `FRONTEND_URL`,
  `OSU_REDIRECT_URI` → unchanged.
- **VPS Supabase `.env`:** `JWT_SECRET` = existing; `ANON_KEY`/`SERVICE_ROLE_KEY`
  = existing; plus `POSTGRES_PASSWORD`, dashboard creds, encryption keys.

## What I'll provide / you should ask me for

- VPS IP, Ubuntu version, RAM/disk; whether Docker is installed.
- Confirmation of the `api.sheepex.net` subdomain.
- The secrets (JWT secret, service-role key, DB password, osu creds) — I'll set
  them as env / in untracked files; **never commit them or print them back.**
- Confirm: reuse the JWT secret (default) or rotate now.

## Constraints

- Infra only — do not change app features or runtime behavior.
- Keep secrets out of git (`scripts/migrate/.env` and any compose `.env` are
  gitignored — verify). Don't echo secret values into the chat.
- Prefer fewest third-party services; reuse Cloudflare (already in the stack).
- Verify each phase before moving on; keep prod live and rollback-able.

## First steps when this fires

1. Re-read the files listed above to refresh/verify the current state.
2. Ask me for the VPS details + confirm the domain + reuse-vs-rotate.
3. Start with the Phase 1 `docker-compose` + `.env` template.
