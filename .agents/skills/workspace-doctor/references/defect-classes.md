# Doctor defect classes: code → cause → fix → re-check

Grouped the way `.agents/scripts/doctor.mjs` checks the kit. `E` = doctor reports it as an error by default,
`W` = warning (the 5 third-party skills - `architecture-decision-records`, `commit-archaeologist`, `seo-audit`,
`thinking-out-loud`, `vercel-react-best-practices` - get warnings where a kit skill would get an error; fix them
upstream, never by hand-editing the installed copy). Codes are doctor's own `[code]` tag; the message it prints already
says what is wrong — this file explains the invariant so the fix targets the cause, not the one file that got
flagged. In orchestrator mode the orchestrator reads this table to write the brief; an `implementer` or `fixer`
applies the fix; a `test-engineer` re-runs the re-check command.

## Rules (`.agents/rules/*.md`)

| code | E/W | cause | fix |
|---|---|---|---|
| `rule-no-frontmatter` | E | no `---` block, or it opens but never closes | add frontmatter as line 1: `trigger:`, `description:` (and `globs:` for glob rules) between two `---` lines |
| `rule-trigger-missing` / `-invalid` | E | no `trigger:`, or a value other than the 4 allowed | use exactly `always_on \| glob \| model_decision \| manual` |
| `rule-description-missing` | E | no `description:` | one line, what + when, ≤ 200 chars — it is ALL a `model_decision` rule shows until opened |
| `rule-globs-missing` | E | `trigger: glob` with no `globs:` | the rule never fires; add `globs: "**/<pattern>"` |
| `rule-globs-list` | E | `globs:` written as a YAML list | Antigravity ignores list globs; rewrite as ONE quoted comma string |
| `rule-glob-dir` | E | any pattern has a directory component (`src/**`, `**/routes/*.tsx`, `.agents/**`) | matching is BASENAME-ONLY (VERIFIED) — it never fires, silently. Rewrite as `**/<basename-glob>`; if the rule truly needs folder scope, use a basename naming convention, or `trigger: model_decision` with a description that names the folder (never a directory `AGENTS.md`: SKILL.md invariant 4, doctor `stray-directory-rule`) |
| `rule-glob-backslash` / `-brace` | E | a Windows-style `\` path, or `{a,b}` brace expansion | neither is supported; list each basename pattern separately, forward slashes only |
| `rule-glob-bare` / `-catchall` / `-negation` / `-empty` | W | works, but off-convention, matches everything, is negated, or an empty item from a stray comma | tidy it; a catch-all pattern usually means the rule should be `always_on` instead |
| `rule-globs-unquoted` | W | `globs:` written unquoted or as a block scalar | quote it — an unquoted leading `*` is a YAML alias to a strict parser |
| `rule-globs-ignored` | W | `globs:` present on an `always_on`/`manual` rule | harmless but dead; remove it |
| `rule-size` | E | bytes (after include expansion) over the kit cap for its trigger (always_on 7,000 / glob·model_decision 6,000 / `90-lessons.md` 4,500 / any file's platform hard cap 24,000) | move detail into a guide or `references/`, leave a one-line pointer, re-measure with `wc -c` |
| `rule-nested-dir` | E | a subfolder under `.agents/rules/` | Antigravity scans the folder FLAT; move every `.md` file up |
| `rule-fw-guard` | W | an `fw-*.md` file with no `Applies only if ...` line | add the guard as body line 1 (template §2) |
| `rule-include-missing` | E | `@[label](path)` include target does not exist | fix the path; includes expand before the size check |
| `yaml-strict` | W | an unquoted scalar containing `: ` or ending `:` | wrap the value in double quotes — a strict YAML parser rejects the whole frontmatter otherwise |

Re-check: `node .agents/scripts/doctor.mjs --quiet` (only this file's issues should remain, then none).

## Always-on files + budget

| code | E/W | cause | fix |
|---|---|---|---|
| `alwayson-missing` | W | root `AGENTS.md` or `.agents/GEMINI.md` absent | create it — every workspace needs both |
| `alwayson-frontmatter` | W | a standalone `AGENTS.md`/`GEMINI.md` has a `---` block | it takes NO frontmatter; injected as plain text regardless — remove it to avoid confusion |
| `alwayson-size` | E/W | root `AGENTS.md` or `.agents/GEMINI.md` over 3,500 B (or the 24,000 B platform cap) | trim to project facts / kit index only; move detail into guides or a skill |
| `budget` | E/W | the sum of root `AGENTS.md` + `.agents/GEMINI.md` + every `always_on` rule, in tokens (bytes/4), is over 9,000 (warn) or 16,000 (error) | shrink the biggest always-on files first (doctor prints the byte breakdown); demote a rule to `glob`/`model_decision` if it is not truly needed every turn. The `model_decision` index and the skill index are printed separately — they share a DIFFERENT platform budget and do not count toward this one, but a huge index still costs real tokens once a model opens several |

## Guides (`guides/**/*.md`)

| code | E/W | cause | fix |
|---|---|---|---|
| `guide-size` | E/W | over 23,000 B (warn) or 24,000 B (error, platform hard cap — truncated on a line boundary) | split the guide, or cut a section that duplicates a principles guide |

## Skills (`.agents/skills/<name>/SKILL.md`)

| code | E/W | cause | fix |
|---|---|---|---|
| `skill-no-skillmd` | W | a folder under `skills/` with no `SKILL.md` | add one, or remove the folder if it is not meant to be a skill |
| `skill-name-missing` / `-mismatch` / `-format` | E(kit)/W(third-party) | frontmatter `name` absent, differs from the folder, or is not lowercase-hyphen | `name:` must equal the folder name exactly |
| `skill-duplicate-name` | E | two skill folders declare the same `name` | rename one — `/<name>` must be unique |
| `skill-name-collision` | W | the name shadows a built-in slash command | rename the skill (list in `templates.md` §5) |
| `skill-description-missing` / `-long` | E/W | no `description:`, or it is too long | third person, what + when + trigger words a user would say |
| `skill-too-long` (>500) / `skill-long` (>250, kit skills) | E/W | SKILL.md itself carries too much prose | move procedure detail, tables and examples into `references/`; keep only what every invocation needs |
| `skill-icon-missing` | W | no `metadata: { icon: <emoji> }` | add one emoji |
| `skill-no-frontmatter` / `skill-yaml` | E(kit)/W(third-party) | no `---` block, a YAML parse error, or a duplicate key | frontmatter as line 1 with `name`, `description`, optional `metadata: { icon }`; quote values containing `: ` |
| `skill-broken-link` / `skill-stray-file` | E/W | a relative link in the skill or its references does not resolve; or a stray `.md` sits directly in `skills/` | fix the path; move stray files into a proper `<name>/SKILL.md` |

Never fix a third-party skill's warning by editing its files — those are locked by `skills-lock.json`; reinstall
or update it through its own mechanism instead. Kit-skill contract checks doctor does not make (no `Used by:`
line, a worker told to delegate, a reference to a deleted skill) are in §Orchestrator-mode contract below.

## Agents (`.agents/agents/<name>.md`)

| code | E/W | cause | fix |
|---|---|---|---|
| `agent-no-frontmatter` / `agent-name-missing` / `-description-missing` | E | required keys absent | Antigravity itself rejects an agent missing name or description |
| `agent-name-builtin` | E | `name:` is `self`, `research` or `browser` | rename — those are reserved |
| `agent-name-mismatch` / `-format` / `agent-duplicate-name` | W/W/E | `name:` differs from the file name, is not lowercase-hyphen, or is used twice | the name is the `TypeName` the orchestrator dispatches and the hooks map to a phase: file name == `name`, unique |
| `agent-yaml` / `agent-bool` | E/W | frontmatter parse error or duplicate key; `subagent`/`mainAgent`/`hidden` not `true`/`false` | fix the YAML; booleans unquoted |
| `agent-policy-invalid` | E | `commandExecutionPolicy` not `off \| auto \| eager \| sandbox` | this kit uses `sandbox` for every agent |
| `agent-model-invalid` | E | `model:` is not `flash \| pro \| inherit` | use exactly one of those three tiers |
| `agent-tools-type` | E | `tools:` is not a YAML list | unlike a rule's `globs:` (a quoted string), an agent's `tools:` IS a YAML list — do not quote it into a string |
| `agent-tool-unknown` | E | a tool name doctor does not recognize | a misspelled tool can hang the subagent silently; use only the verified names (`view_file`, `write_to_file`, `replace_file_content`, `run_command`, `grep_search`, `find_by_name`, `list_dir`, `search_web`, `read_url_content`, `invoke_subagent`, `send_message`, `manage_subagents`, `define_subagent`, `manage_task`, `ask_question`, `call_mcp_tool`, `list_resources`, `read_resource`, `generate_image`, `schedule`) |
| `agent-tool-cli-unavailable` / `agent-tool-unverified` | W | `multi_replace_file_content` listed (the CLI silently drops it for subagents, VERIFIED), or a tool that exists in the binary but is not verified for subagents | use `replace_file_content`; drop the unverified tool |
| `agent-no-send-message` | W | a worker (`subagent` not `false`) body never mentions `send_message` | workers report once via `send_message`; end with the closing line of `templates.md` §6. The `orchestrator` (`subagent: false`) is exempt |
| `agent-no-h1` | W | no `# Role` / `# Procedure` / etc. sections | use the H1 body sections from `templates.md` §6 (worker) or §6b (orchestrator) |
| `agent-stray` | W | a non-`.md` file, or a folder without `agent.md`, under `.agents/agents/` | move or delete it; only `<name>.md` (or `<name>/agent.md`) is an agent |

## Hooks (`.agents/hooks.json`)

| code | E/W | cause | fix |
|---|---|---|---|
| `hooks-json-invalid` / `-config-invalid` | E | the file, or a file under `hooks/`, is not valid JSON | fix the syntax; hooks fail closed on a broken config |
| `hooks-shape` | E | a tool event (`PreToolUse`/`PostToolUse`) is missing the nested `{"matcher":..., "hooks":[...]}` wrapper, or a flat event (`PreInvocation`/`PostInvocation`/`Stop`) has one it should not | tool events group by matcher; flat events take handler objects directly — mixing the two shapes fails at runtime with "command hook must specify 'command'" |
| `hooks-script-missing` | E | the command names a script file that does not exist at the resolved path | remember hook commands run with CWD = `.agents/` — `node hooks/x.mjs`, not `node .agents/hooks/x.mjs` |
| `hooks-timeout` | E/W | timeout missing/non-numeric, or unreasonably high | hooks block the agent loop; keep timeouts small (this kit: 5–20 s) |
| `hooks-matcher` | E/W | matcher is not `"*"` or a valid regex | fix the pattern, or use `"*"` for every tool |
| `hooks-handler` | E | a handler is not `{ "type": "command", "command": "...", "timeout": N }` | fix the handler object |
| `hooks-unknown-key` / `hooks-empty` / `hooks-missing` | W | an unknown event name (silently dropped by Antigravity), a hook with no events, or no `hooks.json` at all (the verify, pipeline and learning gates are off) | use only `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop`, `enabled`; restore `hooks.json` |

Hooks v2 behaviour (role detection, the orchestrator guard's deny rules, dispatch tracking, `[orchestrator]`
notes, `PIPELINE GATE:`) has no doctor code: it is covered by `node --test ".agents/hooks/test/*.test.mjs"`. A hook
change without a matching synthetic-transcript test is a REVIEW finding.

## Orchestrator-mode roster (`roster-*`)

| code | E/W | cause | fix |
|---|---|---|---|
| `roster-worker-subagent-flag` | E | a non-orchestrator agent has `subagent` missing or not `true` | `subagent: true` (worker) or `subagent: false` (main agent) |
| `roster-worker-no-tools` / `-delegates` | E | a worker has no `tools:` list (inherits `invoke_subagent`), or lists `invoke_subagent` | list its tools explicitly, without `invoke_subagent`; workers report with `send_message` |
| `roster-worker-role` | E | a worker body lacks "You are a WORKER (<PHASE> phase). ..." under `# Role` | copy the role line from `templates.md` §6 |
| `roster-worker-unmapped` / `-phase` | E/W | a worker is not in `TYPE_PHASE` (`hooks/lib.mjs`), so its dispatches are phase OTHER; or its role line names another phase | add it to `TYPE_PHASE` (+ a hooks test); make the two agree |
| `roster-typemap-missing` / `roster-typemap-stale` | E/W | no `const TYPE_PHASE = {...}` literal in `hooks/lib.mjs`; or it maps a name with no agent file | restore the literal; remove the stale key |
| `roster-orchestrator-subagent` / `-writes` | E | the orchestrator is not `subagent: false`, has no `tools:` list, or lists a write tool | `subagent: false`, `mainAgent: true`, read/dispatch tools only |
| `roster-guard-missing` | E | no enabled PreToolUse command hook runs `hooks/orchestrator-guard.mjs` for the edit tools and `invoke_subagent` | restore `frontier-orchestrator-guard` in `hooks.json` with `"enabled": true` |

## Stray directory rules and lessons

| code | E/W | cause | fix |
|---|---|---|---|
| `stray-directory-rule` | E(inside `.agents/`)/W(elsewhere) | an `AGENTS.md`/`GEMINI.md` outside the two allowed locations | rename it (`README.md`); it was being injected as an always-on rule for its folder |
| `lessons-format` / `-duplicate-id` | W/E | a ledger line does not match the `- [L-NNNN] scope:<area> | +h -h | date | lesson | evidence: <where>` shape, or an id repeats | fix by hand only for formatting; use `node .agents/scripts/lessons.mjs` for anything that changes counters or ids |
| `lessons-promoted-unknown` | W | `90-lessons.md` cites an `L-NNNN` not in the ledger | fix the id, or add the missing ledger entry |
| `ref-missing` / `link-broken` | E/W | prose references a `.agents/...` path or a relative link that does not exist | fix the path, or create the missing file if the reference is correct |

## Orchestrator-mode contract (manual checks)

Items 1-3 are also doctor `roster-*` errors; the rest have no code. The reviewer applies these on every kit change. Copy each command exactly: the `|` inside the quotes is a regex
"or" for `search.mjs` (never escape it). Each item: check -> command -> fix.

1. A worker lists `invoke_subagent` or `manage_subagents`.
   `node .agents/scripts/search.mjs "invoke_subagent|manage_subagents" .agents/agents` -> only `orchestrator.md`
   may show them under `tools:`. Fix: remove the tool; workers report with `send_message` and never delegate.
2. The `orchestrator` agent lists a write tool. View `.agents/agents/orchestrator.md` `tools:`.
   Fix: remove `write_to_file` / `replace_file_content`; every change is a worker task.
3. A worker body lacks the role line or the Worker Report envelope.
   `node .agents/scripts/search.mjs "You are a WORKER" .agents/agents --files` must list every agent except
   `orchestrator.md`; `node .agents/scripts/search.mjs "Lesson candidates:" .agents/agents --files` the same.
   Fix: copy both from `templates.md` §6.
4. A kit skill has no `Used by:` line under its H1.
   `node .agents/scripts/search.mjs "^Used by:" .agents/skills --files`, compared with the kit skill folders.
   Fix: add it (`templates.md` §5 rules).
5. A skill tells a worker to delegate, or tells the orchestrator to edit a file. Read each procedure step for
   "dispatch", "invoke_subagent", "edit", "write". Fix: worker playbooks do the step or report `INPUT GAP:`;
   orchestrator playbooks say "dispatch an implementer / fixer / scribe with a brief that pastes X".
6. A reference to a deleted kit skill or rule (the five skills merged into `/orchestrate` in ADR-0002, the old
   delegation rule, the merged ADR topic rule).
   `node .agents/scripts/search.mjs "/feature\b|/bugfix|/refactor\b|/delegate|/review-changes|03-delegation-and-learning|topic-adr" .agents`
   Expected hits: this file, `.agents/.state/`, and fixtures in `.agents/scripts/test/*.test.mjs` /
   `.agents/hooks/test/*.test.mjs` (they test detection of the old names); never "fix" those. Fix: point to `/orchestrate` (+ its
   `references/task-types.md` section), `03-orchestration.md`, the worker agent, or
   `topic-architecture-decisions.md`.
7. A reference to a removed third-party skill.
   `node .agents/scripts/search.mjs "advisor-orchestrator-worker|remotion-best-practices|project-graveyard|first-reader|dependency-doctor" .agents`
   Expected hits: this file, `.agents/.state/`, and fixtures in `.agents/scripts/test/*.test.mjs` /
   `.agents/hooks/test/*.test.mjs`. Fix: remove it, or point to the kit's own
   replacement (the `orchestrate` skill, `/upgrade-deps`, an `explorer` search).
8. A TypeName in a skill or brief that has no agent file. Compare the names with `.agents/agents/*.md`.
   Fix: use an existing TypeName; a new agent needs every touchpoint in `templates.md` §8.
9. `rules/03-orchestration.md` missing, not `always_on`, or over 7,000 B: doctor `rule-size`; view the
   frontmatter. Fix: restore it per `templates.md` §7.

## The basename-only glob rule, in one place

Antigravity matches every `globs:` pattern against the file's NAME ONLY, never its path (VERIFIED, agy 1.2.10,
Windows). `**/*.tsx`, `*.tsx` and `**/*session*` all work. `src/**/*.tsx`, `**/routes/*.tsx`, `**/.agents/**` and
any pattern with a `/` before the final segment NEVER match — silently, with no error at runtime, which is why
`doctor.mjs` treats it as an ERROR rather than a warning. There is no supported way to scope a rule to one
directory by glob; use a basename naming convention, or `trigger: model_decision` with a description that names
the folder (never a directory `AGENTS.md`: SKILL.md invariant 4, doctor `stray-directory-rule`).
