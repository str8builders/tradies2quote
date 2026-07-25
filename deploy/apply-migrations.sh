#!/usr/bin/env bash
# ===========================================================================
# apply-migrations.sh — apply repo SQL migrations to the SELF-HOSTED Postgres.
#
# The VPS deploy path (rsync + systemd) ships app code but nothing applies
# supabase/migrations/*.sql — this closes that gap. Tracks applied files in
# public._applied_migrations so re-runs are idempotent and only NEW files run.
#
# USAGE (on the VPS, from the repo root):
#   ./deploy/apply-migrations.sh              # apply all pending, in name order
#   DRY_RUN=1 ./deploy/apply-migrations.sh    # list pending, change nothing
#
# Connects through the tradies Supabase db container by default; override
# with DB_CONTAINER or TARGET_DB_URL (psql connstring, bypasses docker).
# ===========================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
DB_CONTAINER="${DB_CONTAINER:-tradies-supabase-db}"

psql_run() {
  if [ -n "${TARGET_DB_URL:-}" ]; then
    psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 "$@"
  else
    docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
  fi
}

psql_file() {
  # stdin variant so the file doesn't need to exist inside the container
  if [ -n "${TARGET_DB_URL:-}" ]; then
    psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f "$1"
  else
    docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$1"
  fi
}

echo ">> Ensuring tracking table exists..."
psql_run -q <<'SQL'
create table if not exists public._applied_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
SQL

applied=$(psql_run -qAt -c "select name from public._applied_migrations;")

pending=()
for f in "$MIGRATIONS_DIR"/*.sql; do
  base="$(basename "$f")"
  case "$base" in rollback_*) continue ;; esac   # rollback scripts are manual-only
  if ! grep -qx "$base" <<<"$applied"; then
    pending+=("$f")
  fi
done

if [ ${#pending[@]} -eq 0 ]; then
  echo ">> Nothing pending — schema is up to date."
  exit 0
fi

echo ">> Pending migrations (${#pending[@]}):"
printf '   %s\n' "${pending[@]##*/}"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo ">> DRY_RUN=1 — no changes made."
  exit 0
fi

for f in "${pending[@]}"; do
  base="$(basename "$f")"
  echo ">> Applying $base ..."
  psql_file "$f"
  psql_run -q -c "insert into public._applied_migrations (name) values ('$base');"
done

echo ">> Done. ${#pending[@]} migration(s) applied."
