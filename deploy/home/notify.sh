# shellcheck shell=bash
# Alerts and heartbeats for the home server scripts (docs/devops/home-server.md §알림, #409).
# Sourced by auto-deploy.sh, backup.sh and boot-check.sh, and by .github/workflows/uptime.yml.
#
#   scene_notify <dedupe-key|""> <message>   send one short line to SCENE_ALERT_URL
#   scene_heartbeat <url> [fail]             ping a heartbeat (healthchecks.io style) URL
#
# Both are best effort: an empty URL or a failed request never fails the caller.
# Messages must stay short and free of secrets, personal data and database contents:
# callers pass only the host, a step name and short commit ids. Never log the URLs; they hold tokens.
#
# SCENE_ALERT_URL is detected by host:
#   discord.com/api/webhooks/...      -> JSON {"content": ...}
#   hooks.slack.com/...               -> JSON {"text": ...}
#   api.telegram.org/bot<token>/sendMessage?chat_id=<id> -> form text=...
#   anything else (ntfy, ...)         -> plain text body
# SCENE_ALERT_FORMAT=text|discord|slack|telegram overrides the guess.

SCENE_ALERT_DEDUPE_HOURS="${SCENE_ALERT_DEDUPE_HOURS:-6}"

_scene_json_string() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/}"
  s="${s//$'\t'/ }"
  printf '"%s"' "$s"
}

_scene_alert_format() {
  if [[ -n "${SCENE_ALERT_FORMAT:-}" ]]; then
    printf '%s' "$SCENE_ALERT_FORMAT"
    return
  fi
  case "$1" in
    https://discord.com/api/webhooks/* | https://discordapp.com/api/webhooks/*) printf discord ;;
    https://hooks.slack.com/*) printf slack ;;
    https://api.telegram.org/bot*) printf telegram ;;
    *) printf text ;;
  esac
}

# True if the same key was sent less than SCENE_ALERT_DEDUPE_HOURS ago. Records the key otherwise.
_scene_alert_recent() {
  local key="$1" dir="${SCENE_ALERT_STATE_DIR:-}" file now last
  [[ -n "$key" && -n "$dir" ]] || return 1
  mkdir -p "$dir/alerts" 2>/dev/null || return 1
  file="$dir/alerts/${key//[^A-Za-z0-9._-]/_}"
  now="$(date +%s)"
  if [[ -f "$file" ]]; then
    last="$(cat "$file" 2>/dev/null || echo 0)"
    if [[ "$last" =~ ^[0-9]+$ ]] && ((now - last < SCENE_ALERT_DEDUPE_HOURS * 3600)); then
      return 0
    fi
  fi
  printf '%s\n' "$now" >"$file" 2>/dev/null || true
  return 1
}

scene_notify() {
  local key="$1" message="$2" url="${SCENE_ALERT_URL:-}" label body
  [[ -n "$url" ]] || return 0
  if _scene_alert_recent "$key"; then
    return 0
  fi
  label="${SCENE_ALERT_LABEL:-SCENE}"
  body="[$label] $message"
  case "$(_scene_alert_format "$url")" in
    discord)
      curl -fsS -m 15 -o /dev/null -H 'Content-Type: application/json' \
        --data-binary "{\"content\":$(_scene_json_string "$body")}" "$url" ;;
    slack)
      curl -fsS -m 15 -o /dev/null -H 'Content-Type: application/json' \
        --data-binary "{\"text\":$(_scene_json_string "$body")}" "$url" ;;
    telegram)
      curl -fsS -m 15 -o /dev/null --data-urlencode "text=$body" "$url" ;;
    *)
      curl -fsS -m 15 -o /dev/null -H 'Content-Type: text/plain; charset=utf-8' \
        -H "Title: $label" --data-binary "$body" "$url" ;;
  esac >/dev/null 2>&1 || {
    printf '%s [notify] alert could not be sent\n' "$(date --iso-8601=seconds)" >&2
    # Let the next run try again instead of waiting out the dedupe window.
    [[ -n "$key" && -n "${SCENE_ALERT_STATE_DIR:-}" ]] &&
      rm -f "$SCENE_ALERT_STATE_DIR/alerts/${key//[^A-Za-z0-9._-]/_}"
  }
  return 0
}

# Forget a dedupe key, so the next failure of the same kind is sent again (call after a recovery).
scene_notify_clear() {
  local key="$1" dir="${SCENE_ALERT_STATE_DIR:-}"
  [[ -n "$key" && -n "$dir" ]] || return 0
  rm -f "$dir/alerts/${key//[^A-Za-z0-9._-]/_}" 2>/dev/null || true
}

# Was this key alerted and not yet cleared?
scene_notify_pending() {
  local key="$1" dir="${SCENE_ALERT_STATE_DIR:-}"
  [[ -n "$key" && -n "$dir" && -f "$dir/alerts/${key//[^A-Za-z0-9._-]/_}" ]]
}

scene_heartbeat() {
  local url="$1" suffix=""
  [[ -n "$url" ]] || return 0
  [[ "${2:-}" == fail ]] && suffix=/fail
  curl -fsS -m 10 --retry 2 -o /dev/null "${url%/}$suffix" >/dev/null 2>&1 ||
    printf '%s [notify] heartbeat could not be sent\n' "$(date --iso-8601=seconds)" >&2
  return 0
}

# Read KEY=value from a compose .env file without sourcing it (values may hold spaces).
scene_env_value() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  sed -n "s/^$key=//p" "$file" | tail -n 1
}

# Load alert settings from .env unless the environment already has them.
scene_notify_load() {
  local file="$1" key
  for key in SCENE_ALERT_URL SCENE_ALERT_FORMAT SCENE_ALERT_LABEL SCENE_DEPLOY_HEARTBEAT_URL BACKUP_HEARTBEAT_URL; do
    if [[ -z "${!key:-}" ]]; then
      printf -v "$key" '%s' "$(scene_env_value "$file" "$key")"
    fi
  done
  export SCENE_ALERT_URL SCENE_ALERT_FORMAT SCENE_ALERT_LABEL
}
