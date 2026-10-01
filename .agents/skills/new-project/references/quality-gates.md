# Day-1 quality gates per stack

Goal: on day 1, `node .agents/scripts/verify.mjs` runs format, lint, typecheck and tests for the new project and
prints `VERIFY: PASS`. The script picks up project scripts and config files automatically (see
`.agents/scripts/verify.mjs --list`).

Rule: **use the tool the scaffolder already configured.** Add the default below only for a gate that is missing.
Install tools with the project's package manager as dev dependencies. Take versions from the registry, never
from memory.

## Minimum gate set (every project)

- [ ] Formatter configured and the whole tree formatted once
- [ ] Linter configured with the framework's recommended preset; zero warnings on the scaffold
- [ ] Typecheck (typed languages) in strict mode where the scaffold allows it
- [ ] Unit test runner with ONE real test (a function or component from the scaffold, not `expect(true)`)
- [ ] UI projects: one e2e smoke test (the home page renders, one navigation works)
- [ ] Named scripts/tasks: `lint`, `typecheck`, `test`, `test:e2e` (UI), `build`
- [ ] `.gitignore` covers build output, dependency folders, `.env*` (keep `.env.example`), coverage, test reports
- [ ] `node .agents/scripts/verify.mjs` prints `VERIFY: PASS`

## Defaults with escape hatches

| stack | format + lint | typecheck | unit tests | e2e (UI) |
|---|---|---|---|---|
| TypeScript / JS (Vite, Solid, React, Vue, Svelte, Astro) | Biome (`biome check .`). If the scaffold set up ESLint + Prettier, keep them. | `tsc --noEmit` (script `typecheck`); Svelte: `svelte-check`; Astro: `astro check`; Vue: `vue-tsc --noEmit` | Vitest (`vitest run`). Only if the scaffold uses Jest, keep Jest. | Playwright (`npm init playwright@latest`), 1 smoke spec |
| Next.js | the linter chosen at scaffold time (ESLint or Biome) | `tsc --noEmit` | Vitest | Playwright |
| Angular | `ng lint` after adding the angular-eslint schematic | the build typechecks (`ng build`) | the scaffold's configured runner | Playwright |
| Node server (Hono, Fastify, Express, NestJS) | Biome or the scaffold's ESLint | `tsc --noEmit` | Vitest (NestJS: keep its Jest setup) | API smoke test against the started server |
| Python | Ruff (`ruff check .`, `ruff format --check .`) | mypy or pyright; mypy by default | pytest (`pytest -q`) with at least one test | Playwright for Python for UI apps |
| Django | Ruff | mypy with django-stubs, if the team wants types | pytest + pytest-django (or `manage.py test` if the team uses it) | Playwright |
| Rust | `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` | the compiler | `cargo test` (a unit test plus a `tests/` integration test for APIs) | n/a |
| Go | `gofmt -l .` (must print nothing), `go vet ./...` | the compiler | `go test ./...` | n/a |
| PHP / Laravel | Laravel Pint (`vendor/bin/pint --test`) | PHPStan (`vendor/bin/phpstan analyse`); Larastan for Laravel | Pest (`vendor/bin/pest`), or PHPUnit if the scaffold chose it (`php artisan test` runs either) | Laravel Dusk or Playwright |
| Java / Kotlin (Spring) | the build's formatter plugin if configured (Spotless is common) | the compiler | JUnit 5 via `./mvnw verify` or `./gradlew check` | Playwright for UI |
| .NET | `dotnet format --verify-no-changes`; `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` | the compiler | xUnit (`dotnet new xunit`), `dotnet test` | Playwright for .NET for UI |
| Ruby / Rails | RuboCop (`bundle exec rubocop`); recent `rails new` generates a config | n/a (Sorbet or RBS only if requested) | the scaffold's runner (Minitest `bin/rails test`), or RSpec if the team uses it | Rails system tests or Playwright |
| Elixir / Phoenix | `mix format --check-formatted`, `mix compile --warnings-as-errors` | Dialyzer only if requested | `mix test` | Phoenix LiveView tests / Playwright |
| Dart / Flutter | `dart format --output=none --set-exit-if-changed .`, `dart analyze` / `flutter analyze` | the analyzer | `dart test` / `flutter test` | `integration_test` package |
| Swift | `swift format` (if available in the toolchain; check `swift format --help`) | the compiler | `swift test` | XCUITest for apps |
| C / C++ | clang-format + clang-tidy if configured | the compiler with warnings as errors | CTest (`ctest --test-dir build`) | n/a |

## CI (only if the user wants it)

Mirror the local gates exactly: install with the frozen lockfile, then lint, typecheck, test, build, and e2e
for UI. See `.agents/rules/topic-ci-cd.md` (pin actions, least-privilege tokens, caching, fail fast).

## Bad and good first test

```ts
// bad: proves nothing, and the gate passes even when the app is broken
test("works", () => { expect(true).toBe(true); });

// good: exercises real scaffold code
import { formatPrice } from "./format";
test("formatPrice renders cents with two decimals", () => {
  expect(formatPrice(1999)).toBe("$19.99");
});
```
