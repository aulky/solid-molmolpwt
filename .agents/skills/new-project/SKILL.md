---
name: new-project
description: Orchestrator playbook for starting a new app, service, library or CLI through the pipeline. Explorers check for existing work to reuse, the orchestrator pins requirements with the user, a planner compares stacks and an implementer records the choice in an ADR, an implementer scaffolds with the official CLI and wires day-1 quality gates (lint, typecheck, test, e2e, verify), testers prove install/build/run/verify, and a planner drafts at most 7 roadmap steps. Use when the user wants to start, create, bootstrap, scaffold or spin up a new project, or proposes a rewrite in a new stack.
metadata:
  icon: 🌱
---

# New project: reuse check, requirements, stack ADR, official scaffold, gates from day 1

Used by: orchestrator (plans, asks the user, verifies); workers follow the step for their phase - `explorer`
and `docs-researcher` (EXPLORE: steps 1, 3a), `planner` (PREPARE: steps 3b, 10), `advisor` (lane L critique),
`implementer` (IMPLEMENT: steps 3c, 6, 7, 9), `reviewer` (REVIEW), `test-engineer` + `e2e-tester` (TEST: step
8), `scribe` (LEARN).

Default stack: the one the user already ships with (their other repos, `AGENTS.md`). Another stack only if a
requirement rules that one out, and the ADR says why. Default lane: M (L for a rewrite of an existing project).

## When to use
- "Start / create / bootstrap / scaffold / spin up a new <app | API | service | library | CLI>."
- A new package inside an existing monorepo.
- The user proposes rewriting an existing project in a new stack (the rewrite guard, step 4, applies).

Do NOT use for:
- A feature in an existing project. Use `/orchestrate` (feature task type).
- Reviving or finishing an old project. Use `/orchestrate` on that project's folder, starting with EXPLORE of
  what exists; bring it under the kit with `/onboard-repo`.
- Bringing an existing repo under this kit. Use `/onboard-repo`.

## Invariants
1. Scaffold only into an EMPTY target directory the user confirmed, because scaffolders overwrite files and can
   run `git init`. NEVER scaffold over an existing project. The scaffold task runs BEFORE any other task writes
   into the target (the ADR too). When the kit repo itself was cloned as the project root (only `.agents/`,
   `AGENTS.md`, `README.md`, `.gitignore`, `skills-lock.json`), that root is the target: scaffold in place next to
   `.agents/` (a CLI flag for a non-empty folder only if its `--help` says existing files are kept, else BLOCKED),
   and step 9 skips kit-install and runs only `/onboard-repo`.
2. The implementer uses the official scaffolding CLI with explicit flags after reading its `--help`, because
   CLIs change. NEVER hand-write a framework's boilerplate from memory.
3. NEVER invent versions. They come from the scaffolder output or the registry (docs-researcher), and the ADR
   freezes the stack: no stack migrations until v1 ships.
4. Step 0 of every roadmap is "it installs, builds, runs, and `verify` passes on the untouched scaffold". No
   feature work before that gate.
5. Mention a reuse match ONCE, let the user choose, then drop it.
6. You never scaffold, install or write files yourself (git too: `git init` goes through `/commit-and-pr`).
   Every brief that installs lists the manifest AND the lockfile in OWNED FILES and names the exact commands
   in the brief field `ALLOWED COMMANDS: <cmd>; <cmd>` (after OWNED FILES; same field as `/upgrade-deps`),
   because the implementer and fixer install nothing that is not listed there exactly. A worker that answers
   `INPUT GAP: needs <cmd>` -> re-dispatch with that exact command added (new T-id); never run it yourself.

## Phase map
| Step | Phase | Who | Output the gate needs |
|---|---|---|---|
| 1 Reuse check | EXPLORE | `explorer` (workspace + folders the user named), `docs-researcher` (world check) | matches with paths, or "none" |
| 2 Requirements | PREPARE | orchestrator + user (`ask_question`) | deliverable, users, 3-5 criteria, non-goals, constraints |
| 3a Versions | EXPLORE | `docs-researcher` per candidate stack | current versions and scaffold flags, cited |
| 3b Stack comparison | PREPARE | `planner` (+ `advisor`, lane L) | >= 2 options, pros AND cons, recommendation |
| 4 Rewrite guard, 5 Target dir | PREPARE | orchestrator + user | user's choice quoted; empty dir confirmed (`list_dir`) |
| 6 Scaffold | IMPLEMENT wave 1 | `implementer` | exact command, created files listed |
| 3c ADR, 7 Day-1 gates | IMPLEMENT wave 2 (disjoint files) | `implementer` x 2 | ADR `Status: Proposed`; lint/typecheck/test scripts wired |
| - Review | REVIEW | `reviewer` | requirements covered, no hand-written boilerplate, no secrets |
| 8 Step 0 proof + first tests | TEST | `test-engineer` (1 real unit test), `e2e-tester` (UI smoke) | build/run/verify PASS (no installs in TEST) |
| 9 Kit + project facts | IMPLEMENT -> `/onboard-repo`; git via `/commit-and-pr` | `implementer` (kit-install), then the onboard pipeline | AGENTS.md PASS |
| 10 Roadmap | PREPARE (for the next pipeline) | `planner` | <= 7 steps, step 1 doable this session |
| - Learn | LEARN | `scribe` | scaffolder flags that changed, setup gotchas |

## Checklist (orchestrator)
Copy this and tick items as you go:
```
- [ ] Reuse check done (workspace + folders the user named); any match mentioned once; user's choice quoted
- [ ] Requirements on the board: deliverable, users, 3-5 checkable criteria, non-goals, constraints
- [ ] Stack: >= 2 options compared by a planner; versions cited by a docs-researcher; user accepted
- [ ] Target directory absolute, confirmed by the user, and empty (you listed it)
- [ ] Scaffold task PASS: official CLI, flags from --help, created files listed
- [ ] Wave 2: ADR (docs/adr/, Status: Proposed, index row) and day-1 gates, disjoint OWNED FILES
- [ ] REVIEW done; TEST: 1 real unit test, e2e smoke (UI), build + run + verify PASS (install done in IMPLEMENT)
- [ ] Kit installed and /onboard-repo run in the new project (if it gets this kit); git init only if asked
- [ ] Roadmap <= 7 steps in the Completion Report; LEARN done; New Project block written
```

## Procedure

### EXPLORE
1. **Reuse check.** Ask ONE question: "Where do your other projects live? I can check whether you already
   started this." Skip it if the user said this is new; never sweep a home directory uninvited.
   - `explorer` brief: `node .agents/scripts/search.mjs "<name>|<key noun>" -i --files` in this workspace, then
     the same with `<folder>` for each folder the user named, plus `list_dir` and README first lines of
     matching folders. Read-only; report `path` + how much exists.
   - `docs-researcher` brief (same wave): does an existing library, template or product already do this?
   - Match found: say it once ("You already built about 60% of this in `<path>`. Continue that instead?"). The
     user's choice stands. Continue -> `/orchestrate` on that folder instead of this playbook.

### PREPARE (with the user)
2. **Requirements (you).** Deliverable, users, 3-5 checkable success criteria (these become the acceptance
   criteria), non-goals, constraints (runtime, hosting, data, auth, budget, team familiarity). A Must you cannot
   infer -> ONE bundled `ask_question` with options.
3. **Stack.**
   - a. `docs-researcher` per candidate stack (EXPLORE wave): current stable versions, the official scaffold
     command and flags ([references/scaffolders.md](references/scaffolders.md) as the starting point), cited.
   - b. `planner`: drivers as Must/Should; >= 2 real options, each with pros AND cons; fewer moving parts and
     built-in capabilities first; managed auth and payments over hand-rolled; team familiarity counts. Lane L:
     `advisor` critique. You present the recommendation; the user accepts or picks.
   - c. The ADR is an IMPLEMENT task in wave 2 (step 3c below).
4. **Rewrite guard** (only when replacing an existing project). State once that rewrites often stall shipping and
   offer to freeze the current stack until the feature ships. User still wants it: lane L; the old system is the
   test oracle (characterization tests first), one vertical slice at a time (strangler pattern), and the ADR
   supersedes the old decision.
5. **Target directory.** Absolute path, confirmed by the user; you `list_dir` it and it is empty or absent. Outside
   the current workspace -> the user must add it as an Antigravity workspace later (customizations load only for
   bound folders).

### IMPLEMENT
6. **Scaffold (implementer, wave 1, alone).** Brief: the exact command from the docs-researcher report, run from
   the PARENT folder, `<cli> --help` first, explicit non-interactive flags; OWNED FILES `<target>/**`;
   `ALLOWED COMMANDS:` the scaffold command and the full install (the gates' dev dependencies too, when the
   docs-researcher named them), so TEST installs nothing. The CLI insists on prompts the shell cannot answer ->
   BLOCKED; you give the user the exact command to run in their terminal, and wait.
   DONE WHEN: created files listed; the generated manifest and README quoted. Scaffolders may write agent files
   (create-next-app adds `AGENTS.md` and `CLAUDE.md`; `--no-agents-md` skips them): useful facts go into the
   root `AGENTS.md` later (step 9); never leave a nested `AGENTS.md` or `GEMINI.md` inside this workspace.
7. **Wave 2, two implementers with disjoint files:**
   - 3c ADR: `docs/adr/NNNN-<kebab-title>.md` in the NEW project with the `architecture-decision-records` skill,
     `Status: Proposed` until the user accepts, an index row in `docs/adr/README.md`. The Decision names the stack
     and major versions and says "no stack migrations until v1 ships". OWNED FILES: `<target>/docs/adr/**`.
   - Day-1 gates from [references/quality-gates.md](references/quality-gates.md): format, lint, typecheck, a unit
     test runner config, an e2e config for UI projects, scripts named `lint`, `typecheck`, `test` (plus
     `test:e2e`), a `.gitignore` for build output and `.env*`; keep the generated `.env.example`, never real
     secrets. OWNED FILES: the config files, the manifest, the lockfile, `.gitignore`. `ALLOWED COMMANDS:` the
     dev-dependency installs not already done in step 6.

### REVIEW
- `reviewer`: requirements and acceptance criteria verbatim; lens = scaffold untouched except the gates, no
  hand-written boilerplate, no secrets, scripts named as required, ADR complete.

### TEST
8. **Step 0 proof (same wave).** `test-engineer`, OWNED FILES `<target>/<unit test file>`, installs nothing
   (steps 6-7 did): build, start once (background, then stop), write ONE real unit test, then run the new
   project's `lint`, `typecheck`, `test` and `build` scripts (Cwd = `<target>`), and
   `node .agents/scripts/verify.mjs` from this workspace root when `<target>` is inside it (roots are detected
   to depth 3). `e2e-tester` (UI projects): one smoke spec (home page renders).
   Gate: every command's exit code and key line quoted; you rerun one of them (verify when available). FAIL ->
   FIX round on the gates task.

### Kit, LEARN, roadmap, REPORT
9. **Kit and project facts** (if the project gets this kit): an `implementer` runs
   `node .agents/scripts/kit-install.mjs --target <target> --dry-run`, then without `--dry-run`; then run
   `/onboard-repo` for the new project. Ask once whether to initialize git; if the scaffolder did not and the user
   agrees, `git init` + the first commit go through `/commit-and-pr` (orchestrator, git metadata only, user
   asked).
10. **Roadmap (planner).** At most 7 steps. Step 0 = the proof from step 8 (done). Step 1 completable this
    session. Every step ends in something verifiable. The last step is shipped: a URL, a release, a published
    package, not "keep working on it".
11. **LEARN (scribe)** with the scaffolder flags that differed from `references/scaffolders.md`, setup gotchas,
    new project facts. Then the Completion Report with the block below, and offer to start roadmap step 1 as
    a new pipeline.

## Output (New Project block inside the Completion Report)
```
### New project
- Reuse check (T<id>): <searched where> -> <no match | match at <path>: user chose <reuse|new>>
- Requirements: <deliverable>; criteria: 1) ... 2) ...; non-goals: ...
- Stack: <choice + major versions> (ADR: `docs/adr/NNNN-<title>.md`, Status: Proposed; T<id>)
- Scaffold (T<id>): `<exact command>` in `<dir>`
- Gates (T<id>): format `<cmd>` · lint `<cmd>` · typecheck `<cmd>` · test `<cmd>` · e2e `<cmd or n/a>`
- Step 0 (T<id> test-engineer, rerun by orchestrator): `<verify command>` -> <PASS + key lines>
- Roadmap (T<id> planner): 0. Prove install/build/run/verify (done) 1. <completable today> ... N. Ship: <URL | release | package>
```

## References
- [references/scaffolders.md](references/scaffolders.md): official scaffolding CLIs per stack, with
  non-interactive flags. Paste the row into the docs-researcher and scaffold briefs.
- [references/quality-gates.md](references/quality-gates.md): day-1 gate defaults per stack (with escape hatches).
- [architecture-decision-records](../architecture-decision-records/SKILL.md): ADR templates and the index.
- `.agents/rules/topic-new-project.md`, `.agents/rules/topic-architecture-decisions.md`,
  `.agents/skills/orchestrate/references/briefs.md`.
