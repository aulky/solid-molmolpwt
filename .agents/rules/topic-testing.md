---
trigger: glob
globs: "**/*.test.*,**/*.spec.*,**/test_*.py,**/*_test.py,**/conftest.py,**/*_test.go,**/*Test.java,**/*Test.kt,**/*Tests.cs,**/*_spec.rb,**/*_test.exs,**/playwright.config.*,**/vitest.config.*,**/jest.config.*"
description: "Testing card: runner commands, test invariants, flakiness and tamper pitfalls, bad->good example. Loaded when editing test files or test-runner configs."
---
# Testing - topic card
Principles guide: `.agents/guides/principles/testing-strategy.md` - read it before choosing a test level, adding mocks or fakes, or fixing a flaky test. Procedures: `/write-tests` (`test-engineer`: unit, integration, API/CLI), `/e2e-test` (`e2e-tester`: browser, Playwright) - the TEST phase of `/orchestrate`.

## Toolchain (use the project's own scripts and config first)
- Find the runner: `scripts.test` in package.json, or the config file present (`vitest.config.*`, `jest.config.*`, `playwright.config.*`, `[tool.pytest]` in pyproject.toml, go.mod, Cargo.toml). Use it. NEVER add a second runner.
- Run ONE file or test first, never in watch mode:
  - Vitest `npx vitest run <file> -t "<name>"` - Jest `npx jest <file> -t "<name>"` - Playwright `npx playwright test <file> --reporter=line`
  - pytest `python -m pytest -q <file>::<test>` (`uv run pytest` when uv.lock exists) - Go `go test ./<pkg> -run '^TestX$' -count=1` - Rust `cargo test <name>`
  - JVM `./mvnw -q test -Dtest=<Class>` or `./gradlew test --tests <Class>` - .NET `dotnet test --filter <Name>` - Ruby `bundle exec rspec <file>:<line>` - Elixir `mix test <file>:<line>`
- Bun projects: `bun run test` runs the package script; `bun test` is Bun's own runner, a different tool. Use `bunx` instead of `npx`.
- Before finishing: `node .agents/scripts/verify.mjs`. The Stop gate needs a pass after your last edit.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER delete, skip or weaken a test or assertion to get green - tests encode requirements. Instead fix the code, or report the test as wrong with evidence (quote the requirement). The Stop gate flags new `.skip(`, `it.only`, `xit(`, `@Disabled`, `#[ignore]`, `t.Skip(`, `@pytest.mark.skip`.
2. MUST see a new test fail for the right reason before the fix makes it pass - a test that never failed may test nothing. Bug fix: the regression test comes from the `debugger` (EXPLORE) and is read-only unless it is in your OWNED FILES; missing -> report `INPUT GAP:`.
3. NEVER special-case tests in production code (hard-coded return values, `if (process.env.NODE_ENV === "test")`) - it hides the bug. Instead implement the general behaviour.
4. MUST keep tests deterministic: no real sleeps, wall clock, unseeded randomness, network or test-order dependence - flaky tests get ignored. Instead use fake timers or clocks, fixed seeds, fakes at the boundary, fresh setup per test.
5. Test observable behaviour through the public API, not private internals - internals change in refactors. Mock only boundaries (HTTP, DB, clock, filesystem), never the unit under test.
6. One behaviour per test, Arrange-Act-Assert, and a name that states it ("returns 404 when the user is missing").
7. NEVER update snapshots or golden files blindly (`-u`, `--update-snapshots`) - that accepts regressions. Instead read the diff and state why the new output is correct.

## Pitfalls Flash models get wrong
- An async test without `await` passes before the assertion runs. Await every promise, `expect(...).rejects`, and every Playwright `expect`.
- `vitest` without `run` can start watch mode and hang the command. Always `vitest run`.
- `.only` / `fit` left in the file silently skips the rest of the suite.
- Playwright: `page.waitForTimeout()` is for debugging only and makes tests flaky. Use web-first assertions (`await expect(locator).toBeVisible()`) and `getByRole` / `getByLabel` / `getByTestId`, not CSS chains.
- `toBeTruthy()` / `assert x` passes on wrong values. Assert exact values (`toBe(90)`, `toEqual({...})`, `assert x == 90`).
- Asserting only that a mock was called proves wiring, not behaviour. Assert the result or the side effect.
- Shared mutable state (module-level arrays, leftover DB rows, `scope="session"` fixtures) causes order-dependent failures. Reset in `beforeEach` or fixtures.
- Go: a cached `ok` hides reruns; use `-count=1`. Table tests use `t.Run(name, ...)`; `t.Parallel()` needs independent state.
- Dates and money: pin time zone and locale in the test, compare integers or decimals, not floats.
- Editing `conftest.py` or a runner config affects every test below it. Run the full suite after such edits.

## Example - bad -> good
```ts
// BAD: shared fixture, promise not awaited, truthy assertion
const cart = makeCart();
test("discount", () => {
  applyDiscount(cart, "SAVE10");
  expect(cart.total).toBeTruthy();
});
```
```ts
// GOOD: fresh state, awaited, exact value, behaviour in the name
test("SAVE10 takes 10% off the subtotal", async () => {
  const cart = makeCart({ items: [{ price: 50, qty: 2 }] });
  await applyDiscount(cart, "SAVE10");
  expect(cart.total).toBe(90);
});
```

## Before finishing
- [ ] New or changed behaviour has a test that failed before the fix
- [ ] No new skip/only/ignore, no weakened assertions, no blind snapshot updates
- [ ] No sleeps, real network or wall-clock dependence added
- [ ] Single test passes, then `node .agents/scripts/verify.mjs` passes
