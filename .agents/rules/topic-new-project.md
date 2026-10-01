---
trigger: model_decision
description: "Apply when asked to start, scaffold or bootstrap a new project, app, service, package or standalone tool, or to rewrite/port/migrate an existing project to a new stack."
---
# New project - topic rule
Procedure: `/new-project` (orchestrator playbook). Who: `explorer` does the reuse check, `docs-researcher` verifies versions and the official scaffold command, the orchestrator asks the user, `planner` compares stacks and drafts the roadmap, one `implementer` task writes the ADR (docs-only) and a separate `implementer` task scaffolds, `test-engineer` / `e2e-tester` prove it runs. Principles guides: `.agents/guides/principles/simplicity.md` and `.agents/guides/principles/architecture.md`. Stack choice: `topic-architecture-decisions.md`.

## Protocol
1. Reuse check (graveyard check) BEFORE scaffolding, at most 5 searches:
   - Search the workspace for similar names, README text or modules: `node .agents/scripts/search.mjs '<keyword>' --files`.
   - If the user keeps projects elsewhere, the orchestrator asks ONCE where (a worker reports `INPUT GAP:`). Never sweep the home directory or a drive root.
   - If a match exists, say it once: "You already built part of this in `<path>` (<evidence: README, N commits>). Resurrect it instead?" Let the user choose, then drop the subject.
2. Rewrite guard: for "rewrite/port/migrate to X" of unfinished work, say once that repeated rewrites delay shipping and recommend freezing the current stack until it ships. If the user still wants it, make the migration its own scoped step with a verification gate.
3. Requirements in at most 6 lines: users, core job, v1 must-haves (<= 3), non-goals, constraints (hosting, budget, language), and "shipped" = a URL, a release or a published package.
4. Stack freeze: choose once. Default to what the user already uses; use managed services and official SDKs for auth and payments. Verify current versions and the official scaffold command in the docs (`/research-docs`). Record the choice as an ADR with Status Proposed (`topic-architecture-decisions.md`). No stack changes until v1 ships.
5. Scaffold with the official generator (`npm create <x>`, `cargo new`, `go mod init`, `uv init`, `dotnet new`, `composer create-project`, ...), never hand-written framework boilerplate from memory.
6. Quality gates on day 1: formatter, linter, typecheck, one passing test, `.gitignore`, README with run commands, and the kit (`node .agents/scripts/kit-install.mjs --target <dir>` if the project lives in another folder, then `/onboard-repo` for its `AGENTS.md`). `node .agents/scripts/verify.mjs` must pass before feature work.
7. Plan at most 7 steps that end at "shipped". Step 0: it installs and runs. Step 1: completable today, with visible progress. Every step ends in a verifiable artifact.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER scaffold before the reuse check and a confirmed stack - rework and duplicate projects. Instead: steps 1-4 first; they take minutes.
2. NEVER hand-roll auth, payments or crypto in a new project - the most common place projects stall and leak. Instead: a managed provider or official SDK, checked against its current docs.
3. NEVER create the project outside the workspace, or into a non-empty folder, without the user's yes. Instead: the orchestrator proposes the path and waits; the implementer brief names the approved path in OWNED FILES.
4. NEVER write dependency versions from memory into manifests. Instead: let the generator or package manager resolve them (`bun add <pkg>`, `cargo add <crate>`).
5. NEVER write "keep working on it" as a plan step. Instead: each step names its artifact and its check.

## Pitfalls Flash models get wrong
- Adding optional tooling (Docker, CI, monorepo, i18n) to v1 unasked.
- Picking a new stack because it is newer, not because a driver needs it.
- Declaring the scaffold "working" without running install and the entry point.
- Mixing two package managers (check for an existing lockfile first).

## Example - bad -> good
```markdown
BAD:  Created 38 files by hand (custom auth, webpack config, Docker, Kubernetes). Not run yet.

GOOD:
Reuse check: `../habit-old` has a habit-tracker README and 23 commits -> offered to resurrect; user chose a new project.
Stack (ADR-0002, Proposed): the user's usual stack + managed auth. Versions resolved by the generator.
0. Scaffold with the official generator; install; start the entry point      (check: GET / -> 200)
1. Habit list page with seed data - today                                   (check: e2e test passes)
2. Persist habits in the database                                            (check: integration test)
3. Managed-auth sign-in                                                      (check: e2e login test)
4. Deploy a preview                                                          (check: preview URL -> 200) = shipped
```

## Before finishing
- [ ] Reuse check done and reported; stack recorded as a Proposed ADR
- [ ] Install, entry point and `verify.mjs` observed passing (quote the output)
- [ ] Plan has <= 7 steps, each with a check, ending at shipped
