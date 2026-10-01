# Antigravity Frontier Kit

An AI agent workspace for Google Antigravity that makes a low-tier Gemini model (Flash) work like a much
stronger one. It does this with three things: orchestrator mode (one core agent plans and checks, worker
subagents each run exactly one task), deterministic hooks and scripts instead of hoping the model remembers,
and a small always-on context with everything else loaded only when it is relevant.

This is not application code. Nothing here ships to production or changes your project's source; it only shapes how
AI agents work inside the repository it is installed in. If you are a human who wants to understand what the agents do (or extend
what they can do), start here. If you are an agent: `.agents/GEMINI.md` is your entry point, not this file.

Why the kit exists: `.agents/docs/adr/0001-adopt-antigravity-frontier-kit.md`. Why it always runs in orchestrator mode:
`.agents/docs/adr/0002-orchestrator-mode-pipeline.md`. How the pieces fit: `.agents/docs/architecture.md`. The platform
facts everything depends on: `.agents/docs/antigravity-spec.md`.

## Quick start

- **Ask the agent anything.** The agent you talk to is the ORCHESTRATOR. It never edits files itself; it
  dispatches workers through the pipeline below and ends with a Completion Report. A pure question gets a direct
  answer with `path:line` evidence and no pipeline.
- **Strict orchestrator (optional, recommended for real work):** pick the `orchestrator` agent with `/agents`, or
  start the CLI with `agy --agent orchestrator`. It has no file-writing tools at all, so it cannot skip the
  pipeline. Antigravity cannot make a custom agent the persistent default, so select it per session. The default
  agent also follows orchestrator mode (always-on rules plus hook cards). It keeps its write tools, but a
  PreToolUse hook denies its workspace edits and malformed dispatches (see "What the hooks enforce").
- **Run all checks:** `node .agents/scripts/verify.mjs`.
- **Check the kit is healthy:** `node .agents/scripts/doctor.mjs`.
- **First session in a workspace:** type `/start` (like `/init`). It detects an empty kit clone or an existing
  codebase, routes to `/new-project` or `/onboard-repo`, reads the codebase, fills `AGENTS.md` and installs the
  git commit-msg hook.
- **Use the kit in another repository:** `node .agents/scripts/kit-install.mjs --target <path>`, then run
  `/start` in that repository.
- **Commit policy:** Conventional Commits, no `Co-authored-by` or AI attribution, the user's own git identity only
  (`rules/topic-git-workflow.md`), enforced by `node .agents/scripts/commit-msg.mjs install` (a git commit-msg hook).
- **Something feels off** (rule not firing, subagent not found, budget too big): ask for `/workspace-doctor`, or
  read `.agents/skills/workspace-doctor/references/defect-classes.md`.

## How work flows

**Role check.** Every agent decides its role first. A conversation that another agent started (its first step is a
`[Message] ... sender=<id>`), or whose system prompt or `[worker]` hook card says it is a WORKER, is a WORKER;
every other conversation is the ORCHESTRATOR.

**The pipeline.** Every change runs `EXPLORE -> PREPARE -> IMPLEMENT -> REVIEW -> FIX -> TEST -> LEARN`, then the
orchestrator's REPORT:

| Phase | Workers (`.agents/agents/<name>.md`) | Done when |
|---|---|---|
| EXPLORE | `explorer`, `docs-researcher`, `git-historian` | files/lines to change, the pattern to copy and constraints are named |
| PREPARE | `planner` (+ `advisor` critique in lane L) | 2-5 checkable acceptance criteria; tasks T1..Tn with one objective and disjoint owned files each |
| IMPLEMENT | `implementer` (one per task) | each implementer reports PASS with its check output |
| REVIEW | `reviewer`, `security-auditor` | verdict APPROVE, or APPLY findings listed |
| FIX | `fixer`, `debugger` (unclear failures) | findings fixed and re-reviewed; max 2 rounds, then escalate |
| TEST | `test-engineer` (non-browser), `e2e-tester` (Playwright) | new/changed behaviour tested, `verify.mjs` PASS, e2e PASS when UI changed |
| LEARN | `scribe` | lessons recorded, `AGENTS.md` / guides updated, or "nothing new" |

**Lanes.** The orchestrator picks one and states it. S (<= 2 files, <= ~40 lines, no API/schema/auth/dependency
change): lighter EXPLORE and PREPARE, still reviewed, tested and learned. M (default): full pipeline. L (> 8 files,
public API or schema, migration, auth/crypto/payments, concurrency, or 2 failed FIX rounds): extra advisor
critique and 2-3 reviewers.

**One agent, one task.** A worker runs exactly the one task in its brief, edits only its `OWNED FILES`, verifies,
and reports once with `send_message`. One task may get several agents (parallel attempts, review lenses), never
the other way round. The full runbook, brief templates and per-task-type playbooks: `/orchestrate`
(`.agents/skills/orchestrate/`).

## What's in here

```
AGENTS.md                    Project facts template - fill in per project (root, always-on)
.agents/
  GEMINI.md                  Kit index: role check, pipeline, roster by phase, routing, scripts (always-on)
  README.md                  This file
  docs/
    architecture.md          How the kit is organized and why (start here as a human)
    antigravity-spec.md      Verified Antigravity platform facts the kit depends on
    adr/                     Architecture Decision Records for the kit itself
  rules/                     Flat directory - Antigravity ignores subfolders here
    00-03, 90-lessons.md     Always-on core: protocol + role check, standards, evidence,
                             orchestration (03-orchestration.md), curated lessons
    lang-*.md                Language quick cards (glob-triggered by file extension)
    fw-*.md                  Framework quick cards (model_decision until activate-stack.mjs detects the stack)
    topic-*.md               Situational rules (testing, security, migrations, ADRs, ...)
  guides/                    Deep reference, read on demand: principles/, languages/, frameworks/
  agents/                    orchestrator + 13 workers (one file each)
  skills/                    Runbooks: /orchestrate plus worker and task-type playbooks
  hooks.json, hooks/         Deterministic gates: orchestrator guard, role cards, verify + pipeline gates
  scripts/                   Zero-dependency Node scripts (verify, search, doctor, lessons, ...)
  memory/lessons.md          Cross-session lessons ledger (written by the scribe)
  .state/                    Runtime state written by hooks/scripts - gitignored, never hand-edit
```

Agents on disk: `orchestrator` (core, `mainAgent: true`, no write tools) and the workers `explorer`,
`docs-researcher`, `git-historian`, `planner`, `advisor` (consult), `implementer`, `reviewer`,
`security-auditor`, `fixer`, `debugger`, `test-engineer`, `e2e-tester`, `scribe`.

Skills on disk: `orchestrate` (orchestrator runbook); worker playbooks `verify`, `write-tests`, `e2e-test`,
`research-docs`, `security-audit`, `reflect`, `capture-skill`; task-type playbooks `perf-audit`, `db-migration`,
`upgrade-deps`; orchestrator-level `start` (first session: routes to the next two), `onboard-repo`, `new-project`,
`commit-and-pr` (only when asked),
`workspace-doctor`; third-party `architecture-decision-records`, `commit-archaeologist`, `seo-audit`,
`thinking-out-loud`, `vercel-react-best-practices`. Every kit skill except `orchestrate` (orchestrator-only) names its
users in a `Used by:` line.

## What the hooks enforce

- **Orchestrator guard** (`orchestrator-guard.mjs`, PreToolUse on `write_to_file`, `replace_file_content`,
  `multi_replace_file_content` and `invoke_subagent`, shipped enabled): in an ORCHESTRATOR conversation it
  DENIES (the tool does not run, the reason tells it what to do instead):
  - any edit of a file inside the workspace (Antigravity artifacts outside it pass): dispatch an implementer or
    fixer with the change as its OBJECTIVE;
  - an `invoke_subagent` wave with more than 3 entries; a TypeName that is not one of the 13 workers in
    `agents/` (`self`, `research`, `browser`, `orchestrator` and unknown names are refused); a Prompt without
    exactly one `TASK: T<n>` (a single task id), exactly one `OBJECTIVE:`, an `OWNED FILES:` and a `DONE WHEN:`
    line; two writers in one wave whose `OWNED FILES` overlap.

  Every other call it covers, and every worker call, gets `orchestratorGuardPassthrough` from
  `hooks/guard.config.json`: `"allow"` (default: auto-approved, like always-proceed) or `"ask"` (Antigravity's
  normal permission prompt). It always prints an explicit decision, because `{}` denies the tool; on an internal
  error it falls back to the passthrough decision, never to deny.
- **Role cards and notes** (`inject-context.mjs`, `track-tools.mjs`): the first model call gets an
  `[orchestrator]` or `[worker]` card; while workers are outstanding every orchestrator call gets
  `[orchestrator] waiting on <n>: <list>`, and every 5th call the phase ledger (`EXPLORE ✓ PREPARE ✓ IMPLEMENT …`).
  A shell command by the orchestrator that writes files (`Set-Content`, `>`, formatters, `bun add`,
  `lessons.mjs add|vote`, `git add|commit`, ...) and a `send_message` to a worker that already reported each
  queue an `[orchestrator]` note (the command itself is not blocked; it belongs in a worker's
  `ALLOWED COMMANDS:`).
- **QUALITY GATE** (`quality-gate.mjs`): a turn cannot end while code changed after the last passing check; a
  diff that adds test skips or removes assertions is flagged (`TEST INTEGRITY:`).
- **PIPELINE GATE** (same hook, orchestrator only):
  - Early report: a Completion Report written while a worker is still outstanding is blocked
    (`PIPELINE GATE: <n> worker(s) have not reported ...`).
  - Completeness: after IMPLEMENT/FIX work, once no worker is still running, the turn cannot end without a
    REVIEW dispatch after the latest IMPLEMENT or FIX dispatch, a PASS reply from `test-engineer`/`e2e-tester`,
    a passing FULL `verify.mjs` (not `--quick`) after the latest TEST reply, and a PASS reply from the `scribe`.
    FAIL/BLOCKED replies do not count, and a brief's `PHASE:` only counts for the types that own that phase.
    Only e2e may be "not applicable". Max 3 consecutive blocks per missing set; the count resets when a phase
    is completed or new IMPLEMENT/FIX work is dispatched.
- **LEARNING:** a check that failed and then passed prompts a lesson candidate (workers put it in their report;
  the scribe records it).
- **Command guard** (`command-guard.mjs`): denies or asks before catastrophic shell commands. Shipped disabled;
  set `"enabled": true` for `frontier-guard` in `hooks.json` to turn it on.

## How the kit learns

Workers end every report with `Lesson candidates:`. The LEARN phase sends them, plus FIX rounds and user
corrections, to the `scribe`, which runs `node .agents/scripts/lessons.mjs add|vote`, promotes proven lessons into
the always-on `rules/90-lessons.md`, updates root `AGENTS.md` with new project facts, fixes guides a worker proved
wrong, and drafts skills via `/capture-skill`. The orchestrator searches the ledger at the start of EXPLORE
(`node .agents/scripts/lessons.mjs search <keyword>`).

## Maintaining this kit

Adding a language/framework pack, topic rule, skill or agent; fixing a `doctor.mjs` warning; managing the
always-on budget: all of it is **`/workspace-doctor`**. In orchestrator mode the orchestrator runs the doctor and
plans, and workers make the edits from its templates, which already encode every platform constraint in
`.agents/docs/antigravity-spec.md`. A new agent TypeName must also be added to the hooks phase map
(`hooks/lib.mjs`) and to `scripts/kit-install.mjs`; doctor's `roster-*` checks catch a worker that is unmapped,
lists `invoke_subagent` or lacks the WORKER role line, an orchestrator with a write tool, and a disabled guard.

Two invariants fail silently, with no error from the platform: rule files must stay directly in
`.agents/rules/` (no subfolders), and every `globs:` pattern must be a basename pattern like `**/*.rs`.

## Alternatives

For very large autonomous campaigns on a paid Antigravity plan, the built-in `/boost` and `/teamwork-preview`
modes are alternatives. This kit's orchestrator mode is the everyday default and works on every plan.

## Reference

- `.agents/docs/architecture.md` - roles, pipeline, layers, hooks, extension points.
- `.agents/docs/antigravity-spec.md` - verified platform behavior and how to re-verify it after an upgrade.
- `.agents/skills/orchestrate/` - the orchestrator runbook, filled briefs, task-type playbooks, review checklist.
- `.agents/skills/workspace-doctor/` - templates and the full doctor defect-code reference.
- `.agents/docs/adr/` - the decisions behind this kit.
