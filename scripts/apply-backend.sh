#!/usr/bin/env bash
set -euo pipefail
if [[ "${CONNECT_BACKEND_CONFIRMATION:-}" != 'APPLY_REVIEWED_CONNECT_BACKEND' || -z "${CONNECT_BACKUP_ID:-}" ]]; then
  echo 'Backend apply requires an explicit confirmation and a completed backup identifier.' >&2
  exit 2
fi
if [[ "${GITHUB_REPOSITORY:-}" != 'Chimera1988/connect-messenger' ]]; then
  echo 'Unexpected repository.' >&2
  exit 2
fi
node scripts/check-db-target.cjs
sha256sum --check supabase/upgrade.sha256
export PGDATABASE="$CONNECT_DATABASE_URL"
psql --no-psqlrc --set=ON_ERROR_STOP=1 --file=supabase/preflight.sql
for migration in supabase/migrations/20261118*.sql; do
  psql --no-psqlrc --set=ON_ERROR_STOP=1 --file="$migration"
done
psql --no-psqlrc --set=ON_ERROR_STOP=1 --file=supabase/preflight.sql
for function in connect-delete-account connect-delete-forever connect-media-gc-daily connect-sticker-webp-convert; do
  supabase functions deploy "$function" --project-ref "$CONNECT_PROJECT_REF" --use-api
 done
