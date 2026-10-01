# Package-manager commands per ecosystem

**V** = checked against the installed tool's `--help` or the official docs in 2026-09 (bun 1.3.8, npm 11,
cargo 1.97, go 1.26, uv 0.10 were run locally; composer, dart, deno and dotnet were checked in their docs).
**S** = long-stable, not re-checked; confirm with `--help`. Third-party plugins are marked "(plugin)". Install
them only if the user agrees.

"install exactly" = reproduce the lockfile without changing it. Use it after a rollback and in CI.

## JavaScript / TypeScript

| pm (lockfile) | list outdated | update within ranges | set one package to a version (incl. major) | install exactly | why is it here | audit | tag |
|---|---|---|---|---|---|---|---|
| bun (`bun.lock`) | `bun outdated` | `bun update` | `bun update <pkg>@<ver>` or `bun add <pkg>@<ver>`; all to latest: `bun update --latest` | `bun install --frozen-lockfile` | `bun why <pkg>` | `bun audit` | V |
| npm (`package-lock.json`) | `npm outdated` | `npm update` | `npm install <pkg>@<ver>` | `npm ci` | `npm explain <pkg>` / `npm ls <pkg>` | `npm audit` (`npm audit fix`; never `--force` unreviewed, because it can jump majors) | V |
| pnpm (`pnpm-lock.yaml`) | `pnpm outdated` | `pnpm update` | `pnpm add <pkg>@<ver>` | `pnpm install --frozen-lockfile` | `pnpm why <pkg>` | `pnpm audit` | S |
| yarn 1 (`yarn.lock`, classic) | `yarn outdated` | `yarn upgrade` | `yarn add <pkg>@<ver>` | `yarn install --frozen-lockfile` | `yarn why <pkg>` | `yarn audit` | S |
| yarn 2+ (`yarn.lock` + `.yarnrc.yml`) | `yarn upgrade-interactive` (interactive: ask the user) | `yarn up <pkg>` | `yarn up <pkg>@<ver>` | `yarn install --immutable` | `yarn why <pkg>` | `yarn npm audit` | S |
| deno (`deno.lock`) | `deno outdated` | `deno outdated --update` | `deno outdated --update --latest <pkg>` | `deno install --frozen` (S) | - | - | V |

Useful extras: `npm view <pkg> versions --json`, `npm view <pkg>@<ver> peerDependencies engines`, and
`npm view <pkg> repository.url` (where to find the changelog). After install, look for
`node_modules/<pkg>/CHANGELOG.md`. Monorepos: bun `--filter <ws>` / `-r`; pnpm `-r` / `--filter`.

## Rust (cargo, `Cargo.lock`)

| goal | command | tag |
|---|---|---|
| what would change within semver ranges | `cargo update --dry-run` | V |
| update within ranges | `cargo update` (one crate: `cargo update <crate>`) | V |
| exact version within the range | `cargo update <crate> --precise <ver>` | V |
| major bump | `cargo add <crate>@<major>` (or edit `Cargo.toml`), then `cargo update <crate>` | V |
| install exactly | `cargo build --locked` (or `--frozen` offline) | V |
| why / duplicates | `cargo tree -i <crate>`, `cargo tree -d` | V |
| outdated list | `cargo outdated` (plugin cargo-outdated) | S |
| audit | `cargo audit` (plugin cargo-audit) or `cargo deny check` (plugin cargo-deny) | S |
| edition migration | `cargo fix --edition`, then set `edition` in `Cargo.toml` | S |

## Go (`go.mod` + `go.sum`)

| goal | command | tag |
|---|---|---|
| list available updates | `go list -m -u all` | V |
| update deps to newer minor/patch | `go get -u ./...` (patch only: `go get -u=patch ./...`) | V |
| set one module version | `go get example.com/mod@v1.2.3` | V |
| major v2+ | the import path changes (`example.com/mod/v2`): `go get example.com/mod/v2@latest`, then update the imports | S |
| tidy after changes | `go mod tidy` | S |
| why is it here | `go mod why -m <module>` | S |
| vulnerabilities | `govulncheck ./...` (install: `go install golang.org/x/vuln/cmd/govulncheck@latest`) | S |
| toolchain | `go get go@<version>` / `go get toolchain@patch` | V |

## Python

| pm (lockfile) | list outdated | update within constraints | one package / major | install exactly | why | audit | tag |
|---|---|---|---|---|---|---|---|
| uv (`uv.lock`) | `uv tree --outdated` | `uv lock --upgrade`, then `uv sync` | `uv lock --upgrade-package <pkg>`; major: `uv add "<pkg>>=<X>"` | `uv sync --locked` | `uv tree --invert --package <pkg>` | `uvx pip-audit` (plugin) | V (audit S) |
| poetry (`poetry.lock`) | `poetry show --outdated` | `poetry update` | `poetry add <pkg>@^<X>` | `poetry install` | `poetry show --tree` | - | S |
| pip + pip-tools (`requirements.txt` from `.in`) | `pip list --outdated` | `pip-compile --upgrade` | `pip-compile --upgrade-package <pkg>==<ver>` | `pip install -r requirements.txt` (`--require-hashes` if hashed) | `pipdeptree -r -p <pkg>` (plugin) | `pip-audit` (plugin) | S |

Run `python`, never `python3`, on this machine (lesson L-0002). For manifest hygiene (unpinned deps,
stdlib shadowing), see `.agents/rules/topic-dependencies.md`.

## PHP (composer, `composer.lock`) (V)

| goal | command |
|---|---|
| list outdated (direct only) | `composer outdated --direct` |
| update within constraints | `composer update` (one package: `composer update vendor/pkg --with-dependencies`, or `-w`) |
| major bump | `composer require vendor/pkg:^<X> --with-all-dependencies` (`-W`) |
| install exactly | `composer install` |
| why is it here | `composer why vendor/pkg` (alias of `depends`; `--tree`) |
| audit | `composer audit` |
| raise lower bounds to the installed versions | `composer bump` |
Laravel majors: follow the official upgrade guide for each version you cross, one major at a time.

## Ruby (bundler, `Gemfile.lock`) (S)

| goal | command |
|---|---|
| list outdated | `bundle outdated` |
| update one gem minimally | `bundle update <gem> --conservative` |
| major bump | edit the constraint in `Gemfile`, then `bundle update <gem> --conservative` |
| install exactly | `bundle config set --local frozen true`, then `bundle install` |
| audit | `bundle audit` (plugin bundler-audit) |
Rails majors: `bin/rails app:update` after the bump, and review every file it touches.

## .NET (NuGet)

| goal | .NET 10+ (noun-first) | .NET 9 and earlier | tag |
|---|---|---|---|
| list outdated | `dotnet package list --outdated` | `dotnet list package --outdated` | V |
| set a version | `dotnet package add <Pkg> --version <v>` | `dotnet add package <Pkg> --version <v>` | S |
| vulnerable | `dotnet package list --vulnerable` | `dotnet list package --vulnerable` | S |
| install exactly | `dotnet restore --locked-mode` (needs `packages.lock.json`) | same | S |
With Central Package Management (`Directory.Packages.props`), change the version there, not in each `.csproj`.

## JVM (S)

| tool | list updates | change a version | why | install exactly |
|---|---|---|---|---|
| Maven | `mvn versions:display-dependency-updates` (versions plugin) | edit `pom.xml` (or the BOM/parent version) | `mvn dependency:tree -Dincludes=<group>:<artifact>` | `mvn -B verify` |
| Gradle | `./gradlew dependencyUpdates` (plugin gradle-versions) | edit `gradle/libs.versions.toml` or the build file | `./gradlew dependencyInsight --dependency <name>` | dependency locking if enabled (`--write-locks` to refresh) |
Spring Boot majors: bump the Boot parent/plugin first. Follow the Boot migration guide, and let the BOM manage
the managed dependencies.

## Elixir (mix, `mix.lock`) (S)

`mix hex.outdated` · in range: `mix deps.update <dep>` (all: `mix deps.update --all`) · major: edit `mix.exs`,
then `mix deps.update <dep>` · install exactly: `mix deps.get` · tree: `mix deps.tree` · retired packages:
`mix hex.audit`

## Dart / Flutter (pub, `pubspec.lock`) (V)

`dart pub outdated` · in range: `dart pub upgrade` (one: `dart pub upgrade <pkg>`) · majors: edit the
constraint in `pubspec.yaml` and run `dart pub upgrade <pkg>`, or `dart pub upgrade --major-versions` (updates
ALL resolvable constraints) · install exactly: `dart pub get --enforce-lockfile` · tree: `dart pub deps`.
Flutter projects: the same commands with `flutter pub`.

## Swift (SwiftPM, `Package.resolved`) (S)

In range: `swift package update` (one: `swift package update <pkg>`) · major: edit the requirement in
`Package.swift`, then `swift package update <pkg>` · install exactly: `swift package resolve` · tree:
`swift package show-dependencies`

## Official codemods (check the migration guide; run them only on a clean tree)

Many frameworks ship an upgrade codemod or command. Examples: Next.js `npx @next/codemod@latest <transform>`,
Angular `ng update <pkg>`, Rails `bin/rails app:update`, Rust `cargo fix --edition`. Review the full diff
before verifying.
