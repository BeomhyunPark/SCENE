#!/usr/bin/env bash
# Daily encrypted PostgreSQL backup to off-site storage (docs/devops/home-server.md §백업).
# Needs on the host: docker compose, age, rclone (with BACKUP_REMOTE configured).
# The age private key never lives on this machine.
set -euo pipefail

cd "$(dirname "$0")"
set -a
# shellcheck disable=SC1091
source .env
set +a

: "${BACKUP_REMOTE:?set BACKUP_REMOTE in .env}"
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT in .env}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

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
