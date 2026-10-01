# context7 MCP: what it is, checking it, adding it (optional)

Verified 2026-09-28: package `@upstash/context7-mcp` on the public npm registry, latest `4.1.1`
(`npm view @upstash/context7-mcp version`), bin `context7-mcp` -> `dist/index.js`, CLI flags
`--transport <stdio|http>` (default `stdio`), `--port <n>` (http only), `--api-key <key>` (or env
`CONTEXT7_API_KEY`). Website: `https://context7.com`. Re-check the version before quoting it again if
this file is more than a few months old - `npm view @upstash/context7-mcp version`.

## What it is
An MCP server that serves up-to-date, version-aware documentation snippets for public libraries/frameworks
on request (`resolve-library-id` then `query-docs` / `get-library-docs` tools, exact tool names depend on
the server version - check what `list_resources`/the tool list actually shows once connected). It is a
*supplement* to the facts-first hierarchy in `SKILL.md`, never a replacement for reading the installed
package's own source for the exact locked version - context7's index can lag a just-released version.

## Is it already configured? (check this first - do not assume)
Fastest and matches what the running agent actually has available:
```
agy mcp list
```
Look for a row named `context7` (or similar) with `STATUS enabled`. If the CLI is unavailable or you are
inside the agent itself, `view_file` these locations instead (first one that exists and has a
`context7`-ish entry under `mcpServers` wins):
- Global: `~/.gemini/config/mcp_config.json` (Windows: `%USERPROFILE%\.gemini\config\mcp_config.json`) -
  applies to every workspace/project.
- Workspace, only if this kit is installed as an Antigravity plugin: `.agents/plugins/<name>/mcp_config.json`
  (tools from it are namespaced `<plugin>_<server>`).
No entry in either place -> **not configured**. Say so in your output and move on; this step is optional.

## Adding it globally (optional - only if the user asks, or repeated research would clearly benefit)
Ask before doing this: it adds a new external service, an occasional read-only network round-trip when
queried, and (if you set an API key) a rate limit tied to that key. Two equivalent ways:

**A - `agy` CLI (preferred, edits the global config for you):**
```
agy mcp add context7 npx -y @upstash/context7-mcp
```
With an API key for a higher rate limit (get one at `context7.com`, then either flag works):
```
agy mcp add --env CONTEXT7_API_KEY=<key> context7 npx -y @upstash/context7-mcp
```
Verify: `agy mcp list` shows `context7` as `enabled`. Flags must come before the name; anything after
`context7` is passed through as the command's own arguments (add `-- --api-key <key>` instead of `--env` if
you'd rather pass it as a CLI flag).

**B - edit `~/.gemini/config/mcp_config.json` by hand**, add an entry under `mcpServers` (create the file
with just `{"mcpServers":{}}` if it does not exist yet):
```json
"context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }
```
Add `"env": {"CONTEXT7_API_KEY": "<key>"}` for a key. Never write a real key into a file you might publish
or commit; prefer the environment-variable form and set `CONTEXT7_API_KEY` in your own shell profile instead
of pasting it into JSON if this machine is shared.

## Using it once configured
1. Resolve the library id for the PINNED major version (from step 1 of the main procedure) - not an
   unspecified "latest".
2. Query its docs for the specific API/question.
3. Cite it as `[context7: <library-id>@<version>]` with confidence `medium` (official docs at the exact
   pinned version are `high`; context7 is a curated secondary index, useful when official docs are hard to
   navigate, but re-check anything load-bearing against the installed source or an official versioned page).

## Removing it
```
agy mcp remove context7
```
or delete the `context7` entry from `mcp_config.json` by hand.
