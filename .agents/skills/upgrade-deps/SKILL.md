---
name: upgrade-deps
description: Task-type playbook for safe dependency upgrades run through the orchestrator pipeline, in any ecosystem (npm/pnpm/yarn/bun/deno, cargo, go, uv/poetry/pip, composer, bundler, NuGet, Maven/Gradle, mix, pub, SwiftPM). It takes a baseline, reads changelogs and migration guides, bumps one major at a time through the package manager, verifies each, and keeps a rollback. Use when asked to update, upgrade or bump packages, fix outdated or vulnerable dependencies, or move to a new framework or runtime major version.
metadata:
  icon: 📦
---

# Upgrade deps: baseline, read the changelog, one major per task, verify, keep a rollback

Used by: orchestrator (plans the pipeline with this playbook); workers follow the step for their phase -
`docs-researcher` (EXPLORE: step 3), `planner` (PREPARE: step 4), `implementer` (IMPLEMENT: steps 5-6, and a
rollback task), `reviewer` (REVIEW), `debugger` / `fixer` (FIX: step 8), `test-engineer` + `e2e-tester` (TEST:
step 7), `scribe` (LEARN).

Default order: patch and minor updates batched per ecosystem as ONE task, then each major version as its own
task, in dependency order (runtime or framework first, then the plugins that depend on it).

## When to use
- "Update / upgrade / bump dependencies", "we're behind on X", "move to <framework> vN", "Node/Python/Go
  runtime upgrade".
- An audit reported vulnerable versions and the fix is an upgrade.
- A dependency's deprecation warning or end-of-life notice.

Do NOT use for:
- Adding a NEW dependency. That is a feature task (`/orchestrate`, feature section of
  `.agents/skills/orchestrate/references/task-types.md`), plus an ADR if it is architecturally significant.
- A full security review. Use `/security-audit` (this playbook only applies the upgrades it recommends).
- Manifest hygiene (unpinned deps, stdlib shadowing, duplicates) with no upgrade. Plan it as a normal
  `/orchestrate` task with `.agents/rules/topic-dependencies.md` pasted into the briefs.

## Invariants (paste into every IMPLEMENT and FIX brief under DO NOT / CONTEXT)
1. NEVER edit a lockfile by hand, because it holds resolved versions and integrity hashes. Instead change
   versions through the package manager ([references/pm-commands.md](references/pm-commands.md)). A hook warns.
2. Use ONLY the package manager that matches the lockfile. Mixing managers silently re-resolves everything.
   Use the package manager named in AGENTS.md / the canonical lockfile; if two lockfiles exist, follow AGENTS.md or ask.
3. One major version per IMPLEMENT task, verified before the next. NEVER batch several majors, because a failure
   then has several possible causes.
4. NEVER invent a version or a migration step. The `docs-researcher` reads the changelog or migration guide for
   the exact range crossed and cites it; the implementer brief pastes that list.
5. The baseline is recorded before any change. Baseline FAIL -> stop and ask; never mix pre-existing failures
   into the upgrade.
6. Keep a rollback: a clean git state (commits only when the user asks, `/commit-and-pr`), or copies of the
   manifest and lockfile made by the implementer before its package-manager command, in the gitignored folder
   `.scratch/upgrade-backup/<T-id>/` (never `.agents/.state/`: hook state; a "never edit `.scratch/`" note in
   AGENTS.md covers existing notes, not this new subfolder the brief owns).
7. Workers install nothing unless the brief allows it. Every upgrade brief therefore lists the manifest, the
   lockfile AND `.scratch/upgrade-backup/<T-id>/**` in OWNED FILES and names the exact commands in the brief
   field `ALLOWED COMMANDS: <cmd>; <cmd>` (after OWNED FILES). The implementer and fixer run an install only
   when it is listed there exactly; anything else -> `INPUT GAP: needs <cmd>`. Then re-dispatch with the exact
   command added (new T-id); never run it yourself (the orchestrator guard flags shell writes).
8. Tasks that own the same manifest and lockfile run one after another, never in the same wave.

## Phase map
| Step | Phase | Who | Output the gate needs |
|---|---|---|---|
| 1 Identify, 2 Baseline, 3a Inventory | EXPLORE | orchestrator (read-only commands) | ecosystems + pm; `VERIFY: PASS`; outdated list classified |
| 3b Research per major | EXPLORE | `docs-researcher`, one per major | cited breaking changes, codemod, peer/engine constraints |
| 3c Code hit by breaking changes | EXPLORE | `explorer` | `path:line` for each removed or renamed API |
| 4 Plan | PREPARE | `planner` (lane S: orchestrator) | T1 patch+minor batch; T2..Tn one per major, dependency order |
| 5 Patch + minor batch | IMPLEMENT | `implementer` | pm command output, `verify.mjs --quick` PASS |
| 6 One major | IMPLEMENT | `implementer` per major | pm command, codemod diff, fixes, verify PASS |
| - Review | REVIEW | `reviewer` per task | breaking-change list vs the diff; manifest + lockfile changed together |
| 7 Final checks | TEST | `test-engineer` (+ `e2e-tester` for UI apps) | full verify + e2e vs the baseline; duplicate majors; audit if allowed |
| 8 Failure / stuck | FIX (max 2 rounds), then ESCALATE | `debugger` (unclear failure), `fixer` (code fixes); rollback = new IMPLEMENT task | verify back to the baseline |
| - Learn | LEARN | `scribe` | pinned-on-purpose facts, codemod surprises |

## Checklist (orchestrator)
Copy this and tick items as you go:
```
- [ ] Ecosystem(s) + package manager identified from lockfiles; `<pm> --version` works
- [ ] Baseline `node .agents/scripts/verify.mjs` recorded by you (stopped and asked if it failed)
- [ ] git repo: `git status --porcelain` clean, or the user chose how to proceed
- [ ] Outdated list collected; each item patch/minor/major/runtime; pinned-on-purpose items skipped with reason
- [ ] One docs-researcher per major: breaking changes cited with URL, codemod named
- [ ] Board: T1 patch+minor; one task per major in dependency order; same manifest -> never parallel
- [ ] Network audit asked once; `NETWORK: allowed` on the board, or "audit: not run (no network permission)"
- [ ] Every upgrade brief: manifest + lockfile + backup folder in OWNED FILES, ALLOWED COMMANDS, backup step
- [ ] REVIEW per task; TEST full verify (+ e2e) compared with the baseline
- [ ] Stuck after 2 FIX rounds -> ESCALATED; any rollback ran as its own IMPLEMENT task (reviewed, tested)
- [ ] Completion Report has the Upgrade block (versions, breaking changes handled, rollback)
```

## Procedure

### EXPLORE
1. **Identify (orchestrator).** Find the lockfiles (`bun.lock`, `package-lock.json`, `pnpm-lock.yaml`,
   `yarn.lock`, `deno.lock`, `Cargo.lock`, `go.sum`, `uv.lock`, `poetry.lock`, `composer.lock`,
   `Gemfile.lock`, `packages.lock.json`, `mix.lock`, `pubspec.lock`, `Package.resolved`) and map each to its
   package manager. Two lockfiles for one ecosystem: the one `AGENTS.md` or the lessons name wins; unclear ->
   ask. Check the tool exists (`<pm> --version`).
2. **Baseline (orchestrator).** Run `node .agents/scripts/verify.mjs` (`--e2e` for UI apps with an e2e suite).
   Check: `VERIFY: PASS`. FAIL -> stop, report the pre-existing failures, ask whether to fix them first (that
   is a separate pipeline).
3. **Inventory and research.**
   - a. You run the outdated command per ecosystem (read-only, [references/pm-commands.md](references/pm-commands.md)).
     The audit command sends package names to an external service: ask the user once; yes -> record
     `NETWORK: allowed` on the board and run it; no -> write "audit: not run (no network permission)". Classify each package patch, minor, major, or runtime/framework. Skip packages
     pinned on purpose (comments, `overrides`/`resolutions`, ADRs, lessons) and say why.
   - b. One `docs-researcher` per major (waves of <= 3; brief `.agents/skills/orchestrate/references/briefs.md`
     §docs-researcher): release notes, `CHANGELOG.md` or migration guide for EVERY major in the range (3 to 5
     crosses 4 and 5); the official codemod if any; peers and engines (`npm view <pkg>@<ver> peerDependencies
     engines`, `bun why <pkg>`, `cargo tree -i <crate>`, `go mod why -m <mod>`, `composer why <vendor/pkg>`).
   - c. One `explorer` greps each removed or renamed API: `node .agents/scripts/search.mjs "<api>"`.
   Gate: every major has a cited breaking-change list and the `path:line` hits in this codebase (or "none").

### PREPARE
4. **Plan (planner; lane S: you).** T1 = the patch + minor batch for one ecosystem. T2..Tn = one task per
   major, in dependency order. Each task: OWNED FILES = manifest + lockfile + `.scratch/upgrade-backup/<T-id>/**`
   + the files hit by that major's breaking changes; `ALLOWED COMMANDS:` the exact commands; DONE WHEN ends with
   `node .agents/scripts/verify.mjs --quick` PASS. A framework major -> lane L (advisor critique).

### IMPLEMENT (one task at a time for the same manifest)
5. **Patch + minor batch (implementer).** Brief steps: copy manifest + lockfile to
   `.scratch/upgrade-backup/<T-id>/` (no git: PowerShell `New-Item -ItemType Directory -Force <dir>`,
   then `Copy-Item package.json,bun.lock <dir>/`; POSIX `mkdir -p <dir>` then `cp package.json bun.lock <dir>/`);
   run the in-range update (`bun update`, `cargo update`, `uv lock --upgrade`, `composer update`, ...); run
   the checks. FAIL -> the implementer reports it; the orchestrator bisects with smaller tasks (half the batch).
6. **One major (implementer per major).** Brief pastes the docs-researcher's cited breaking changes and the
   explorer's `path:line` hits. Steps: backup (as in step 5); apply through the pm (keep exact-pin style if the
   project pins); run the official codemod if the guide ships one and review its diff; fix typecheck and build
   errors first, then tests; run `node .agents/scripts/verify.mjs` (+ a production build for frameworks).

### REVIEW
- `reviewer` per upgrade task. Lens: every cited breaking change handled or shown not to apply; manifest and
  lockfile changed together and only by the pm; no unrelated code changes.

### TEST
7. **Final checks (test-engineer; + e2e-tester for UI apps).** Full `node .agents/scripts/verify.mjs`
   (`--e2e`), compared with the baseline step list; duplicate majors (`bun why <pkg>`, `npm ls <pkg>`,
   `cargo tree -d`); the audit command again only if the board says `NETWORK: allowed` (paste that line into
   the TEST brief), findings before -> after; otherwise "audit: not run (no network permission)".

### FIX
8. **Failure or stuck.** Unclear failure -> `debugger` (repro = the failing verify step). Code fixes -> `fixer`
   (`FIX ROUND 1`, then `2`). Still failing after round 2 -> ESCALATE (advisor, then the user); never a third
   FIX round. Rollback chosen -> a NEW IMPLEMENT task for an `implementer` that restores ONLY that package:
   OWNED FILES = manifest + lockfile; `ALLOWED COMMANDS:` the frozen install
   ([references/pm-commands.md](references/pm-commands.md), column "install exactly"); steps: git
   `git restore <manifest> <lockfile>` (uncommitted changes), no git: copy back from
   `.scratch/upgrade-backup/<T-id>/`, then the frozen install. No `git revert` (it commits) unless the user asked
   for commits. REVIEW and TEST it like any task. Gate: verify matches the baseline again. Report the blocker
   with evidence and continue with the next task.

### LEARN and REPORT
- `scribe` brief: packages pinned on purpose and why, codemod or peer-dependency surprises, any pm command
  that behaved differently from `references/pm-commands.md`.
- You run `node .agents/scripts/verify.mjs`; commits per upgrade only if the user asks (`/commit-and-pr`, type
  `build(deps)`).

## Output (Upgrade block inside the Completion Report)
```
### Upgrade
- Ecosystem / pm: <node / bun> (lockfile `bun.lock`)
- Baseline (orchestrator): `node .agents/scripts/verify.mjs` -> PASS (before any change)
- Applied:
  | task | package | from | to | type | breaking changes handled (source URL), codemod | verify |
  |---|---|---|---|---|---|---|
  | T3 | <pkg> | 2.4.1 | 3.0.0 | major | renamed config key per <URL> | PASS |
- Skipped / blocked: <package: reason + evidence>
- Audit after: `<audit cmd>` -> <n> findings (was <m>)
- Rollback: <commit sha per upgrade | backups at .scratch/upgrade-backup/<T-id>/>
```

## References
- [references/pm-commands.md](references/pm-commands.md): outdated, upgrade-one, in-range update, frozen install,
  why and audit commands per ecosystem. Paste the exact rows into briefs.
- `.agents/skills/orchestrate/references/task-types.md` (dependency-upgrade section).
- `.agents/rules/topic-dependencies.md` and `.agents/guides/principles/dependency-management.md`.
