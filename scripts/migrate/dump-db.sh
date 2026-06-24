#!/usr/bin/env bash
#
# Migrate the Postgres DATA from a hosted Supabase project to the self-hosted
# Supabase on the VPS. Schema-free: it dumps only `public` table *data* and loads
# it into a destination DB that already has the schema (apply supabase/migrations
# there FIRST). The app's identities live entirely in public.users (no auth.users
# FK — see supabase/migrations/0001_init.sql), so public-only is complete.
#
# Storage objects are NOT handled here — run copy-storage.mjs for the maps bucket.
#
# Usage:
#   1. Apply supabase/migrations/*.sql to the VPS Postgres (creates tables, RLS,
#      functions, the `maps` bucket, realtime). The dest DB's public tables must
#      be EMPTY before this runs.
#   2. cp scripts/migrate/.env.example scripts/migrate/.env  and fill it in.
#   3. bash scripts/migrate/dump-db.sh
#
# Requires the postgresql client (pg_dump/psql) at a version >= both servers
# (Supabase is PG15): `sudo apt install postgresql-client-15`.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Auto-source scripts/migrate/.env if present (export every var it sets).
if [[ -f "$HERE/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$HERE/.env"
  set +a
fi

: "${SOURCE_DB_URL:?set SOURCE_DB_URL (hosted Supabase direct connection string)}"
: "${DEST_DB_URL:?set DEST_DB_URL (VPS Postgres superuser connection string)}"

DUMP="${1:-$HERE/public_data.sql}"

echo ">> Dumping public-schema data from source ..."
pg_dump "$SOURCE_DB_URL" \
  --data-only \
  --schema=public \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  --quote-all-identifiers \
  -f "$DUMP"
echo "   wrote $DUMP ($(du -h "$DUMP" | cut -f1))"

echo ">> Restoring into destination (triggers/FK checks disabled during load) ..."
echo "   target: ${DEST_DB_URL%@*}@${DEST_DB_URL##*@}"
psql "$DEST_DB_URL" -v ON_ERROR_STOP=1 -f "$DUMP"

echo ">> Row counts on destination:"
psql "$DEST_DB_URL" -At -c "
  select 'users',          count(*) from public.users
  union all select 'projects',       count(*) from public.projects
  union all select 'project_assets', count(*) from public.project_assets
  union all select 'presets',        count(*) from public.presets;"

echo ">> Done. Next: node --env-file=scripts/migrate/.env scripts/migrate/copy-storage.mjs"
