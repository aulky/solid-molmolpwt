# Exact templates for kit pieces

Provenance, so you know what is quoted vs. derived: §1 (Language pack) and §4 (Deep guide) are reproduced
verbatim from the kit's design contract (§10 of the kit's original research notes, kept outside the published
repo; overview in `.agents/docs/architecture.md`). §2 (Framework pack) and §3 (Topic rule) spell out that
contract's one-line note that those two are "identical to the language pack template except" a short list of
differences. §5 (Skill), §6 (Worker agent) and §6b (Orchestrator agent) follow the orchestrator-mode contract
(`.agents/docs/adr/0002-orchestrator-mode-pipeline.md`): every agent is either the one ORCHESTRATOR or a WORKER that
runs exactly one task. §7 lists what the orchestrator-mode pieces must contain; §8 lists what else to update
when you add or remove a piece.

Copy a template, fill the placeholders, then run `node .agents/scripts/doctor.mjs` before doing anything else
with the new file. Sizes are targets, not the platform's hard cap (24,000 B for any rule or guide file).

## 1. Language pack — `.agents/rules/lang-<id>.md`, 3,000–5,500 bytes

```
---
trigger: glob
globs: "<patterns>"
description: "<Language> quick card: toolchain, invariants, idioms, pitfalls. Loaded when editing <ext> files."
---
# <Language> — quick card
Deep guide: `.agents/guides/languages/<id>.md` — read it before non-trivial <Language> work (new module, concurrency, public API, perf).

## Toolchain (use the project's own config first)
- Format: `<cmd>` · Lint: `<cmd>` · Types/Build: `<cmd>` · Test: `<cmd>` · All: `node .agents/scripts/verify.mjs --only <stack>`
## Invariants (MUST / NEVER — with reason → alternative)
1. ...(5–9 items)
## Idioms & pitfalls Flash models get wrong
- ...(6–12 bullets, concrete, version-aware)
## Example — bad → good
(one small pair, ≤ 12 lines each)
## Before finishing
- [ ] formatted · [ ] lint/types clean · [ ] tests for new behaviour pass · [ ] no <lang-specific red flags>
```

`globs:` is ONE double-quoted, comma-separated string of basename-only patterns, e.g.
`globs: "**/*.rs,**/Cargo.toml"`. Every pattern is `**/<basename-glob>` — see `defect-classes.md` §Globs for why.

## 2. Framework pack — `.agents/rules/fw-<id>.md`

Identical to the language pack template, except:
- `trigger: model_decision` by default (keep `globs:` in the frontmatter anyway — `activate-stack.mjs` flips the
  trigger to `glob` once it detects the framework's manifest dependency; it never touches `globs:`).
- Body line 1 after the title is the guard:
  ```
  Applies only if <manifest condition, e.g. package.json dependency "solid-js">. Otherwise ignore this rule.
  ```
- Deep guide line points to `.agents/guides/frameworks/<id>.md` instead of `languages/`.
- Sections: `## Project shape`, `## Invariants`, `## Patterns`, `## Pitfalls`, `## Example`, `## Before finishing`
  (no `## Toolchain` — the framework's toolchain lives in its matching language pack; do not repeat it).

## 3. Topic rule — `.agents/rules/topic-<id>.md`

Same spirit as a language/framework pack, ≤ 5,500 bytes, `trigger: glob` (basename patterns) or
`trigger: model_decision` for a broad situational topic with no reliable file signature. Add one pointer line to
the relevant `guides/principles/<id>.md`. Use the language-pack section order; drop `## Toolchain` unless the
topic has one (e.g. `topic-testing.md` can list test runners).

## 4. Deep guide — `guides/{languages,frameworks,principles}/<id>.md`, 9,000–20,000 B, HARD MAX 23,000 B

```
# <Subject> — engineering guide
> Scope, audience, last verified: 2026-09 (what you verified and how).
## 1. Mental model / philosophy
## 2. Project structure & tooling (commands; config files; version notes verified)
## 3. Core idioms (with short code)
## 4. Error handling
## 5. Testing (framework, patterns, commands)
## 6. Performance
## 7. Security
## 8. Concurrency / async (where relevant)
## 9. Anti-patterns → fixes (table)
## 10. Review checklist
## 11. References (official docs URLs)
```

Principles guides (`guides/principles/<id>.md`) adapt the sections to: definition → why → how to check → examples
in at least 3 languages → anti-patterns → checklist. Every version or API claim in a guide must be verified
(installed package, official docs, or context7) and dated; never state one from memory as current.

## 5. Skill — `.agents/skills/<name>/SKILL.md` (≤ 250 lines for a kit skill; bulk → `references/`)

Fenced with 4 backticks below because the template itself contains two literal 3-backtick example fences
(Checklist, Output) — a 3-backtick outer fence would close early on the first one it meets.

````
---
name: <name>
description: <third person: what it does + who uses it + when, with the words a user would say>
metadata:
  icon: <one emoji>
---
# <Title>

Used by: <orchestrator | worker TypeNames, e.g. "test-engineer"; for a task-type playbook: "orchestrator (plans
with it); workers follow the step for their phase - <TypeName> (<PHASE>: step N), ...">

## When to use
- <trigger 1>
- <trigger 2>

Do NOT use for:
- <adjacent case> — use `/<other-skill>` instead.

## Invariants
1. <MUST/NEVER — with reason → alternative>

## Checklist
Copy this and tick items as you go:
```
- [ ] <item>
```

## Procedure
1. **<Step>.** <what to do; in an orchestrator playbook: the PHASE, which worker does it, what its brief
   pastes>. Check: <how you know it worked>.

## Output
```
## <Title> Report   (orchestrator playbooks: a "### <Title>" block inside the Completion Report)
- <field>: <value>
```

## References
- [references/<file>.md](references/<file>.md): <what it holds>.
````

Rules for every kit skill:
- `name:` equals the folder name exactly (lowercase-hyphen). Every skill is a slash command `/<name>` — never
  reuse a built-in name (`/plan`, `/learn`, `/rewind`, `/fork`, `/browser`, `/model`, `/agents`, `/skills`,
  `/hooks`, `/help`, `/config`, `/usage`, `/permissions`, `/effort`).
- The `Used by:` line comes right under the H1. Three kinds: worker playbook (`verify`, `write-tests`,
  `e2e-test`, `research-docs`, `security-audit`, `reflect`, `capture-skill`), task-type playbook the orchestrator
  plans with (`perf-audit`, `db-migration`, `upgrade-deps`), orchestrator-level (`orchestrate`, `start`, `onboard-repo`,
  `new-project`, `commit-and-pr`, `workspace-doctor`).
- NEVER tell a worker to delegate, dispatch or call `invoke_subagent` (workers cannot). An orchestrator playbook
  NEVER tells the orchestrator to edit a file: every write is "dispatch an implementer / fixer / scribe with a
  brief that pastes X".
- Name workers only by TypeNames that exist in `.agents/agents/`; name phases exactly EXPLORE, PREPARE,
  IMPLEMENT, REVIEW, FIX, TEST, LEARN.
- Register a new kit skill in the touchpoints of §8.

## 6. Worker agent — `.agents/agents/<name>.md` (2–6 KB)

````
---
name: <name>
description: "<PHASE>-phase worker: <what it produces for one task>. <when the orchestrator dispatches it>."
model: flash | pro | inherit
subagent: true
mainAgent: false
tools:
  - view_file
  - grep_search
  - find_by_name
  - list_dir
  - run_command
commandExecutionPolicy: sandbox
---

# Role
You are a WORKER (<PHASE> phase). You run exactly one task — the one in your brief — and report with send_message. You never delegate and you ignore orchestrator-only instructions in the always-on rules.

<one paragraph: what this worker is for; read-only workers add "You never modify files.">

# Inputs you will receive
The orchestrator's brief is everything you know (you have no conversation history):
- `TASK: <T-id> | PHASE: <PHASE> | AGENT: <name>` - copy the T-id into your status line.
- `OBJECTIVE:` one outcome. `CONTEXT:` <what this worker needs pasted>.
- `OWNED FILES:` <what it may edit> | read-only. `DO NOT:` obey it.
- `DONE WHEN:` numbered criteria. Missing input -> status BLOCKED, `INPUT GAP: <what>`.

# Procedure
1. <bounded step: max N searches, M file windows>
STOP when <criteria>.

# Rules
- NEVER <action> - because <reason>. Instead <alternative>.
- One command per `run_command` (PowerShell): no `&&`, forward slashes, `python` not `python3`.

# Output format
Status: PASS = ...; FAIL = ...; BLOCKED = ...
```text
## <name>: <PASS | FAIL | BLOCKED> — <T-id>
<agent-specific body>
Evidence: <command -> key output lines | path:line>
Files touched: <list | none>
Lesson candidates: <one-line "when X, do Y because Z" | none>
```
Example (illustrative):
```text
<a short filled example>
```

Send your final result with send_message to the caller: one message containing only the filled envelope, no preamble. If you are blocked or failed, still send it with the output you saw. The orchestrator is waiting for your message and cannot continue without it.
````

- Tools: a YAML list of verified names only (`defect-classes.md` §Agents). Writers add `write_to_file` and
  `replace_file_content`. NEVER list `invoke_subagent` or `manage_subagents` for a worker (workers never
  delegate) and NEVER `multi_replace_file_content` (the CLI silently drops it for subagents).
- `name` must not collide with the built-in subagents `self`, `research`, `browser`; the file name equals `name`
  (it is the `TypeName` in `invoke_subagent`).
- The Worker Report envelope lines (`## <agent>: <status> — <T-id>`, `Evidence:`, `Files touched:`,
  `Lesson candidates:`) are exact: the orchestrator greps them.
- Current roster (phase — model): explorer, docs-researcher, git-historian (EXPLORE — flash); planner
  (PREPARE — pro); advisor (consult — pro); implementer (IMPLEMENT — inherit); reviewer, security-auditor
  (REVIEW — pro); fixer, debugger (FIX — inherit); test-engineer, e2e-tester (TEST — inherit); scribe
  (LEARN — flash).

## 6b. Orchestrator agent — `.agents/agents/orchestrator.md` (exactly one)

Differences from §6: `subagent: false`, `mainAgent: true`, `model: inherit`; tools = `view_file`, `grep_search`,
`find_by_name`, `list_dir`, `run_command`, `invoke_subagent`, `manage_subagents`, `send_message`, `search_web`,
`read_url_content`, `ask_question`, `manage_task`, and NO write tool (`write_to_file`, `replace_file_content`).
Body: `# Role` "You are the ORCHESTRATOR ..." plus the runbook pointer `/orchestrate`; `# Procedure` = the 7
phases condensed, with worker TypeNames and gates; `# Rules` (no workspace edits, one task per worker, never
answer on a report not yet received, commit only when asked); `# Output format` = the task board and the
Completion Report. No send_message closing line (it reports to the user). Selectable with `/agents` or
`agy --agent orchestrator`; the always-on rules make every non-worker conversation act as the orchestrator anyway.

## 7. Orchestrator-mode pieces (what must stay true)

| Piece | Must contain / satisfy | Check |
|---|---|---|
| `rules/00-core-protocol.md` | `trigger: always_on`, <= 7,000 B; role check (a conversation that starts with `[Message] ... sender=` or a `You are a WORKER` prompt is a worker; every other is the orchestrator); shared invariants; hook message prefixes `[kit]`, `[orchestrator]`, `[worker]`, `QUALITY GATE:`, `PIPELINE GATE:`, `TEST INTEGRITY:`, `LEARNING:` | doctor; `wc -c` |
| `rules/03-orchestration.md` | `trigger: always_on`, <= 7,000 B; no-edit rule; lanes S/M/L; the 7 phases with worker TypeNames and gates; one task per agent + redundancy; the brief template (TASK/PHASE/AGENT, OBJECTIVE, CONTEXT, OWNED FILES, ALLOWED COMMANDS, DO NOT, DELIVERABLE, DONE WHEN); TypeName only from the 13 workers; lane S the only lane that skips EXPLORE/PREPARE; `send_message` to a worker only for its INPUT GAP; full verify after the scribe's LEARN reply; async waiting; grading PASS/FIX/ESCALATE; FIX loop (max 2 rounds); Completion Report; LEARN via scribe. It replaced the old delegation rule: no other `03-*.md` file may exist | doctor; `list_dir` of `.agents/rules/` shows exactly one `03-*.md` |
| `.agents/GEMINI.md` | <= 3,500 B; "orchestrator mode is always on"; the 7-phase line; roster by phase; lanes one-liner; task-type routing (`/perf-audit`, `/security-audit`, `/db-migration`, `/upgrade-deps`, `/onboard-repo`, `/new-project`, `/workspace-doctor`, `/commit-and-pr` when asked); the 5 third-party skills | doctor `alwayson-size`, `budget` |
| `skills/orchestrate/` | SKILL.md <= 250 lines: role check, lanes, a checklist + gate per phase, dispatch shape, fan-out, waiting, grading, escalation, REPORT; `references/briefs.md` has a filled brief for EVERY worker TypeName plus the FIX brief and status board; `references/task-types.md` covers feature, bugfix, refactor, performance, security, db-migration, dependency-upgrade, docs-only, question-only; `references/review-checklist.md` | a new worker -> a new briefs.md section |
| Hooks v2 (`hooks/*.mjs`) | `orchestrator-guard.mjs` (PreToolUse on the 3 edit tools + `invoke_subagent`, enabled): in the orchestrator only, denies workspace edits and waves with > 3 entries, a non-worker TypeName, a Prompt without exactly one `TASK: T<n>`, exactly one `OBJECTIVE:`, `OWNED FILES:` and `DONE WHEN:`, or overlapping writer OWNED FILES; always an explicit decision, else `guard.config.json` `orchestratorGuardPassthrough`; per-conversation state: `role`, `children`, `dispatches` (<= 100), `orchestratorEditWarned`, `gate.pipelineBlocks`; role from the transcript's first step (`SYSTEM_MESSAGE` containing `sender=`, a brief or `You are a WORKER` -> worker; unreadable -> null, guard allows, pipeline gate off); TypeName -> phase map (explorer, docs-researcher, git-historian -> EXPLORE; planner -> PREPARE; implementer -> IMPLEMENT; reviewer, security-auditor -> REVIEW; fixer, debugger -> FIX; test-engineer, e2e-tester -> TEST; scribe -> LEARN; advisor -> CONSULT; anything else -> OTHER); `[orchestrator]` notes for shell writes, a message to a finished worker and (backstop) edits; `PIPELINE GATE:` on Stop for a Completion Report while a child is outstanding, and, with none outstanding, for a missing REVIEW after the latest IMPLEMENT/FIX, TEST PASS, full verify after TEST, or scribe PASS (max 3 consecutive blocks); worker `QUALITY GATE:` and `LEARNING:` texts point to the Worker Report | `node --test ".agents/hooks/test/*.test.mjs"`; each hook < 1 s |
| Worker agents | §6 role line, Worker Report envelope, closing send_message line; `subagent: true`; explicit `tools:` without `invoke_subagent`; a TYPE_PHASE entry | reviewer reads each; doctor `agent-*` and `roster-*` codes |

## 8. Touchpoints when adding or removing a piece (one task per file set)

| You add / remove | Also update (each its own task, disjoint OWNED FILES) |
|---|---|
| Worker agent | the TypeName -> phase map in the hooks lib (`.agents/hooks/lib.mjs`; search it for `implementer`) + a hooks test, or the new worker counts as OTHER and the PIPELINE GATE never sees it; `rules/03-orchestration.md` phase line (if it joins a phase); `.agents/GEMINI.md` roster; `skills/orchestrate/references/briefs.md` (a filled brief) and the SKILL.md phase checklist; `scripts/kit-install.mjs` and `scripts/doctor.mjs` if either hard-codes agent names (+ their tests); `docs/architecture.md` |
| Kit skill | `KIT_SKILLS` in `scripts/kit-install.mjs` (+ `scripts/test/kit-install.test.mjs`); `.agents/GEMINI.md` routing if it is a task-type or orchestrator playbook; `skills/orchestrate/references/task-types.md` if it is a task-type playbook |
| Third-party skill | `THIRD_PARTY_SKILLS` in `scripts/doctor.mjs` AND `scripts/kit-install.mjs` (+ tests); `rules/topic-installed-skills-compat.md`; `.agents/GEMINI.md` list; `skills-lock.json` only through the installer |
| Always-on rule | budget re-measured (doctor); `rules/topic-agent-kit.md` `globs:` if it lists core rule files by name |
| Renamed or deleted anything | `node .agents/scripts/search.mjs "<old name>" .agents` and the root `AGENTS.md`: every hit is a task (`.scratch/` is never edited) |
