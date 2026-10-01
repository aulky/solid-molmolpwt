---
name: workspace-doctor
description: Orchestrator playbook for maintaining the Frontier Kit itself (.agents/) through the pipeline. The orchestrator runs doctor.mjs, groups every defect it reports (frontmatter, basename-only globs, byte caps, the always-on token budget, skill/agent/hook contracts, stray AGENTS.md files) into worker tasks, and adds a new language pack, framework pack, topic rule, skill or agent from the exact templates, keeping the orchestrator-mode roster, 03-orchestration.md and hooks v2 consistent. Use when the user says kit doctor, fix the kit, add a language/framework pack, add a skill or agent, the always-on budget is too big, activate-stack, or wants this kit installed into another repo.
metadata:
  icon: 🩺
---

# Workspace doctor: maintain the Frontier Kit itself

Used by: orchestrator (runs the doctor, plans, verifies); workers follow the step for their phase - `explorer`
(EXPLORE: step 2), `planner` (PREPARE, lane M/L: step 3), `implementer` (IMPLEMENT: steps 4-6, 9), `reviewer`
(REVIEW: step 7), `fixer` (FIX), `test-engineer` (TEST: step 8), `scribe` (LEARN).

This playbook is about `.agents/` - the kit - not the user's application code. Kit files are workspace files:
you (the orchestrator) never edit them; every fix or addition is a worker task.

## When to use
- `node .agents/scripts/doctor.mjs` reports errors or warnings, or a kit change is requested.
- Adding a language pack, framework pack, topic rule, skill or agent to this kit.
- The always-on budget looks large, or `/onboard-repo` or `activate-stack.mjs` behaved unexpectedly.
- Propagating kit changes into another repo that already carries this kit.

Do NOT use for:
- Bugs or features in the repo's own application code. Use `/orchestrate`.
- Bringing a repo under this kit for the FIRST time. Use `/onboard-repo` (it runs the doctor at the end).
- Recording one lesson. That is the `scribe`'s LEARN task (`/reflect` steps), never a doctor pipeline.

## Invariants (paste the relevant ones into every IMPLEMENT and REVIEW brief)
1. NEVER hand-edit `.agents/.state/*` (runtime state written by hooks and scripts). Instead let the script or hook
   regenerate it; delete a corrupt file and re-run the command if needed.
2. NEVER add a nested folder under `.agents/rules/`, because Antigravity scans it FLAT and silently ignores
   subfolders (VERIFIED). Instead keep every rule file directly in `.agents/rules/`.
3. NEVER write `globs:` as a YAML list or with any directory component (`src/**`, `**/routes/*.tsx`), because
   matching is BASENAME-ONLY (VERIFIED) and both forms never fire, with no error. Instead write one
   double-quoted, comma-separated string of `**/<basename-glob>` patterns.
4. NEVER create a file named `AGENTS.md` or `GEMINI.md` anywhere except root `AGENTS.md` and `.agents/GEMINI.md`,
   because every other one becomes an always-on directory rule. Instead name kit documentation `README.md`.
5. Keep the always-on budget (root `AGENTS.md` + `.agents/GEMINI.md` + every `always_on` rule, bytes/4) under
   9,000 tokens. Past the error threshold Antigravity demotes the largest rules to path pointers; fix it first.
6. NEVER edit the 5 installed third-party skills (`architecture-decision-records`, `commit-archaeologist`,
   `seo-audit`, `thinking-out-loud`, `vercel-react-best-practices`) or `skills-lock.json`. Instead reinstall or
   update them through their own mechanism.
7. Orchestrator-mode contract (summary in `references/templates.md` §7): workers never
   list `invoke_subagent`; the `orchestrator` agent lists no write tool; every worker body starts with the
   WORKER role line and ends with the Worker Report envelope; no skill tells a worker to delegate; every kit
   skill has a `Used by:` line under its H1; `orchestrator-guard.mjs` stays enabled in `hooks.json`. Doctor's
   `roster-*` codes check the agent and guard parts. A change that breaks one of these is a REVIEW finding (APPLY).
8. A new agent, skill or rule has touchpoints in other files (roster, hooks phase map, kit-install lists,
   GEMINI.md routing). Plan one task per touched file set from the table in `references/templates.md` §8,
   because a half-registered agent is invisible to the pipeline gate.

## Checklist (orchestrator)
Copy this and tick items as you go:
```
- [ ] `node .agents/scripts/doctor.mjs` run by you; full issue list on the board (or --json)
- [ ] Lane stated; issues grouped into tasks by defect class and file set (disjoint OWNED FILES)
- [ ] Every WARN: a fix task, or accepted with a one-line reason on the board
- [ ] Budget checked: warn 9,000 / error 16,000 tokens; a trim task if over warn
- [ ] New kit piece: exact template from references/templates.md; every touchpoint in §8 planned
- [ ] REVIEW with the contract lens (references/defect-classes.md §Orchestrator-mode contract)
- [ ] TEST: doctor PASS, `node --test` suites PASS, `verify.mjs --only agent-kit` PASS (test-engineer)
- [ ] activate-stack re-run (implementer) if a framework pack or a dependency changed
- [ ] LEARN: scribe briefed; kit-install propagation only if the user asked
- [ ] You ran doctor.mjs and verify.mjs; Workspace Doctor block in the Completion Report
```

## Procedure

### EXPLORE
1. **Run the doctor (you).** `node .agents/scripts/doctor.mjs` (`--json` for a machine-readable report,
   `--quiet` for problems only). Read the counts line and the final `DOCTOR: PASS|FAIL (<n> errors, <n>
   warnings)` line. Each issue is `<file>[:<line>] [<code>] <message>`; doctor's message says what to change,
   [references/defect-classes.md](references/defect-classes.md) says why, so the fix targets the cause.
2. **Find the cause across files (explorer, when one class hits many files or the cause is unclear).** Brief:
   the codes and files, plus `node .agents/scripts/search.mjs "<old name>" .agents` for every reference to a
   renamed or deleted skill, rule or agent (the ready-made commands are items 6-7 of
   `references/defect-classes.md` §Orchestrator-mode contract). Report `path:line` per hit.

### PREPARE
3. **Group into tasks (you for lane S, `planner` for M/L).** Errors before warnings. One task = one defect class
   in one file set:
   - **Frontmatter / trigger** (`rule-no-frontmatter`, `rule-trigger-missing`, `-invalid`): the file is silently
     ignored; add `trigger`, `globs` (if `glob`), `description`.
   - **Globs** (`rule-globs-list`, `rule-glob-dir`, `-backslash`, `-brace`): ONE quoted comma string of
     `**/<basename-glob>` patterns (invariant 3).
   - **Size / budget** (`rule-size`, `guide-size`, `budget`): move prose into a guide or `references/`, leave a
     one-line pointer; DONE WHEN includes `wc -c <file>` under the cap.
   - **Skills** (`skill-name-mismatch`, `skill-too-long`, `skill-long`, `skill-description-missing`): folder
     name == `name`, <= 250 lines for a kit skill.
   - **Agents** (`agent-tool-unknown`, `agent-model-invalid`, `agent-name-builtin`, `agent-name-mismatch`):
     verified tool names only; file name == `name` (the TypeName).
   - **Hooks** (`hooks-shape`, `hooks-script-missing`, `hooks-unknown-key`): tool events need
     `{"matcher":..., "hooks":[...]}`; `PreInvocation`/`PostInvocation`/`Stop` take handlers directly.
   - **Stray directory rules** (`stray-directory-rule`): rename the file (invariant 4).
   Warnings you accept: one line each on the board with the reason. Never silence a check by deleting or
   weakening it; changing `doctor.mjs` itself is a separate task with its tests.
4. **Budget (a task when over warn).** Doctor prints `~<n> tokens ... warn > 9,000, error > 16,000` and a byte
   breakdown per always-on file. Trim task: shorten the largest always-on file, move detail to a guide, or demote
   a rule to `glob`/`model_decision` if it only matters for some files. `03-orchestration.md` and
   `00-core-protocol.md` stay always_on (<= 7,000 B each). The `model_decision` index and skill listings have a
   separate platform budget; do not conflate them.

### IMPLEMENT
5. **Fix tasks (implementer, one per group).** Brief pastes the doctor lines, the defect-class row, the relevant
   invariants and the template section. DONE WHEN: `node .agents/scripts/doctor.mjs --quiet` shows none of this
   task's codes; `wc -c` of each owned file within its cap.
6. **Add a kit piece (implementer, only when asked to extend the kit).** Copy the exact template from
   [references/templates.md](references/templates.md): language pack §1 (`rules/lang-<id>.md`, glob,
   3,000-5,500 B, + `guides/languages/<id>.md`), framework pack §2 (`rules/fw-<id>.md`, `trigger:
   model_decision`, guard line `Applies only if <manifest condition>. Otherwise ignore this rule.`), topic rule
   §3, deep guide §4, skill §5 (with `Used by:`), agent §6 (worker) or §6b (orchestrator). Then the touchpoints
   from §8, each as its own task with disjoint files (hooks phase map, kit-install lists, GEMINI.md roster or
   routing, `03-orchestration.md`, orchestrate `references/briefs.md` and `task-types.md`).
   Activation after adding or removing a framework pack, or after a dependency changed: an implementer runs
   `node .agents/scripts/activate-stack.mjs` (you ran `--dry-run` first and pasted the expected
   `<file>: <from> -> <to>` lines; OWNED FILES = those `fw-*.md` files). `# pinned` after a trigger value keeps it.

### REVIEW and FIX
7. **Review (reviewer).** Lens: the invariants above, the template followed section by section, the
   numbered checks in §Orchestrator-mode contract of `references/defect-classes.md`, no reference to a deleted skill, rule or
   third-party skill. Hook or script changes: `security-auditor` too (hooks run on every tool call; never log env
   vars or file contents; PreToolUse must return an explicit decision). APPLY findings -> `fixer`, max 2 rounds.

### TEST
8. **Checks (test-engineer).** `node .agents/scripts/doctor.mjs` (`DOCTOR: PASS (0 errors, ...)`, or only the
   accepted warnings); `node --test ".agents/hooks/test/*.test.mjs"` and `node --test
   ".agents/scripts/test/*.test.mjs"` (pass the glob; a bare directory fails); `node .agents/scripts/verify.mjs
   --only agent-kit`. Hook changes: the synthetic-transcript tests for role detection, dispatch tracking and
   the pipeline gate must exist and pass, and each hook finishes in under 1 s.

### LEARN, propagate, REPORT
9. **Propagate (implementer, only when the user asked and another repo carries the kit).**
   `node .agents/scripts/kit-install.mjs --target <repoDir> --dry-run`, report CREATE/OVERWRITE/CONFLICT/SAME/KEEP
   counts, then without `--dry-run`. `--force` only if the user wants kit files in the target overwritten; it
   never overwrites the target's `AGENTS.md`, `memory/lessons.md` or `rules/90-lessons.md`. It copies kit skills
   only, never the 5 third-party ones, then runs the target's `activate-stack.mjs`.
10. **LEARN (scribe)**: platform surprises (a glob that did not fire, a tool the CLI dropped) as lesson candidates.
11. **REPORT (you).** `node .agents/scripts/doctor.mjs` and `node .agents/scripts/verify.mjs`, then the block below.

## Output (Workspace Doctor block inside the Completion Report)
```
### Workspace doctor
- Doctor before (orchestrator): `node .agents/scripts/doctor.mjs` -> FAIL (<n> errors, <n> warnings)
- Fixed: <file [code] -> what changed (T<id>)> (one line each)
- Accepted warnings: <file [code] -> reason, or "none">
- Budget: <before> -> <after> tokens (warn 9,000 / error 16,000 across N always-on files)
- Added: <new rule/skill/agent files, template section, byte size; touchpoints updated (T<ids>)>
- activate-stack: <ran (T<id>) / not needed> -> <frameworks detected; triggers changed>
- Kit tests (T<id> test-engineer): <node --test results, or "not touched">
- kit-install: <ran against <dir> with <counts> / not requested>
- Doctor after (orchestrator): `node .agents/scripts/doctor.mjs` -> PASS (0 errors, <n> warnings)
```

## References
- [references/templates.md](references/templates.md): exact templates for a language pack, framework pack,
  topic rule, deep guide, skill, worker agent and orchestrator agent; notes for the `orchestrate` skill,
  `03-orchestration.md` and hooks v2; the touchpoint table for adding an agent, skill or rule.
- [references/defect-classes.md](references/defect-classes.md): every doctor.mjs code with the fix pattern and
  re-check command, the orchestrator-mode contract checks, budget mechanics, the basename-only glob rule.
- `.agents/docs/antigravity-spec.md` (verified platform spec), `.agents/docs/architecture.md` (layers, budgets,
  extension points), `.agents/rules/topic-agent-kit.md` (quick card, loaded by glob).
- `node .agents/scripts/doctor.mjs --help`, `node .agents/scripts/activate-stack.mjs --help`,
  `node .agents/scripts/kit-install.mjs --help`.
