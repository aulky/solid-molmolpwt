# Antigravity Frontier Kit

A ready-to-clone Google Antigravity workspace that makes a low-tier Gemini model (Flash) work like a much stronger
one. It contains no application code. Everything lives in `.agents/` (rules, skills, agents, hooks, scripts and
guides) plus a root `AGENTS.md` template for your project's facts.

- **Orchestrator mode.** One core agent plans and assigns tasks. Each worker subagent runs exactly one task
  through `EXPLORE -> PREPARE -> IMPLEMENT -> REVIEW -> FIX -> TEST -> LEARN`.
- **Deterministic gates.** Hooks block unverified finishes, direct edits by the orchestrator, and skipped pipeline
  phases. `verify.mjs` runs every check the repo has.
- **Guidance on demand.** Rules for 11 languages and 11 frameworks, 18 principle guides and topic rules. Framework
  rules switch on automatically when their stack is detected.
- **`/start` for the first session.** Like `/init`: it detects a fresh kit clone or an existing codebase, reads
  the code, fills in `AGENTS.md`, switches on the matching rules and sets up git hygiene.
- **Commit policy.** Conventional Commits, no `Co-authored-by` or AI attribution, and commits only as your own
  git identity. A git commit-msg hook (`commit-msg.mjs`) enforces it.
- **Continuous learning.** Lessons go into a ledger (`.agents/memory/lessons.md`), and proven ones are promoted to
  an always-on rule.

Human overview: [`.agents/README.md`](.agents/README.md). Agent entry point: [`.agents/GEMINI.md`](.agents/GEMINI.md).
Design: [`.agents/docs/architecture.md`](.agents/docs/architecture.md), with decisions in
[`.agents/docs/adr/`](.agents/docs/adr/).

## Requirements

- Google Antigravity (IDE, app or the `agy` CLI).
- Node.js 22+ on `PATH`. Hooks and scripts are zero-dependency Node (>= 18); the `node --test <glob>` commands
  below need Node >= 21.
- Playwright in the project, for browser e2e tests (the `e2e-tester` sets it up when a UI changes).

## Use it

### A. Start a new project from the kit

```powershell
git clone https://github.com/<you>/<this-repo>.git my-app
cd my-app
Remove-Item -Recurse -Force .git   # start the project's own history
git init
```

Open the folder in Antigravity and ask for `/new-project` to scaffold the stack, or add your code and ask for
`/start`. It detects whether the folder is empty or already has code and routes to `/new-project` or
`/onboard-repo`: it reads the codebase, fills in `AGENTS.md`, switches on the matching framework rules and
installs the git commit-msg hook.

### B. Add the kit to an existing project

```powershell
git clone https://github.com/<you>/<this-repo>.git C:\tools\frontier-kit
node C:\tools\frontier-kit\.agents\scripts\kit-install.mjs --target C:\path\to\project --dry-run
node C:\tools\frontier-kit\.agents\scripts\kit-install.mjs --target C:\path\to\project
```

The installer copies the kit and creates an `AGENTS.md` template and empty lessons files (it never overwrites
ones that already exist). It also adds `.gitignore` entries and runs `activate-stack.mjs`. After that, open the
project in Antigravity and run `/start`. To update a project later, `git pull` the kit and re-run the
installer with `--force`. Your project's `AGENTS.md` and lessons are never overwritten.

The installer also copies the 5 third-party skills listed in `skills-lock.json` (kit files link to them), plus
`skills-lock.json` itself when the target has none. Route B starts with an empty lessons ledger. Route A keeps the
kit's seed lessons, which include two about this Windows machine (`python` rather than `python3`, no `rg`); retire
them with `node .agents/scripts/lessons.mjs retire <id> --reason "..."` if they don't apply.

## Check it

```powershell
node .agents/scripts/doctor.mjs                   # kit health: rules, globs, budgets, roster, hooks
node --test .agents/hooks/test/*.test.mjs         # hook tests
node --test .agents/scripts/test/*.test.mjs       # script tests
node .agents/scripts/verify.mjs                   # every check the project has (after onboarding)
node .agents/scripts/commit-msg.mjs status        # git identity + commit-msg hook (install: ... install)
```

## Layout

```
AGENTS.md          Project facts template (always-on). Filled by /start.
skills-lock.json   Sources of the third-party skills in .agents/skills/.
.agents/
  GEMINI.md        Kit index for agents (always-on)
  rules/           Always-on core, lang-*, fw-*, topic-* rules (flat directory)
  agents/          orchestrator + 13 single-task workers
  skills/          /orchestrate runbook, worker and task-type playbooks
  hooks.json       Hook registration; hooks/ holds the guard and gates
  scripts/         verify, doctor, search, repo-map, lessons, activate-stack, kit-install, commit-msg
  guides/          Deep references: principles/, languages/, frameworks/
  docs/            Architecture, verified platform spec, ADRs
  memory/          Lessons ledger
```
