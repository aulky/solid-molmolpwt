# Antigravity platform spec (verified)

What this kit relies on about how Google Antigravity actually behaves, as opposed to what its public docs
say. Verified against `agy` CLI **1.2.10** on Windows 11 (2026-09-24 to 2026-09-28) by running real headless
turns (`agy -p ... --new-project --output-format json`) against disposable probe workspaces and reading the
resulting `transcript_full.jsonl`, CLI logs, and the CLI binary's extracted strings — not by trusting the
docs alone. The full probe transcripts, methodology and raw evidence live in the kit's original research notes
(kept outside the published repo) and the earlier turns of this kit's build session; this file is the condensed, load-bearing subset kept under
`.agents/` so it travels with the kit into other repositories.

Where a public docs page and the live behavior disagreed, live behavior wins below, and the disagreement is
noted. Anything marked **DOC** came only from bundled documentation and was not independently probed.

## Discovery and loading

- The workspace customization root is `<repo>/.agents/` (also `.agent/`, `_agents/`, `_agent/` — DOC).
- Customizations load **only** once the folder is bound to an Antigravity project or workspace (the IDE/2.0
  "add workspace" action, or the CLI's `--new-project` / `--project <id>` flags). A bare `agy -p` run in a
  folder that has never been registered as a project runs with **no** workspace customizations at all — not
  even `hooks.json` — and silently executes inside `~/.gemini/antigravity-cli/scratch` instead. This is the
  single most common reason a kit "isn't loading": the folder was never turned into a project.
- Always-on context, verified loaded every turn: root `GEMINI.md`, root `AGENTS.md`, `.agents/GEMINI.md`.
  Standalone `GEMINI.md`/`AGENTS.md` files take no frontmatter (DOC) — **any** file with either of those two
  exact names, anywhere under the repo, becomes an always-on rule for its directory. This is why the kit
  never creates a file with either name except the two allowed ones.
- Loaded rules are injected wrapped as `<RULE[<absolute path>]> ... </RULE[<absolute path>]>`.

## Rules (`.agents/rules/*.md`)

- A rule file **must** open with YAML frontmatter containing `trigger:`. A file with no frontmatter, or where
  the frontmatter block never closes, is silently ignored — no error, no warning, it just never loads.
- The directory is scanned **flat**. `.agents/rules/<subfolder>/x.md` is never discovered. Every rule file
  must live directly in `.agents/rules/`.
- Trigger values and what each does:
  - `always_on` — full text injected into the system prompt every turn.
  - `model_decision` + `description:` — only `- file:///<path>: <description>` is injected; the model must
    choose to `view_file` the rule itself before it takes effect. A weak model will not always do this, so
    anything load-bearing belongs in `always_on` or `glob`, not `model_decision`.
  - `glob` + `globs:` — injected when the agent touches a matching file (see matching rules below).
  - `manual` — never auto-loaded; only applies when the user `@`-mentions it in chat.
- `globs:` **must** be one double-quoted, comma-separated string: `globs: "**/*.rs,**/*.go"`. A YAML list
  (`globs:\n  - "**/*.py"`) is silently ignored — the rule simply never fires, with no error.
- **Glob matching is basename-only.** The pattern is matched against the file's *name*, not its path.
  - Matches: `**/*.tsx`, `*.tsx`, `index.tsx`, `**/index.tsx`, `*session*`, `**/*session*`, `**/*.test.ts`.
  - Never matches: `src/**/*.tsx`, `**/routes/*.tsx`, `**/routes/**/*.tsx`, `**/src/routes/**`,
    `**/auth/**`, `**/.agents/**`, `docs/adr/*.md`, `**/adr/*.md`, any backslash path, any `{a,b}` brace
    expansion. All of these look reasonable and fail with **no error** — the rule is simply dead.
  - Consequence: write every pattern as `**/<basename-glob>`. If a rule genuinely needs directory scope
    (e.g. "only inside `docs/adr/`"), it cannot be expressed as a glob rule at all — use a directory-scoped
    `AGENTS.md`, lean on a distinctive basename convention, or fall back to `model_decision`.
- `@[label](./relative/path.txt)` inlines a file's contents into a rule (frontmatter of the included file is
  stripped); the inlined bytes count toward the size cap below.
- Size limits (DOC, not independently re-measured but consistent with observed demotions): 24,000 bytes per
  rule file after include expansion, truncated on a line boundary if exceeded. All active `always_on` and
  global rules share a single 20,000-token budget; once exceeded, the largest files are demoted from full
  inline text to a `- <path>: <description>` pointer — functionally the same as `model_decision`. This kit
  keeps its own budget target far under that ceiling (`node .agents/scripts/doctor.mjs` enforces warn/error
  thresholds at 9,000 / 16,000 tokens) so it never depends on that platform fallback.

## Skills (`.agents/skills/<name>/SKILL.md`)

- Frontmatter: `name` (lowercase-hyphen, unique) and `description` (third person, states what the skill does
  and when to use it — this is the only text the model sees before activating the skill).
- Optional: `disable-slash-command: true` (hides it from the `/` menu and `/name` resolution while keeping it
  model-invocable), `disable-model-invocation` (yaml key exists in the CLI; opposite direction), `metadata:`
  with a nested `icon:` (a single emoji shown in listings).
- Every skill is automatically a slash command, `/<name>`. Legacy Antigravity **workflows**
  (`.agents/workflows/*.md`) are deprecated in favor of skills and stop being indexed on 2026-11-01 — this
  kit has no workflows.
- Progressive disclosure: only `name` + `description` sit in context until the skill is activated; put bulk
  content in `references/`, and runnable helpers in `scripts/`.

## Custom agents / subagents (`.agents/agents/`)

- Both a flat file (`.agents/agents/<name>.md`) and a directory (`.agents/agents/<name>/agent.md`) layout are
  discovered; this kit uses the flat layout exclusively for simplicity.
- Body: an H1 title, then the system prompt (plain markdown after the frontmatter's closing `---`).
- Frontmatter keys seen working: `name`, `description`, `model` (`inherit` default, or `flash` / `pro`),
  `tools` (a YAML list of tool names — this **does** restrict the toolset, verified: `tools: [view_file,
  grep_search]` really does give the subagent only those two plus the always-present `send_message`,
  `call_mcp_tool`, `list_resources`, `read_resource`, `manage_task`), `subagent`, `mainAgent`, and
  `commandExecutionPolicy`.
- Built-in subagents always available regardless of what a repo defines: `self` (a clone of the caller) and
  `research`.
- `invoke_subagent` takes `{"Subagents":[{"TypeName":"<agent name>","Role":"<short role>","Prompt":"<a
  complete, self-contained brief>"}]}`. **It is asynchronous** — it returns immediately with the child's
  conversation id, and the child reports back later via its own `send_message` call. A caller that writes its
  final answer before that message arrives will act on a result that does not exist yet (this was directly
  observed: a weak model answered with a literal `null` for the subagent's output). Always wait for the
  message; do not poll.
- A dispatch entry may also carry `"Workspace"` (binary strings, NOT probed): `"inherit"` (default; the child
  works in the parent's folder; the only value this kit has exercised), `"branch"` ("a new isolated workspace
  branched or cloned from the parent") and `"share"` (a new workspace sharing the parent's repository directory,
  like a git worktree). The binary also contains "CitC workspace branching is not supported in this build", so
  `branch` may fail in the public CLI; probe it before relying on it. Until then, use `inherit` and run
  alternative attempts one after another.
- Selecting a custom agent as the main agent (changelog 1.x: `--agent` flag and `agents` subcommand; `mainAgent`
  frontmatter): `mainAgent: true` makes an agent selectable, per session, through
  the `/agents` picker or the CLI flag `agy --agent <name>` (`agy agents` lists them). No setting was found (docs,
  changelog, binary strings) that makes a custom agent the **persistent default** for a workspace; every new
  session starts on the default agent. Switching back to the default agent via `/agents` works (fixed in the
  changelog). Consequence for this kit: always-on rules and hooks must make the default agent behave as the
  orchestrator; the strict `orchestrator` agent is an opt-in per session.
- A custom agent defined in Markdown inherits the ambient skills, rules and subagents by default, like the
  default agent (changelog).

## Tools (verified names and argument keys, default CLI toolset)

- `run_command {CommandLine, Cwd, WaitMsBeforeAsync, toolAction, toolSummary}`
- `view_file {AbsolutePath, StartLine?, EndLine?}`
- `write_to_file {TargetFile, CodeContent, Overwrite, Description}`
- `replace_file_content {TargetFile, TargetContent, ReplacementContent, StartLine, EndLine, AllowMultiple,
  Instruction, Description}`
- Also present: `generate_image`, `read_url_content`, `search_web`, `manage_task`, `schedule`,
  `invoke_subagent`, `manage_subagents`, `define_subagent`, `send_message`, `ask_question`, `call_mcp_tool`,
  `list_resources`, `read_resource`.
- Legacy tools (`grep_search`, `find_by_name`, `list_dir`) are only available to an agent that explicitly
  lists them in its own `tools:` frontmatter; the default toolset omits them, so the default agent searches
  via `run_command` (this kit's `node .agents/scripts/search.mjs`, or `git grep`/PowerShell `Select-String`)
  or `view_file` instead.
- `multi_replace_file_content` is silently **not** granted to a custom subagent even when listed in `tools:`
  in the CLI (no error, no hang — it just isn't in the resulting toolset). Do not rely on it for subagents.
- Observed failure mode: a weak model given a loose, unbounded prompt wandered outside the intended workspace
  reading unrelated files, burning hundreds of thousands of tokens. Always state an explicit workspace
  boundary and a stop condition in agent/skill prompts.

## Hooks (`.agents/hooks.json`)

- Shape: a JSON object keyed by hook name. Each hook may set `enabled` (default true) and any of
  `PreToolUse`, `PostToolUse` (both use `{"matcher": "<regex on the tool name>", "hooks": [{"type":"command",
  "command":"...","timeout":<seconds>}]}`), plus `PreInvocation`, `PostInvocation`, `Stop` (all three take a
  flat array of `{"type":"command","command":"...","timeout":<seconds>}` handlers, no `matcher` wrapper).
- The command runs via `cmd /c` on Windows (`sh -c` on Unix). The **working directory is the folder
  containing `hooks.json`** — i.e. `<repo>/.agents` — so `node hooks/track-tools.mjs` resolves correctly, and
  `ANTIGRAVITY_CONVERSATION_ID` is set in the environment.
- stdin is one JSON object, camelCase keys. Common fields on every event: `conversationId`,
  `workspacePaths` (forward slashes), `transcriptPath` (points at
  `<app-data>/brain/<id>/.system_generated/logs/transcript_full.jsonl`), `artifactDirectoryPath`, `modelName`.
  - `PreToolUse` adds `stepIdx`, `toolCall: {name, args}`.
  - `PostToolUse` adds the same plus `error` (`""` on success).
  - `PreInvocation` / `PostInvocation` add `invocationNum` (0-based) and `initialNumSteps`.
  - `Stop` adds `executionNum`, `terminationReason` (e.g. `"NO_TOOL_CALL"`, `"max_steps_exceeded"`, `"error"`),
    `fullyIdle`, `error`.
- stdout must be exactly one JSON object:
  - `PreToolUse`: `{"decision": "allow"|"deny"|"ask"|"force_ask"|"deny_unless_prior_grant", "reason"?,
    "overwrite"?: {argKey: value}}`. **Returning `{}` or an empty/missing `decision` denies the tool call** —
    this is fail-closed, verified directly, and there is no pass-through value. A hook that errors and prints
    nothing therefore blocks every tool call it matches; every hook in this kit catches all errors and still
    emits a valid JSON decision.
  - `PostToolUse`: `{}` — it cannot inject feedback directly into the conversation. The pattern this kit uses
    instead is: `PostToolUse` writes a small state file, and the *next* `PreInvocation` reads it and injects
    an `ephemeralMessage`.
  - `PreInvocation`: `{"injectSteps":[{"ephemeralMessage":"..."}]}` (also accepts `{"userMessage":...}` and
    `{"toolCall":{...}}`). Verified: the model actually sees an injected `ephemeralMessage`.
  - `PostInvocation`: `{"injectSteps":[], "terminationBehavior": "force_continue"|"terminate"|""}`.
  - `Stop`: `{"decision":"continue","reason":"..."}` blocks the stop and injects `reason` as a system message;
    any other value (or no decision) lets the turn end. The platform caps consecutive forced continuations
    itself, so a stuck `Stop` hook cannot loop forever — but a hook should still track its own block count and
    give up gracefully well before that cap.
- Hooks run synchronously and block the agent loop; keep them fast (this kit's hooks target well under 1
  second, syntax-check sub-steps excepted).
- VERIFIED live (2026-09-30, agy 1.2.10, Gemini 3.8 Flash Low): a `PreToolUse` matcher on
  `write_to_file|replace_file_content|...|invoke_subagent` DOES fire for file-edit tools (the orchestrator
  guard denied a real `replace_file_content`; the model saw `tool call denied by pre-tool hook: <reason>`).
  Hooks also fire inside subagent conversations.
- VERIFIED live: a worker may keep talking after its report (e.g. a Stop-hook continuation), sending a
  plain follow-up like "Task T3 is complete…". Only a message with a Worker Report envelope may set a
  child's status; never let a later non-report message overwrite it (this caused a false PIPELINE GATE).
  A finished child also produces `sender=system … Subagent <id> has gone idle` in the parent.

## `transcript_full.jsonl` (verified line shape)

One JSON object per step:
`{"step_index":N,"source":"USER_EXPLICIT"|"MODEL"|...,"type":"USER_INPUT"|"PLANNER_RESPONSE"|"GENERIC"|
"SYSTEM_MESSAGE","status":"DONE"|"ERROR","created_at":"<ISO>","content":"...","tool_calls":[{"name":
"run_command","args":{...}}],"error":"..."}`. A tool's result appears as the *next* step, typically
`type: "GENERIC"` with `content` starting `"The command exited with code 0.\nOutput: ..."`.

### Subagent traffic in the transcript (the hooks in `hooks/lib.mjs` depend on it)

Source: observed in real agent sessions; the binary strings confirm "Created the following subagents:",
"MESSAGE_PRIORITY_NORMAL" and "Subagent %s has gone idle"; the hook tests use synthetic copies of these lines.

- **Child conversation, first line.** A CLI subagent's transcript starts with step 0 of `type: "SYSTEM_MESSAGE"`
  whose `content` is the parent's brief wrapped as
  `<SYSTEM_MESSAGE>\n[Message] timestamp=<ISO> sender=<parentConversationId> priority=MESSAGE_PRIORITY_NORMAL content=<brief>`.
  A user-started conversation's step 0 is `type: "USER_INPUT"`. So "step 0 is a `SYSTEM_MESSAGE` containing
  `sender=`" identifies a worker. An IDE subagent can instead start with a `USER_INPUT` step holding the brief
  and no `sender=`; the hooks therefore also mark a child as a worker through a marker file the parent's hook
  writes when it links the child id (`.state/children/<childId>.json`).
- **Parent conversation, dispatch result.** The step after an `invoke_subagent` call is a `GENERIC` step whose
  `content` starts `Created the following subagents:` followed by one JSON-like block per child, in dispatch
  order, each with `"conversationId": "<childId>"` (plus the agent's name/type). This is the only place the
  parent learns the child ids.
- **Parent conversation, child reply.** A child's `send_message` arrives in the parent as a new
  `SYSTEM_MESSAGE` step: `<SYSTEM_MESSAGE>\n[Message] timestamp=<ISO> sender=<childId> priority=... content=<report>`.
  A child that ends without `send_message` (IDE) produces a system notice from `sender=system` containing
  `Subagent <childId> has gone idle` and its last response; treat that as the reply.
- Background task completions also arrive as `SYSTEM_MESSAGE` steps with `sender=` (for example
  `sender=<id>/task-7 content=Task id "<id>/task-7" finished with result: ...`); do not confuse them with a
  worker's report.

## Built-in multi-agent modes (DOC / changelog)

Antigravity ships its own multi-agent modes: `/boost` and `/teamwork-preview` (both slash commands appear in the
1.x changelog; the kit design brief describes them as paid-plan features, the changelog names no plan tier;
not probed for this kit). They suit very large autonomous
campaigns. This kit's orchestrator mode (custom agents + hooks, `.agents/docs/adr/0002-orchestrator-mode-pipeline.md`)
is the everyday default and works on every plan.

## Plugins and MCP

- A workspace plugin at `.agents/plugins/<name>/plugin.json` loads; its `rules/AGENTS.md` is always active,
  and its `skills/<s>/SKILL.md` is listed as `<plugin>:<skill>`.
- `mcp_config.json`: `{"mcpServers": {"<name>": {"command","args","env"} | {"serverUrl"}}}` (DOC). Plugin MCP
  servers are namespaced `<plugin>_<server>` to avoid collisions.

## Models

`agy models` on this machine lists: `gemini-3.8-flash-{high,medium,low}`, `gemini-3.7-flash-*`,
`gemini-3.6-flash-*`, `gemini-3.1-pro-{high,low}`, `claude-sonnet-4-6`, `claude-opus-4-6-thinking`,
`gpt-oss-120b-medium`. Agent frontmatter's `model:` field only understands the coarser tiers `flash` / `pro`
/ `inherit`, not a specific model id.

## Re-verifying after an Antigravity upgrade

If any behavior above seems wrong after a CLI/IDE/app update, don't guess — re-run the same empirical method
used to write this file:

1. Create a throwaway folder with a minimal `.agents/` containing one deliberately distinctive probe rule,
   skill and agent (unique marker strings you can grep for).
2. Register it as a project (`agy --new-project` once, or the IDE/2.0 "add workspace" action) — headless runs
   against an unregistered folder load no customizations at all (see *Discovery and loading* above).
3. Run a headless turn: `agy -p "<instructions that exercise the thing you're checking>" --model
   gemini-3.8-flash-low --project <id> --dangerously-skip-permissions --output-format json --print-timeout
   180s`.
4. Read `~/.gemini/antigravity-cli/brain/<conversationId>/.system_generated/logs/transcript_full.jsonl` for
   what actually happened (tool calls, injected rules, hook payloads), not just the final answer.
5. Delete the throwaway project entry (`~/.gemini/config/projects/<id>.json`) when done.
6. Update this file and `.agents/rules/topic-agent-kit.md` with whatever changed, and note the new CLI
   version at the top.
