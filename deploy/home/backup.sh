#!/usr/bin/env bash
# Daily encrypted PostgreSQL backup to off-site storage (docs/devops/home-server.md §백업).
# Needs on the host: docker compose, age, rclone (with BACKUP_REMOTE configured).
# The age private key never lives on this machine.
set -euo pipefail

cd "$(dirname "$0")"
# Not `source .env`: compose allows unquoted values with spaces, the shell does not.
env_value() { sed -n "s/^$1=//p" .env | tail -n 1; }
BACKUP_REMOTE="$(env_value BACKUP_REMOTE)"
BACKUP_AGE_RECIPIENT="$(env_value BACKUP_AGE_RECIPIENT)"
KEEP_DAYS="$(env_value BACKUP_KEEP_DAYS)"
: "${BACKUP_REMOTE:?set BACKUP_REMOTE in .env}"
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT in .env}"
KEEP_DAYS="${KEEP_DAYS:-30}"

stamp="$(date +%Y%m%d-%H%M%S)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
file="$work/scene-$stamp.sql.gz.age"

docker compose exec -T postgres pg_dump -U scene -d scene --format=plain --no-owner \
  | gzip -9 \
  | age -r "$BACKUP_AGE_RECIPIENT" -o "$file"

# A dump smaller than 1 KB means pg_dump failed quietly.
if [ "$(stat -c %s "$file")" -lt 1024 ]; then
  echo "backup too small, not uploading: $file" >&2
  exit 1
fi

rclone copy "$file" "$BACKUP_REMOTE/"
rclone delete --min-age "${KEEP_DAYS}d" "$BACKUP_REMOTE/"
echo "uploaded $(basename "$file") to $BACKUP_REMOTE"
