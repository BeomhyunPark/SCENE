#!/usr/bin/env bash
# Daily encrypted PostgreSQL backup to off-site storage (docs/devops/home-server.md §백업).
# Needs on the host: docker compose, age, rclone (with BACKUP_REMOTE configured), curl.
# Run from cron (docs/devops/home-server.md §4).
# The age private key never lives on this machine.
#
# Alerts (#409, notify.sh): a failure sends one line to SCENE_ALERT_URL. Success pings
# BACKUP_HEARTBEAT_URL, so a backup that never ran (cron off, machine down) also shows up outside.
set -Eeuo pipefail
# cron starts with a short PATH; age may live in ~/.local/bin.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$(dirname "$0")"
# shellcheck source=notify.sh
source ./notify.sh
scene_notify_load .env
export SCENE_ALERT_STATE_DIR="${SCENE_DEPLOY_STATE_DIR:-$HOME/.local/state/scene-deploy}"

step=settings
work=""
# shellcheck disable=SC2329 # called from the EXIT trap
on_exit() {
  local status="$1"
  [[ -n "$work" ]] && rm -rf "$work"
  if [[ "$status" -eq 0 ]]; then
    scene_heartbeat "${BACKUP_HEARTBEAT_URL:-}"
    scene_notify_clear backup-failed
  else
    echo "$(date --iso-8601=seconds) backup failed during '$step' (exit $status)" >&2
    scene_heartbeat "${BACKUP_HEARTBEAT_URL:-}" fail
    scene_notify backup-failed "$(scene_env_value .env SCENE_HOST): 백업 실패 ('$step' 단계, exit $status). backup.log를 확인하세요."
  fi
}
trap 'on_exit $?' EXIT

# Not `source .env`: compose allows unquoted values with spaces, the shell does not.
BACKUP_REMOTE="$(scene_env_value .env BACKUP_REMOTE)"
BACKUP_AGE_RECIPIENT="$(scene_env_value .env BACKUP_AGE_RECIPIENT)"
KEEP_DAYS="$(scene_env_value .env BACKUP_KEEP_DAYS)"
: "${BACKUP_REMOTE:?set BACKUP_REMOTE in .env}"
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT in .env}"
KEEP_DAYS="${KEEP_DAYS:-30}"

stamp="$(date +%Y%m%d-%H%M%S)"
work="$(mktemp -d)"
file="$work/scene-$stamp.sql.gz.age"

step=dump
docker compose exec -T postgres pg_dump -U scene -d scene --format=plain --no-owner \
  | gzip -9 \
  | age -r "$BACKUP_AGE_RECIPIENT" -o "$file"

# A dump smaller than 1 KB means pg_dump failed quietly.
step=size-check
if [ "$(stat -c %s "$file")" -lt 1024 ]; then
  echo "backup too small, not uploading: $file" >&2
  exit 1
fi

step=upload
rclone copy "$file" "$BACKUP_REMOTE/"
step=prune
rclone delete --min-age "${KEEP_DAYS}d" "$BACKUP_REMOTE/"
echo "uploaded $(basename "$file") to $BACKUP_REMOTE"
