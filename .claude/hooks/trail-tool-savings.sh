#!/usr/bin/env bash
# PostToolUse for this repo's trail MCP server (`trail-map` in .mcp.json).
# trail's own matcher in ~/.claude/settings.json only knows `mcp__trail__`, so
# `mcp__trail-map__*` calls never reach its tool-savings hook (#207). This hands
# them to the same hook. Remove it once trail matches the tool name upstream,
# or the calls are counted twice.
#
# Kept as a script on purpose: trail's settings refresh drops any settings
# entry whose command names its hook files, but leaves this one alone.
set -uo pipefail

helper="${HOME}/.claude/helpers/graft-hooks.cjs"
[ -f "$helper" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

node "$helper" tool-savings || exit 0
