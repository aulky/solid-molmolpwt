# Commit, PR and changelog templates

Source: Conventional Commits 1.0.0 (https://www.conventionalcommits.org/en/v1.0.0/, checked 2026-09) and
Keep a Changelog (https://keepachangelog.com/). If the project's own convention differs, the project wins.

## 1. Commit message template

```
<type>(<scope>)<!>: <subject>

<body: what changed and WHY, wrapped at ~72 columns. Say what was wrong before. Leave out
details the diff already shows.>

<footers>
BREAKING CHANGE: <what breaks and how to migrate>
Refs: #123
```

Rules:
- `type` is required and lowercase (table below). `scope` is optional: a short noun for the area, such as
  `auth`, `api`, `deps`, `db` or `ui`. Reuse the scopes you see in `git log`.
- `subject`: imperative mood ("add", not "added"/"adds"), no trailing period, 72 characters or fewer
  for the whole header, and it completes the sentence "If applied, this commit will ...".
- A blank line separates header, body and footers.
- Footer tokens use `-` for spaces (`Refs: ...`). `BREAKING CHANGE` is the only token with a space.
- Never add `Co-authored-by:`, `Generated with ...`, `Assisted-by:`/`Generated-by:`, robot emoji or any AI/tool
  attribution, here or in PR titles and bodies: the user is the only author. `Signed-off-by` only via
  `git commit -s` when the repo requires DCO.
- Check: `node .agents/scripts/commit-msg.mjs check --message "<message>"` -> `COMMIT-MSG: PASS`.
- A breaking change is marked with `!` before the colon, a `BREAKING CHANGE:` footer, or both.

## 2. Types and SemVer impact

| type | use for | release impact |
|---|---|---|
| `feat` | a new user-visible capability | minor |
| `fix` | a bug fix | patch |
| `perf` | a performance improvement with no behaviour change | patch (by convention) |
| `refactor` | a code change that neither fixes a bug nor adds a feature | none |
| `docs` | documentation only | none |
| `test` | adding or fixing tests only | none |
| `build` | the build system or dependencies (`build(deps): ...`) | none |
| `ci` | CI configuration and scripts | none |
| `style` | formatting, whitespace, no code-meaning change | none |
| `chore` | maintenance that fits nothing above | none |
| `revert` | reverts an earlier commit; add footer `Refs: <sha>` | depends |
| any + `!` / `BREAKING CHANGE:` | an incompatible API or behaviour change | major |

The spec itself defines only `feat` and `fix`. The rest are the common `@commitlint/config-conventional`
set, which the spec mentions. If the project configures commitlint, its `type-enum` wins.

## 3. Examples (bad, then good)

```
bad:  Fixed stuff
good: fix(auth): reject refresh tokens after their expiry time

bad:  feat: Added a new endpoint for users and also refactored the db layer and updated deps
good: (three commits)
      refactor(db): extract query builder from UserRepository
      feat(api): add GET /users/:id/sessions endpoint
      build(deps): bump zod from 3.23.8 to 3.24.1

bad:  update
good: docs(readme): document the bun-only install step
```

A body that explains why:
```
fix(cart): keep line items when the session cookie rotates

The cart was keyed by session id, so rotating the cookie after login
created an empty cart. Key it by user id once authenticated and merge
the anonymous cart on login.

Refs: #482
```

A breaking change:
```
feat(api)!: return ISO-8601 strings for all timestamps

BREAKING CHANGE: `createdAt` and `updatedAt` are now strings like
"2026-09-24T12:00:00Z" instead of epoch milliseconds. Clients must parse
them with Date.parse or a date library.
```

A revert:
```
revert: feat(search): enable fuzzy matching

This reverts commit 1a2b3c4. Fuzzy matching doubled p95 latency.

Refs: 1a2b3c4
```

## 4. Branch names

`<type>/<short-kebab-topic>`, for example `feat/user-sessions-endpoint`, `fix/expired-refresh-token`,
`build/bump-vite`. Use the project's pattern (such as `<issue-id>-topic`) if `git branch -a` shows one.

## 5. PR description template

The orchestrator pipes this body to `gh pr create --body-file -` (SKILL.md step 11) or prints it for the user.
No file is written. Delete sections that do not apply. Do not leave empty headings. Keep it ASCII (Windows
PowerShell 5 pipes non-ASCII characters as `?`).

```markdown
## Summary
<1-3 sentences: what this PR does, in user terms.>

## Why
<The problem or requirement. Link the issue: Closes #123.>

## Changes
- `<path or area>`: <what changed and why>
- ...

## How it was verified
- `node .agents/scripts/verify.mjs` -> VERIFY: PASS
- `<extra command, e.g. bun run test:e2e>` -> <result>
- Manual check: <steps and what you observed, or "none">

## Risks and rollback
- Risk: <what could break, who is affected>
- Rollback: <revert this PR | feature flag | migration down step>

## Breaking changes
<none | what breaks + migration steps>

## Screenshots
<UI changes only: before/after>

## Notes for reviewers
<Where to start reading, trade-offs you chose, follow-ups left out of scope.>
```

PR title: the Conventional Commit header of the main change, for example
`feat(api): add GET /users/:id/sessions endpoint`.

## 6. Changelog entry (Keep a Changelog)

Add under `## [Unreleased]` at the top of `CHANGELOG.md`, in one of these categories in this order:
Added, Changed, Deprecated, Removed, Fixed, Security. Write for users, not for developers.

```markdown
## [Unreleased]
### Fixed
- Carts are no longer emptied when you log in (#482).
```

At release time the `[Unreleased]` items move under `## [1.4.0] - 2026-09-24` (ISO date). That is a release
task. Do it only when asked.

## 7. Changeset file (projects with a `.changeset/` folder)

The interactive `changeset` command needs a TTY, so an `implementer` task writes the file directly (it is a
file change, never written by the orchestrator): `.changeset/<kebab-summary>.md`

```markdown
---
"<package-name-from-package.json>": patch
---

Keep cart line items when the session cookie rotates after login.
```

Bump type: `patch` for fixes, `minor` for features, `major` for breaking changes. A monorepo can list several
packages in the frontmatter, one per line.

## 8. Commands cheat sheet (PowerShell and POSIX)

| goal | command |
|---|---|
| inside a repo? | `git rev-parse --is-inside-work-tree` |
| current branch | `git branch --show-current` |
| what changed | `git status --porcelain=v1 -b` and `git diff --stat` |
| staged files | `git diff --staged --name-only` |
| unstage a file | `git restore --staged <path>` |
| one-line commit | `git commit -m "<header>"` |
| header + body paragraphs | `git commit -m "<header>" -m "<body paragraph>" -m "<footer>"` (each `-m` = one paragraph) |
| multi-line message from stdin (PowerShell) | `@'` newline, message lines, newline, `'@ \| git commit -F -` (closing `'@` at column 0) |
| multi-line message from stdin (POSIX) | `git commit -F - <<'EOF'` newline, message lines, newline, `EOF` |
| last commit files | `git log -1 --stat` |
| undo a published commit | `git revert <sha>` (a new commit; history untouched) |
| push new branch | `git push -u origin HEAD` |
| overwrite own remote branch (user asked) | `git push --force-with-lease` |
