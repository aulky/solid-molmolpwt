# Git workflow — engineering guide for AI agents
> Scope: atomic commits, commit messages (Conventional Commits), trunk-based branching, PR size, rebase vs merge, shared-history safety, history archaeology (bisect, blame, `log -L`, pickaxe), `.gitignore`/`.gitattributes` (Windows line endings), hooks, signing, monorepos. Quick card: `.agents/rules/topic-git-workflow.md`; procedure: `/commit-and-pr` (`.agents/skills/commit-and-pr/SKILL.md`); history questions: `git-historian` subagent or `/commit-archaeologist`.
> Last verified: 2026-09 — git-scm.com docs (git-bisect, git-push, gitattributes, githooks; latest git 2.56.0 dated 2026-09-28; local git 2.52.0), conventionalcommits.org (1.0.0 is current), Google eng-practices "Small CLs", trunkbaseddevelopment.com, GitHub docs (`.git-blame-ignore-revs`). Git 3.0 (SHA-256 and `main` defaults for new repos) is announced but unreleased as of 2026-09: do not assume it.

## 0. How to use this guide
Each section: definition -> why it matters -> **how to check** (commands to run on your own diff) -> examples -> misapplication traps. Two gates come before everything:
1. `git rev-parse --is-inside-work-tree` fails -> not a repo. Run no git write commands; offer `git init` only if the user asks.
2. Write actions (commit, push, rebase, tag, reset) happen only when the user asked or the active skill says so. Read-only commands (`status`, `diff`, `log`, `blame`, `show`) are always fine.

Commands below work in PowerShell and POSIX shells. Run one command per call (PowerShell 5.1 has no `&&`).

## 1. Atomic commits
**Definition:** one commit = one logical change that builds and passes tests on its own. A refactor, a behavior fix and a formatting sweep are three commits, not one.

**Why it matters:** `git revert <sha>` of an atomic commit removes exactly one change. `git bisect` lands on a commit that explains itself. A reviewer reads a rename commit in 30 seconds when it contains nothing else; mixed in with a fix, every renamed line must be checked for hidden behavior changes.

**How to check (on your staged diff):**
- `git diff --cached --stat` — does every file belong to the one change you can name in a sentence? Unrelated files (lockfile churn, editor configs, stray formatting) -> unstage: `git restore --staged <path>`.
- Can you write the subject line without "and"? "Add retry and rename config keys" = two commits.
- Did verify pass at this commit, not just at the branch tip? Bisect needs every commit green.
- Formatting mixed into logic: `git diff --cached -w --stat` shrinks a lot -> split whitespace-only changes out.
- Split one file's hunks with `git add -p <path>` (interactive; not usable by a non-interactive agent — instead stage the refactor edit first, commit, then make the fix edit).

**Example (TypeScript) — bad: one commit hides a behavior change inside a rename:**
```ts
// commit "refactor: rename calc to computeTotal"
export function computeTotal(items: Item[]): number {
  return items.reduce((s, i) => s + i.price * i.qty, 0) * 1.2; // * 1.2 is NEW: tax added silently
}
```
Good: commit 1 `refactor(cart): rename calc to computeTotal` (pure rename, tests unchanged and green); commit 2 `feat(cart): include 20% VAT in totals` (the multiplier plus a test asserting it).

**Misapplication traps:** splitting to the point where commits do not build ("add function" then "add its import") — atomic means *complete*, not *tiny*. Committing a test before its implementation on a shared branch breaks bisect; squash them or mark the test pending.

## 2. Commit messages and Conventional Commits
**Definition:** the subject says *what* in the imperative, the body says *why*. Conventional Commits 1.0.0 structure: `<type>[optional scope]: <description>`, blank line, optional body, optional footers. The spec defines only `feat` (minor bump) and `fix` (patch bump); `build, chore, ci, docs, style, refactor, perf, test` are widely used conventions. Breaking change: `!` before the colon (`feat(api)!: ...`) and/or a `BREAKING CHANGE: <what>` footer (major bump).

**Why it matters:** the diff already shows *what* changed; only the message can record *why* (the incident, the constraint, the rejected alternative). Six months later `git log -L` or `git blame` lands on this message — "fix stuff" makes that dead end. Structured types let tools generate changelogs and semver bumps.

**How to check:**
- Always Conventional Commits in this kit (`git log --oneline -15` shows the scopes already in use). Validate: `node .agents/scripts/commit-msg.mjs check --message "<msg>"`.
- Subject <= 72 chars (aim for 50), imperative ("add", not "added"/"adds"), no trailing period, lower-case after the type.
- Body answers: why was this needed, what was the alternative, what is the risk? Wrap at 72.
- Breaking API/CLI/config change -> `!` or `BREAKING CHANGE:` present.
- Footers: `Refs: #123`, `Closes #123`, `BREAKING CHANGE: ...`. Never `Co-authored-by` or AI/tool attribution: commits carry only the user's own git identity (`.agents/rules/topic-git-workflow.md`).

```text
BAD:  fixed bug
BAD:  feat: Updated the UserService.ts file to change how the timeout works.
GOOD: fix(http): retry idempotent GETs once on connection reset

      Load balancer drops idle keep-alive sockets after 60 s; the first request
      after idle failed with ECONNRESET (~0.3% of calls). POST is not retried
      because it is not idempotent.

      Refs: #412
```

**Misapplication traps:** `chore:` as a catch-all for real behavior changes (hides them from the changelog). Scopes invented per commit (`fix(the-button-thing)`) — use a short fixed list (package or module names). Writing a body that narrates the diff line by line.

## 3. Branching: trunk-based, short-lived branches, small PRs
**Definition:** everyone integrates into one trunk (`main`) at least daily. Work happens directly on trunk (small teams) or on short-lived branches — one developer (two if pairing), living no more than about two days (trunkbaseddevelopment.com). Unfinished features ship dark behind a flag, not in a long-lived branch. Releases are tags (or release branches cut from trunk, fixes cherry-picked from trunk, never the reverse).

**Why it matters:** merge pain grows with branch age and with how many people touch the same files. DORA associates trunk-based development (three or fewer active branches, merged to trunk at least daily) with higher delivery performance.

**PR size:** Google's guidance: about 100 changed lines is usually reasonable, 1000 is usually too large, and spread matters (200 lines in one file beats 200 lines over 50 files). Keep refactorings in a separate PR from features and fixes.

**How to check:**
- `git diff --stat origin/main...HEAD` (three dots = changes since the merge base) — over ~400 changed lines or ~15 files -> propose a split: preparatory refactor PR, then the behavior PR.
- `git log --oneline origin/main..HEAD` — branch older than a couple of days or 20+ commits -> integrate trunk now.
- Branch name: `<type>/<short-desc>` (e.g. `fix/cart-rounding`) unless the repo has its own pattern (`git branch -r` shows it).
- Generated files (lockfiles, snapshots, codegen) count separately: say so in the PR description instead of splitting them off.

**Misapplication traps:** GitFlow (`develop` + `release/*` + `hotfix/*`) for a web app that deploys continuously — it adds merge ceremony without benefit; keep it only if the project really ships versioned releases with parallel support lines. Feature flags left forever: each flag needs an owner and removal date.

## 4. Rebase vs merge; never rewrite shared history
**Definition:** *rebase* replays your commits on a new base (linear history, new SHAs). *Merge* records a merge commit that joins two histories (true history, SHAs preserved). *Squash-merge* collapses a PR into one commit on trunk.

**Default policy:**
- Local, unpushed commits: rebase freely (`git fetch origin`, then `git rebase origin/main`) to update and to tidy.
- Pushed commits that someone else may have fetched: never rebase, amend or force-push them — their clones diverge and duplicate commits reappear on the next merge. Integrate with `git merge origin/main` instead.
- Your own pushed PR branch that nobody else builds on: rebase + force-push is acceptable only with `git push --force-with-lease --force-if-includes` (the lease alone is defeated by a background `git fetch`; `--force-if-includes` checks the remote tip is in your reflog). Never force-push `main`/`master` or a release branch.
- PR landing: follow the repo setting. Squash-merge suits PRs with messy WIP commits; rebase-merge or merge-commit preserves curated atomic commits.

**How to check:**
- Before any rewrite: `git branch -r --contains <oldest-commit-you-will-rewrite>` — any output means it is published; stop and ask.
- `git status` shows "diverged" after a teammate's push -> `git pull --rebase` only if your local commits are unpublished; otherwise merge.
- Conflict resolution: `git log --merge --oneline` shows commits on both sides touching the conflicted files; keep both intents, then re-run verify. Recommended once per machine: `git config --global merge.conflictStyle zdiff3` (shows the base version) and `git config --global rerere.enabled true` (reuses recorded resolutions).
- Lost work after a bad rebase: `git reflog`, then `git branch rescue <sha>` — do this before any `reset --hard`.

**Misapplication traps:** rebasing a long branch with 30 commits one conflict at a time when a single merge is cheaper and just as clear. Squash-merging a PR whose commits were carefully atomic (you lose bisect granularity). Treating "linear history" as a goal worth breaking collaborators' clones.

## 5. History archaeology: bisect, blame, `log -L`, pickaxe
Before changing code that looks wrong, find out why it is that way. Ask the history first, the user second.

| Question | Command |
|---|---|
| Who last touched these lines, and in which commit? | `git blame -w -C -L 40,60 -- src/cart.py` (`-w` ignore whitespace, `-C` follow moved code) |
| Full evolution of one function | `git log -L :total:src/cart.py` (function-name form needs a diff driver, see §6) or `git log -L 40,60:src/cart.py` |
| When did this string/call appear or vanish? | `git log -S "retry_count" --oneline` (count changes) or `git log -G "retry_\w+" --oneline` (regex on diff lines) |
| History of a file across renames | `git log --follow --oneline -- src/cart.py` |
| Why was it written? | `git show <sha>` then read the message, linked issue and PR |
| Which commit introduced a regression? | `git bisect` (below) |

Hide bulk reformat commits from blame: list their full SHAs (with `#` comments) in `.git-blame-ignore-revs` at the repo root, then `git config blame.ignoreRevsFile .git-blame-ignore-revs`. GitHub's blame view reads that file automatically.

**Bisect** is a binary search over commits: ~log2(N) test runs (1,000 commits -> about 10). Automate it with a script whose exit code is the verdict: `0` = good, `1`–`127` except `125` = bad, `125` = cannot test (skip), anything else aborts.
```text
git bisect start <bad-sha> <good-sha>
git bisect run python ../bisect_check.py
git bisect reset
```
**Example (Python) — bisect script: bad treats a build failure as "bad":**
```python
# BAD: any error, including an unrelated broken build, is reported as the regression
import subprocess, sys
sys.exit(subprocess.run(["pytest", "tests/test_cart.py::test_rounding"]).returncode)
```
```python
# GOOD: untestable commits are skipped (125), only the real assertion decides good/bad
import subprocess, sys
if subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-e", "."]).returncode != 0:
    sys.exit(125)  # cannot build this commit -> skip it
r = subprocess.run([sys.executable, "-m", "pytest", "-q", "tests/test_cart.py::test_rounding"])
# pytest: 0 passed, 1 a test failed; 2-5 = interrupted/internal/usage error/no tests -> skip
sys.exit({0: 0, 1: 1}.get(r.returncode, 125))
```
**Go:** `git bisect run go test -run TestRounding ./cart/` works directly (non-zero on failure), but a compile error also exits non-zero and is misreported as "bad" — wrap it like the Python script when older commits may not build. **Rust:** same with `cargo test rounding`; use `cargo build || exit 125` in a shell wrapper (POSIX; on Windows use a small `.py` or `.mjs` wrapper).

Keep the check script *outside* the tracked tree (or untracked) so checking out old commits does not remove it. Use `git bisect start --term-old=fast --term-new=slow` for non-bug searches such as a performance change.

**Misapplication traps:** blaming a person rather than reading the commit ("blame" answers *which change*, not *who is at fault*). Stopping at the reformat commit that blame shows — use `-w`, `-C` and the ignore-revs file. Bisecting when `git log -S` would answer in one command.

## 6. Repo hygiene: `.gitignore` and `.gitattributes`
**`.gitignore`:** ignore build output (`dist/`, `.output/`, `target/`, `__pycache__/`), dependencies (`node_modules/`, `vendor/` when not committed), local env (`.env`, `.env.*` but keep `!.env.example`), and machine files. Put personal editor/OS files in your global ignore (`git config --global core.excludesFile <path>`), not the repo's. Commit lockfiles (`bun.lock`, `package-lock.json`, `Cargo.lock` for apps, `go.sum`, `poetry.lock`/`uv.lock`, `composer.lock`).

**How to check:** `git check-ignore -v <path>` shows which rule matches. `git status --porcelain --ignored` lists what is ignored. A file already tracked is not affected by adding it to `.gitignore`: `git rm --cached <path>` (keeps the local file). A committed secret is not fixed by ignoring it: rotate it first, and history rewrite is the user's decision.

**`.gitattributes` and line endings (Windows):** without it, each developer's `core.autocrlf` decides, and Windows checkouts produce CRLF files that break shell scripts (`/bin/bash^M: bad interpreter`) and create whole-file diffs. Commit the policy in the repo so it wins over personal settings:
```gitattributes
* text=auto eol=lf
*.bat  text eol=crlf
*.cmd  text eol=crlf
*.png  binary
*.jpg  binary
*.py   diff=python
*.go   diff=golang
*.rs   diff=rust
*.php  diff=php
*.md   diff=markdown
```
`text=auto` lets git detect text vs binary; `eol=lf` keeps LF in the working tree on every OS (modern editors and PowerShell handle LF fine; `.bat`/`.cmd` need CRLF). The `diff=<lang>` lines enable language-aware hunk headers and `git log -L :func:file` (built-in drivers include python, golang, rust, php, java, csharp, cpp, kotlin, ruby, bash, css, html, markdown; there is none for TypeScript, where the default heuristic mostly works).

After adding or changing line-ending rules, renormalize in its own commit: `git add --renormalize .`, then `git status`, then commit `chore: normalize line endings`, and add that SHA to `.git-blame-ignore-revs`.

**How to check:** `git ls-files --eol` shows index (`i/`) and working-tree (`w/`) endings per file; any `i/crlf` or `i/mixed` in a text file is a bug. `git diff --cached --stat` showing every line changed in a file you edited slightly = line endings flipped.

**Misapplication traps:** documenting a `core.autocrlf` setting instead of committing `.gitattributes`; mixing the renormalize with real changes.

## 7. Hooks and signing
**Hooks** are local gates: `pre-commit` (format/lint staged files), `commit-msg` (message format), `pre-push` (tests). They live in `.git/hooks/` (not versioned); share them by committing a directory and setting `git config core.hooksPath .githooks`, or with a manager the repo already uses (lefthook, husky, pre-commit, CaptainHook for PHP). CI must run the same checks, because anyone can skip hooks with `--no-verify`.
- Keep `pre-commit` fast (seconds): staged files only. Put the full test suite in `pre-push` or CI.
- Agent rule: NEVER pass `--no-verify` unless the user asks — the hook is the repo's gate. Instead fix what it reports and commit again (the failed commit did not happen; do not `--amend` the previous commit).
- On Windows, hooks run under Git's bundled `sh`; a `#!/bin/sh` script with LF endings works. Prefer `node`/`python` hook bodies for cross-platform logic.

**Signing** proves a commit came from a key the author controls (GitHub shows "Verified"). SSH signing avoids GPG setup:
```text
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
```
Verify: `git log --show-signature -1` (local verification needs `gpg.ssh.allowedSignersFile`). Agent rule: never disable signing or change signing config unless asked; if signing fails, report it.

## 8. Monorepo tips
- One repo, many packages: scope commits by package (`fix(api): ...`, `feat(web): ...`) and keep a cross-package change in one atomic commit — that is the point of a monorepo.
- Ownership: `CODEOWNERS` (GitHub/GitLab) routes review by path.
- CI: run only affected packages (path filters or the workspace tool's "affected" command), but always run the full suite on trunk.
- Large repos: partial clone `git clone --filter=blob:none <url>`, `git sparse-checkout set <dir> <dir>` (cone mode), `git maintenance start` for background upkeep; `scalar` (ships with Git) bundles these settings.
- Do not store large binaries in git; use Git LFS or an artifact store, decided before the first binary lands (removing them later needs a history rewrite).

**How to check:** `git diff --cached --stat` spans several packages -> is it one logical change (keep together) or several (split per package)?

## 9. Anti-patterns -> fixes
| Anti-pattern | Fix |
|---|---|
| `git add -A` / `git add .` then commit | Stage explicit paths; read `git diff --cached --stat` |
| "WIP", "fix", "update" messages | Imperative subject + why in body; match `git log` style |
| Refactor + fix + format in one commit | Three commits, each green |
| Force-push to a shared branch | Merge instead; own branch only: `--force-with-lease --force-if-includes` |
| `--amend` on a pushed commit | New commit (`fix: ...` or `git commit --fixup <sha>` before the PR merges) |
| Week-old branch, 2,000-line PR | Integrate daily; split refactor PR from behavior PR; flags for unfinished work |
| Bisect marks broken builds as "bad" | Exit 125 for untestable commits |
| `--no-verify` to get past a failing hook | Fix the reported problem |
| Secret committed, then just deleted | Rotate the secret; history rewrite is the owner's decision |

## 10. Review checklist (copy into the Completion Report when you commit)
- [ ] Repo check passed (`git rev-parse --is-inside-work-tree`); write actions were requested
- [ ] `git diff --cached --stat`: only files for one logical change; no secrets, `.env*`, build output, binaries
- [ ] Verify passed at this commit (not only at the branch tip)
- [ ] Message matches repo style; subject imperative <= 72 chars; body says why; breaking changes marked
- [ ] No rewrite of published commits (`git branch -r --contains <sha>` empty) and no force-push to trunk
- [ ] PR diff <= ~400 lines or split proposed; refactors separate from behavior changes
- [ ] No `--no-verify`, no signing changes unless asked
- [ ] Line endings unchanged (`git ls-files --eol` for new files); `.gitattributes` covers new file types
- [ ] Commit SHAs listed in the Completion Report

## 11. References
- Conventional Commits 1.0.0: https://www.conventionalcommits.org/en/v1.0.0/
- Git reference: https://git-scm.com/docs (git-bisect, git-push `--force-if-includes`, gitattributes, githooks, git-blame, git-log `-L`/`-S`/`-G`)
- Pro Git book: https://git-scm.com/book/en/v2
- Google eng-practices, Small CLs: https://google.github.io/eng-practices/review/developer/small-cls.html
- Trunk-based development: https://trunkbaseddevelopment.com/ · DORA: https://dora.dev/capabilities/trunk-based-development/
- GitHub, ignore revisions in blame: https://docs.github.com/en/repositories/working-with-files/using-files/viewing-and-understanding-files
- Related: `.agents/guides/principles/code-review.md` (reviewing the PR), `.agents/guides/principles/documentation.md` (changelogs, ADRs), `.agents/guides/principles/dependency-management.md` (lockfiles)
