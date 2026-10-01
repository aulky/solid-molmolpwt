---
name: perf-audit
description: Task-type playbook for a performance problem, run through the orchestrator pipeline the measured way - pin a metric and a budget, take a baseline with the real profiler for the stack (Chrome DevTools/Lighthouse for web, node --cpu-prof, py-spy, go tool pprof, cargo flamegraph, dotnet-trace, Xdebug/Blackfire), confirm one hypothesis in the profile, make the smallest change, then re-measure with the same command. Use for "this is slow", "make it faster", "reduce bundle/load/memory/latency", before/after a perf-sensitive change, or a performance review.
metadata:
  icon: ⚡
---

# Perf audit: metric + budget first, profile, one hypothesis per task, re-measure

Used by: orchestrator (plans the pipeline with this playbook); workers follow the step for their phase -
`debugger` (EXPLORE: steps 2-4), `implementer` (IMPLEMENT: step 5), `reviewer` (REVIEW), `test-engineer`
(TEST: steps 6-7; web MCP-trace re-measure: `debugger`), `scribe` (LEARN).

"Faster" is not a metric. Before any code changes, the pipeline names the metric, the budget it must meet,
and ONE measurement command that is run the exact same way before and after. Otherwise the comparison is
meaningless.

## When to use
- "This is slow" / "make X faster" / "reduce bundle size / TTFB / memory / p95 latency".
- Before merging a change to a hot path, or after one, to confirm it did what it was meant to.
- A performance review or a Core Web Vitals / Lighthouse check on a web app.

Do NOT use for:
- A crash or wrong output (a bug, not a perf problem). Use `/orchestrate` with the bugfix section of
  `.agents/skills/orchestrate/references/task-types.md`.
- Spotting known anti-patterns (N+1, allocations, complexity) in a diff with no measurement step. That is a
  REVIEW-phase lens: the `reviewer` uses `.agents/guides/principles/performance.md` (and the
  `vercel-react-best-practices` skill on React/Next.js only - never on SolidJS or other non-React projects).
- Resource exhaustion by hostile input (unbounded request size, no rate limit). Use `/security-audit`
  (OWASP API4). This skill is about legitimate-load performance.

## Invariants
1. NEVER plan an IMPLEMENT task before a baseline number exists, because a fix without a baseline cannot be
   shown to work. Instead dispatch the EXPLORE `debugger` first; no benchmark exists -> a `test-engineer`
   task writes one (OBJECTIVE kind: characterization), then the debugger measures.
2. The baseline command, inputs and iteration count are pasted VERBATIM into the TEST brief, because an
   "equivalent" command measures something else. Instead copy the exact line from the debugger's report.
3. One hypothesis per IMPLEMENT task, because two changes in one task hide which one moved the metric.
   Instead plan one task per confirmed hypothesis, in order of likely impact.
4. No improvement after TEST is not a win. Instead it becomes a FIX round (next hypothesis) or a `fixer` task
   that reverts the change. Max 2 FIX rounds, then ESCALATE.
5. The orchestrator never runs the profiler to "fix it quickly" and never edits code, because profilers,
   builds and report flags write files. Workers measure and change; the orchestrator grades by the profile file
   and the quoted output, and reruns a command only if it writes no files (a plain timing or benchmark run).

## Phase map
| Step | Phase | Worker (TypeName) | What the brief asks for |
|---|---|---|---|
| 1 Metric + budget | EXPLORE (orchestrator states it) | orchestrator; `ask_question` if no budget | the exact number to read and the target |
| 2 Baseline | EXPLORE | `debugger` (PHASE: EXPLORE, APPLY_FIX: no) | the measurement command run 3+ times, median, profile file |
| 3-4 Hypotheses + confirmation | EXPLORE (same debugger task) | `debugger` | <= 3 ranked hypotheses, the quoted frame/query/line for the top one |
| - Plan | PREPARE | orchestrator (lane S) or `planner` (lane M/L) | one task per confirmed hypothesis; new dependency or redesign -> ask the user |
| 5 Smallest change | IMPLEMENT | `implementer` | the change the profile points at, nothing else |
| - Review | REVIEW | `reviewer` (+ `security-auditor` for caches keyed on user data) | correctness of the change, no drive-by edits |
| 6 Re-measure | TEST | `test-engineer` (CLI commands incl. Lighthouse CLI); `debugger` if the baseline was an MCP trace | the SAME command, inputs, iterations; both numbers and the delta |
| 7 Correctness | TEST (same wave) | `test-engineer` (+ `e2e-tester` if UI changed) | `node .agents/scripts/verify.mjs` PASS |
| - Learn | LEARN | `scribe` | baseline -> after, confirmed cause as a lesson candidate if non-obvious |

The debugger measures in EXPLORE because the `explorer` agent may not run benchmarks or profilers.

## Checklist (orchestrator)
Copy this and tick items as you go:
```
- [ ] Metric named (the exact number) and budget set with its source, or labelled "Inferred:"
- [ ] EXPLORE debugger report graded: baseline number, exact command, input size, run count, profile path
- [ ] Top hypothesis confirmed by a quoted frame/query/line from the profile (not "some slow function")
- [ ] PREPARE: one IMPLEMENT task per confirmed hypothesis; OWNED FILES = only the files the profile named
- [ ] REVIEW done on the change (never skipped)
- [ ] TEST brief contains the baseline command VERBATIM; after-number from the SAME command
- [ ] `node .agents/scripts/verify.mjs` PASS (correctness) - rerun by you before REPORT
- [ ] LEARN: scribe briefed with baseline -> after and the confirmed cause
- [ ] Completion Report has the Perf block (baseline -> after, command, delta)
```

## Procedure

### EXPLORE
1. **Pin the metric and the budget (orchestrator).** Name exactly what will be read (for example "p95
   response time for GET /search", "Lighthouse LCP on /", "peak RSS during import", "wall time of
   `pytest -k slow`") and the target, with a reason: a product requirement, a regression against the last
   release, or a stated goal. No budget given -> ask once with `ask_question`, or write "no stated budget;
   Inferred: N% improvement" and name N.
   Check: you can write "`<metric>`: baseline unknown, target `<value>`" on the task board.
2. **Baseline (debugger).** Dispatch one `debugger` (brief: `.agents/skills/orchestrate/references/briefs.md`
   §debugger) with `PHASE: EXPLORE`, `APPLY_FIX: no`, the metric, the budget, and the tool from
   [references/profilers.md](references/profilers.md): web (chrome-devtools MCP trace or Lighthouse against a
   production build, never the dev server), Node (`node --cpu-prof` / `--heap-prof`), Python (`py-spy`, or
   `python -m cProfile` when nothing can be installed), Go (`go test -bench` + `go tool pprof`), Rust
   (`cargo flamegraph`), .NET (`dotnet-trace`), PHP (Xdebug or Blackfire). OWNED FILES: the profile output
   folder only (for example `.scratch/perf/`, gitignored; `node --cpu-prof-dir .scratch/perf`), never
   `.agents/.state/` (hook state); a "never edit `.scratch/`" note in AGENTS.md means the existing notes.
   DONE WHEN: 3+ runs, the median reported, the exact command line, input size, iteration count and the
   profile file path quoted.
   Gate: you open the profile file and read the quoted output the debugger reports. Rerun the command only if
   it writes no files (a plain timing or benchmark run without `--cpu-prof`, `--heap-prof`, a build or a
   report flag) and takes under ~2 minutes; its number must land in the same range. Otherwise grade by the
   quoted output and the profile path.
3. **Hypotheses (same debugger task).** Up to 3 candidate causes ranked by likely impact x cheapness to
   check, each stated in one line BEFORE the debugger reads the profile in detail, each falsifiable (it names
   the frame, query or allocation that would confirm or kill it). Common categories:
   [references/common-wins.md](references/common-wins.md).
4. **Confirmation (same debugger task).** The report quotes the frame, query, allocation site or render pass
   the profile blames (`path:line`, function name, or query text + row estimate). The top of the profile
   does not match any hypothesis -> the debugger says so and re-ranks; nobody forces the fix onto the
   expected cause.
   Gate: you open the cited `path:line` yourself. A claim without a quoted frame -> FIX brief to the same
   role, not a plan.

### PREPARE
- Lane S: you write a 1-task board. Lane M/L: `planner` with the debugger's report pasted in.
- One IMPLEMENT task per confirmed hypothesis, highest impact first. DONE WHEN ends with the check command.
- The fix needs a new dependency, a cache service, or an architecture change -> ask the user now (hard to
  reverse), and treat a new dependency as a feature task.

### IMPLEMENT
5. **Smallest change (implementer).** Brief: `Task kind: feature` (or `refactor` when behaviour must not
   change), the quoted profile evidence, the hypothesis, OWNED FILES = the files the profile named. DO NOT:
   drive-by optimizations, unrelated refactors, new dependencies.
   Gate: files touched are all in OWNED FILES; its `verify.mjs --quick` output rerun by you.

### REVIEW
- `reviewer` on the change; the requirement line says "only the confirmed hypothesis is addressed". Add a
  `security-auditor` when the change adds a cache keyed on user, tenant or auth data.

### TEST
6. **Re-measure (test-engineer).** The brief pastes the baseline command VERBATIM, the same inputs and the
   same iteration count, and asks for both numbers and the delta (absolute and %). OWNED FILES: the profile
   output folder only (a benchmark file only if the plan said so). Web metrics: the same Lighthouse CLI command
   (`npx lighthouse <url> --output=json ...`, or the project runner's equivalent), run as a CLI tool by the test-engineer. Baseline from a
   chrome-devtools MCP trace -> dispatch the same `debugger` role instead (`PHASE: TEST`, `APPLY_FIX: no`).
   Gate: the after-number came from the SAME command. No movement -> say so plainly: next hypothesis as a
   FIX round, or a `fixer` task that reverts the change. Never report the code change alone as a win.
7. **Correctness (same TEST wave).** A perf change is still a code change: `node .agents/scripts/verify.mjs`
   must pass (`--e2e` and an `e2e-tester` when a browser-visible flow changed).

### LEARN and REPORT
- `scribe` brief: baseline -> after with the command, the confirmed cause, any profiler flag that did not work
  on this machine (a lesson candidate).
- You run `node .agents/scripts/verify.mjs` yourself, then add the Perf block to the Completion Report.

## Output (Perf block inside the Completion Report)
```
### Perf
Metric: <exact metric> - Budget: <target> (<source, or "Inferred: N% improvement">)
Baseline: <value> (`<command>`, <n> runs, median, input <size>) - profile: <path> (T<id> debugger)
Hypotheses: <ranked 1-3>; confirmed: <quoted frame/query/line> -> <which hypothesis>
Change: `<path>` - <what, one line> (T<id> implementer)
After: <value> (same command, T<id> test-engineer) - Delta: <+/-X%, absolute>
Correctness: `node .agents/scripts/verify.mjs` -> <VERIFY line, run by orchestrator>
```

## References
- [references/profilers.md](references/profilers.md): per-stack profiler commands, what is verified on this
  machine and what to check with `--help` first. Paste the chosen command into the debugger brief.
- [references/common-wins.md](references/common-wins.md): catalogue of common wins per language/layer, to
  recognize a category once the profile points at it (never a substitute for measuring).
- `.agents/skills/orchestrate/references/task-types.md` (performance section) and
  `.agents/skills/orchestrate/references/briefs.md` (§debugger, §implementer, §test-engineer).
- `.agents/guides/principles/performance.md`: budgets, complexity, caching, N+1.
