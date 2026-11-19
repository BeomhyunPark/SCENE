#!/usr/bin/env bash
# After a reboot: make sure SCENE is up and say so (docs/devops/home-server.md §재부팅 뒤 자동 시작, #410).
#
#   boot-check.sh            from cron @reboot: wait for Docker, start the stack if needed,
#                            check the public address, send one alert with the result
#   boot-check.sh --report   print each link of the boot chain (run by hand; sends nothing)
#
# Docker restarts the containers by itself (restart: unless-stopped). This script is the check and
# the alert, and a safety net for a stack that was left stopped. It never builds or pulls.
set -Eeuo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${SCENE_DEPLOY_STATE_DIR:-$HOME/.local/state/scene-deploy}"
DOCKER_WAIT_SECONDS="${SCENE_BOOT_DOCKER_WAIT:-300}"
cd "$COMPOSE_DIR"
# shellcheck source=notify.sh
source ./notify.sh
scene_notify_load .env
export SCENE_ALERT_STATE_DIR="$STATE_DIR"
SCENE_HOST="$(scene_env_value .env SCENE_HOST)"
: "${SCENE_HOST:?set SCENE_HOST in .env}"
# Same empty Docker config as auto-deploy.sh: cron has no Windows PATH for Docker Desktop's helper.
if [[ -f "$STATE_DIR/docker-config/config.json" ]]; then
  export DOCKER_CONFIG="$STATE_DIR/docker-config"
fi

log() { printf '%s [boot-check] %s\n' "$(date --iso-8601=seconds)" "$*"; }
http_code() { curl -sS -o /dev/null -m 20 -w '%{http_code}' "$1" 2>/dev/null || true; }

public_ok() {
  local base="${SCENE_DEPLOY_SMOKE_URL:-https://$SCENE_HOST}" try page api
  for try in 1 2 3 4 5 6 7 8 9 10 11 12; do
    page="$(http_code "$base/")"
    api="$(http_code "$base/api/v1/operator/me")"
    if [[ "$page" == 200 && "$api" == 401 ]]; then
      return 0
    fi
    log "public try $try: / $page, /api/v1/operator/me $api"
    sleep 15
  done
  return 1
}

# Service names and states only: no environment, no logs.
services_summary() {
  docker compose ps --all --format '{{.Service}}={{.State}}' 2>/dev/null | sort | tr '\n' ' '
}

wait_for_docker() {
  local waited=0
  until docker info >/dev/null 2>&1; do
    if ((waited >= DOCKER_WAIT_SECONDS)); then
      return 1
    fi
    sleep 5
    waited=$((waited + 5))
  done
}

on_boot() {
  local booted
  booted="$(uptime -s 2>/dev/null || echo unknown)"
  log "boot at $booted"
  if ! wait_for_docker; then
    log "ERROR: Docker did not answer within ${DOCKER_WAIT_SECONDS}s"
    scene_notify "" "$SCENE_HOST: 재부팅 감지(부팅 $booted). Docker가 ${DOCKER_WAIT_SECONDS}초 안에 뜨지 않았습니다. 서버를 확인하세요."
    exit 1
  fi
  # Starts only what is not running; existing images, no build.
  if ! timeout 900 docker compose up -d --wait >/dev/null 2>&1; then
    log "WARN: docker compose up --wait did not finish cleanly"
  fi
  if public_ok; then
    log "public address ok; services: $(services_summary)"
    scene_notify "" "$SCENE_HOST: 재부팅 뒤 다시 켜졌습니다 (부팅 $booted). 공개 주소 정상."
  else
    log "ERROR: public address not ok; services: $(services_summary)"
    scene_notify "" "$SCENE_HOST: 재부팅 뒤 공개 주소가 응답하지 않습니다 (부팅 $booted). 서비스: $(services_summary)"
    exit 1
  fi
}

check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    printf '  [ok]   %s\n' "$label"
  else
    printf '  [FAIL] %s\n' "$label"
  fi
}

has_cron_line() { crontab -l 2>/dev/null | grep -v '^[[:space:]]*#' | grep -q -- "$1"; }

report() {
  echo "SCENE boot chain ($(date --iso-8601=seconds), up since $(uptime -s 2>/dev/null || echo '?'))"
  check "systemd is PID 1 (WSL [boot] systemd=true)" test "$(ps -p 1 -o comm= 2>/dev/null)" = systemd
  check "docker.service enabled" systemctl is-enabled docker
  check "docker answers" docker info
  check "cron.service enabled" systemctl is-enabled cron
  check "cron.service running" systemctl is-active cron
  check "crontab: # scene-auto-deploy" has_cron_line scene-auto-deploy
  check "crontab: # scene-backup" has_cron_line scene-backup
  check "crontab: # scene-boot-check" has_cron_line scene-boot-check
  check "automatic deploy not paused" test ! -f "$STATE_DIR/paused"
  check "SCENE_ALERT_URL set" test -n "${SCENE_ALERT_URL:-}"
  check "SCENE_DEPLOY_HEARTBEAT_URL set" test -n "${SCENE_DEPLOY_HEARTBEAT_URL:-}"
  check "BACKUP_HEARTBEAT_URL set" test -n "${BACKUP_HEARTBEAT_URL:-}"
  check "public address (/ 200, /api 401)" test "$(http_code "https://$SCENE_HOST/")$(http_code "https://$SCENE_HOST/api/v1/operator/me")" = 200401
  echo "  services: $(services_summary)"
}

case "${1:-}" in
  "") on_boot ;;
  --report) report ;;
  *)
    echo "usage: $0 [--report]" >&2
    exit 2
    ;;
esac
