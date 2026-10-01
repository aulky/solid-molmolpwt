---
name: onboard-repo
description: Orchestrator playbook that onboards a repository onto the Frontier Kit through the pipeline - an explorer maps the repo, an implementer activates the framework packs and writes or refreshes the root AGENTS.md project-facts file from a template, a reviewer checks every fact, a test-engineer runs the checks, and the scribe seeds non-obvious lessons. Also covers installing the kit into a repo that has no `.agents/` yet. Use for "onboard this repo", "set up the agent kit here", "the stack changed, refresh AGENTS.md", "install the kit in <other repo>", or when AGENTS.md is missing, stale, or fails its own check.
metadata:
  icon: 🧭
---

# Onboard repo: map, activate, write project facts, check, learn

Used by: orchestrator (plans and verifies); workers follow the step for their phase - `explorer` (EXPLORE:
step 2), `implementer` (IMPLEMENT: steps 1, 3, 4), `reviewer` (REVIEW), `test-engineer` (TEST: step 5),
`scribe` (LEARN: step 6).

`AGENTS.md` is read on every turn. A stale or padded one costs tokens forever; a missing fact costs a wrong
guess later. Every line in it must come from a manifest, lockfile or command output read in this pipeline,
never from memory. It holds PROJECT FACTS ONLY: no advice, no kit documentation, no orchestrator or pipeline
instructions (those live in `.agents/GEMINI.md` and `.agents/rules/03-orchestration.md`).

## When to use
- First time this kit runs in a repo (root `AGENTS.md` missing, or `.agents/` just installed).
- The stack changed (new framework, upgraded major version, new package manager) and facts are stale.
- `AGENTS.md` fails `check-agents-md.mjs` or has drifted from what `repo-map.mjs` now reports.
- Copying this kit into another repo (Laravel/PHP, Rust, a SolidJS app, ...).

Do NOT use for:
- A single dependency-version or API question. Dispatch a `docs-researcher` (`/research-docs`).
- Adding a language/framework pack, rule, skill or agent to the kit itself. Use `/workspace-doctor`.
- Just re-running checks with nothing to update: run `node .agents/scripts/doctor.mjs` yourself.
- One new project fact found during another pipeline: the `scribe` adds it to `AGENTS.md` in that LEARN phase.

## Invariants
1. You (the orchestrator) never write `AGENTS.md`, rule triggers or lessons yourself, because every write goes
   through REVIEW and TEST. Instead dispatch the implementer (files) or the scribe (lessons).
2. Every fact in the implementer brief is pasted from `repo-map.mjs` output or a manifest line, because the
   implementer has no other source. NEVER let a brief say "fill in the usual commands".
3. `AGENTS.md` stays <= 3,500 bytes with no YAML frontmatter. Cut a bullet before you make a sentence vague.
4. NEVER create another `AGENTS.md` or `GEMINI.md` in a subfolder, because it becomes an always-on directory
   rule. Per-package detail goes into the one root file or stays out.
5. Doctor errors that predate this pipeline are reported under "Not done / risks", not fixed silently. Fixing
   them is a `/workspace-doctor` pipeline.

## Phase map
| Step | Phase | Worker | Output the gate needs |
|---|---|---|---|
| 0 Starting point | - | orchestrator | fresh install, or `.agents/` already present |
| 1 Install the kit (new repo only) | IMPLEMENT (own mini pipeline) | `implementer` | kit-install counts; target doctor runs |
| 2 Map | EXPLORE | `explorer` (lane S: orchestrator) | stacks, pm, scripts, entry points, tests, gotchas |
| 3 Activate packs | IMPLEMENT | `implementer` (OWNED: the `fw-*.md` files the dry-run lists) | `activate-stack.mjs` output; `stack.json` frameworks |
| 4 AGENTS.md | IMPLEMENT (same wave, disjoint file) | `implementer` (OWNED: `AGENTS.md`) | `check-agents-md.mjs` PASS |
| - Review | REVIEW | `reviewer` | every fact matched to a manifest line or command output |
| 5 Checks | TEST | `test-engineer` | check-agents-md, doctor, every listed command's result |
| 6 Lessons | LEARN | `scribe` | L-ids added, or "nothing surprising" |
| 7 Final doctor + verify | REPORT | orchestrator | DOCTOR and VERIFY lines |

## Checklist (orchestrator)
Copy this and tick items as you go:
```
- [ ] Starting point decided: install the kit fresh, or onboard a repo that already has .agents/
- [ ] Lane stated (S: only AGENTS.md changes; M: packs + AGENTS.md or a kit install)
- [ ] EXPLORE: repo-map output graded; package manager and every top-level script named
- [ ] activate-stack --dry-run read by you; the implementer brief lists exactly those fw-*.md files
- [ ] AGENTS.md brief pastes the template and the repo-map facts; DONE WHEN = check-agents-md PASS
- [ ] REVIEW: every AGENTS.md line traced to a source; project facts only
- [ ] TEST: check-agents-md, doctor --quiet and each listed command run (dev server excluded)
- [ ] LEARN: scribe seeded only surprising facts that are NOT already in AGENTS.md
- [ ] You ran doctor.mjs --quiet and verify.mjs; Completion Report has the Onboarding block
```

## Procedure
0. **Pick the starting point.** Repo already has this kit's `.agents/` -> step 2. No `.agents/` yet -> step 1
   first, then steps 2-7 against the target (`--root <repoDir>` on every script, or a new session bound to the
   target, because customizations load only for a folder bound as an Antigravity workspace).

1. **Install the kit (implementer, new repo only).** Brief: run
   `node .agents/scripts/kit-install.mjs --target <repoDir> --dry-run`, report the CREATE/OVERWRITE/CONFLICT
   counts, then run it without `--dry-run`. OWNED FILES: `<repoDir>/.agents/**`, `<repoDir>/AGENTS.md`
   (placeholder only), `<repoDir>/.gitignore`. DO NOT: `--force` unless the user asked. It copies rules (except
   `90-lessons.md` content), guides, kit and third-party skills, agents, hooks + `hooks.json`, scripts and docs; creates an
   empty `memory/lessons.md` and a `rules/90-lessons.md` skeleton; appends `.gitignore` entries; runs
   `activate-stack.mjs` in the target. The 5 third-party skills are copied unmodified (kit files link to them),
   plus `skills-lock.json` when the target has none.
   Gate: `node <repoDir>/.agents/scripts/doctor.mjs --quiet --root <repoDir>` runs (errors about the
   placeholder `AGENTS.md` are expected until step 4). Then REVIEW (reviewer reads the counts and the
   `.gitignore` diff) before continuing.

2. **Map (explorer; lane S: you).** Brief: run `node .agents/scripts/repo-map.mjs` and
   `node .agents/scripts/repo-map.mjs --json` (`--root <repoDir>` if needed) and report stacks, package manager
   (from the lockfile actually present), detected frameworks, scripts per root (`.roots[].scripts`), entry
   points (`.entryPoints`), route dirs (`.routeDirs`), test locations (`.tests.locations`), notable config
   (`.config`), plus gotchas seen: a stale second lockfile, a missing CLI tool, "not a git repo", OS quirks.
   Also: `node .agents/scripts/lessons.mjs search <stack word>` for known facts.
   Gate: you can name the package manager and every top-level script. You run `activate-stack.mjs --dry-run`
   yourself (read-only) and note the `<file>: <from> -> <to>` lines.

3. **Activate packs (implementer).** Brief: run `node .agents/scripts/activate-stack.mjs` (no `--dry-run`).
   OWNED FILES: exactly the `fw-*.md` files your dry-run listed. It rewrites only each file's `trigger:` line
   (glob if the manifest shows the framework, `model_decision` otherwise); a trigger ending in `# pinned` stays.
   DONE WHEN: its output matches your dry-run; `.agents/.state/stack.json` lists the frameworks from step 2.

4. **Write or refresh AGENTS.md (implementer, same wave as step 3).** Brief pastes
   [references/agents-md-template.md](references/agents-md-template.md) and the step-2 facts. OWNED FILES:
   `AGENTS.md`. Every `<FILL: ...>` replaced from the pasted facts: Stack (exact versions from manifest +
   lockfile), Layout, Commands, Conventions (gotchas folded in, or a trailing `## Gotchas` section when there are
   more than two or three). Unknown fact -> drop the bullet; never guess.
   DONE WHEN: `node .agents/skills/onboard-repo/scripts/check-agents-md.mjs [file] [--root <repoDir>]` ->
   `AGENTS-MD: PASS` with 0 errors; `wc -c AGENTS.md` <= 3,500; every WARN fixed or listed.

   **REVIEW (reviewer).** Lens: each line of `AGENTS.md` traced to a manifest line, lockfile, or the pasted
   command output (`path:line` or quote); no kit documentation, advice or pipeline instructions; nothing a
   `fw-*.md` pack or guide already says generically.

5. **Checks (test-engineer).** Run `check-agents-md.mjs`, `node .agents/scripts/doctor.mjs --quiet`, and each
   command in the `## Commands` section once (skip long-running dev servers; say so), then report each exit code
   and key line. A listed command that fails -> FIX task for `AGENTS.md` (fixer) or a lesson candidate if the
   repo itself is broken.

6. **Lessons (scribe).** Brief: the gotchas from step 2 and every worker's `Lesson candidates`. Only facts a
   session would otherwise get wrong AND that are not already stated in `AGENTS.md` (a lesson duplicating a
   project fact is noise), for example a stub binary or a flag that silently no-ops. Scope `onboarding`.
   Nothing qualifies -> the scribe reports "nothing new"; never manufacture a lesson.

7. **Final checks (you).** `node .agents/scripts/doctor.mjs --quiet [--root <repoDir>]` and
   `node .agents/scripts/verify.mjs`. Errors caused by this pipeline's edits -> FIX round; older errors ->
   "Not done / risks".

## Output (Onboarding block inside the Completion Report)
```
### Onboarding: <repo path>
Detected: <stacks/frameworks> - package manager <pm> (source: repo-map.mjs, T<id> explorer)
Changed:
- `AGENTS.md` - written/refreshed (<bytes> B) (T<id> implementer)
- `.agents/rules/fw-<id>.md` (x N) - trigger flipped to glob (activate-stack.mjs, T<id>)
- <kit-install into <repoDir>: <counts> (T<id>) - if applicable>
Checks (T<id> test-engineer): check-agents-md -> PASS (0 errors, <n> warnings); listed commands -> <results>
Doctor (orchestrator): `node .agents/scripts/doctor.mjs --quiet` -> <summary line>
Lessons (T<id> scribe): <L-ids added | nothing new>
```

## References
- [references/agents-md-template.md](references/agents-md-template.md): the template, placeholder convention,
  and which `repo-map.mjs` field feeds which section. Paste it into the step-4 brief.
- [scripts/check-agents-md.mjs](scripts/check-agents-md.mjs): `--help` for all flags; validates size, required
  sections, unfilled placeholders, and cross-checks commands and versions against the manifest.
- `.agents/scripts/repo-map.mjs`, `activate-stack.mjs`, `doctor.mjs`, `kit-install.mjs`, `lessons.mjs`: all
  take `--help`.
- `.agents/rules/03-orchestration.md` (LEARN phase) and `.agents/agents/scribe.md`: how lessons are recorded
  and promoted to `90-lessons.md`.
- Kit maintenance beyond project facts: `/workspace-doctor`.
