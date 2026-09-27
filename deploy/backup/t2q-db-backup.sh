#!/usr/bin/env bash
# Nightly Tradies2Quote backup (installed as /srv/t2q/bin/t2q-db-backup.sh,
# run by t2q-db-backup.timer as root, because it drives the database container).
#
#   - The whole database (pg_dump, custom format): public data, logins (auth)
#     and file records (storage), so a restore brings everything back.
#   - The uploaded files themselves (the Supabase storage volume).
#   - Kept 14 days in /srv/t2q/backups/nightly (root only).
#   - Every dump is read back (pg_restore --list). On Sundays it is restored
#     into a throwaway database and key row counts are compared with live,
#     then the throwaway database is dropped.
#
# These copies live on the same server. A copy somewhere else (another
# provider or cloud storage) is still needed to survive losing the server.
set -euo pipefail

DIR=/srv/t2q/backups/nightly
STORAGE_PARENT=/srv/t2q/supabase-official/docker/volumes
KEEP_DAYS=14
DB_CONTAINER=supabase-db
STAMP=$(date +%Y%m%d-%H%M)
umask 077
mkdir -p "$DIR"

dump="$DIR/t2q-db-$STAMP.dump"
files="$DIR/t2q-storage-$STAMP.tar.gz"

docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres --format=custom --no-owner --no-privileges > "$dump.partial"
mv "$dump.partial" "$dump"

# Read the dump back; it must list the core tables.
listing=$(docker exec -i "$DB_CONTAINER" pg_restore --list < "$dump")
for table in "TABLE public quotes" "TABLE public profiles" "TABLE public invoices" "TABLE auth users"; do
  if ! grep -q "$table " <<<"$listing"; then
    echo "backup check failed: '$table' missing from $dump" >&2
    exit 1
  fi
done

tar -C "$STORAGE_PARENT" -czf "$files.partial" storage
mv "$files.partial" "$files"

if [ "$(date +%u)" = 7 ] || [ "${T2Q_BACKUP_RESTORE_TEST:-0}" = 1 ]; then
  check=t2q_backup_check
  docker exec "$DB_CONTAINER" psql -U postgres -q -c "drop database if exists $check" -c "create database $check"
  # Supabase's own extensions may not all restore into a plain database;
  # what matters is that the data does, so count rows instead of failing.
  docker exec -i "$DB_CONTAINER" pg_restore -U postgres -d "$check" --no-owner --no-privileges < "$dump" > /dev/null 2>&1 || true
  mismatch=0
  for table in public.quotes public.profiles public.invoices public.materials public.clients auth.users; do
    live=$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -At -c "select count(*) from $table")
    restored=$(docker exec "$DB_CONTAINER" psql -U postgres -d "$check" -At -c "select count(*) from $table" 2>/dev/null || echo "missing")
    if [ "$live" != "$restored" ]; then
      echo "restore test: $table live=$live restored=$restored" >&2
      mismatch=1
    fi
  done
  docker exec "$DB_CONTAINER" psql -U postgres -q -c "drop database if exists $check"
  if [ "$mismatch" = 1 ]; then
    echo "restore test FAILED for $dump" >&2
    exit 1
  fi
  echo "restore test passed for $dump"
fi

find "$DIR" -maxdepth 1 -type f \( -name 't2q-db-*.dump' -o -name 't2q-storage-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "backup ok: $(du -h "$dump" | cut -f1) database, $(du -h "$files" | cut -f1) files"
