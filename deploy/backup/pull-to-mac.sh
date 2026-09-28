#!/bin/bash
# Off-server copy of the nightly Tradies2Quote backups, on the owner's Mac.
#
# Installed as ~/Library/Application Support/T2QBackup/pull-to-mac.sh and run by
# ~/Library/LaunchAgents/com.str8builders.t2q-backup-pull.plist (07:15 and
# 19:15; launchd runs a missed time when the Mac wakes).
#
# The server keeps 14 days in /srv/t2q/backups/nightly (t2q-db-backup.sh).
# This copies them into an encrypted disk image (AES-256), so losing the
# server or the hosting account loses nothing, and a lost laptop exposes
# nothing: the image's password is in the login Keychain ("T2Q backup disk").
# Kept 60 days here.
#
# Restore: open ~/Backups/T2QBackups.sparsebundle (the password is in Keychain
# Access under "T2Q backup disk"); the dumps are in nightly/. See
# deploy/README.md for pg_restore.
set -euo pipefail

IMG="$HOME/Backups/T2QBackups.sparsebundle"
MNT="$HOME/Backups/.t2q-mount"
LOG="$HOME/Backups/t2q-backup-pull.log"
KEEP_DAYS=60

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

PW=$(security find-generic-password -a t2q-backup -s "T2Q backup disk" -w)
mkdir -p "$MNT"
if ! mount | grep -q " on $MNT "; then
  printf '%s' "$PW" | hdiutil attach -stdinpass -nobrowse -noverify -mountpoint "$MNT" "$IMG" >/dev/null
fi
trap 'hdiutil detach "$MNT" >/dev/null 2>&1 || hdiutil detach -force "$MNT" >/dev/null 2>&1 || true' EXIT

mkdir -p "$MNT/nightly"
if rsync -a --partial --timeout=120 -e "ssh -o BatchMode=yes -o ConnectTimeout=20" \
  str8-sydney:/srv/t2q/backups/nightly/ "$MNT/nightly/"; then
  find "$MNT/nightly" -type f -mtime +"$KEEP_DAYS" -delete
  newest=$(ls -t "$MNT/nightly" | head -1)
  log "ok: $(ls "$MNT/nightly" | wc -l | tr -d ' ') files, newest $newest"
else
  log "FAILED: could not copy from the server (offline or asleep?)"
  exit 1
fi
