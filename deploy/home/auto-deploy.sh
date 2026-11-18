#!/usr/bin/env bash
# Pull-based auto deploy for the home server (docs/devops/home-server.md §자동 배포, #257).
# Run from cron every few minutes. Deploys origin/main once its CI checks have passed.
#
#   auto-deploy.sh           deploy if origin/main moved
#   auto-deploy.sh --force   rebuild and redeploy the current origin/main even if nothing moved
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
  docker compose exec -T postgres pg_dump -U scene -d scene --format=plain --no-owner | gzip -9 >"$file"
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

main() {
  local force=false
  if [[ "${1:-}" == --force ]]; then
    force=true
  elif [[ $# -gt 0 ]]; then
    echo "usage: $0 [--force]" >&2
    exit 2
  fi

  mkdir -p "$STATE_DIR"
  exec 9>"$STATE_DIR/lock"
  flock -n 9 || exit 0

  cd "$COMPOSE_DIR"
  # Not `source .env`: compose allows unquoted values with spaces, the shell does not.
  SCENE_HOST="$(sed -n 's/^SCENE_HOST=//p' .env | tail -n 1)"
  : "${SCENE_HOST:?set SCENE_HOST in .env}"

  git -C "$REPO_DIR" fetch --quiet origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
  local current target
  current="$(git -C "$REPO_DIR" rev-parse HEAD)"
  target="$(git -C "$REPO_DIR" rev-parse "origin/$BRANCH")"

  if [[ "$current" == "$target" && "$force" == false ]]; then
    exit 0
  fi
  if [[ -n "$(git -C "$REPO_DIR" status --porcelain --untracked-files=no)" ]]; then
    log "ERROR: $REPO_DIR has local changes; not deploying"
    exit 1
  fi
  if [[ "$force" == false && -f "$STATE_DIR/failed-sha" && "$(cat "$STATE_DIR/failed-sha")" == "$target" ]]; then
    exit 0 # This commit already failed once. Wait for a newer one.
  fi

  case "$(ci_state "$target")" in
    pending)
      log "waiting for CI on ${target:0:7}"
      exit 0
      ;;
    failure)
      log "CI failed on ${target:0:7}; not deploying"
      exit 0
      ;;
  esac

  if [[ "$force" == false ]] && git -C "$REPO_DIR" diff --quiet "$current" "$target" -- "${RUNTIME_PATHS[@]}"; then
    git -C "$REPO_DIR" merge --quiet --ff-only "$target"
    log "updated ${current:0:7} -> ${target:0:7}: no runtime change, nothing restarted"
    exit 0
  fi

  log "deploying ${current:0:7} -> ${target:0:7}"
  docker_config
  backup "$current"
  git -C "$REPO_DIR" merge --quiet --ff-only "$target"

  # Build before touching anything: a failed build leaves the running containers as they are.
  if ! build; then
    log "ERROR: build of ${target:0:7} failed; the running version ${current:0:7} was not touched"
    printf '%s\n' "$target" >"$STATE_DIR/failed-sha"
    git -C "$REPO_DIR" reset --quiet --hard "$current"
    exit 1
  fi

  if up && smoke; then
    rm -f "$STATE_DIR/failed-sha"
    printf '%s\n' "$target" >"$STATE_DIR/deployed-sha"
    log "deployed ${target:0:7}"
    exit 0
  fi

  log "ERROR: deploy of ${target:0:7} failed; going back to ${current:0:7}"
  printf '%s\n' "$target" >"$STATE_DIR/failed-sha"
  git -C "$REPO_DIR" reset --quiet --hard "$current"
  if build && up && smoke; then
    log "rolled back to ${current:0:7}. Database changes are NOT rolled back; the pre-deploy dump is in $BACKUP_DIR"
  else
    log "ERROR: rollback to ${current:0:7} also failed. The site may be down."
  fi
  exit 1
}

# Bash reads a script as it runs; calling main last keeps a mid-run `git merge` of this file harmless.
main "$@"
