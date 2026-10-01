# Frontier Kit architecture

How `.agents/` is organized, why it has this shape, and where to extend it. Platform facts this design depends
on: `.agents/docs/antigravity-spec.md`. Decisions: `.agents/docs/adr/0001-adopt-antigravity-frontier-kit.md` (the layered
kit) and `.agents/docs/adr/0002-orchestrator-mode-pipeline.md` (always-on orchestrator mode). The full research
trail (the kit's original research notes) is kept outside the published repo; this file is the short version
that travels with the kit.

## The problem this solves

A low-tier model (Gemini Flash) degrades in three measured ways: it stops verifying its own work once the output
"looks done", its instruction-following decays as the prompt grows, and one agent doing everything (explore,
plan, code, review its own code, test) leaves gaps it cannot see from inside its own context. None of these is
fixed by a longer prompt. The fixes are architectural:

1. Anything that **must** happen is a deterministic hook or script, not a request.
2. The always-on prompt stays small; everything else sits behind a trigger reached only when relevant.
3. Work is split into small, single-task briefs for fresh-context workers, and a separate core agent checks
   every result (orchestrator mode).

## Roles

The first thing every agent does is the **role check** (`rules/00-core-protocol.md`):

- A conversation whose first step is a message from another agent (`[Message] ... sender=<id>`), or whose system
  prompt says `You are a WORKER`, is a **WORKER**.
- Every other conversation (the one the user talks to, including the default agent) is the **ORCHESTRATOR**.

| | ORCHESTRATOR | WORKER |
|---|---|---|
| Owns | understanding the request, the lane, the task board, one-task briefs, dispatch, waiting, grading results, final verification, Completion Report | exactly the ONE task in its brief |
| Edits files | never inside the workspace; every change is a worker task | only the brief's `OWNED FILES` (read-only workers: none) |
| Delegates | yes, `invoke_subagent` (waves of <= 3) | never; workers' `tools` lists omit `invoke_subagent` |
| Reports | Completion Report with a phase ledger | once, via `send_message`, in the Worker Report envelope |
| Protocol | `rules/03-orchestration.md`, runbook `/orchestrate` | `rules/00-core-protocol.md` + its own agent file |

Two ways to run the orchestrator:

- **Default agent** (always available): the always-on rules and the hook cards make it the orchestrator. It still
  has write tools, so `orchestrator-guard.mjs` denies its workspace edits and malformed dispatches, and the Stop
  hook gates the end of its turn.
- **Strict agent** `orchestrator` (`agents/orchestrator.md`, `mainAgent: true`, `subagent: false`): no write tools
  at all. Select it with `/agents` or `agy --agent orchestrator`. Antigravity cannot make a custom agent the
  persistent default, so it is selected per session.

## The pipeline

Every change runs `EXPLORE -> PREPARE -> IMPLEMENT -> REVIEW -> FIX -> TEST -> LEARN`, then the orchestrator's
REPORT. These exact phase names are used in rules, skills, agents, hooks and reports.

| # | Phase | Workers | Exit gate (the orchestrator checks it) |
|---|---|---|---|
| 1 | EXPLORE | `explorer` (1-3, one area each), `docs-researcher`, `git-historian` | files/lines to change, sibling pattern, constraints named; lessons searched |
| 2 | PREPARE | `planner`; `advisor` critique (lane L) | 2-5 checkable acceptance criteria; T1..Tn each with one objective, disjoint OWNED FILES, DONE WHEN, test plan |
| 3 | IMPLEMENT | `implementer`, one per task; parallel only for disjoint files | each reports PASS with check output |
| 4 | REVIEW | `reviewer`; `security-auditor` for security surface | APPROVE, or APPLY findings listed |
| 5 | FIX | `fixer` per task's APPLY set; `debugger` first when the cause is unclear | targeted re-review passes; max 2 rounds, then ESCALATE (`advisor` or user) |
| 6 | TEST | `test-engineer` (unit/integration/API/CLI via tools), `e2e-tester` (browser, Playwright) | tests for new/changed behaviour pass; `verify.mjs` PASS; e2e PASS when UI changed |
| 7 | LEARN | `scribe` | Learn Report: lessons added/voted, docs updated, or "nothing new" |
| - | REPORT | orchestrator | it ran `node .agents/scripts/verify.mjs` itself after the last write-phase result |

- REVIEW is never skipped after IMPLEMENT, TEST never after IMPLEMENT/FIX, LEARN never at the end of a pipeline.
- FIX loops back to a targeted REVIEW, then TEST. A TEST failure goes to `debugger` (when the cause is unclear)
  -> `fixer` -> REVIEW -> TEST.
- `advisor` is a consult, not a phase: plan critique, stuck after 2 FIX rounds, conflicting results, final audit.
- A question with nothing to change skips the pipeline: the orchestrator answers with `path:line` evidence.
- How the pipeline adapts per task type (feature, bugfix, refactor, performance, security, migration, dependency
  upgrade, docs-only): `.agents/skills/orchestrate/references/task-types.md`.

### Lanes

| | S (small) | M (default) | L (large / critical) |
|---|---|---|---|
| When | <= 2 files, <= ~40 lines, no API/schema/auth/dependency change | anything else | > 8 files, public API or schema, migration, auth/crypto/payments, concurrency, 2 failed FIX rounds |
| EXPLORE | orchestrator reads (<= 4) or 1 explorer | 1-3 explorers (+ docs-researcher) | M + git-historian |
| PREPARE | orchestrator writes a 1-task board | planner | planner + advisor critique |
| IMPLEMENT | 1 implementer | 1 per task, waves of <= 3, disjoint files | M; critical task: 2 attempts, reviewer picks |
| REVIEW | 1 reviewer | 1 per task or integrated diff (+ security-auditor) | 2-3 reviewers, different lenses |
| FIX | fixer if needed | fixer per task with APPLY findings | same |
| TEST | test-engineer (+ e2e-tester if UI) | test-engineer + e2e-tester in parallel | M + adversarial edge-case brief |
| LEARN | scribe | scribe | scribe + advisor success audit before REPORT |

### One agent, one task

A worker runs exactly one task and never "also fixes" something else; missing input or out-of-scope work is
reported as `INPUT GAP:` / `OUT OF SCOPE:`. One task MAY get several agents (parallel attempts, review lenses,
exploration areas); the orchestrator merges them explicitly (pick or reconcile with a reason, never average).
Every dispatch uses the brief template (`TASK | PHASE | AGENT`, `OBJECTIVE`, `CONTEXT`, `OWNED FILES`, `DO NOT`,
`DELIVERABLE`, `DONE WHEN`); every result starts `## <agent>: <PASS | FAIL | BLOCKED> — <T-id>`. Filled briefs for
every worker type: `.agents/skills/orchestrate/references/briefs.md`.

`invoke_subagent` is asynchronous: it returns child ids at once and each child answers later via `send_message`.
The orchestrator ends its turn with a status board and never acts on a result it has not received.

## The layers

| Layer | Mechanism | What lives there | Loaded |
|---|---|---|---|
| **Core** | `trigger: always_on` | `rules/00-core-protocol.md`, `01-engineering-standards.md`, `02-evidence-and-communication.md`, `03-orchestration.md`, `90-lessons.md`, root `AGENTS.md`, `.agents/GEMINI.md` | Every turn |
| **Language/framework packs** | `trigger: glob` (or `model_decision` until `activate-stack.mjs` detects the stack) | `rules/lang-*.md`, `rules/fw-*.md` | When the agent touches a matching file |
| **Topic rules** | `trigger: glob` or `model_decision` | `rules/topic-*.md` | By file name, or when the model recognizes the situation |
| **Deep guides** | plain files | `guides/principles/`, `guides/languages/`, `guides/frameworks/` | When a rule, skill or brief points to them |
| **Skills** | `skills/<name>/SKILL.md` | `/orchestrate` + worker and task-type playbooks (each has a `Used by:` line) | On `/name` or when the description matches |
| **Agents** | `agents/<name>.md` | `orchestrator` + 13 single-task workers | Workers via `invoke_subagent`; `orchestrator` via `/agents` or `--agent` |
| **Hooks** | `hooks.json` + `hooks/*.mjs` | Role cards, gates, feedback | Every tool call / model call / stop |
| **Scripts** | plain Node, zero dependencies | `scripts/*.mjs` | Run by agents or hooks |
| **Memory** | `memory/lessons.md` (+ curated `rules/90-lessons.md`) | Cross-session lessons | Searched in EXPLORE; written in LEARN |
| **Runtime state** | `.state/*` (gitignored) | Per-conversation tracking | Never hand-edited |

Core and the promoted lessons cost full text every turn (about 8,200 of the 9,000-token target); every
`model_decision` rule and skill also costs its one-line description every turn (about 4,200 tokens more, reported
separately by `node .agents/scripts/doctor.mjs`). Everything else is progressive disclosure.

## Why hooks, not just rules

A rule can only ask. A weak model sometimes skips the request, so every "must" is also a hook. All hooks share a
per-conversation state file `.state/conv-<id>.json` and print exactly one JSON object.

- **Role detection** (`hooks/lib.mjs`): reads the transcript head. Step 0 of type `SYSTEM_MESSAGE` containing
  `sender=`, or a step 0 carrying a dispatch brief (`TASK: T<n>` + `AGENT:`, or `TASK:` + `OBJECTIVE:` +
  `OWNED FILES:`) or `You are a WORKER`, means worker; a parent-written child marker also marks a worker; any
  other step 0 means orchestrator. Unreadable -> role unknown: the guard allows and the pipeline gate stays off.
- **`orchestrator-guard.mjs`** (PreToolUse on `write_to_file|replace_file_content|multi_replace_file_content|
  invoke_subagent`, shipped enabled): the hard half of the no-edit and one-task-per-agent rules. Only in a
  conversation that is positively the orchestrator it returns `deny` with a corrective reason for (1) an edit of
  a path inside the workspace, (2) an `invoke_subagent` wave with more than 3 entries, a TypeName outside the 13
  workers in `agents/` (never `self`, `research`, `browser`, `orchestrator`), a Prompt without exactly one
  `TASK: T<n>` id, exactly one `OBJECTIVE:`, an `OWNED FILES:` and a `DONE WHEN:` line, or two writers whose
  `OWNED FILES` overlap. Everything else gets `orchestratorGuardPassthrough` from `hooks/guard.config.json`
  (`"allow"` default, or `"ask"` for the normal permission prompt). It always prints an explicit decision
  (`{}` denies the tool) and falls back to the passthrough decision on any error.
- **`track-tools.mjs`** (PostToolUse): records views, edits and check commands, runs a fast syntax check after
  edits. For an orchestrator it records each `invoke_subagent` dispatch with its phase (the brief's `PHASE:`
  when that type may run it and the phase's gate owner matches, else the TypeName -> phase map; a wave the guard
  denied is not recorded), links dispatches to child ids from the `Created the following subagents:` result, and
  queues an `[orchestrator]` note when the orchestrator runs a file-writing shell command (`Set-Content`, `>`,
  formatters, installs, `lessons.mjs add|vote`, git writes; it belongs in a worker's `ALLOWED COMMANDS:`), when
  it messages a worker that already reported (new work = new dispatch), and, as a backstop if the guard is
  disabled, once per file it edits itself.
- **`inject-context.mjs`** (PreInvocation): the `[orchestrator]` or `[worker]` role card on the first call; queued
  notes; unverified-edit and drift reminders; child replies (`sender=<childId>`) marked as received;
  `[orchestrator] waiting on <n>: <list>` on every call while workers are outstanding, and every 5th
  orchestrator call the phase ledger `Phases: EXPLORE ✓ ... | waiting on: <n> worker(s)`.
- **`quality-gate.mjs`** (Stop): QUALITY GATE (code changed after the last passing check), TEST INTEGRITY (added
  skips, removed assertions), PIPELINE GATE (orchestrator only), LEARNING nudge after a fail-then-pass. The
  PIPELINE GATE blocks (a) a Completion Report written while a worker is outstanding, and (b) after
  IMPLEMENT/FIX work with no worker outstanding, a missing REVIEW dispatch after the latest IMPLEMENT or FIX
  dispatch, a missing PASS reply from `test-engineer`/`e2e-tester`, a missing passing FULL `verify.mjs` (not
  `--quick`) after the latest TEST reply, or a missing `scribe` PASS reply. FAIL/BLOCKED replies do not count and
  only e2e may be "not applicable"; max 3 consecutive blocks per missing set, reset when a phase is completed or
  new IMPLEMENT/FIX work is dispatched. It never blocks a legitimately waiting orchestrator or an abnormal
  termination, and appends a metrics line (with `role`, `dispatches`, `pipelineBlocked`) to
  `.state/sessions.jsonl`.
- **`command-guard.mjs`** (PreToolUse on `run_command`, shipped disabled): denies or force-asks catastrophic or
  risky commands. It always returns an explicit decision, because `{}` denies the tool.

Tests: `node --test .agents/hooks/test/hooks.test.mjs` (synthetic transcripts for role detection, dispatch
tracking, replies and every gate branch).

## The learning loop

1. EXPLORE: the orchestrator runs `node .agents/scripts/lessons.mjs search <keyword>` and pastes relevant lessons
   into briefs.
2. Every Worker Report ends with `Lesson candidates:` (one line: "when X, do Y because Z", or none).
3. LEARN: the orchestrator sends all candidates, FIX rounds, user corrections and new project facts to the
   `scribe`, which runs `lessons.mjs add|vote`, promotes lessons (helpful >= 2, harmful 0) into
   `rules/90-lessons.md`, updates root `AGENTS.md`, corrects guides a worker proved wrong, drafts skills via
   `/capture-skill`, and runs `node .agents/scripts/doctor.mjs --quiet`.

## Why the kit only covers some languages/frameworks

Each pack is verified content, expensive to write well, and an unused pack only costs budget. The kit ships packs
for the languages and frameworks in use, added on request through `/workspace-doctor`. `activate-stack.mjs` only
flips existing framework packs from `model_decision` to `glob` when it detects their manifest.

## Extension points

All extensions go through **`/workspace-doctor`** (`.agents/skills/workspace-doctor/`): templates for a language
pack, framework pack, topic rule, skill or agent (`references/templates.md`) and every `doctor.mjs` defect code
(`references/defect-classes.md`). In orchestrator mode the orchestrator runs the doctor and plans; workers apply
the templates. A new agent needs: the worker body sections (`# Role` WORKER line, `# Inputs you will receive`,
`# Procedure`, `# Rules`, `# Output format` with the envelope), `subagent: true` and an explicit `tools:` list
without `invoke_subagent`, an entry in the hooks TypeName -> phase map (`hooks/lib.mjs`), and an entry in
`scripts/kit-install.mjs`. The guard reads its worker roster from `agents/` itself.

## Reuse across repositories

`node .agents/scripts/kit-install.mjs --target <other-repo> [--dry-run]` copies the reusable kit (rules except
the lessons ledger, guides, skills, agents, hooks, scripts, docs, `.agents/GEMINI.md`), seeds an empty lessons
ledger, creates a starter root `AGENTS.md` if none exists, and runs `activate-stack.mjs` in the target. It never
overwrites a file without `--force`.

## Validating the kit

`node .agents/scripts/doctor.mjs` is the single source of truth: frontmatter, basename-only globs, byte caps, the
always-on budget, skill/agent/hook contracts, the orchestrator-mode roster (`roster-*`: workers never list
`invoke_subagent`, carry the WORKER role line and map to a phase; the orchestrator has no write tool; the guard
hook is enabled for the edit tools and `invoke_subagent`), stray `AGENTS.md`/`GEMINI.md`. Run it after any change under
`.agents/`; a change is finished at `PASS (0 errors)`.

## Alternatives

Antigravity's paid `/boost` and `/teamwork-preview` modes suit very large autonomous campaigns. This kit's
orchestrator mode is the everyday default: it works on every plan, uses the repository's own rules, gates and
lessons, and keeps every phase visible in the Completion Report.
