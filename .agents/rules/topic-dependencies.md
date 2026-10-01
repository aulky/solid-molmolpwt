---
trigger: glob
globs: "**/package.json,**/Cargo.toml,**/go.mod,**/pyproject.toml,**/requirements*.txt,**/composer.json,**/Gemfile,**/pom.xml,**/build.gradle*,**/*.csproj,**/pubspec.yaml,**/mix.exs"
description: "Dependency manifest card: pick the package manager from the lockfile, add/remove/why/audit commands, version invariants. Loaded when editing package manifests."
---
# Dependencies - topic card
Principles guide: `.agents/guides/principles/dependency-management.md` - read it before adding a new dependency or changing a major version. Upgrades: `/upgrade-deps` (section `dependency-upgrade` of `.agents/skills/orchestrate/references/task-types.md`). A new major dependency may need an ADR: `topic-architecture-decisions.md`.

## Toolchain - the lockfile picks the manager
Two lockfiles present? The canonical one is named in `AGENTS.md` or the lessons. Never run the other manager.
- bun.lock -> `bun add <pkg>` (`-d` dev) - `bun remove` - `bun why <pkg>` - `bun audit`
- pnpm-lock.yaml -> `pnpm add` - `pnpm remove` - `pnpm why` - `pnpm audit`
- yarn.lock -> `yarn add` - `yarn remove` - `yarn why`
- package-lock.json -> `npm install <pkg>` - `npm uninstall` - `npm explain <pkg>` - `npm audit`
- Cargo.lock -> `cargo add` - `cargo remove` - `cargo tree -i <crate>` - `cargo audit` if installed
- go.sum -> `go get <mod>@<ver>` then `go mod tidy` - `go mod why -m <mod>` - `govulncheck ./...` if installed
- uv.lock -> `uv add` - `uv remove` - `uv tree`; poetry.lock -> `poetry add` / `poetry remove`; plain requirements.txt -> edit, then `python -m pip install -r requirements.txt` inside the project venv - `pip-audit` if installed
- composer.lock -> `composer require` - `composer remove` - `composer why <pkg>` - `composer audit`
- Gemfile.lock -> `bundle add` - `bundle remove`; .NET -> `dotnet add package` - `dotnet list package --vulnerable --include-transitive`
- pubspec.lock -> `dart pub add` (`flutter pub add`) - `dart pub deps`; mix.lock -> edit mix.exs, `mix deps.get` - `mix deps.tree`
- pom.xml / build.gradle* -> edit the build file - `mvn dependency:tree` / `gradle dependencies`

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER hand-edit a lockfile - it holds resolved versions and integrity hashes, and the tracking hook flags it. Instead run the manager. If a lockfile was hand-edited, revert it and reinstall.
2. NEVER invent a version from memory. Instead read the lockfile or installed version (`npm ls <pkg>`, `cargo tree`, `go list -m <mod>`, `python -m pip show <pkg>`) or the registry (`npm view <pkg> version`, `/research-docs`), then run the tests with it.
3. Add a dependency only when needed - each one is supply-chain and upgrade cost. First search for an existing helper or an already-installed package, prefer the standard library, and name the reason in your Worker Report. A new framework or large package not named in your brief -> report `INPUT GAP:` (the orchestrator asks the user).
4. Use the manager's add/remove command where one exists - it updates manifest and lockfile together. Maven, Gradle and mix: edit the build file, then resolve.
5. Resolve a version conflict by checking who needs which version (`why`, `tree -i`), not by picking the newest number - that can turn a clear resolver error into a runtime regression. Keep one declaration per dependency.
6. Test, lint and build tools go in dev dependencies (`-d`/`-D`, `--dev`, `[dev-dependencies]`, `require-dev`, `group :development`), never in runtime dependencies.
7. NEVER use unbounded specs (`*`, `latest`, empty) - they resolve differently tomorrow. Follow the manifest's existing range style (`^`, `~`, exact).
8. Only with the user's OK in your brief: upgrading a major version, `npm audit fix --force` (it can apply breaking majors), or a command that sends package data to an external service beyond a normal install or the manager's `audit`. Otherwise report `BLOCKED:` with the exact command.

## Pitfalls Flash models get wrong
- `npm install` in a bun or pnpm project creates a second lockfile. Revert the file you created and use the right manager.
- Monorepo: install in the package that imports it (`npm install -w <ws>`, `pnpm add --filter <pkg>`, `bun add --cwd <dir>`), not at the root.
- `go get` without `go mod tidy` leaves go.mod/go.sum inconsistent; let `tidy` manage `// indirect` lines.
- Python: never `pip install` into the global interpreter. Never list stdlib modules or obsolete backports (`dataclasses`, `pathlib`, `typing`, `enum34`, `futures`) for modern Python.
- A library that lists the same package in `peerDependencies` and `devDependencies` is intentional, not a conflict.
- A clean audit is not proof of safety, and a finding in a dev-only transitive package may be low risk. Report severity and path; do not auto-fix silently.
- Changing a manifest field (engines, `type`, workspaces, Cargo features) changes the whole build. Run the full verify, not one test.

## Example - bad -> good
```jsonc
// BAD: hand-edited manifest, invented version, test tool in runtime deps
"dependencies": { "zod": "^3.99.0", "vitest": "latest" }
```
```sh
# GOOD: ask the manager; it resolves real versions and updates bun.lock
bun why zod
bun add zod
bun add -d vitest
```

## Before finishing
- [ ] Manager taken from the lockfile; only that lockfile changed, and only via the manager
- [ ] No invented versions, no `*`/`latest`; dev tools in dev dependencies
- [ ] Each new dependency justified in the Worker Report
- [ ] Install succeeded, then `node .agents/scripts/verify.mjs` passes
