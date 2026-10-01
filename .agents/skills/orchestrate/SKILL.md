---
name: orchestrate
description: The orchestrator's runbook for every task that changes files. It picks lane S/M/L, runs EXPLORE -> PREPARE -> IMPLEMENT -> REVIEW -> FIX -> TEST -> LEARN with exactly one task per worker subagent, writes self-contained briefs, waits for the async reports, grades each result PASS/FIX/ESCALATE by exercising it, and ends with the Completion Report. Use for every task that changes files (feature, bug, refactor, performance, security fix, migration, upgrade, docs) and when the user says build, add, fix, change, implement, delegate, fan out, parallelize or orchestrate.
metadata:
  icon: 🎼
---

# Orchestrate: one task per worker, seven phases, every result verified

Used by: orchestrator only. Workers never follow this skill; their contract is their own agent file.

You are the ORCHESTRATOR. You plan, brief, dispatch, wait, verify and report. Workers do every change, each
in a clean context with one task. You trust no worker result until you have exercised it yourself.

Role check first: this conversation started with a message from another agent (`sender=<id>`), or your system
prompt says `You are a WORKER`? Then you are a WORKER: do only your brief and stop reading this skill.

## When to use
- Every task that changes a workspace file: code, tests, config, docs, `.agents/`. Lane S keeps small ones cheap.
- The playbook per task type (feature, bugfix, refactor, performance, security, DB migration, dependency
  upgrade, docs-only) is in [references/task-types.md](references/task-types.md). Read its section in step 0.

Do NOT use for:
- Only a question, nothing to change: answer with `path:line` evidence (explorers optional). No pipeline.
  Any request implying a file change ("fix", "can you add", "update", "make", "change") is a change, not a question.
- Commits and pull requests: `/commit-and-pr`, only when the user asks.
- Very large autonomous campaigns on a paid plan: Antigravity's own `/boost` or `/teamwork-preview` are
  alternatives. This skill is the everyday default and works on every plan.

## Invariants
1. NEVER edit a workspace file yourself, not one line, not through the shell (`Set-Content`, `>`, formatters,
   `bun add`, `lessons.mjs add|vote`), because your edit skips REVIEW and TEST. Instead dispatch an
   `implementer` or `fixer`. A PreToolUse guard denies your edit tools; shell writes are flagged.
2. One agent = one task with ONE objective. NEVER put two objectives in one brief, because the worker will
   finish one and fake the other. Instead split into two tasks. One task MAY go to 2-3 agents (redundancy).
3. `invoke_subagent` is async. NEVER write a result, verdict or report you have not received, because a weak
   parent answers `null`. Instead end your turn with the task board and resume on the worker's message.
4. Workers see nothing of this chat. NEVER write "as discussed" or "the file above". Instead paste the facts,
   absolute paths, snippets and exact commands into the brief.
5. Exercise every result before you use it (rerun its command, open a cited `path:line`). Reading the worker's
   claim again proves nothing.
6. REVIEW follows EVERY IMPLEMENT and EVERY FIX; TEST follows them; LEARN ends the pipeline; only e2e may be
   "not applicable: <reason>". The Stop hook blocks with `PIPELINE GATE:` when a REVIEW after the latest
   IMPLEMENT/FIX, a PASS TEST or LEARN reply, or your full verify after the latest TEST reply is missing, and
   when you write a Completion Report while a worker is outstanding.
7. At most 3 subagents per `invoke_subagent` call (shared quota). Parallel writers need disjoint OWNED FILES.
   TypeName only from the 13 workers in `.agents/agents/` (never `self`, `research`, `browser` or
   `orchestrator`). The guard denies a wave that breaks this or has a Prompt without exactly one `TASK: T<n>`, one `OBJECTIVE:`, an
   `OWNED FILES:` and a `DONE WHEN:` line.
8. `send_message` to a worker only to answer its `INPUT GAP` for the same T-id. New work = a new dispatch.

## Step 0: task type and lane (state both before any dispatch)
1. Task type: feature | bugfix | refactor | performance | security | db-migration | dependency-upgrade | docs-only |
   question-only (question-only: no pipeline, see Do NOT use).
   Open its section in [references/task-types.md](references/task-types.md) and apply its phase changes.
2. Lane. Pick the first row that matches and write `Lane: <S|M|L> - <reason>`:
   | Lane | When |
   |---|---|
   | L | > 8 files, public API or schema, data migration, auth/crypto/payments, concurrency, or 2 failed FIX rounds |
   | S | <= 2 files, <= ~40 changed lines, and none of the L triggers, no dependency change |
   | M | everything else (default) |
3. Only lane S may skip EXPLORE/PREPARE dispatches, and only after you wrote `Lane: S - <reason>`.
   Unsure between two lanes: pick the larger. Re-state the lane after EXPLORE if the facts changed it.
4. Search lessons: `node .agents/scripts/lessons.mjs search <keyword>` (read-only; you may run it). Note ids.

## Task board (print after every dispatch and every verdict; example rows from a sample SolidStart project)
```text
Lane: <S|M|L> - <reason> — Type: <task type> — Acceptance criteria: 1) ... 2) ...
| T-id | Phase | Agent(s) | Objective | Owned files | Status | Evidence |
|---|---|---|---|---|---|---|
| T1 | EXPLORE | explorer | map nav rendering | read-only | PASS | src/components/Nav.tsx:6 re-read |
| T2 | IMPLEMENT | implementer | add /contact page | src/routes/contact.tsx | DISPATCHED id=<childId> | - |
Waiting on: <n> worker(s). FIX rounds: T2=0. Advisor consults: 0/4.
```
Status values: PENDING, DISPATCHED, PASS, FIX, ESCALATED, BLOCKED. T-ids never repeat: a FIX gets a new T-id
that names the task it fixes (`T5 FIX of T2`). Keep the board in your messages or a `manage_task` artifact.

## Phase 1 — EXPLORE (facts before plans)
```text
- [ ] Lessons searched; matching ids noted
- [ ] Lane S: <= 4 reads yourself, or 1 explorer. Lane M/L: 1-3 explorers, one area each
- [ ] Library/API involved -> docs-researcher; odd legacy code (git repo) -> git-historian
- [ ] Every report graded; 1-2 cited path:line per report re-opened
```
Briefs: `briefs.md` §explorer, §docs-researcher, §git-historian.
Gate: you can name the files and lines to change (or new files plus the sibling file to copy), the constraints,
and the check command. Missing fact -> one more targeted explorer, not a guess.

## Phase 2 — PREPARE (criteria + task board)
```text
- [ ] Lane S: you write a 1-task board. Lane M: planner. Lane L: planner + advisor critique
- [ ] 2-5 acceptance criteria, each checkable ("GET /x returns 201", "heading 'Contact' visible")
- [ ] Every task: ONE objective (no "and"), OWNED FILES, DONE WHEN ending in a command, test plan
- [ ] OWNED FILES disjoint within a wave; each shared file (routes, barrel, package.json) owned by ONE task
- [ ] User-visible design choices asked now (ask_question), not after IMPLEMENT
```
Briefs: `briefs.md` §planner, §advisor. You copy the planner's table onto your board; you never write the plan
body yourself (lane S's 1-task board is the only exception).
Gate: every box above ticked. A task with two objectives or overlapping OWNED FILES -> split it or re-order the
waves before any IMPLEMENT dispatch.

## Phase 3 — IMPLEMENT (one implementer per task)
```text
- [ ] Waves of <= 3; a task starts only after every task it depends on is PASS
- [ ] Each brief pastes: sibling pattern, path:line facts, task kind, repro or baseline command
- [ ] A task that must install or run a writing command lists it exactly in `ALLOWED COMMANDS:` (else `none`)
- [ ] Each report graded: changed files re-opened AND its check command rerun by you (quote your own VERIFY
  line); a quoted output alone is not proof
- [ ] Files touched are all in OWNED FILES (compare with `.agents/.state/conv-<childId>.json` "edits" keys if unsure)
```
Brief: `briefs.md` §implementer. Gate: every task PASS with its check output. A file outside OWNED FILES
touched -> FIX task that reverts it, and a note for LEARN.

## Phase 4 — REVIEW (fresh context, never skipped)
```text
- [ ] Lane S/M: 1 reviewer per task or on the integrated change. Lane L: 2-3 reviewers, one lens each
- [ ] security-auditor added when the change touches auth, sessions, input parsing, secrets, crypto, uploads,
      SQL, shell, user-supplied URLs or HTML
- [ ] REQUIREMENTS copied verbatim from the user and the acceptance criteria (never your paraphrase)
- [ ] Every finding opened at path:line, then APPLY / DEFER / REBUT (one line of evidence each)
```
Briefs: `briefs.md` §reviewer, §security-auditor. Checklist the reviewer applies:
[references/review-checklist.md](references/review-checklist.md).
Gate: verdict APPROVE, or every finding triaged. APPLY findings -> Phase 5. DEFER -> "Not done / risks".

## Phase 5 — FIX (only when REVIEW or TEST found problems)
```text
- [ ] Cause clear -> fixer with exactly the task's APPLY findings. Cause unclear -> debugger first
- [ ] Brief quotes each finding (path:line, quoted code -> failure, fix direction) and the failed output
- [ ] FIX round counted per original task (max 2)
- [ ] Targeted reviewer re-check on the fixer's "Re-review focus" lines
```
Briefs: `briefs.md` §fixer, §debugger, §FIX brief. Gate: every finding FIXED and confirmed by the targeted
re-review. CANNOT FIX (outside OWNED FILES) -> a new task for the owner, not a wider fixer brief.
Loop: FIX -> targeted REVIEW -> TEST. After round 2 still failing -> ESCALATE (below). Never a round 3.

## Phase 6 — TEST (prove behaviour, never skipped after IMPLEMENT or FIX)
```text
- [ ] test-engineer: non-browser behaviour (unit, integration, API/CLI via tools)
- [ ] e2e-tester: any browser-visible flow changed (route, form, nav, client state) — same wave
- [ ] Lane L: one extra test-engineer with the "challenger" brief (adversarial edge cases)
- [ ] You rerun each reported test command once, or `node .agents/scripts/verify.mjs`
```
Briefs: `briefs.md` §test-engineer, §e2e-tester. A test that fails because the code is wrong: `debugger`
(cause unclear) -> `fixer` -> targeted REVIEW -> TEST again. Never ask a worker to weaken or skip a test.
Gate: every TEST reply PASS; new or changed behaviour has passing tests; e2e PASS when UI changed (or "not
applicable: <reason>", the only phase that may be).

## Phase 7 — LEARN (never skipped; the scribe may report "nothing new")
```text
- [ ] One scribe brief with: every "Lesson candidates" line verbatim, FIX rounds + causes, user corrections
      (quoted), checks that failed then passed, lesson ids that helped or misled, new project facts
      (scripts, routes, env vars, dependencies), guide or skill statements a worker proved wrong
- [ ] Learn Report received and graded (rerun `node .agents/scripts/lessons.mjs search <words of a new lesson>`)
```
Brief: `briefs.md` §scribe. Gate: Learn Report arrived with PASS, or FAIL handled as a FIX task for it.

## REPORT (you only)
1. After the scribe's LEARN reply (so after the latest TEST reply), run the full
   `node .agents/scripts/verify.mjs` yourself (never `--quick`; `--e2e` if UI changed).
   It must print `VERIFY: PASS` in this conversation. FAIL -> debugger/fixer, not a report.
2. Lane L: an `advisor` final audit ("all criteria met? ship or conditional pass?") before the report.
3. Write the Completion Report exactly (from `.agents/rules/03-orchestration.md`):
```markdown
## Completion Report
- Lane: <S|M|L>; tasks: <n>; agents dispatched: <n>
- Explore: <agents -> key facts>
- Prepare: <planner | orchestrator> -> <n tasks>; criteria: <n>
- Implement: <T-id -> agent -> PASS/FAIL>
- Review: <reviewer(s) -> verdicts; findings applied/rebutted>
- Fix: <rounds; T-ids> | none
- Test: <test-engineer -> result>; <e2e-tester -> result | not applicable: reason>
- Learn: <scribe -> lessons L-ids / docs updated | nothing new>
- Changed: `<path>` — <why> (one line each, from worker reports)
- Verification (run by orchestrator): `node .agents/scripts/verify.mjs` -> <VERIFY line>
- Not done / risks: <list | none>
```

## Dispatching
One wave per call, exact shape (VERIFIED):
```json
{"Subagents":[
  {"TypeName":"explorer","Role":"T1 nav mapper","Prompt":"<brief T1>","Workspace":"inherit"},
  {"TypeName":"explorer","Role":"T2 route mapper","Prompt":"<brief T2>","Workspace":"inherit"}
]}
```
- `TypeName` = one of the 13 workers in `.agents/agents/`. `Role` = T-id + 2-5 words. `Prompt` = the full brief.
- `Workspace: "inherit"` (default): the worker edits your tree. `"branch"`: isolated git worktree, git repos
  only; merge it through an implementer task after review. Never use `share` (not verified).
- Every brief uses the template in [references/briefs.md](references/briefs.md), all fields in order.

## Fan-out and redundancy ("one task, many agents")
Same brief to 2-3 agents, never two tasks to one agent. Use it where a miss is expensive:
| Pattern | Phase | How | Merge rule |
|---|---|---|---|
| Areas | EXPLORE | 1 explorer per area (UI, server, data) | union; conflicts -> re-open the lines yourself |
| Lenses | REVIEW | reviewers: correctness / security / requirement coverage | union of findings; triage each |
| Attempts | IMPLEMENT (lane L, git) | 2 implementers, `Workspace:"branch"` | reviewer compares both, you pick one with a reason |
| Two plans | PREPARE (lane L) | 2 planners, then advisor merges | take the merged plan; list what was dropped |
| Challenger | TEST (lane L) | extra test-engineer writes adversarial edge cases | every failing case -> debugger/fixer |
Never average two results. Pick one, or reconcile with a stated reason, or ESCALATE. Not a git repo: no
parallel attempts on the same file; run attempts one after another or use lenses instead.

## Waiting
- After a dispatch: print the task board with `Waiting on: <n>`, then end your turn. Or do independent work
  (draft the next wave's briefs, read files). Never sleep-poll.
- A message `[Message] ... sender=<id>` arrives: match its T-id (first line `## <agent>: <status> — <T-id>`),
  grade it, update the board, dispatch what it unblocks.
- Resumed with no new report: `manage_subagents` `{"Action":"list"}`. Stuck or dead:
  `{"Action":"kill","ConversationIds":["<id>"]}`, then re-dispatch a tighter brief (counts as an attempt).

## Grading every report (exercise it)
| Verdict | When | Next |
|---|---|---|
| PASS | every DONE WHEN met AND your rerun or re-opened line matched the claim | board -> PASS, next phase |
| FIX | a criterion failed, evidence missing, or your rerun disagrees | FIX brief (new T-id) quoting the failed line |
| ESCALATE | 2 FIX rounds failed, results conflict, or a judgment call outside the criteria | advisor consult, then user |
- Proof is: a command you reran, a `path:line` you opened, a test output line. Not proof: "the file exists",
  the worker's summary, a grep of a README.
- `BLOCKED` or `INPUT GAP:` -> answer it with `send_message` (same T-id only), re-dispatch, or re-plan. `OUT OF SCOPE:` -> new task
  or "Not done / risks". Never let the same worker widen its own scope.

## Escalation
1. `advisor` consult (`briefs.md` §advisor; max 4 per run): stuck after 2 FIX rounds, conflicting reports,
   judgment call, lane L plan critique, lane L final audit. Apply each fix or rebut it in one line.
2. Still stuck, or the choice is the user's (scope, UX, data loss, cost): `ask_question` with 2-3 options and
   your recommendation. Stop the affected tasks until the answer arrives; continue independent ones.
3. Two failed FIX rounds on a lane S/M task: re-state the lane as L.

## References
- [references/briefs.md](references/briefs.md): a filled brief per worker type, FIX brief, advisor consult,
  status board, worked lane-M example.
- [references/task-types.md](references/task-types.md): phase changes per task type.
- [references/review-checklist.md](references/review-checklist.md): what reviewers check.
- `.agents/rules/03-orchestration.md` (always-on protocol), `.agents/agents/` (worker contracts),
  `.agents/docs/antigravity-spec.md` (verified `invoke_subagent` facts).
- Worker playbooks: `/verify`, `/write-tests`, `/e2e-test`, `/research-docs`, `/security-audit`, `/reflect`.
