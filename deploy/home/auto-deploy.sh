#!/usr/bin/env bash
# Pull-based auto deploy for the home server (docs/devops/home-server.md §자동 배포, #257).
# Run from cron every few minutes. Deploys origin/main once its CI checks have passed.
#
#   auto-deploy.sh                  deploy if origin/main moved (cron)
#   auto-deploy.sh --force          rebuild and redeploy the current origin/main even if nothing moved,
#                                   also while paused (the deliberate manual deploy during a freeze)
#   auto-deploy.sh --pause [reason] stop automatic deploys until --resume (deploy freeze, #411)
#   auto-deploy.sh --resume         start automatic deploys again
#   auto-deploy.sh --status         show pause state and which commit runs
#   auto-deploy.sh --test-alert     send one test line to SCENE_ALERT_URL
#
# Freeze from GitHub (#411): while origin/main has deploy/home/FREEZE, nothing is deployed unless the
# newest commit message has the line "Deploy-During-Freeze: yes" (the urgent fix during a freeze).
# --pause works only on this machine; FREEZE works from anywhere, for example from the retreat site.
#
# Alerts (#409, deploy/home/notify.sh): SCENE_ALERT_URL in .env gets a line on every deploy, failure
# and rollback; SCENE_DEPLOY_HEARTBEAT_URL is pinged on every run that ends normally, so a stopped
# cron or a dead machine shows up outside. Both may be empty: then nothing is sent.
#
# Needs on the host: git, docker compose, gh (logged in), curl, flock.
set -Eeuo pipefail
umask 077
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

REPO_DIR="${SCENE_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
COMPOSE_DIR="$REPO_DIR/deploy/home"
STATE_DIR="${SCENE_DEPLOY_STATE_DIR:-$HOME/.local/state/scene-deploy}"
BACKUP_DIR="${SCENE_DEPLOY_BACKUP_DIR:-$HOME/scene-backups}"
KEEP_BACKUPS="${SCENE_DEPLOY_KEEP_BACKUPS:-10}"
GH_REPO="${SCENE_DEPLOY_GH_REPO:-BeomhyunPark/SCENE}"
BRANCH=main
REQUIRED_CHECKS=(ci-ok docs-check)
# A change outside these paths cannot change what is running, so it needs no rebuild.
RUNTIME_PATHS=(backend frontend deploy/home/compose.yaml)
PAUSE_FILE="$STATE_DIR/paused"
FREEZE_PATH=deploy/home/FREEZE
FREEZE_TRAILER='^Deploy-During-Freeze:[[:space:]]*yes[[:space:]]*$'

# shellcheck source=notify.sh
source "$COMPOSE_DIR/notify.sh"

log() { printf '%s [auto-deploy] %s\n' "$(date --iso-8601=seconds)" "$*"; }

# Prints: success | pending | failure
ci_state() {
  local sha="$1" runs name line state=success
  runs="$(gh api "repos/$GH_REPO/commits/$sha/check-runs?per_page=100" \
    -q '.check_runs[] | [.name, .status, (.conclusion // "")] | @tsv')" || { echo pending; return; }
  for name in "${REQUIRED_CHECKS[@]}"; do
    # The newest run of a check is listed first.
    line="$(awk -F'\t' -v n="$name" '$1 == n { print; exit }' <<<"$runs")"
    if [[ -z "$line" ]]; then
      state=pending
    elif [[ "$(cut -f2 <<<"$line")" != completed ]]; then
      state=pending
    elif [[ "$(cut -f3 <<<"$line")" != success ]]; then
      echo failure
      return
    fi
  done
  echo "$state"
}

http_code() { curl -sS -o /dev/null -m 20 -w '%{http_code}' "$1" 2>/dev/null || true; }

# The whole chain from outside: Cloudflare -> tunnel -> nginx -> backend.
smoke() {
  local base="${SCENE_DEPLOY_SMOKE_URL:-https://$SCENE_HOST}" try page api
  for try in 1 2 3 4 5 6; do
    page="$(http_code "$base/")"
    api="$(http_code "$base/api/v1/operator/me")"
    if [[ "$page" == 200 && "$api" == 401 ]]; then
      log "smoke ok: / 200, /api/v1/operator/me 401"
      return 0
    fi
    log "smoke try $try: / $page, /api/v1/operator/me $api"
    sleep 10
  done
  return 1
}

backup() {
  local sha="$1" file
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  file="$BACKUP_DIR/pre-deploy-$(date +%Y%m%d-%H%M%S)-${sha:0:7}.sql.gz"
  # Checked explicitly: main calls this inside `if`, where set -e does not apply.
  if ! docker compose exec -T postgres pg_dump -U scene -d scene --format=plain --no-owner | gzip -9 >"$file"; then
    log "ERROR: pre-deploy dump failed: $file"
    rm -f "$file"
    return 1
  fi
  if [[ "$(stat -c %s "$file")" -lt 1024 ]]; then
    log "ERROR: pre-deploy dump is too small: $file"
    return 1
  fi
  log "pre-deploy dump: $file"
  # Keep only the newest dumps; they hold personal data.
  find "$BACKUP_DIR" -maxdepth 1 -name 'pre-deploy-*.sql.gz' -printf '%T@ %p\n' \
    | sort -rn | tail -n +"$((KEEP_BACKUPS + 1))" | cut -d' ' -f2- | xargs -r rm -f --
}

# cron has no Windows PATH, so Docker Desktop's credsStore (docker-credential-desktop.exe) in
# ~/.docker/config.json fails every image pull. All images here are public: use an empty config.
docker_config() {
  export DOCKER_CONFIG="$STATE_DIR/docker-config"
  mkdir -p "$DOCKER_CONFIG"
  [[ -f "$DOCKER_CONFIG/config.json" ]] || echo '{}' >"$DOCKER_CONFIG/config.json"
  # Keep the compose and buildx plugins the user installed.
  if [[ -d "$HOME/.docker/cli-plugins" && ! -e "$DOCKER_CONFIG/cli-plugins" ]]; then
    ln -s "$HOME/.docker/cli-plugins" "$DOCKER_CONFIG/cli-plugins"
  fi
}

build() { docker compose build --pull; }
up() { docker compose up -d --wait; }

STEP=start
HANDLED=false # set when the script decided to stop with an error and already said why
alert() { scene_notify "${2:-}" "$SCENE_HOST: $1"; }

# shellcheck disable=SC2329 # called from the EXIT trap
on_exit() {
  local status=$?
  if [[ "$status" -eq 0 || "$HANDLED" == true ]]; then
    scene_heartbeat "${SCENE_DEPLOY_HEARTBEAT_URL:-}"
  else
    log "ERROR: stopped unexpectedly during '$STEP' (exit $status)"
    alert "자동 배포가 '$STEP' 단계에서 예상하지 못하게 멈췄습니다 (exit $status). auto-deploy.log를 확인하세요." "unexpected-$STEP"
  fi
}

pause() {
  local reason="${1:-no reason given}"
  mkdir -p "$STATE_DIR"
  printf '%s %s\n' "$(date --iso-8601=seconds)" "$reason" >"$PAUSE_FILE"
  log "paused: $reason"
  load_env
  alert "자동 배포를 멈췄습니다 (동결). 다시 켜기: auto-deploy.sh --resume"
}

resume() {
  if [[ ! -f "$PAUSE_FILE" ]]; then
    echo "not paused"
    return 0
  fi
  rm -f "$PAUSE_FILE"
  log "resumed"
  load_env
  alert "자동 배포를 다시 켰습니다. 5분 안에 origin/main을 반영합니다."
}

status() {
  if [[ -f "$PAUSE_FILE" ]]; then
    echo "automatic deploy: PAUSED since $(cat "$PAUSE_FILE")"
  else
    echo "automatic deploy: on"
  fi
  echo "running commit:   $(git -C "$REPO_DIR" rev-parse --short HEAD)"
  echo "origin/$BRANCH:      $(git -C "$REPO_DIR" rev-parse --short "origin/$BRANCH") (as of the last fetch)"
  [[ -f "$STATE_DIR/deployed-sha" ]] && echo "last deployed:    $(cut -c1-7 "$STATE_DIR/deployed-sha")"
  [[ -f "$STATE_DIR/failed-sha" ]] && echo "last failed:      $(cut -c1-7 "$STATE_DIR/failed-sha")"
  if frozen_at "origin/$BRANCH"; then
    echo "freeze:           origin/$BRANCH has $FREEZE_PATH (only commits with 'Deploy-During-Freeze: yes' deploy)"
  else
    echo "freeze:           none"
  fi
  echo "alerts:           $([[ -n "${SCENE_ALERT_URL:-}" ]] && echo on || echo off)"
  echo "heartbeat:        $([[ -n "${SCENE_DEPLOY_HEARTBEAT_URL:-}" ]] && echo on || echo off)"
}

# True if the commit has the FREEZE file and is not marked as an urgent fix.
frozen_at() {
  git -C "$REPO_DIR" cat-file -e "$1:$FREEZE_PATH" 2>/dev/null &&
    ! git -C "$REPO_DIR" log -1 --format=%B "$1" | grep -qiE "$FREEZE_TRAILER"
}

load_env() {
  # Not `source .env`: compose allows unquoted values with spaces, the shell does not.
  SCENE_HOST="$(scene_env_value "$COMPOSE_DIR/.env" SCENE_HOST)"
  : "${SCENE_HOST:?set SCENE_HOST in .env}"
  scene_notify_load "$COMPOSE_DIR/.env"
  export SCENE_ALERT_STATE_DIR="$STATE_DIR"
}

main() {
  local force=false
  case "${1:-}" in
    "") ;;
    --force) force=true ;;
    --pause)
      shift
      pause "$*"
      exit 0
      ;;
    --resume)
      resume
      exit 0
      ;;
    --status)
      load_env
      status
      exit 0
      ;;
    --test-alert)
      load_env
      if [[ -z "${SCENE_ALERT_URL:-}" ]]; then
        echo "SCENE_ALERT_URL is empty in $COMPOSE_DIR/.env" >&2
        exit 1
      fi
      alert "시험 알림입니다. 이 줄이 보이면 알림 설정이 맞습니다."
      echo "sent (check your phone)"
      exit 0
      ;;
    *)
      echo "usage: $0 [--force | --pause [reason] | --resume | --status | --test-alert]" >&2
      exit 2
      ;;
  esac

  mkdir -p "$STATE_DIR"
  exec 9>"$STATE_DIR/lock"
  flock -n 9 || exit 0

  cd "$COMPOSE_DIR"
  load_env
  trap on_exit EXIT

  if [[ -f "$PAUSE_FILE" && "$force" == false ]]; then
    exit 0 # Deploy freeze (--pause). The heartbeat still says cron is alive.
  fi

  STEP=fetch
  # A short GitHub or home internet outage is normal: alert only after 30 minutes of failed fetches.
  if ! git -C "$REPO_DIR" fetch --quiet origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"; then
    local fails
    fails="$(($(cat "$STATE_DIR/fetch-failures" 2>/dev/null || echo 0) + 1))"
    printf '%s\n' "$fails" >"$STATE_DIR/fetch-failures"
    log "ERROR: git fetch failed ($fails in a row)"
    if ((fails >= 6)); then
      alert "30분째 GitHub에서 main을 가져오지 못합니다. 서버의 인터넷이나 git 설정을 확인하세요." fetch-failing
    fi
    HANDLED=true
    exit 1
  fi
  rm -f "$STATE_DIR/fetch-failures"
  scene_notify_clear fetch-failing
  local current target
  current="$(git -C "$REPO_DIR" rev-parse HEAD)"
  target="$(git -C "$REPO_DIR" rev-parse "origin/$BRANCH")"

  if [[ "$current" == "$target" && "$force" == false ]]; then
    exit 0
  fi
  if [[ "$force" == false ]] && frozen_at "$target"; then
    if [[ "$(cat "$STATE_DIR/frozen-sha" 2>/dev/null)" != "$target" ]]; then
      printf '%s\n' "$target" >"$STATE_DIR/frozen-sha"
      log "frozen ($FREEZE_PATH on $BRANCH): not deploying ${target:0:7}"
      alert "배포 동결 중: main ${target:0:7} 배포를 보류합니다. 운영은 ${current:0:7} 그대로입니다." "frozen-${target:0:7}"
    fi
    exit 0
  fi
  if [[ -n "$(git -C "$REPO_DIR" status --porcelain --untracked-files=no)" ]]; then
    log "ERROR: $REPO_DIR has local changes; not deploying"
    alert "운영 사본에 손으로 고친 파일이 있어 배포하지 않습니다 (${target:0:7} 대기). git status를 확인하세요." dirty-tree
    HANDLED=true
    exit 1
  fi
  if [[ "$force" == false && -f "$STATE_DIR/failed-sha" && "$(cat "$STATE_DIR/failed-sha")" == "$target" ]]; then
    exit 0 # This commit already failed once. Wait for a newer one.
  fi

  STEP=ci
  case "$(ci_state "$target")" in
    pending)
      log "waiting for CI on ${target:0:7}"
      # CI normally ends within 30 minutes. Longer means gh cannot read the checks or CI is stuck.
      if [[ "$(cut -d' ' -f1 "$STATE_DIR/ci-wait" 2>/dev/null)" != "$target" ]]; then
        printf '%s %s\n' "$target" "$(date +%s)" >"$STATE_DIR/ci-wait"
      elif (($(date +%s) - $(cut -d' ' -f2 "$STATE_DIR/ci-wait") > 3600)); then
        alert "main ${target:0:7}의 CI 결과를 1시간째 확인하지 못해 배포를 기다리고 있습니다. gh 로그인과 Actions를 확인하세요." "ci-wait-${target:0:7}"
      fi
      exit 0
      ;;
    failure)
      log "CI failed on ${target:0:7}; not deploying"
      alert "main ${target:0:7}의 CI가 실패해 배포하지 않습니다. 운영은 ${current:0:7} 그대로입니다." "ci-failed-${target:0:7}"
      exit 0
      ;;
  esac

  if [[ "$force" == false ]] && git -C "$REPO_DIR" diff --quiet "$current" "$target" -- "${RUNTIME_PATHS[@]}"; then
    git -C "$REPO_DIR" merge --quiet --ff-only "$target"
    log "updated ${current:0:7} -> ${target:0:7}: no runtime change, nothing restarted"
    exit 0
  fi

  log "deploying ${current:0:7} -> ${target:0:7}"
  STEP=docker-config
  docker_config
  STEP=pre-deploy-dump
  if ! backup "$current"; then
    log "ERROR: pre-deploy dump failed; not deploying ${target:0:7}"
    alert "배포 전 DB 덤프 실패로 ${target:0:7} 배포를 건너뛰었습니다. 운영은 ${current:0:7} 그대로입니다." "dump-failed-${target:0:7}"
    HANDLED=true
    exit 1
  fi
  STEP=merge
  git -C "$REPO_DIR" merge --quiet --ff-only "$target"

  # Build before touching anything: a failed build leaves the running containers as they are.
  STEP=build
  if ! build; then
    log "ERROR: build of ${target:0:7} failed; the running version ${current:0:7} was not touched"
    printf '%s\n' "$target" >"$STATE_DIR/failed-sha"
    git -C "$REPO_DIR" reset --quiet --hard "$current"
    alert "${target:0:7} 빌드 실패. 운영은 ${current:0:7} 그대로입니다 (컨테이너를 건드리지 않음)."
    HANDLED=true
    exit 1
  fi

  STEP=up
  if up && smoke; then
    rm -f "$STATE_DIR/failed-sha"
    printf '%s\n' "$target" >"$STATE_DIR/deployed-sha"
    log "deployed ${target:0:7}"
    alert "배포 완료 ${current:0:7} -> ${target:0:7}"
    exit 0
  fi

  log "ERROR: deploy of ${target:0:7} failed; going back to ${current:0:7}"
  printf '%s\n' "$target" >"$STATE_DIR/failed-sha"
  git -C "$REPO_DIR" reset --quiet --hard "$current"
  STEP=rollback
  if build && up && smoke; then
    log "rolled back to ${current:0:7}. Database changes are NOT rolled back; the pre-deploy dump is in $BACKUP_DIR"
    alert "${target:0:7} 배포 실패 → ${current:0:7}로 되돌렸습니다. DB 변경은 되돌리지 않았습니다. 배포 전 덤프가 ~/scene-backups에 있습니다."
  else
    log "ERROR: rollback to ${current:0:7} also failed. The site may be down."
    alert "긴급: ${target:0:7} 배포 실패, ${current:0:7}로 되돌리기도 실패. 사이트가 멈췄을 수 있습니다."
  fi
  HANDLED=true
  exit 1
}

# Bash reads a script as it runs; calling main last keeps a mid-run `git merge` of this file harmless.
main "$@"
