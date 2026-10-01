---
name: commit-and-pr
description: Orchestrator playbook that turns verified pipeline work into atomic Conventional Commits, PR descriptions and changelog entries, and never rewrites history unless asked. Use only when the user asks to commit, write or fix a commit message, split changes into commits, push, open or describe a pull request, or update the changelog or release notes.
metadata:
  icon: 📝
---

# Commit and PR: atomic Conventional Commits plus a PR description a reviewer can act on

Used by: orchestrator only, and only when the user asks. Workers never commit, push or open PRs. File changes
this playbook needs (changelog, changeset, `.gitignore`, a fix for a failing git hook) are worker tasks
(`implementer` / `fixer`) run through `/orchestrate`.

Always Conventional Commits 1.0.0 (`<type>(<scope>): <subject>`). A commitlint config may narrow the types or
scopes; follow it within Conventional Commits. The user is the only author: no co-author or AI-attribution lines,
and commits carry the user's configured git identity (rule `topic-git-workflow.md`, invariants 6-8). The
commit-msg hook (`node .agents/scripts/commit-msg.mjs install`) enforces both.

## When to use
- The user says commit, commit message, split into commits, push, open a PR, prepare a PR, PR description,
  changelog, or release notes.
- A pipeline finished (Completion Report written) and the user wants the work committed.

Do NOT use for:
- Finding out why old code exists. Dispatch a `git-historian` (it uses the `commit-archaeologist` skill).
- Reviewing the diff for bugs. That is the REVIEW phase of `/orchestrate` (a `reviewer` worker); this playbook
  only packages work that already passed REVIEW and TEST.
- A folder that is not a git repository when the user did not ask for version control. Report it and stop.
  Offer `git init` only if the user asks for version control.

## Invariants
1. NEVER rewrite history (`git commit --amend`, `git rebase`, `git reset --hard`, `git push --force`,
   `git filter-branch`) unless the user asked for that exact operation, because others may already have those
   commits. Instead add a new commit, or `git revert <sha>` for published commits.
2. NEVER use `--no-verify`, because hooks are the project's own gate. Instead send what the hook reports to a
   `fixer` (step 9) and commit again. A failed hook created no commit, so `--amend` would change the PREVIOUS one.
3. NEVER stage secrets or generated files (`.env*`, `*.pem`, `*.key`, `id_rsa*`, `node_modules/`, build output,
   `.agents/.state/`), because anything committed is exposed to everyone with the repo. Instead
   `git restore --staged <path>`; a missing `.gitignore` entry is an implementer task.
4. NEVER push, open a PR, create tags or publish unless the user asked, because those are visible to others.
   Instead prepare everything and show the exact command.
5. Commit only verified work: a pipeline whose REVIEW and TEST passed, plus your own
   `node .agents/scripts/verify.mjs` PASS right before the first commit. FAIL -> report and ask.
6. Your commands here change only git metadata (index, commits, branches, remote), never file content:
   `git init` (only when the user asked, e.g. from `/new-project`), `git add`, `git restore --staged`,
   `git commit`, `git switch -c`, `git push`, `gh pr create`. Anything that
   writes a file is a worker task, because the orchestrator never edits workspace files.
7. No message or PR body file: pass text with `-m` or on stdin (`-F -`, `--body-file -`), because you have no
   file-writing tools and a temp file would be a workspace edit.
8. NEVER add `Co-authored-by`, `Generated with`, `Assisted-by`, robot emoji or any AI/tool attribution to a commit,
   PR title or body, tag or release note, and NEVER pass `--author`, `-c user.*` or `GIT_AUTHOR_*`/`GIT_COMMITTER_*`,
   because the history must show only the user's own GitHub identity. Identity unset -> ask the user to set it.

## Phase map
| Step | Phase | Who |
|---|---|---|
| 1-3 Detect git, read state and conventions, verify | EXPLORE | orchestrator (read-only + `verify.mjs`) |
| 4 Commit plan | PREPARE | orchestrator (a commit table, not code) |
| 5 Changelog / changeset / `.gitignore` entry | IMPLEMENT -> REVIEW -> TEST -> LEARN | lane S docs-only pipeline: `implementer`, `reviewer`, `test-engineer` (runs verify), `scribe` |
| 6-8 Branch, stage, commit | REPORT stage | orchestrator (git metadata only) |
| 9 Hook failure | FIX -> REVIEW -> TEST | `fixer` (or `debugger` if unclear), targeted `reviewer`, verify |
| 10-11 Push, PR | REPORT stage | orchestrator, only when asked |

## Checklist
Copy this and tick items as you go:
```
- [ ] Inside a git work tree (or reported "not a git repository" and stopped)
- [ ] Project convention known: git log style, commitlint config, release tooling, CHANGELOG.md
- [ ] The work passed REVIEW and TEST (Completion Report) and `verify.mjs` PASS was run by you just now
- [ ] Commit plan table: commit -> files; paths from other work left unstaged and named
- [ ] Changelog / changeset written by an implementer task (or "not applicable" with the reason)
- [ ] Staged file list equals the plan; no secrets or generated files staged
- [ ] Each message follows the template (type, scope, imperative subject <= 72 chars, body says why)
- [ ] Hook failures fixed by a fixer and committed as a NEW commit (no --amend, no --no-verify)
- [ ] Push / PR only if asked; PR body from the template
- [ ] Commit Report written
```

## Procedure

### EXPLORE (you, read-only)
1. **Detect git.** `git rev-parse --is-inside-work-tree`.
   - Prints `true`: continue.
   - Error `not a git repository`: stop, report "not a git repository; nothing committed". Offer `git init` plus a
     first commit only if the user wants version control.
   - `git` not found: report it and stop.
2. **Read the state and the conventions.** `node .agents/scripts/commit-msg.mjs status`: identity NOT CONFIGURED ->
   stop and ask the user to set `user.name`/`user.email` themselves; hook not installed -> offer to install it
   (implementer task: `ALLOWED COMMANDS: node .agents/scripts/commit-msg.mjs install`). Then, one command per call
   (kit rule: no `&&`):
   `git status --porcelain=v1 -b`, `git diff --stat`, `git diff --staged --stat`, `git log --oneline -n 15`.
   Look for `commitlint.config.*` or `.commitlintrc*`, `.changeset/`, `release-please-config.json`,
   `.releaserc*`, `CHANGELOG.md`.
   Check: you can say which task (T-id) each changed path belongs to. Paths from other work stay unstaged.
3. **Verify.** `node .agents/scripts/verify.mjs` (or the project's own test command).
   Check: `VERIFY: PASS`. FAIL -> stop, show the failing step, ask. The fix is a pipeline, not a commit.

### PREPARE (you)
4. **Plan atomic commits.** One logical change per commit:
   - a behaviour change together with its tests;
   - a refactor separate from a behaviour change;
   - formatting-only changes separate;
   - a dependency bump with its manifest and lockfile together, and nothing else.
   Each commit should build and pass tests on its own where feasible. Write the plan as a table (commit ->
   files). `git add -p` is not available non-interactively: a file mixing two concerns goes with its dominant
   concern (say so in the body), or ask the user.

### IMPLEMENT -> REVIEW -> TEST -> LEARN (only if a file must change)
5. **Changelog / changeset.** Decide what the project needs, then dispatch it as a lane S docs-only task via
   `/orchestrate` (implementer OWNED FILES = only that file; `reviewer`; `test-engineer` runs
   `node .agents/scripts/verify.mjs`; `scribe`). Best: plan this task in the original pipeline's PREPARE when
   the user asked for a release up front.
   - `.changeset/` exists: the implementer writes `.changeset/<kebab-summary>.md` (format in
     `references/templates.md` §7). Nobody edits `CHANGELOG.md` by hand.
   - release-please or semantic-release: the commit messages ARE the changelog input. No file task.
   - `CHANGELOG.md` without tooling: one user-facing bullet under `## [Unreleased]` in the right category
     (Added, Changed, Deprecated, Removed, Fixed, Security).
   - None of these: skip. Never create a changelog unless asked.

### Commit (you, git metadata only)
6. **Branch (only when a PR is wanted).** `git branch --show-current`. On `main`, `master` or the default branch:
   `git switch -c <type>/<short-kebab-topic>` (for example `fix/expired-refresh-token`) before committing.
7. **Stage exactly.** If step 5 or 9 ran a pipeline, rerun `node .agents/scripts/verify.mjs` yourself now;
   FAIL -> stop and ask. Then `git add -- <path1> <path2>` with the planned paths. Never `git add -A` or `git add .`
   unless every change was reviewed and belongs in this commit.
   Check: `git diff --staged --name-only` equals the plan; names checked against invariant 3; `git diff --staged`
   read for credentials, tokens or private keys.
8. **Commit.** Message from `references/templates.md` §1. One line: `git commit -m "fix(auth): reject expired
   refresh tokens"`. With a body: one `-m` per paragraph,
   `git commit -m "fix(auth): reject expired refresh tokens" -m "Tokens past exp were accepted because ..."`,
   or pipe a multi-line message to `git commit -F -` (templates §8). Avoid double quotes inside messages.
   Before each commit: `node .agents/scripts/commit-msg.mjs check --message "<header>"` -> `COMMIT-MSG: PASS`.
   Check: `git log -1 --stat` shows exactly the intended files and `git log -1 --format='%an <%ae>'` is the
   identity from step 2. Repeat steps 7-8 per planned commit; at the end
   `git status --porcelain` shows only the paths you left out on purpose.

### FIX (only if a git hook fails)
9. **Hook failure.** Read the hook output. A formatter hook that rewrote files: `git diff --stat` shows them;
   formatting-only -> stage them and run the same `git commit` again. Lint, type or test failure -> a `fixer`
   task (brief: the hook output verbatim, OWNED FILES = the failing files; `debugger` first if unclear), a
   targeted `reviewer` re-check, `verify.mjs` PASS, then the same `git commit` again. Never `--amend`.

### Push and PR (only when asked)
10. **Push.** `git push -u origin HEAD`. The user explicitly asked to overwrite a remote branch:
    `git push --force-with-lease`, never plain `--force`, never on `main` or `master`.
11. **PR.** Title = the Conventional Commit header of the main change. Body = `references/templates.md` §5,
    filled from the Completion Report (Summary, Why, Changes, How it was verified, Risks and rollback).
    - `gh --version` works and the user asked you to open it: pipe the body on stdin, PowerShell:
      `@'` newline, body lines, newline, `'@ | gh pr create --title "<title>" --body-file -` (closing `'@` at
      column 0; add `--draft` if work remains). POSIX: `gh pr create --title "<title>" --body-file - <<'EOF'`.
    - Otherwise: print the title and body for the user to paste, plus the push command.
12. **Report** with the template below.

## Output
```
## Commit Report
- Branch: `<branch>` (pushed: yes/no)
- Commits:
  - `<sha7>` <header> (<n> files; tasks T<id>, T<id>)
- Verification before commit (run by orchestrator): `node .agents/scripts/verify.mjs` -> <VERIFY line>
- Left unstaged: <paths and why, or "none">
- Changelog: <CHANGELOG.md entry by T<id> | .changeset/<file> by T<id> | release tooling | not applicable>
- Hook fixes: <T<id> fixer -> FIXED | none>
- PR: <URL | body printed for the user | not requested>
- Not done / risks: <list or "none">
```

## References
- [references/templates.md](references/templates.md): commit message template, type table with SemVer impact,
  examples, PR description template, changelog and changeset formats, command cheat sheet (stdin forms).
- `.agents/skills/orchestrate/SKILL.md` (the pipeline that must finish first; lane S docs-only for step 5).
- `.agents/guides/principles/git-workflow.md`: branching, history hygiene, review flow.
- Conventional Commits 1.0.0: https://www.conventionalcommits.org/en/v1.0.0/
- Keep a Changelog: https://keepachangelog.com/
