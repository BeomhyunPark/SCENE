---
title: "Count trail MCP calls with a repo wrapper hook, not by renaming the server"
author: Claude
date: 2026-11-02
branch: claude/trail-mcp-tool-naming-hjcszd
cost: { minutes: 1, tokens: 3401 }
id: l-f5db04f7
scope: repo
status: active
src: agent
---

## Decided
The trail MCP server stays registered as `trail-map`. Its calls (`mcp__trail-map__*`) reach trail's tool-savings hook through a repo PostToolUse entry that runs a wrapper script. trail's own matcher only knows `mcp__trail__`, so without the wrapper these calls are never counted (checked in a real session: the session metrics did not change after MCP calls). Upstream is being asked to match on the tool suffix instead. Once it does, remove the wrapper or calls count twice.

## Tried and ruled out
- Renaming the server to `trail`: on every fresh clone, trail init's old-layout cleanup deletes `mcpServers.trail` and `mcpServers.graft` from `.mcp.json`. The wiring stamp lives in the ignored cache, so cloud sessions run that cleanup every time.
- Adding `mcp__trail-map__` to the matcher trail writes: the user-level hooks are rewritten from a fixed matcher. A repo settings entry whose command names trail's own hook files (the user-level helpers shim or `.trail/hook.cjs`) is treated as trail's and dropped.

## Watch out
Hooks are read at session start, so a changed matcher only shows up in the next session. The server's ToolSearch hint says `mcp__trail__…`. Load the tools as `mcp__trail-map__…` instead.

In the code:
- `.claude/settings.json` PostToolUse `matcher: "mcp__trail-map__"` runs `.claude/hooks/trail-tool-savings.sh`, which calls the user-level helpers shim with `tool-savings`
- trail-code 0.28.1: `dist/claude/init.js` `clearOldLayout`/`dropServer`, `dist/hosts/config-write.js` `isGraftEntry`, `dist/claude/settings-merge.js:74` matcher, `dist/mcp/instructions.js` `toolSearchQuery`
- Issue #207
