# Review checklist: concrete checks, not slogans

Used by: `reviewer` and `security-auditor` workers (REVIEW phase) and the orchestrator (triage).
Work through the sections in order. For each one write "ok" or `path:line — observation`. Search with
`node .agents/scripts/search.mjs "<regex>" <path>`. Every regex below is a starting point: open each hit and
read the code around it before you report it. You are read-only: report findings, never fix them.

## 0. Change set (before section 1)
- [ ] You know every changed file and what it should now do: from CHANGE in your brief; in a git repository also
  `git status --porcelain` and `git diff` (read-only). Not a git repo: write "before-state not visible" and judge
  each file against what the brief says it should do.
- [ ] Every changed file belongs to the task. A file nobody asked to change is already a finding (it may have been
  edited outside the worker's OWNED FILES).
- [ ] Flag lockfiles, generated files, files outside the workspace, and files holding secrets (`.env*`, `*.pem`).

## 1. Requirements
- [ ] Every requirement and acceptance criterion in the brief is implemented and reachable from a real entry point
  (route, CLI, export, UI control). Judge against the requirement words, not the implementer's explanation.
- [ ] Nothing unrequested was added: no extra options, flags, abstractions or "while I was here" refactors.
- [ ] Changed behaviour that users or callers can see is intended and stated in the brief.

## 2. Correctness
- [ ] Empty, null or undefined inputs, zero, negative numbers, the max boundary, and the empty list are handled.
- [ ] Off-by-one cases: loop bounds, slicing, pagination, date ranges (inclusive or exclusive), trailing slashes.
- [ ] Error paths:
  - Every `catch` either handles the error or rethrows it with context.
  - No empty `catch {}`.
  - No error that is logged and then ignored when the caller needs to know.
- [ ] Async code:
  - Every promise is awaited or returned. Search: `\.then\(|async ` near calls that are not awaited.
  - No unhandled rejection. No race on shared state.
- [ ] Resources are closed or released: files, DB connections, timers, event listeners, subscriptions.
- [ ] Every caller of a changed signature was updated. Search for the function name across the workspace.

## 3. Tests
- [ ] New or changed behaviour has a test that would fail without the change (or a TEST task is planned for it).
- [ ] No test was weakened. Search:
  `node .agents/scripts/search.mjs "\.skip\(|\.only\(|xit\(|@Disabled|#\[ignore\]|t\.Skip\(|pytest\.mark\.skip|markTestSkipped" .`
- [ ] No suppression comments were added. Search:
  `node .agents/scripts/search.mjs "@ts-ignore|@ts-expect-error|eslint-disable|biome-ignore|# type: ignore|//nolint|#\[allow\(" .`
  Each hit that the change added needs a written reason.
- [ ] No expected values are copied from the implementation's output, and no test depends on time, randomness or
  order. A bugfix has a regression test that failed before the fix.

## 4. Security (see `.agents/rules/topic-security.md`; deep audit: `/security-audit`)
- [ ] Untrusted input never reaches SQL, the shell, the file system, HTML or URL fetches unescaped:
  - SQL: parameterized queries only.
  - Shell: argument arrays, no string concatenation.
  - File paths: resolve the path and check it against a base directory.
  - HTML: no `innerHTML` with user data.
  - Outbound URLs: use an allow-list, which prevents SSRF.
- [ ] Every server entry point checks authentication and authorization. The ownership check sits next to the data access.
- [ ] No secrets in code, config, logs, tests or fixtures. Search:
  `node .agents/scripts/search.mjs -i "api[_-]?key|secret|password|token|BEGIN [A-Z ]*PRIVATE KEY" <changed paths>`
- [ ] No sensitive data in error messages or logs (tokens, passwords, PII, full request bodies).
- [ ] New dependencies are justified, come from the official registry, and were installed through the
  package manager. The lockfile was not hand-edited.
- Any hit here on auth, sessions, crypto, uploads, SQL or shell: say "security-auditor recommended" in your report.

## 5. Performance
- [ ] No query or network call inside a loop (N+1). Batch it, or load it once.
- [ ] Independent I/O runs in parallel (`Promise.all`, a task group), not sequentially.
- [ ] Hot paths do not scan lists repeatedly. Use a map or set lookup when inputs can be large.
- [ ] No unbounded growth: caches have limits, lists are paginated, uploads have size limits.
- [ ] Frontend: no heavy work in render paths, and no new large client bundle for a small feature.

## 6. Scope and hygiene
- [ ] No debug leftovers. Search:
  `node .agents/scripts/search.mjs "console\.log|debugger;|dbg!\(|print\(|var_dump|dd\(" <changed paths>`
  Confirm each hit is intended.
- [ ] No commented-out code blocks, and no TODOs without an owner or issue.
- [ ] No unrelated reformatting of untouched lines (run the formatter on the changed paths only, never the
  project-wide format script; the command is in root `AGENTS.md`).
- [ ] Generated files, build output and lockfiles changed only through their tools.

## 7. Consistency and reuse
- [ ] Before accepting a new helper, search for an existing one with the same job.
- [ ] Names, error handling and file layout follow the neighbouring code, not personal taste.
- [ ] Project-specific rules hold: the project's conventions in root `AGENTS.md` (framework idioms, package
  manager, import aliases) and `.agents/rules/90-lessons.md`.

## 8. Documentation
- [ ] README, usage docs or configuration docs are updated when behaviour, commands or environment variables changed
  (or the scribe gets the new fact in LEARN).
- [ ] A significant decision (new dependency, architecture, data model) has an ADR (`/architecture-decision-records`).
- [ ] Public API changes have updated doc comments.

## 9. Kit files (only when `.agents/` changed)
- [ ] Rules stay flat in `.agents/rules/` and have valid frontmatter. Globs are one quoted comma string of
  `**/<basename>` patterns (matching is basename-only).
- [ ] Skills have name == folder, a description with triggers, and at most 250 lines.
- [ ] Worker agents (`.agents/agents/*.md`) never list `invoke_subagent` or `multi_replace_file_content`; no skill
  or rule tells a worker to delegate; no reference to a deleted skill or rule.
- [ ] `node .agents/scripts/doctor.mjs --quiet` reports no new errors.

## Severity guide (the same scale the reviewer uses)
- **blocker**: requirement unmet, data loss, security hole, or broken build or tests.
- **major**: wrong result on realistic input.
- **minor**: wrong result on rare input.
- Style preferences are not findings. Each finding quotes the code and names a concrete failing input.

## Triage (orchestrator, after the review report arrives)
Open every cited `path:line` first. Then give each finding exactly one verdict:
| Verdict | When | What you write |
|---|---|---|
| APPLY | real and in scope (correctness, requirement, security, test integrity) | goes to the `fixer` brief, quoted |
| REBUT | false positive, or the reviewer lacked context | 1 line of evidence (`path:line`, test name, command output) |
| DEFER | real but outside the task, or needs a user decision | "Not done / risks" in the Completion Report |
- An "Unconfirmed" item needs your own check (or an explorer) before it becomes APPLY.
- Style and taste notes: park them; chasing every note leads to over-engineering.
- The fixes changed more than about 30 lines or added files -> one more full review round (at most 2 rounds).
