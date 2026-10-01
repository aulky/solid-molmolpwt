# Task types: how the pipeline adapts

Every type still runs EXPLORE -> PREPARE -> IMPLEMENT -> REVIEW -> FIX -> TEST -> LEARN (question-only is the one
exception). A section lists only what CHANGES for that type: extra workers, extra brief lines, extra gates.
Pick the type in step 0 of `/orchestrate`. A request with two types (a feature that needs a refactor first) becomes
separate tasks with separate objectives; the structural task lands, is reviewed and tested before the behaviour task.

| Type | Triggers | Default lane | Playbook |
|---|---|---|---|
| feature | add, build, implement, support for, "as a user I want" | M | this file |
| bugfix | doesn't work, broken, throws, wrong output, failing test | S or M | this file |
| refactor | clean up, restructure, extract, rename, move, dedupe, simplify | M | this file + `.agents/rules/topic-refactoring.md` |
| performance | slow, faster, bundle size, memory, latency | M | `/perf-audit` |
| security | audit, harden, auth, tokens, secrets, injection | L when auth/crypto changes | `/security-audit` |
| db-migration | add/rename/drop/retype a column, table, index; backfill | L | `/db-migration` |
| dependency-upgrade | update, upgrade, bump, outdated, vulnerable package | M (L for a framework major) | `/upgrade-deps` |
| docs-only | README, docs, comments, AGENTS.md, no code or config change | S | this file |
| question-only | how, why, where, explain; nothing to change | none | this file |

## feature
- EXPLORE: find the sibling to copy (a route, component or module with the same shape). The gate needs its
  `path:line`, or the new file paths plus that sibling.
- PREPARE: 2-5 acceptance criteria, each checkable ("POST /orders returns 201", "heading 'Contact' visible").
  Criteria you inferred instead of reading them in the request are labelled `Inferred:` on the board. Ask at
  most ONE clarifying question, and only for what the repo cannot answer. A user-visible choice between valid
  designs is asked now, before IMPLEMENT.
- PREPARE: each task's test plan says unit, e2e or both. Logic that is well specified and separable gets its
  test task in the SAME wave as the implementer (test-first), with the expected behaviour pasted into both briefs.
- IMPLEMENT: implementer brief says `Task kind: feature` and pastes the sibling snippet.
- TEST: any user-visible flow (new page, route, form, interactive element) -> `e2e-tester`. Skip only when nothing
  in the change is reachable in a browser, and write that reason in the Completion Report.
- LEARN: scribe gets the new facts (script, route, env var, dependency) for root `AGENTS.md`. A significant,
  hard-to-reverse architecture choice -> the planner proposes an ADR task (`docs/adr/`,
  `/architecture-decision-records`, `.agents/rules/topic-architecture-decisions.md`).

## bugfix
A bug you have not seen fail is a guess. Reproduce first, fix the cause, never the symptom.
- EXPLORE (reproduce-first): dispatch `debugger` with `APPLY_FIX: no` (brief: `briefs.md` §debugger), in parallel
  with at most 1 explorer for the area. The debugger's DONE WHEN:
  1. Exact repro command, literal error text, exit code quoted (at most 3 input variations).
  2. At most 3 ranked, falsifiable hypotheses ("if H1 is true, running X shows Y").
  3. The cheapest discriminating experiment run (a targeted test, a `node -e` / `python -c` one-liner, a
     temporary log line that is then removed); one hypothesis confirmed, the others refuted, by quoted output.
  4. Root cause in one sentence with `path:line` where the bad value ORIGINATES, not where it is observed.
  5. A regression test added that fails now for the right reason (an assertion about the bug, not a setup or
     import error); its failure message quoted.
- Gate: `NOT REPRODUCED` -> stop the pipeline, report every attempt, ask the user for exact repro steps. Never
  plan a fix for a bug nobody saw fail. `INCONCLUSIVE` -> one more debugger round with the remaining hypotheses,
  then ESCALATE (advisor).
- Also check memory: `node .agents/scripts/lessons.mjs search <error keyword>`; git repo: the git-historian or
  `git log -n 10 --format="%h %ad %s" --date=short -- <file>` for a change that lines up with the start.
- PREPARE: lane S when the fix is <= 2 files. Task = "make <regression test> pass by fixing <root cause path:line>".
  The regression test file is owned by the debugger task (already written) and is read-only for the implementer.
- IMPLEMENT: brief pastes the root cause, the repro command and the failing test output; `Task kind: bug`.
  DO NOT: "add a retry, a sleep, an empty catch, optional chaining that hides a value that should exist, or a
  skipped or loosened test", because each hides the symptom and the bug returns worse. DONE WHEN: the
  regression test and the original repro both pass.
- REVIEW: reviewer AREAS OF CONCERN: "Does the change fix the root cause at <path:line> or only mask the symptom?
  Other callers with the same bad value?"
- TEST: test-engineer runs the full suite and adds edge cases next to the regression test; the regression test
  stays permanently.
- LEARN: the root cause sentence is a lesson candidate when it was non-obvious.
- Completion Report "Not done / risks": other places with the same pattern that were not fixed.

## refactor
Structure changes, behaviour never does. Prove it with the same tests passing before and after.
- Gate before anything: write the goal as one sentence. If it contains "add", "support", "fix" or "change"
  applied to behaviour, it is not a refactor: split the behaviour part into a feature or bugfix task.
- EXPLORE, Chesterton's fence: for every odd piece to touch (workaround, `TODO`/`HACK`/`FIXME`, duplicate logic,
  strange condition, magic value) get the reason it exists. Git repo -> `git-historian` per `path:line` range.
  Not a git repo -> an explorer searches tests, docs and comments; still unexplained -> ask the user before any
  task deletes it. Gate: every odd piece has a finding (evidence + confidence) or "asked the user".
- EXPLORE, reference sweep: an explorer lists EVERY reference to each symbol that will be renamed, moved or
  deleted: `node .agents/scripts/search.mjs "\bOldName\b"` over the workspace, plus strings, config, templates,
  docs, dynamic imports, serialization and public API consumers. The list goes into the implementer brief.
- TEST BEFORE (a TEST task that runs BEFORE IMPLEMENT): `test-engineer` records the baseline (`<command> -> N
  passed`, test names). Thin coverage -> it writes characterization tests that pin CURRENT behaviour, odd outputs
  included (OBJECTIVE kind: characterization). A bug noticed here is not fixed: it goes to "Not done / risks".
- PREPARE: each task is ONE catalog step (rename, extract function or variable, inline, move, introduce parameter
  object, replace conditional with a table, split phase) or one small sequence of steps with a single objective
  (e.g. "extract parsePrice from cart.ts"); list the steps in the brief. A rewrite too
  big to prove "same behaviour" at once -> strangler stages: old and new paths side by side, callers migrated
  one task at a time.
- IMPLEMENT: `Task kind: refactor`, `Baseline: <command> -> N passed`. The implementer runs
  `node .agents/scripts/verify.mjs --quick` after each listed step; a failure means the last step is the cause.
- REVIEW: reviewer AREAS OF CONCERN: "Any observable behaviour change (defaults, error types, ordering, logging,
  public signatures)? Any scope creep?"
- TEST AFTER: the same baseline tests pass, same names, same count, plus the characterization tests. A green
  suite with fewer or different tests is not proof: a FIX task finds out why.
- Never refactor code the task did not ask about; put it under "Not done / risks".

## performance (playbook `/perf-audit`)
- EXPLORE: a `debugger` (PHASE: EXPLORE, APPLY_FIX: no; symptom = the slow metric and its budget; repro = the
  existing benchmark or profiler command) takes the BASELINE and names the hot frame (`/perf-audit` steps 1-2).
  Not an explorer: its allowed commands exclude benchmarks. No benchmark exists -> first a `test-engineer` task
  (OBJECTIVE kind: characterization; OWNED FILES: the benchmark script) writes one. Gate: a number, the exact
  command or tool, the input size and iteration count, quoted.
- EXPLORE/PREPARE: up to 3 ranked hypotheses; the profile must point at a frame, query or allocation before a task
  is planned (`/perf-audit` steps 3-4). One hypothesis per IMPLEMENT task.
- IMPLEMENT: the smallest change the profile points at; no drive-by optimizations.
- TEST: re-measure with the SAME tool, inputs and iteration count (`/perf-audit` step 6) and report both numbers;
  then the normal correctness tests. No improvement -> the task is FIX or reverted, not reported as a win.
- Completion Report: baseline -> after, with the command.

## security (playbook `/security-audit`)
- Audit only (no change requested): `security-auditor` workers, one per scope, read-only; the orchestrator
  merges the findings and reports. No IMPLEMENT without the user's go-ahead on which findings to fix.
- Fixing findings or changing auth/sessions/crypto/uploads/SQL/shell: lane L when auth or crypto changes.
  EXPLORE includes a `security-auditor` threat model of the scope. Each finding to fix = one implementer or fixer
  task quoting the SEC-id, source -> sink evidence and the fix direction.
- REVIEW: always `security-auditor` next to the reviewer; the auditor re-checks each SEC-id as FIXED or OPEN.
- TEST: a test per fixed finding that sends the malicious input and asserts rejection.
- Dependency audits send package names to external services: only with `NETWORK: allowed` from the user.

## db-migration (playbook `/db-migration`)
- Lane L. EXPLORE: engine + major version, migration tool, table sizes, lock behaviour (`/db-migration` steps
  1-2, `references/lock-safety.md` of that skill).
- PREPARE: expand/contract; each phase is its own migration, its own task and its own deploy step. Backfill is a
  separate task. The plan lists the rollback per phase. Destructive steps (drop, retype, data loss) are asked
  to the user before IMPLEMENT.
- IMPLEMENT: one migration file per task; a backup step before any run against a non-throwaway database.
- TEST: apply, roll back, re-apply against a local or ephemeral database of the SAME major version; data checks
  (row counts, nulls) quoted. Large or risky table -> verify on a restored copy.
- Completion Report: deploy order and rollback per phase.

## dependency-upgrade (playbook `/upgrade-deps`)
- EXPLORE: baseline `node .agents/scripts/verify.mjs` (+ `--e2e` for UI apps), the outdated inventory, and a
  `docs-researcher` per major version with the changelog and migration guide (breaking changes, codemods).
- PREPARE: one task for the patch + minor batch; one task PER major version, in dependency order. The lockfile
  changes only through the package manager (the one the lockfile names), never by hand, and is owned by that one task.
- IMPLEMENT: the implementer runs the package manager command, applies the documented migration steps, runs the
  checks. A new dependency (not an upgrade) is a feature task and may need an ADR.
- TEST: full verify plus e2e; compare with the baseline. Failure after a major -> debugger, or roll that major
  back as a FIX task.
- Completion Report: versions from -> to, the rollback command.

## docs-only
- Lane S (M when > 2 files). EXPLORE: the facts the docs must state, read from the code or config (never from
  memory); every command in the new text is run once by an explorer and its output quoted.
- IMPLEMENT: implementer owns only the doc files. REVIEW: reviewer checks every stated fact against `path:line` or
  command output and every link resolves.
- TEST: no unit or e2e tests; the test-engineer brief is "run every command the docs show and report the output",
  plus `node .agents/scripts/verify.mjs` (kit docs: also `node .agents/scripts/doctor.mjs --quiet`).
- LEARN: still runs (the scribe may report "nothing new").

## question-only
- No pipeline, no gate, no task board: nothing changes. Any request implying a file change ("fix", "add",
  "update", "make", "change") is NOT question-only.
- Answer directly with `path:line` evidence. For a broad question dispatch 1-3 explorers (and a docs-researcher
  for library facts), wait for their reports, grade them, then answer.
- Label what you did not verify as `Inferred:`. If the answer shows something should change, offer it as a
  follow-up task; do not start the pipeline until the user asks.
