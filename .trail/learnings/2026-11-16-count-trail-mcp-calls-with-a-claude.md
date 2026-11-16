---
title: "Count trail MCP calls with a repo wrapper hook whose matcher ends in .*"
author: Claude
date: 2026-11-16
branch: claude/trail-mcp-tool-savings-txridu
cost: { minutes: 1, tokens: 4275 }
id: l-5519a356
scope: repo
status: active
replaces: l-f5db04f7
src: agent
---

## Decided
The trail MCP server stays registered as `trail-map`, and its calls reach trail's tool-savings hook through a repo PostToolUse entry that runs a wrapper script. The matcher must be `mcp__trail-map__.*`. Claude Code compares a matcher made only of letters, digits, `_`, `-`, spaces, `,` and `|` as an exact tool name, so `mcp__trail-map__` (the first version) matched nothing and no MCP call was counted. The `.*` puts it on the regex path. Docs: https://code.claude.com/docs/en/hooks#matcher-patterns and https://code.claude.com/docs/en/hooks#match-mcp-tools.

## Tried and ruled out
- Renaming the server to `trail`: on every fresh clone, trail init's old-layout cleanup deletes `mcpServers.trail` and `mcpServers.graft` from `.mcp.json`.
- Adding `mcp__trail-map__` to the matcher trail writes, or a repo entry whose command names trail's hook files: trail rewrites the user hooks from a fixed matcher and drops repo entries that name its hook files.
- Testing a matcher with a JS regex (`new RegExp(m).test(name)`): that is not how Claude Code decides for exact-character matchers. It is why the first version looked right but never fired.

## Watch out
- The user-level matcher `…|mcp__graft__|mcp__trail__|…` is also on the exact path, so it matches no MCP tool, not even under a server named `trail`. It doesn't overlap ours, so no call counts twice. If upstream changes it to match MCP tools (e.g. `mcp__.*__(graft|trail)_`), remove the wrapper or calls count twice.
- The `Bash` matcher counts any `[trail] tokens saved ≈ N` text in a Bash output. Printing a captured trail payload while debugging inflates `savedTokens`.
- In the 2026-11-16 session, the settings change was picked up without a restart. Still check a fresh session.

In the code:
- `.claude/settings.json` PostToolUse `matcher: "mcp__trail-map__.*"` runs `.claude/hooks/trail-tool-savings.sh`, which calls the user-level helpers shim with `tool-savings`
- trail-code 0.28.1: `dist/claude/hooks.js` `classifyAndScore`, `dist/claude/session-metrics.js` `isGraftMcpTool` and `recordToolUse`, `dist/claude/settings-merge.js:74`
- Issue #207
