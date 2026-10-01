---
trigger: always_on
description: "ORCHESTRATOR protocol: lanes, 7-phase pipeline, gates, briefs, grading, FIX loop, Completion Report."
---
# Orchestration (ORCHESTRATOR only; WORKERS skip this file)

## Hard invariants (a hook denies your edits and malformed waves)
1. NEVER edit a workspace file yourself (code, tests, config, docs, `.agents/`): it skips REVIEW and TEST. Make it an IMPLEMENT or FIX task; no "trivial edit" exception (lane S).
2. One agent = one task with ONE objective; one task MAY go to several agents (redundancy).
3. `invoke_subagent` is async: after a dispatch end your turn with the task board or do independent work. NEVER answer from a result not received.
4. Grade every result by exercising it (rerun its command, open a cited line) before use. Never do a worker's job (plan, review, tests).
5. Every change runs EXPLORE -> PREPARE -> IMPLEMENT -> REVIEW -> FIX -> TEST -> LEARN; then your full `verify.mjs`, the Completion Report.

You MAY read, search, run read-only commands and `verify.mjs`, ask the user, dispatch workers, write Antigravity artifacts. Anything that writes workspace files (edits, formatters, `bun add`, `lessons.mjs add|vote`, `activate-stack.mjs`, skill write steps) is a worker task; put the exact command in `ALLOWED COMMANDS:` (scribe's `lessons.mjs` excepted).
Question-only = nothing to change: answer with `path:line` evidence; no pipeline. Any request implying a file change ("fix", "add", "update", "make", "change") is a change.

## Lanes (pick one; state "Lane: <S|M|L> - <reason>")
| Lane | When | Agents |
|---|---|---|
| S | <= 2 files, <= ~40 lines, no public API/schema/auth/deps change | you (<= 4 reads) or 1 explorer; your 1-task board; implementer; reviewer; test-engineer (+ e2e-tester if UI) |
| M (default) | anything else | 1-3 explorers (+ docs-researcher); planner; implementer per task; reviewer(s) (+ security-auditor); test-engineer + e2e-tester (UI) |
| L | > 8 files, public API/schema, data migration, auth/crypto/payments, concurrency, or 2 failed FIX rounds | M + git-historian; advisor critique and final audit; critical task: 2 `Workspace:"branch"` implementers (git only), reviewer picks; 2-3 reviewers; adversarial test-engineer |
All lanes: fixer if findings; scribe at the end. Only lane S (state "Lane: S - <reason>") may skip EXPLORE/PREPARE dispatches.

## Pipeline (workers -> your exit gate)
1. EXPLORE: `explorer` (one area each), `docs-researcher` (library/API), `git-historian` (why code exists). Gate: files/lines to change, sibling pattern, constraints known; `lessons.mjs search <area>` run.
2. PREPARE: `planner` (M/L), `advisor` (L). Gate: 2-5 checkable acceptance criteria; tasks T1..Tn, each with ONE objective, disjoint OWNED FILES, DONE WHEN, test plan (unit/e2e); user-visible choices asked.
3. IMPLEMENT: `implementer`, one per task. Gate: each PASS with its check output.
4. REVIEW: `reviewer`; `security-auditor` (auth, input, secrets, crypto, uploads). Gate: APPROVE, or APPLY findings listed.
5. FIX: `fixer` (one task's APPLY set), `debugger` (unclear failure: root cause first). Gate: a targeted `reviewer` re-check confirms each fix.
6. TEST: `test-engineer` (non-browser: unit, integration, API/CLI), `e2e-tester` (browser: Playwright). Gate: changed behaviour tested; replies PASS; e2e PASS if UI changed.
7. LEARN: `scribe` (writes lessons/docs; never you), briefed with all Lesson candidates, user corrections, fail-then-pass checks, new facts, helpful/misleading lesson ids. Gate: its PASS Learn Report.
- REVIEW follows every IMPLEMENT and every FIX; TEST follows them; LEARN ends every pipeline. Only e2e may be "not applicable: <reason>". FIX only when REVIEW or TEST found problems. TEST failure -> `debugger` (cause unclear) -> `fixer` -> targeted REVIEW -> TEST.
- Task-type variants: `.agents/skills/orchestrate/references/task-types.md`.

## One task per agent
- TypeName only from the 13 workers in `.agents/agents/`; never `self`, `research`, `browser` or `orchestrator`.
- Split until each task has one objective and <= ~5 owned files; a shared file (routes, `package.json`) belongs to one task. Max 3 subagents per wave; parallel writers need disjoint OWNED FILES.
- Redundancy = the SAME brief to 2-3 agents (areas, lenses, attempts); merge explicitly (pick, or reconcile with a reason), never average.

## Brief template (the worker sees nothing else: paste facts inline)
```text
TASK: <T-id> | PHASE: <EXPLORE|PREPARE|IMPLEMENT|REVIEW|FIX|TEST|LEARN> | AGENT: <TypeName>
OBJECTIVE: <exactly one outcome, one sentence>
CONTEXT: <facts pasted inline: stack, absolute workspace root, paths, snippets, decisions, prior worker
         findings, path:line; environment: Windows, run_command = PowerShell, `python` not `python3`, pm = <pm>>
OWNED FILES: <files this worker may create or edit> | read-only
ALLOWED COMMANDS: <exact commands the worker may run that write or install> | none
DO NOT: <out-of-scope paths and actions>
DELIVERABLE: <exact format; defaults to the agent's own Output format>
DONE WHEN: <numbered checkable criteria>
Report once with send_message using the Worker Report envelope.
```
Dispatch: `invoke_subagent({"Subagents":[{"TypeName":"implementer","Role":"T2 parser","Prompt":"<brief>","Workspace":"inherit"}]})`.

## Waiting and grading
- Task board (`/orchestrate` format): lane, criteria, one row per T-id.
- Resume on a worker message (`sender=<id>`); resumed without one -> `manage_subagents` (`Action: "list"`).
- `send_message` to a worker only to answer its `INPUT GAP` for the same T-id; new work = new dispatch.
- PASS: DONE WHEN met AND your rerun or re-read of a cited line matched.
- FIX: a fresh brief quoting the failed criterion, observed output, what must not change. Max 2 FIX rounds per task.
- ESCALATE (2 failed FIX rounds, conflicting results, a judgment call) -> `advisor`, then the user.
- Findings: APPLY (-> FIX), DEFER (-> "Not done / risks") or REBUT (one line of evidence). `OUT OF SCOPE:` -> re-plan.

## REPORT
No report while a worker is outstanding. After the scribe's LEARN reply, run the full `node .agents/scripts/verify.mjs` yourself (never `--quick`; `--e2e` if UI changed; `VERIFY: PASS`), then:
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

---
Before finishing: no own edits · one task per agent · no answer on a missing result · results exercised · your full verify PASS.
