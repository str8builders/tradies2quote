#!/usr/bin/env bash
# ===========================================================================
# migrate-supabase.sh — copy your CLOUD Supabase into the SELF-HOSTED one.
#
# Moves: public schema (tables, functions, RLS, data), auth users, and
# storage metadata (bucket + object rows). The actual stored FILES are copied
# separately — see the note at the bottom.
#
# PREREQUISITES
#   * Cloud Supabase project is ACTIVE (un-paused) and you have its DB password.
#   * The self-hosted Supabase stack is already running on the VPS, so the
#     target auth/storage schemas exist (created by GoTrue/Storage on boot).
#   * postgresql-client (pg_dump/psql) v17 installed locally.
#
# USAGE
#   SOURCE_DB_URL='postgresql://postgres:PASS@db.guiovuqccbzlbacaxepd.supabase.co:5432/postgres' \
#   TARGET_DB_URL='postgresql://postgres:PASS@YOUR_VPS_IP:5432/postgres' \
#   ./deploy/migrate-supabase.sh          # dry run: dumps only, no writes
#
#   ...same env... APPLY=1 ./deploy/migrate-supabase.sh   # actually restore
#
# Always run the dry run first and inspect deploy/_dump/*.sql.
# ===========================================================================
set -euo pipefail

: "${SOURCE_DB_URL:?set SOURCE_DB_URL (cloud Supabase connection string)}"
DUMP_DIR="$(cd "$(dirname "$0")" && pwd)/_dump"
mkdir -p "$DUMP_DIR"

# Internal bookkeeping tables that the target already owns — never overwrite.
EXCLUDES=(
  --exclude-table 'auth.schema_migrations'
  --exclude-table 'storage.migrations'
  --exclude-table 'supabase_migrations.*'
)

echo ">> [1/4] Dumping PUBLIC schema (structure + data) from source..."
pg_dump "$SOURCE_DB_URL" \
  --schema=public --no-owner --no-privileges \
  --quote-all-identifiers \
  -f "$DUMP_DIR/01_public.sql"

echo ">> [2/4] Dumping AUTH users (data only) from source..."
pg_dump "$SOURCE_DB_URL" \
  --schema=auth --data-only --no-owner --no-privileges \
  --quote-all-identifiers "${EXCLUDES[@]}" \
  -f "$DUMP_DIR/02_auth_data.sql"

echo ">> [3/4] Dumping STORAGE metadata (buckets + object rows) from source..."
pg_dump "$SOURCE_DB_URL" \
  --schema=storage --data-only --no-owner --no-privileges \
  --quote-all-identifiers "${EXCLUDES[@]}" \
  -f "$DUMP_DIR/03_storage_meta.sql"

echo ">> Dumps written to $DUMP_DIR:"
ls -lh "$DUMP_DIR"

if [ "${APPLY:-0}" != "1" ]; then
  cat <<'EOF'

DRY RUN complete. No changes were made to the target.
Inspect the .sql files above, then re-run with APPLY=1 (and TARGET_DB_URL set)
to restore. Restore order is: public -> auth data -> storage meta.
EOF
  exit 0
fi

: "${TARGET_DB_URL:?set TARGET_DB_URL (self-hosted Supabase Postgres) to APPLY}"

echo ">> [4/4] Restoring into target (session_replication_role=replica to defer FKs/triggers)..."
for f in 01_public.sql 02_auth_data.sql 03_storage_meta.sql; do
  echo "   -> $f"
  psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 \
    -c 'SET session_replication_role = replica;' \
    -f "$DUMP_DIR/$f"
done

echo ">> Done. Verify row counts, then reconcile sequences if needed:"
echo "   SELECT 'quotes', count(*) FROM public.quotes;   -- etc."

cat <<'EOF'

NEXT — copy the actual STORAGE FILES (the dumps above only moved the DB rows
that reference them). Options:
  * If cloud storage is on S3: `aws s3 sync` the bucket into the self-hosted
    Storage backend, OR
  * Use `supabase storage` CLI / the Storage REST API to download each object
    from the cloud project and re-upload to the self-hosted one.
Buckets/paths are listed in storage.objects (see 03_storage_meta.sql).
EOF
