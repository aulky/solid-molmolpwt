---
trigger: glob
globs: "**/hooks.json,**/track-tools.mjs,**/inject-context.mjs,**/quality-gate.mjs,**/command-guard.mjs,**/lessons.md,**/90-lessons.md,**/lang-*.md,**/fw-*.md,**/topic-*.md,**/00-core-protocol.md,**/01-engineering-standards.md,**/02-evidence-and-communication.md,**/03-orchestration.md,**/doctor.mjs,**/activate-stack.mjs,**/verify.mjs,**/kit-install.mjs"
description: "Kit maintenance card: rule frontmatter, basename-only globs, byte caps, agent roster, skill and hook v2 contracts, doctor. Loaded when editing kit rules, lessons, hooks or kit scripts."
---
# Agent kit maintenance - topic card
Platform facts: `.agents/docs/antigravity-spec.md`. Layers and roles: `.agents/docs/architecture.md`. Procedure: `/workspace-doctor`. Pipeline: `03-orchestration.md`, runbook `/orchestrate`.
Orchestrator mode: a kit change is an IMPLEMENT task (worker `implementer`, OWNED FILES = the kit files) followed by REVIEW, TEST and LEARN. The orchestrator never edits kit files. `.agents/memory/`, `90-lessons.md`, root `AGENTS.md`, guide fixes and skill drafts (`/capture-skill`) are written by the `scribe`.

## Toolchain (the worker that edits runs these before its Worker Report)
- Validate: `node .agents/scripts/doctor.mjs` (`--quiet` = problems only; exit 1 = errors) after EVERY kit edit (the Stop gate ignores rule and guide edits).
- Tests: `node --test ".agents/hooks/test/*.test.mjs"` and `node --test ".agents/scripts/test/*.test.mjs"`. Pass the quoted glob, never a bare directory (fails: `Cannot find module`).
- Framework triggers: `node .agents/scripts/activate-stack.mjs --dry-run`, then without it. All kit checks: `node .agents/scripts/verify.mjs --only agent-kit`.

## Invariants (MUST / NEVER - with reason -> alternative)
1. Rules live FLAT in `.agents/rules/` - subfolder files are silently ignored.
2. Every rule starts with YAML frontmatter on line 1: `trigger:` exactly `always_on` | `glob` | `model_decision` | `manual`, plus a one-line `description:` (<= 200 chars, what + when). Missing or unknown trigger = rule silently ignored. `model_decision` rules are seen only by description.
3. `globs:` is ONE double-quoted, comma-separated string: `globs: "**/*.rs,**/Cargo.toml"`. NEVER a YAML list (ignored) or brace expansion. Matching is BASENAME-ONLY: write `**/<basename-glob>`. A directory part (`src/**`, `.agents/**`) never fires -> file-name convention or `model_decision`.
4. Byte caps (`wc -c`): each always_on rule (00-03) <= 7,000 B; `90-lessons.md` <= 4,500 B; glob and model_decision rules <= 6,000 B; root `AGENTS.md` and `.agents/GEMINI.md` <= 3,500 B; guides <= 23,000 B (error at 24,000). Always-on total (bytes/4) <= ~9,000 tokens.
5. NEVER create `AGENTS.md` or `GEMINI.md` except repo-root `AGENTS.md` and `.agents/GEMINI.md` - any other becomes an always-on folder rule.
6. Skills: `.agents/skills/<name>/SKILL.md`, one level deep, `name` == folder, third-person `description`, <= 250 lines, bulk in `references/`, a `Used by: <orchestrator | worker TypeNames>` line under the H1. No skill tells a worker to delegate. Removed skills stay removed: `/feature`, `/bugfix`, `/refactor`, `/delegate`, `/review-changes` -> `/orchestrate` + `.agents/skills/orchestrate/references/task-types.md`. NEVER modify the 5 third-party skills in `skills-lock.json`.
7. Agents: flat `.agents/agents/<name>.md`, `model` `flash` | `pro` | `inherit`, `tools` a YAML list of exact tool names (never `multi_replace_file_content`). Roster (14): `orchestrator` (`mainAgent: true`, `subagent: false`, no write tools) + 13 workers (`subagent: true`, `mainAgent: false`, never `invoke_subagent`): EXPLORE `explorer`, `docs-researcher`, `git-historian`; PREPARE `planner`; consult `advisor`; IMPLEMENT `implementer`; REVIEW `reviewer`, `security-auditor`; FIX `fixer`, `debugger`; TEST `test-engineer`, `e2e-tester`; LEARN `scribe`. Worker body: `# Role` (WORKER line), `# Inputs you will receive`, `# Procedure`, `# Rules`, `# Output format` (Worker Report envelope), `send_message` last; 2-6 KB. A new TypeName also goes into the hooks phase map and `kit-install.mjs`.
8. Hooks: `.agents/hooks.json` commands run with CWD `.agents/` -> `node hooks/<file>.mjs`. Print ONE JSON object. PreToolUse MUST return an explicit `decision` - `{}` DENIES. PostToolUse -> `{}`. PreInvocation -> `{"injectSteps":[{"ephemeralMessage":"..."}]}`. Stop -> `{"decision":"continue","reason":"..."}` blocks, `{}` allows. On any error print `{}` (PreToolUse: `{"decision":"ask"}`); never log env or secrets; < 1 s.
9. Hook messages start with `[kit]`, `[orchestrator]`, `[worker]`, `QUALITY GATE:`, `PIPELINE GATE:`, `TEST INTEGRITY:` or `LEARNING:`. A new prefix also goes into 00. Role: transcript step 0 `SYSTEM_MESSAGE` with `sender=` -> worker; role unknown -> pipeline gate OFF.

## Pitfalls Flash models get wrong
- Framework packs: body line 1 is `Applies only if <manifest condition>. Otherwise ignore this rule.` `activate-stack.mjs` owns their `trigger:` line; do not flip it by hand.
- Lessons: `node .agents/scripts/lessons.mjs add --scope <area> --text "..." --evidence "..."` (scribe). Never rewrite the ledger. Promote to `90-lessons.md` only when helpful >= 2 and harmful 0, ending `(L-NNNN)`.
- No `.agents/workflows/` (deprecated) -> skill. Taken names: /plan /learn /rewind /fork /browser /model /agents /skills /hooks /help /config; subagents self, research, browser.
- Orchestrator-only protocol goes in `03-orchestration.md` or `/orchestrate`; a topic rule addresses workers unless its first lines name who does what.
- Commands must work in PowerShell and sh: `node ...`, forward slashes, no `&&`, no `VAR=x cmd`.

## Before finishing
- [ ] `node .agents/scripts/doctor.mjs` reports no errors; every edited kit file within its cap (`wc -c`)
- [ ] No new AGENTS.md/GEMINI.md, no nested rule folders, third-party skills untouched, no deleted skill name reintroduced
- [ ] Hook or script edits: both `node --test` suites pass; changed files in the Worker Report
