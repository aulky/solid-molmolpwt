---
name: start
description: Orchestrator playbook for the first session in a workspace (like /init). A detection script decides the mode - new (only the kit is here - ask what to build and scaffold in place via /new-project), existing (code but no filled AGENTS.md - read the codebase, activate framework packs and write AGENTS.md via /onboard-repo) or onboarded (refresh drift only) - then it sets up git hygiene (commit-msg hook for Conventional Commits and no co-author trailers, the user's own identity), confirms machine lessons, runs doctor and verify, and reports a codebase tour. Use when the user types /start or /init, says "set up this project", "first time here", "initialize the workspace", or after cloning the kit or running kit-install.
metadata:
  icon: 🚀
---

# Start: detect, route, set up, verify, learn

Used by: orchestrator (detects, asks, routes, verifies). Workers follow the step for their phase - `explorer`
(EXPLORE: step 3), `implementer` (IMPLEMENT: step 4), `reviewer` (REVIEW), `test-engineer` (TEST: step 5),
`scribe` (LEARN: step 6), plus whatever `/new-project` or `/onboard-repo` dispatches.

`/start` is the one entry point for a workspace's first session and is safe to run again: every step checks
the current state first and only fixes what is missing or has drifted. It routes to the existing playbooks
instead of repeating them.

## When to use
- The user types `/start` or `/init`, or says "set up this project", "initialize", "first time here".
- Just after cloning the kit as a new project, or after `kit-install.mjs` put `.agents/` into a repo.
- `AGENTS.md` is missing or still the template (`<fill in ...>` placeholders).
- Re-running later: a quick health check that refreshes stale facts.

Do NOT use for:
- Only a stack change in an onboarded repo: `/onboard-repo` directly.
- A feature or fix: `/orchestrate`.
- Maintaining the kit itself (rules, skills, agents): `/workspace-doctor`.

## Invariants
1. Detection is read-only and comes first: `node .agents/skills/start/scripts/detect.mjs`. Never guess the
   mode, because a wrong mode scaffolds over code or onboards an empty folder.
2. You (the orchestrator) edit nothing and run no write commands, because every write goes through REVIEW and TEST.
   Each file change is a worker task, and each command a worker runs is listed in its `ALLOWED COMMANDS:`.
3. Ask at most ONE bundled `ask_question` (step 2), and only for what detection cannot answer. Everything
   else has a default.
4. Git: never `git init`, commit or push unless the user said yes. Never set `user.name`/`user.email` or
   pass `--author`. If no identity is configured, the user sets it themselves. No co-author or AI-attribution
   lines anywhere (rule `topic-git-workflow.md`).
5. Never scaffold into a folder with project files, never delete or move `.agents/`, `AGENTS.md` or
   `skills-lock.json`, and never create a nested `AGENTS.md`/`GEMINI.md`.
6. Never install dependencies to "prepare" (Playwright, linters) unless the user asked or the routed playbook
   does it with an `ALLOWED COMMANDS:` line. Missing tooling goes into "Next steps" with the exact command.

## Phase map
| Step | Phase | Who | Output the gate needs |
|---|---|---|---|
| 1 Detect | EXPLORE | orchestrator (read-only) | START-DETECT block: mode, git, identity, hook, e2e, lessons |
| 2 Ask once | PREPARE | orchestrator + user | answers quoted (or defaults stated) |
| 3 Route + read the codebase | EXPLORE -> ... | `/new-project` or `/onboard-repo` pipeline; `explorer` x <= 3 for the tour | playbook gates met; tour facts with `path:line` |
| 4 Git setup | IMPLEMENT (same wave as the playbook's IMPLEMENT, disjoint files) | `implementer` | `commit-msg.mjs status` -> hook installed |
| - Review | REVIEW | `reviewer` | AGENTS.md facts traced; hook file is the kit's |
| 5 Checks | TEST | `test-engineer` | check-agents-md, doctor, verify, commit policy smoke check |
| 6 Lessons | LEARN | `scribe` | machine lessons confirmed or retired; new lessons or "nothing new" |
| 7 Report | REPORT | orchestrator | Start block |

## Checklist (orchestrator)
Copy this and tick items as you go:
```
- [ ] detect.mjs run; mode stated (new | existing | onboarded) with its evidence line; lane stated
- [ ] doctor.mjs --quiet run; errors that predate /start listed under risks
- [ ] One bundled question asked (or none needed); answers quoted
- [ ] Routed: new -> /new-project in place | existing -> /onboard-repo from step 2 + tour | onboarded -> drift check
- [ ] Git: hook installed (if repo + user agreed); identity shown; no init/commit/push without a yes
- [ ] REVIEW done; TEST: check-agents-md PASS, doctor PASS, verify PASS, commit policy check PASS
- [ ] LEARN: machine lessons L-xxxx confirmed or retired; scribe report received
- [ ] Start block in the Completion Report, with next steps
```

## Procedure

### EXPLORE
1. **Detect (you, read-only).** Run `node .agents/skills/start/scripts/detect.mjs` and
   `node .agents/scripts/doctor.mjs --quiet`. Quote the `mode:` line and the git lines. Modes:
   - `new`: only kit files at the root (`.agents/`, `AGENTS.md`, the kit `README.md`, `.gitignore`,
     `skills-lock.json`). The kit was cloned as the project root.
   - `existing`: project files exist, and `AGENTS.md` is missing or still the template.
   - `onboarded`: `AGENTS.md` is filled in. `/start` becomes a refresh.
   Lane: M for `new` and `existing`; S for `onboarded` with no drift.

### PREPARE
2. **Ask once (bundled `ask_question`, only the rows that apply):**
   - mode `new`: what to build: deliverable, users, preferred stack (default: the stack the user already ships
     with; see their other repos only if they name them).
   - not a git repository: "Initialize git here?" (default: yes for `new`, ask for `existing`).
   - git repository with the hook `not installed`: "Install the commit-msg hook? It enforces Conventional
     Commits, blocks co-author and AI-attribution trailers, and blocks commits made as another identity."
     (default: yes). `core.hooksPath` set (husky, lefthook): offer to add the one line that `install` prints,
     as a worker task on that tool's hook file.
   - identity `NOT CONFIGURED`: no question. Tell the user to run `git config --global user.name "<name>"` and
     `git config --global user.email "<GitHub email>"` themselves. Commits wait for it; the rest continues.

### Route (the playbook runs its own EXPLORE -> ... -> LEARN)
3. **By mode:**
   - `new` -> `/new-project` with the target = this workspace root (its invariant 1 covers a cloned kit
     root: scaffold in place next to `.agents/`; its step 9 skips kit-install and runs `/onboard-repo`). If the
     user said yes to git, `git init` goes through `/commit-and-pr` after the scaffold (scaffolders may init
     git themselves; check `git rev-parse --is-inside-work-tree` first).
   - `existing` -> `/onboard-repo` starting at its step 2 (`.agents/` is already here). In the same EXPLORE wave,
     dispatch up to 3 `explorer` tasks for the **codebase tour**, one area each, read-only:
     (a) architecture: entry points, modules, and how a request or command flows through them;
     (b) quality gates: test layout and runner, lint/format/typecheck config, CI files;
     (c) build and run: config, env vars (names only, never values), deploy files.
     Each reports `path:line` facts, at most 12 bullets. Facts go into the `AGENTS.md` brief only when they
     are stable project facts (layout, commands, conventions, gotchas); the rest goes into the Start block.
   - `onboarded` -> drift check: one `explorer` runs `node .agents/scripts/repo-map.mjs` and compares it with
     `AGENTS.md` (package manager, scripts, versions, layout), and you run `activate-stack.mjs --dry-run`.
     Drift -> `/onboard-repo` steps 3-6 for only the drifted parts. No drift -> skip to step 5.

### IMPLEMENT (same wave as the routed playbook's IMPLEMENT; disjoint OWNED FILES)
4. **Git setup (implementer), only for the parts the user agreed to:**
   - Hook: `ALLOWED COMMANDS: node .agents/scripts/commit-msg.mjs install`. OWNED FILES: `.git/hooks/commit-msg`.
     DONE WHEN: `node .agents/scripts/commit-msg.mjs status` -> `commit-msg hook: installed` (or the brief's
     husky/lefthook file contains the printed line).
   - `.gitignore` has `.agents/.state/` (kit-install adds it; a cloned kit already has it). Missing -> the same
     implementer adds only that entry (OWNED FILES: `.gitignore`).
   - UI framework detected with no Playwright: no install. Put the exact command in "Next steps" (for example
     `<pm> add -D @playwright/test` then `npx playwright install chromium`). `/e2e-test` sets it up when the
     first UI change needs a browser test.

### REVIEW
- `reviewer`: every `AGENTS.md` line traced to a manifest, lockfile or command output; project facts only; the
  hook file starts with `#!/bin/sh` and contains `frontier-kit commit-msg hook`; no identity or config writes.

### TEST
5. **Checks (test-engineer), read-only commands:**
   `node .agents/skills/onboard-repo/scripts/check-agents-md.mjs` -> `AGENTS-MD: PASS` (skip when mode is `new` and
   no project exists yet: say so); `node .agents/scripts/doctor.mjs --quiet`; `node .agents/scripts/verify.mjs`;
   `node .agents/scripts/commit-msg.mjs check --message "chore: verify commit policy"` -> PASS and
   `node .agents/scripts/commit-msg.mjs check --message "update stuff"` -> FAIL (the policy works);
   `node .agents/scripts/commit-msg.mjs status`. Quote each exit code and key line.

### LEARN
6. **Lessons (scribe).** Brief: detection's `machine lessons to confirm` list and each worker's
   `Lesson candidates`. For each machine lesson, the scribe runs its check (`python3 --version` and
   `python --version` for the Python lesson, `Get-Command rg -ErrorAction SilentlyContinue` for the search one) and
   votes `helpful` when the lesson still holds, or retires it with the evidence when it no longer does
   (`node .agents/scripts/lessons.mjs retire <id> --reason "<evidence>"`). New surprising setup facts are added with scope
   `onboarding`. Nothing qualifies -> "nothing new".

### REPORT
7. **Final checks (you):** `node .agents/scripts/doctor.mjs --quiet` and `node .agents/scripts/verify.mjs`, then the
   Completion Report with the Start block. Offer the first real task (roadmap step 1 for `new`).

## Output (Start block inside the Completion Report)
```
### Start: <workspace path>
Mode: <new | existing | onboarded> (detect.mjs: "<mode line>", "<project entries line>")
Routed to: </new-project | /onboard-repo | drift check> -> <its block, or "no drift">
Codebase tour (T<ids> explorer): architecture <2-4 bullets path:line> · quality gates <...> · build/run <...>
Git: <repo? commits> · identity <name <email> | NOT CONFIGURED - user must set it> · hook <installed | skipped: why>
Checks (T<id> test-engineer): AGENTS-MD <PASS|skipped> · DOCTOR <line> · VERIFY <line> · commit policy PASS/FAIL as expected
Lessons (T<id> scribe): <L-ids confirmed/retired/added | nothing new>
Next steps: 1) <first real task> 2) <missing tooling with exact command, if any>
```

## References
- [scripts/detect.mjs](scripts/detect.mjs): `--help`, `--json`. Read-only; decides the mode.
- `/new-project`, `/onboard-repo`, `/commit-and-pr`, `/e2e-test`: the playbooks this one routes to.
- `.agents/scripts/commit-msg.mjs`: `install`, `status`, `check` (the commit policy).
- `.agents/rules/topic-git-workflow.md`: Conventional Commits, identity and attribution invariants.
