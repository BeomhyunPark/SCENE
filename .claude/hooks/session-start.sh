#!/usr/bin/env bash
# Cloud-only: build trail's code map so a fresh Claude Code on the web VM
# starts with it. Never blocks session start — every path exits 0.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! command -v trail >/dev/null 2>&1; then
  echo "[session-start] trail not found; skipping code map build (add 'npm install -g @trailhq/trail-code' to the environment setup script)." >&2
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

# Build output goes to stderr so it stays out of the session's context.
if trail build 1>&2; then
  echo "[session-start] trail code map built."
else
  echo "[session-start] trail build failed (exit $?); continuing without a fresh map." >&2
fi
exit 0
