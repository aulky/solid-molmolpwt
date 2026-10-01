---
trigger: always_on
description: "Engineering standards as checks for every code change: scope, reuse, simplicity, design, naming, errors, tests, security, dependencies, performance."
---
# Engineering standards

## Hard invariants
1. Change only what the task needs. NEVER add drive-by refactors, renames, reformatting of untouched code or unrequested features, because extra diff hides bugs and slows review. Instead list the idea under `OUT OF SCOPE:` in your Worker Report (orchestrator: "Not done / risks").
2. Before writing a helper, component, type or module, search for an existing one (`search.mjs` with its likely name and key terms). Reuse or extend it, and say what you reused.
3. NEVER delete, skip or weaken a test or assertion to get green, and never hard-code values that only satisfy the test inputs, because tests encode requirements. Instead fix the code, or report the test as wrong with evidence.
4. NEVER put secrets (keys, tokens, passwords) in code, tests, logs or docs. Read them from env or config; use placeholders in examples.
5. NEVER write a dependency version, API signature or config key from memory. Read the lockfile, the installed package (`node_modules/<pkg>/package.json` and its types) or official docs first (`/research-docs`).

## Simplicity (KISS, YAGNI, DRY)
- Use the least machinery that solves today's task: no new layer, option, flag, generic parameter or plugin point unless the task needs it now.
- Extract shared code on the third repetition, or sooner when the copies must always change together. Two similar blocks are fine.
- Prefer the standard library and existing dependencies. Add a dependency only for hard, solved problems (dates, crypto, parsing, protocols) and say why in the report. Never hand-roll crypto.
- One job per function: if describing it needs "and", split it. Use early returns; keep nesting at most 3 levels deep.
- Remove code your change made dead. No commented-out code, no leftover debug prints.

## Design
- Keep I/O (network, database, files, clock, randomness) at the edges. Keep decisions in pure functions that tests can call directly.
- One source of truth: derive values instead of copying state and syncing it with effects or events.
- Do not mutate inputs, props or shared state; return new values.
- Pass dependencies in (parameters, constructor) instead of importing global singletons inside logic.
- Prefer composition over inheritance. A subtype must work everywhere its parent type is used.
- Follow the existing module boundaries and dependency direction. Domain code never imports UI code.

## Read before write
- Read the file, its tests and at least one caller before changing it. Match its naming, style and patterns.
- A file changed since you read it and you did not change it? The user did it on purpose: re-read it and merge. Never overwrite it.
- Changing a signature, route, schema or config key: search every usage and update them, plus tests, types and docs, in the same change.
- Chesterton's fence: before deleting or rewriting odd code (workaround, `HACK`, `TODO`, strange condition), find out why it exists: tests, comments, `git log -L` or blame (orchestrator: brief a `git-historian`). Still unknown -> keep it and ask (worker: report it).

## Naming
- Name by meaning: `unpaidInvoices`, not `list2`. Booleans start with `is`/`has`/`can`; functions are verbs; put units in names (`timeoutMs`, `sizeBytes`).
- Replace magic numbers and strings with named constants. Follow the project's casing and file-naming conventions.

## Errors
- Validate at system boundaries (HTTP handlers, server functions, CLI args, env vars, file and external API input). Trust typed values inside.
- Fail fast with a message that says what failed, for which input, and what to do next.
- NEVER swallow errors (empty `catch`, `catch` that returns null, unhandled promise), because hidden failures turn into wrong data later. Instead handle the error, or add context and rethrow.
- Fix root causes. Do not hide failures with retries, sleeps, broad try/catch or disabled checks.

## Tests
- New behaviour -> a test that fails without your change. Bug fix -> first a test that reproduces the bug; if no test can, write exact manual repro steps.
- Use the project's existing test framework and file layout. Only if there is none, use the default from the language pack.
- Tests are deterministic: no sleeps, no real network, no order dependence. Control time and randomness.
- Run the single test first, then `node .agents/scripts/verify.mjs --quick` (workers); the orchestrator runs the full `verify.mjs`.

## Security
- Build SQL, shell commands, HTML and file paths from input only through parameters, argument arrays or escaping APIs, never by string concatenation.
- Every server entry point (route, server function or action, RPC, webhook) validates input, authenticates, then authorizes, inside that function.
- Never log tokens, passwords, cookies or full request bodies. Never keep request- or user-scoped data in module-level mutable state on a server.

## Dependencies
- Use the package manager the lockfile names: `bun.lock` bun, `pnpm-lock.yaml` pnpm, `yarn.lock` yarn, `package-lock.json` npm; `Cargo.lock`, `go.sum`, `uv.lock`, `poetry.lock`, `composer.lock` their own tools. Several lockfiles -> `AGENTS.md` names the canonical one.
- Add, remove and upgrade only with the package manager's commands; never edit a lockfile by hand. Upgrade one major version at a time after reading its changelog (`/upgrade-deps`).

## Git
- Conventional Commits only. Never `Co-authored-by` or any AI/tool attribution in commits or PRs; commit only as the user's configured git identity (no `--author`, `-c user.*`, `git config user.*`). See `topic-git-workflow.md`.

## Performance defaults
- Run independent I/O concurrently (`Promise.all`, `tokio::join!`, `errgroup`, `asyncio.gather`). Never await independent calls one by one.
- No N+1: batch queries and requests; no I/O inside a loop when a bulk call exists.
- Repeated lookups inside a loop use a Set, Map or dict, not repeated linear scans.
- Hoist request-invariant work (regex compile, config parse, static file reads) out of hot paths. Measure before micro-optimizing.

Deep guides: `.agents/guides/principles/` (simplicity, design-principles, clean-code, error-handling, testing-strategy, security, performance, dependency-management).

---
Before finishing: only requested changes · reused before writing new · tests intact and meaningful · no secrets · no versions from memory.
If a standard here conflicts with the project's existing convention, follow the project and say so in the report.
