---
trigger: model_decision
description: "Apply before any git write (commit, branch, merge, rebase, reset, push, tag), a commit message, PR text or git setup. Conventional Commits; no co-author/AI trailers; user's own identity only."
---
# Git workflow - topic rule
Procedure: `/commit-and-pr`. Principles guide: `.agents/guides/principles/git-workflow.md` - read it for branching models, release tagging and changelogs. History questions: the `git-historian` worker (EXPLORE) or the installed `commit-archaeologist` skill. Git write actions are orchestrator-level and only when the user asks; workers never commit, push or open PRs.

## First check
Run `git rev-parse --is-inside-work-tree`. If it fails, this is not a git repository: run no git write commands, and offer `git init` only if the user asks for version control.
Then `node .agents/scripts/commit-msg.mjs status`: it shows the identity commits will use and whether the commit-msg hook (which enforces this rule) is installed. Hook missing -> `node .agents/scripts/commit-msg.mjs install` (a `/start` step; a worker task in orchestrator mode).

## Protocol
1. Inspect, one command per call: `git status --porcelain`, `git diff --stat`, `git branch --show-current`, `git log --oneline -8` (copy the repo's message style).
2. Commit only when the user asked, or the active skill says so. Stage explicit paths (`git add <path> <path>`); never blind `git add -A`. Check the staged diff (`git diff --cached --stat`) for secrets, `.env*`, build output, large binaries and unrelated files.
3. Atomic commits: one logical change each; verify passes at each commit.
4. Message: Conventional Commits 1.0.0, always. `<type>(<scope>): <imperative summary>` (<= 72 chars, lowercase type, no trailing period); blank line; body = why; footers `BREAKING CHANGE: <what>` (or `!` after the type) and `Refs: #123`. Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. Check it before committing: `node .agents/scripts/commit-msg.mjs check --message "<message>"` -> `COMMIT-MSG: PASS`.
5. Branches: short-lived `<type>/<short-desc>` from the default branch. Do not commit to `main`/`master` directly when the repo works through PRs.
6. PR description: what and why; how it was verified (commands + result); risks and rollback; screenshots for UI changes; linked issue.
7. Conflicts: the orchestrator reads both sides (`git log --merge --oneline`, `git diff`) and dispatches an `implementer` (OWNED FILES = the conflicted files, CONTEXT = both intents); it keeps both intents, never takes one side wholesale unread, and runs verify. Then REVIEW and TEST as usual.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER rewrite published history (`push --force`, `rebase` or `commit --amend` of pushed commits, `filter-repo`) unless the user asks - collaborators' clones break. If asked: `git push --force-with-lease`, never on `main`/`master`.
2. NEVER run destructive commands (`reset --hard`, `clean -fd`, `checkout -- .`, `restore .`, `stash drop`, `branch -D`) without asking - uncommitted work cannot be recovered. Instead: `git stash push -m "<why>"` or a backup branch.
3. NEVER skip hooks (`--no-verify`) or signing unless the user asks - hooks are the repo's quality gates. Instead: fix what the hook reports.
4. NEVER commit secrets. If one was already committed, stop and tell the user: the secret must be rotated, and a history rewrite is their decision.
5. NEVER `git push` (or open a PR) unless the user asked for it.
6. NEVER add `Co-authored-by:`, `Generated with ...`, `Assisted-by:`/`Generated-by:` trailers, robot emoji, model or tool names as authors, or `noreply@<ai vendor>` addresses to commit messages, PR titles/descriptions, tags or release notes - the user is the only author of their history. Instead write the message as the user would and stop there.
7. NEVER change who a commit is from: no `--author`, `-c user.name=`/`-c user.email=`, `GIT_AUTHOR_*`/`GIT_COMMITTER_*` variables, and no `git config user.*` writes - commits carry the user's own git identity (their GitHub account). Identity not configured -> stop and ask the user to set it themselves (`git config --global user.name "<name>"`, `git config --global user.email "<GitHub email>"`); never invent or copy one.
8. `Signed-off-by` only when the repo requires DCO, and only via `git commit -s` (it uses the user's identity).

## Pitfalls Flash models get wrong
- Committing lockfile churn or formatting noise from unrelated files.
- Messages like "update", "fix stuff", "WIP" - or a summary that describes the diff instead of the reason.
- Amending a commit that is already pushed.
- Appending a `Co-authored-by` or "Generated with" footer out of habit from other tools: the commit-msg hook rejects it.
- Writing `Initial commit` or `Update README.md`: use `feat: initial commit`, `docs: update README`.
- Chaining commands with `&&` on Windows PowerShell 5.1 (run one command per call).

## Example - bad -> good
```text
BAD:  git add -A
      git commit -m "updates"
      git push --force

GOOD: git add src/cart/total.ts src/cart/total.test.ts
      git diff --cached --stat
      git commit -m "fix(cart): round totals to cents before tax" -m "Float sums showed 19.999 at checkout. Refs: #88"
      (push only when the user asks)
```

## Before finishing
- [ ] Only requested git write actions were run; none of the NEVER list without an explicit ask
- [ ] Staged diff checked for secrets and unrelated files; verify passed before the commit
- [ ] Every message passes `commit-msg.mjs check` (Conventional Commits, no attribution trailers); author = the user's configured identity (`git log -1 --format='%an <%ae>'`)
- [ ] The Completion Report lists the commit hashes
