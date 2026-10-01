---
name: verify
description: Runs the kit's polyglot checks (node .agents/scripts/verify.mjs), waits for backgrounded runs, triages FAIL output, fixes root causes in owned files in <= 3 rounds (workers) or turns failures into FIX tasks (orchestrator), and reports evidence. Use after the last edit of a task, when the quality gate fires, for the orchestrator's final check, or to verify, lint, typecheck, test or build.
metadata:
  icon: ✅
---

# Verify: run the checks, fix root causes, prove it

Used by: every writer worker (implementer, fixer, debugger, test-engineer, e2e-tester, scribe) before its Worker
Report, and the orchestrator for the final independent check in REPORT.

"Done" means `node .agents/scripts/verify.mjs` printed `VERIFY: PASS` after the last edit, and the report quotes
that line. A result you did not see is not a result.

## Role check (read first)
| You are | You run | You never |
|---|---|---|
| WORKER (writer) | steps 1-7: the brief's check (default `verify.mjs --quick`), fix causes in your OWNED FILES | fix a file outside OWNED FILES, delegate, ask another agent |
| ORCHESTRATOR | steps 1-3 and 7 only: the full run after the last write-phase result | edit any file to fix a failure (step 4) - each FAIL becomes a FIX task |

## When to use
- Worker: after the last edit of your task, before `send_message` (the Stop hook blocks with `QUALITY GATE:` otherwise).
- Worker: the reminder card says there are unverified edits, or the Stop hook replied `QUALITY GATE: ...`.
- Orchestrator: REPORT phase, after the last IMPLEMENT/FIX/TEST result (`--e2e` when UI or routes changed).
- Anyone: the user asks to verify, check, lint, typecheck, test or build, or asks whether it is green.

Do NOT use for:
- Writing new tests. Non-browser tests: `/write-tests` (test-engineer). Browser flows: `/e2e-test` (e2e-tester).
- A failure whose cause is still unknown after 3 rounds. Worker: stop and report FAIL with your hypotheses.
  Orchestrator: dispatch a `debugger` (reproduce-first, `.agents/skills/orchestrate/references/task-types.md` §bugfix).
- Kit-file problems reported by the `agent-kit` step. Use `/workspace-doctor` (orchestrator plans it; a worker fixes).

## Flags
| Need | Command |
|---|---|
| Full gate (orchestrator final check; worker when the brief says so) | `node .agents/scripts/verify.mjs` |
| What would run (no execution) | `node .agents/scripts/verify.mjs --list` |
| Fast inner loop: format, lint, types only (worker default) | `node .agents/scripts/verify.mjs --quick` |
| Only roots with changed files (git) | `node .agents/scripts/verify.mjs --changed` |
| One stack or step | `node .agents/scripts/verify.mjs --only node` or `--only node:test` (comma list allowed) |
| Also run the `test:e2e` script | `node .agents/scripts/verify.mjs --e2e` |
| Slow suites (default 600 s per step) | `node .agents/scripts/verify.mjs --timeout 900` |
| Machine-readable | `node .agents/scripts/verify.mjs --json`, or read `.agents/.state/last-verify.json` |

- Use `--quick`, `--only` and `--changed` while you iterate.
- The brief's `DONE WHEN` check wins over the default. The orchestrator's final run is a full run, with `--e2e`
  when UI or routes changed.

## Checklist
Copy this and tick items as you go:
```
- [ ] Run started from the workspace root after the last edit (the brief's check, or the full gate)
- [ ] Waited for completion (background task finished); saw the literal VERIFY line
- [ ] Every FAIL has a one-sentence root cause with file:line
- [ ] Worker: fixed at the source inside OWNED FILES; failures elsewhere reported as OUT OF SCOPE
- [ ] Orchestrator: no edits; every FAIL turned into a FIX task (fixer, or debugger if the cause is unclear)
- [ ] No test weakened, skipped or deleted; no suppression comments added
- [ ] Fix rounds <= 3 (otherwise stopped and reported FAIL)
- [ ] SKIP lines listed with their reasons
- [ ] Non-obvious cause written as a "Lesson candidates:" line (or "none")
- [ ] Verification block written with the command and its result
```

## Procedure
1. **Preflight.** Run `node .agents/scripts/verify.mjs --list` the first time in a repo, or after adding a stack.
   - Verify: it lists at least one root and one step. If it detects nothing, use the commands in the root
     `AGENTS.md` and say so in the report.
2. **Run the check.** Worker: the brief's check, else `node .agents/scripts/verify.mjs --quick`, plus the narrowest
   test command for the code you touched. Orchestrator: `node .agents/scripts/verify.mjs` (full). `Cwd` = the
   workspace root. Start one run at a time, because parallel runs overwrite `.agents/.state/last-verify.json`.
   TEST phase: only the `e2e-tester` builds (`--e2e`). The `test-engineer` runs `--quick` + `--only node:test`,
   never a run with the build step, because a second build of `.output/` breaks the parallel e2e run (EBUSY/EPERM).
   - **Background run.** If `run_command` returns while the command is still running (a task id or a
     "still running" notice), do not treat the partial output as the result.
     1. Check it with `manage_task` (`Action: "status"`, `TaskId`) until it exits, or wait for the completion notice.
     2. Then read the tail of the output.
     3. If the output is truncated, view `.agents/.state/last-verify.json` and confirm that its `ts` is newer
        than your start time.
   - Verify: you saw `VERIFY: PASS` or `VERIFY: FAIL (<n> failed)` yourself, or a fresh `last-verify.json` with `ok`.
3. **Triage every FAIL** in order: format → lint → typecheck → test → build. Early failures often cause later ones.
   - Each FAIL prints `FAIL <stack>:<step> (<secs>s) — <cmd>` and the last 60 lines of its output.
   - Read the first error, not the last. Typecheck and build errors cascade.
   - Classify each failure with [references/failure-triage.md](references/failure-triage.md)
     (per-stack signatures: missing module, type error, formatter diff, flaky test, missing tool).
   - SKIP is not a failure. List it in the report with its reason (tool missing, not configured).
   - Worker: a FAIL only in files outside your OWNED FILES is not yours. Quote it under `OUT OF SCOPE:` and do
     not fix it, because another worker owns that file.
   - Orchestrator: STOP after this step. For each FAIL write a FIX brief (`.agents/skills/orchestrate/references/briefs.md`
     §fixer; cause unclear -> §debugger) quoting the failing step and its first error line. Never edit the file
     yourself, because your edit would skip REVIEW and TEST. Rerun this skill after the FIX round.
   - Verify: for each FAIL you can write `<path>:<line> — <cause>` in one sentence.
4. **Fix (worker only).** View the file before you edit it. Make the smallest change that removes the cause.
   - Rerun the narrowest check first: the single failing test command, or
     `node .agents/scripts/verify.mjs --only <stack> --quick`.
   - Formatting failures: run the project's formatter in write mode, and only on the files you changed
     (the formatter command is in root `AGENTS.md`).
   - NEVER make a check green by deleting, skipping or loosening a test, by adding `@ts-ignore`,
     `eslint-disable`, `# type: ignore`, `//nolint` or `#[allow(...)]`, by excluding files in config, or by
     hard-coding expected values. That hides the defect, and the quality gate scans for it. Instead, fix the
     code. If a test is genuinely wrong, say why with evidence and change it only when your brief requires the
     new behaviour and the test file is in OWNED FILES.
   - Verify: the specific error is gone in the new output.
5. **Loop.** A round is one verify run after a batch of fixes. At most 3 rounds.
   - Still failing after round 3: stop editing.
     1. Write down the failing step, what you tried, and your next 2 hypotheses.
     2. Report FAIL honestly in your Worker Report. The orchestrator decides the next step (a `debugger`
        task, an `advisor` consult, or the user). Never start that step yourself.
   - The same error twice in a row means your hypothesis was wrong. Change the strategy, not the arguments.
6. **Learn.** If a check failed and then passed for a non-obvious reason (an environment quirk, a hidden
   config, a tool behaviour), write it on the Worker Report envelope's `Lesson candidates:` line (the last line,
   once): `When X, do Y because Z (evidence: <cmd/output>)`. The `scribe` records it in the LEARN phase; never
   run `lessons.mjs add` yourself unless you are the scribe. Otherwise that line reads `Lesson candidates: none`.
7. **Report** with the Verification block below.
   - Worker: put it in your Worker Report body; its `Evidence:` line quotes the VERIFY line.
   - Orchestrator: its first line becomes the Completion Report line
     `Verification (run by orchestrator): node .agents/scripts/verify.mjs -> <VERIFY line>`.

### When verification is impossible
Report exactly why, for example: the toolchain is not installed (quote the SKIP line), the sandbox blocks
the network, or the user said not to run it. Name the command the user should run. Never write "should pass".
Worker: status BLOCKED with that command, not PASS.

## Output
Worker: paste these lines into your Worker Report body (no heading of their own; your agent file's Output format
wins where it names other fields). The envelope's last line stays the single `Lesson candidates:` line.
```text
Verification:
- Command: `node .agents/scripts/verify.mjs [flags]` → VERIFY: PASS | VERIFY: FAIL (<n> failed)
- Steps: <n> PASS, <n> FAIL, <n> SKIP — SKIPs: <stack:step — reason> | none
- Rounds: <1-3> (orchestrator: 1, no fixes)
- Fixed: `<path>:<line>` — <root cause> (one line each) | none
- Remaining failures: `<stack>:<step>` — <first error line> | none
- Out of scope: `<path>` — <failure in a file you do not own> | none
```

## References
- Failure signatures and fixes per stack: [references/failure-triage.md](references/failure-triage.md)
- Script usage: `node .agents/scripts/verify.mjs --help`. Result file: `.agents/.state/last-verify.json`
- Worker protocol and hard invariants: `.agents/rules/00-core-protocol.md`. Orchestrator REPORT and Completion
  Report: `.agents/rules/03-orchestration.md`, `/orchestrate`
- Related: `debugger` worker (unknown cause, via the orchestrator), `/e2e-test` (browser flows),
  `/workspace-doctor` (kit errors)
