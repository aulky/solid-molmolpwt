---
name: write-tests
description: Writes deterministic NON-BROWSER automated tests (unit, integration, API/CLI smoke) - picks the test level, uses the project's framework (per-language defaults with an escape hatch), AAA structure, an edge-case catalogue and anti-flakiness checks. The test-engineer's TEST-phase playbook; browser flows go to /e2e-test. Use to add, write, improve or fix tests, raise coverage, or test a function, endpoint or component.
metadata:
  icon: 🧪
---

# Write tests: level, framework, AAA, edge cases, no flakiness

Used by: `test-engineer` (TEST phase). The `debugger` borrows its conventions for a regression test.

A test earns its place only if it fails when the behaviour breaks and passes every time otherwise.
Default: unit tests in the framework the package already uses. Framework matrix and single-test commands for
each ecosystem: [references/frameworks.md](references/frameworks.md).

Scope: NON-BROWSER tests only - unit, integration, and API/CLI smoke tests driven by tools (`node -e`, the CLI
itself, `curl.exe` against a server the brief says is running). Anything that needs a real browser (click,
navigate, render a page) is a Playwright spec for the `e2e-tester` via `/e2e-test`: list it under `Gaps:` as
`browser flow -> e2e-tester` and do not write it here.

Detect the framework first: read root `AGENTS.md` (Commands, test layout), then the manifests and test config
(`package.json`, `vitest.config.*`, `pyproject.toml`, ...) against the detection table in references/frameworks.md.

## When to use
- A TEST-phase brief of kind: `new` (new behaviour), `regression` (a bug that must stay fixed), `characterization`
  (pin today's behaviour before and after a refactor), or `challenger` (adversarial edge cases, lane L).
- Improve weak tests, fix a flaky unit/integration test, fill a coverage gap.
- Triggers: "add tests", "write a test for", "test this", "coverage", "flaky test", "regression test".

Do NOT use for:
- Browser user flows (Playwright, `e2e/*.spec.ts`) -> `/e2e-test`, owned by the `e2e-tester`.
- A test that fails because the code is wrong -> keep the failing test and report it under `Code bugs found:`;
  the orchestrator routes it to a `debugger` / `fixer`. Never change production code to make it pass.
- Benchmarks or load tests -> `/perf-audit`.
- Making a red suite green by editing tests. Never do that; see the rules in step 8.

## Checklist
Copy this and tick items as you go:
```
- [ ] Behaviours listed (one line each: given / when / then); browser-only ones moved to Gaps -> e2e-tester
- [ ] Level chosen per behaviour (unit | integration | API/CLI) with a reason
- [ ] Framework detected from the repo (frameworks.md row) and single-test command known
- [ ] Nearest existing test viewed; its location, naming, helpers and fixtures copied
- [ ] Tests written in Arrange-Act-Assert, one behaviour per test, behaviour-sentence names
- [ ] Edge cases picked from the catalogue (covered + skipped-with-reason lists)
- [ ] Every new test seen failing once (test-first, regression run before the fix, or expected-value flip)
- [ ] Deterministic: no sleeps, real clock, network, randomness or order dependence; repeat run 10/10
- [ ] `verify.mjs --quick` -> VERIFY: PASS and `verify.mjs --only node:test` -> VERIFY: PASS after the last edit
      (only --quick when a code-bug test is kept); never the full run with build
- [ ] Worker Report written in the test-engineer.md Output format
```

## Procedure
1. **List behaviours.** From the brief's acceptance criteria, the code, or the bug, write one line per observable
   behaviour of the public surface: `given <state/input> when <action> then <result/effect>`. Test what callers
   can observe, not private helpers or call order of internals.
   - A behaviour only observable in a browser: move it to `Gaps: <behaviour> -> e2e-tester`.
   - Verify: every line has a concrete input and an expected output, error or side effect.
2. **Choose the level** per behaviour (lowest level that can observe it):
   | Level | Use for | Boundaries |
   |---|---|---|
   | unit | pure logic, parsing, validation, state transitions, components rendered in isolation (jsdom) | fake the clock, randomness, network |
   | integration | DB queries, HTTP handlers, file I/O, framework wiring, several modules together | real local DB/in-memory server only if the repo already does it; fake third-party APIs |
   | API/CLI smoke | a built command or an endpoint exercised through a tool | run the command / call the handler, assert exit code and output |
   | browser (e2e) | a user journey in a real browser | not yours: `Gaps: -> e2e-tester` (`/e2e-test`) |
   - Mock only what you do not own or what is slow or non-deterministic. Prefer a fake (in-memory implementation)
     over a mock with call expectations. Never mock the unit under test.
   - Verify: each behaviour line has a level and a one-word reason.
3. **Detect the framework.** Check the manifest (devDependencies, `composer.json` require-dev, `pyproject.toml`,
   `Cargo.toml` dev-dependencies, `*.csproj` package references, `Gemfile`, `mix.exs`, `pubspec.yaml`) and config files
   (`vitest.config.*`, `jest.config.*`, `pytest.ini`, `phpunit.xml`, `.rspec`). Pick the row in
   [references/frameworks.md](references/frameworks.md).
   - Default with escape hatch: use the ecosystem default only when the package has no test framework yet
     ("Use vitest. Only if the package already uses jest, use jest.").
   - NEVER add a second test framework to a package, because two runners split config, mocks and CI. Instead use
     the existing one.
   - NEVER install a package or edit a lockfile, because dependency changes are a separate planned task. Instead
     report status BLOCKED with `INPUT GAP: needs <install command>` (bun: `bun add -d <pkg>`) and the reason.
   - Verify: you can write the exact command that runs one test file or one test by name.
4. **Copy local conventions.** Find the nearest tests:
   `node .agents/scripts/search.mjs --files --glob '*.test.*'` (or `*_test.go`, `test_*.py`, `*Test.java`, `*_spec.rb`).
   View one or two. Reuse their location, file naming, imports, setup files, factories, fixtures and helpers.
   - Verify: you can name the test file you mirrored (`path`).
5. **Write the tests** (only in files listed in your brief's OWNED FILES).
   - Arrange-Act-Assert, separated by blank lines. One behaviour per test; several asserts are fine when they
     describe the same behaviour.
   - Name = behaviour sentence: `returns 404 when the order does not exist`, not `test2` or `works`.
   - Input variants go in a parametrized table (`test.each`, `@pytest.mark.parametrize`, table-driven `t.Run`,
     `#[DataProvider]`, `@ParameterizedTest`, `[Theory]`), not in copy-pasted tests or loops with `if`.
   - Assert exact values and error types plus message fragments. Weak: `toBeTruthy()`, `assert result`,
     "does not throw". Strong: `toEqual({ id: 1, total: 300 })`, `pytest.raises(ValueError, match="qty")`.
   - Fresh state per test (factories, `beforeEach`, fixtures, `t.TempDir()`, `tmp_path`); no shared mutable globals.
   - Pick edge cases from [references/edge-cases.md](references/edge-cases.md): at least empty, one boundary,
     one invalid input and one error path per public function, unless they cannot occur (say why).
     Challenger kind: at least 6 hostile inputs (empty, max, unicode, negative, concurrent, malformed).
     Characterization kind: assert today's behaviour, even when it looks odd; note the oddity in the report.
   - Verify: the new file runs alone with the single-test command and every test passes (or fails on purpose, step 6).
6. **Prove each test can fail.** A test that never failed proves nothing.
   - New behaviour: write the test first and watch it fail for the right reason (an assertion message, not an
     import, syntax or setup error).
   - Regression: run it against the unfixed code (before the fix lands, or as reported by the debugger).
   - Existing code: flip the expected value in the TEST, run it, see it fail, then restore it exactly.
     test-engineer: flip the expected value in the TEST only, never production code. Only a `debugger` whose
     OWNED FILES list the production file may temporarily break it (flip a condition), and must restore it exactly.
   - Verify: you recorded the failure message for each new test, and every file you flipped is back to its
     original text (view it to confirm).
7. **Prove determinism.** Run the new tests repeatedly:
   `node .agents/skills/write-tests/scripts/repeat-run.mjs --times 10 -- <single-test command>`.
   Also run them in random order if the runner supports it (frameworks.md) and in the full suite.
   Apply [references/flakiness.md](references/flakiness.md) to any failure; never add sleeps or retries.
   - Verify: final line `REPEAT: PASS (10/10)`.
8. **Gate.** Run `node .agents/scripts/verify.mjs --quick`, then `node .agents/scripts/verify.mjs --only node:test`
   (other stacks: `--only <stack>:test`). NEVER run the full `verify.mjs` (it includes the build step), because an
   `e2e-tester` may be building and serving `.output/` in parallel (lane M) and a second build breaks its run on
   Windows (EBUSY/EPERM); the orchestrator's final full run covers the build.
   If you deliberately kept a failing test for a code bug, run only `node .agents/scripts/verify.mjs --quick`
   (it must print `VERIFY: PASS`) and quote the failing test output as "fails by design: code bug". A QUALITY
   GATE message then asks to fix failures -> edit neither the test nor production code; send the FAIL report.
   Before reporting, check the diff of test files against these rules:
   - NEVER delete, skip (`.skip`, `.only`, `xit`, `#[ignore]`, `t.Skip`, `@pytest.mark.skip`, `markTestSkipped`,
     `@Disabled`) or loosen an existing test or assertion to get green, because tests encode requirements.
     Instead report the code bug, or report the test as wrong with evidence.
   - NEVER update snapshots or golden files without reading the diff; an unread snapshot update accepts any bug.
   - NEVER special-case test inputs in production code or add test-only branches.
   - Verify: both runs end `VERIFY: PASS` after your last edit (or `--quick` only, code-bug case); the Stop
     hook's test-tamper check will ask about any skip marker.

## Output
Workers: use the Output format in `.agents/agents/test-engineer.md` exactly; it is authoritative. The block below
copies its body fields, for orchestrator or ad-hoc use. Fail-first proof = `seen failing: yes` per case; the
REPEAT line and both VERIFY lines go on `Evidence:`.
```text
## test-engineer: <PASS | FAIL | BLOCKED> — <T-id>
Kind / framework / level: <new | regression | characterization | challenger> / <name> / <unit | integration | API/CLI>
Cases:
- [x] <behaviour sentence> - pass (seen failing: <yes | no>)
- [ ] <behaviour sentence> - FAIL: <one-line reason>
Code bugs found: <path:line - observed vs expected | none>
Gaps: <untested case - why (edge cases skipped) | browser flows -> e2e-tester | none>
Evidence: `<test command>` -> exit <code>; <key lines>; REPEAT: PASS (10/10); `verify.mjs --quick` and `--only node:test` -> <VERIFY lines>
Files touched: <list with (new | edit) and test count>
Lesson candidates: <one-line "when X, do Y because Z" | none>
```

## References
- [references/frameworks.md](references/frameworks.md) — per-language defaults, escape hatches, run-one commands,
  parametrization, fixtures, mocking, fake time, random order, coverage (JS/TS, Python, Rust, Go, PHP, JVM, .NET,
  Ruby, Elixir, Dart/Flutter, Swift, C/C++).
- [references/edge-cases.md](references/edge-cases.md) — edge-case catalogue by input type plus test-smell table.
- [references/flakiness.md](references/flakiness.md) — causes of flaky tests and the deterministic fix for each.
- [scripts/repeat-run.mjs](scripts/repeat-run.mjs) — run a command N times (`--times`, `--until-fail`, `--json`).
- Strategy (pyramid, TDD, property-based, contract tests, fakes vs mocks): `.agents/guides/principles/testing-strategy.md`.
- Worker contract: `.agents/agents/test-engineer.md`. How the orchestrator briefs it: `/orchestrate`,
  `.agents/skills/orchestrate/references/briefs.md` §test-engineer.
- Browser flows: `/e2e-test` (e2e-tester). Failures in the full suite: `/verify`.
