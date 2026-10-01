# Testing strategy — engineering guide for AI agents
> Scope: what/how to test, TDD, test doubles, property-based/contract testing, snapshot pitfalls, e2e scope, flakiness, coverage, test data builders — language-agnostic. Quick card: `.agents/rules/01-engineering-standards.md`; glob rule: `.agents/rules/topic-testing.md`.
> Last verified: 2026-09 — tool names checked live: fast-check 4.10.x, Hypothesis 6.168.x, proptest 1.11.x, Stryker 10.x (all active); jqwik README says "pure maintenance mode"; `@pact-foundation/pact` 17.1.x README uses `PactV3`; solid-testing-library README: `render(() => <X />)`. Tools below illustrate, not prescribe; the project's defaults (unit and e2e runners) live in root `AGENTS.md`.

## 0. How this guide works
Each section: definition, why it matters, a concrete **check** to run on your own diff, an example, and where it's over-applied.

## 1. Test pyramid vs. testing trophy — pick the shape on purpose
**Definition:** the *pyramid* (Mike Cohn) weights tests unit-heavy: many unit, fewer integration, very few e2e. The *trophy* (Kent C. Dodds) treats static analysis (types/lint) as a free base layer, then weights *integration* heaviest, because in most apps bugs escape at the seams between units.

**Why it matters:** an all-unit suite can be 100% green while the units don't work together (wrong wiring, mismatched contracts); an all-e2e suite is slow, flaky (§9), and a failure doesn't say where.

**How to check:** is the risk in one function's logic, or in how things are wired together (DB + mapping, two services, component + store)? Logic → unit. Wiring → integration. A handful of whole-system journeys → e2e (§8). A multi-component feature tested only by e2e, or only by mocked units, is a red flag.

| Level | Tests what | Count |
|---|---|---|
| Static | Types compile, lints pass | every file, not a "test" |
| Unit | One function/class, collaborators faked | most tests |
| Integration | Real wiring: DB, HTTP layer, component + store | fewer, not skipped |
| E2E | A full journey through the real system | a handful, critical paths |

**Misapplication / over-engineering trap:** treating either shape as a ratio to hit regardless of risk; the trophy for an I/O-free library, where integration tests are just slow units.

## 2. What to test — behavior and risk, not implementation or the framework
**Definition:** test observable behavior through the public interface, not private internals; prioritize by risk (what's likely to break, what's expensive if wrong), not by "does this line have a test yet."

**Why it matters:** a test coupled to internal structure (a private method was called, call order) breaks on every refactor even when behavior is unchanged — the opposite of what a regression suite is for; testing framework code or trivial pass-throughs spends effort on risk that isn't yours.

**How to check:**
- Does the test call the entry point a real caller uses (exported function, HTTP endpoint, rendered output), not a private symbol?
- Would it still pass after a pure refactor that doesn't change behavior? If not, it tests structure, not behavior.
- Is this code your team is likely to get wrong (business rules, edge cases, parsing), or a one-line delegate to a well-tested library — skip dedicated tests for the latter.

**Misapplication / over-engineering trap:** "every function needs a test" yields tests for getters and glue that catch nothing; skipping "obvious" branching logic is what breaks silently later.

## 3. TDD loop and AAA structure
**Definition:** TDD is red → green → refactor: a failing test for the next small behavior (red), the minimum code to pass it (green), then clean up with the tests as a safety net (refactor). AAA (Arrange-Act-Assert, a.k.a. Given-When-Then) is the shape of the test itself: set up state, perform the one action under test, assert the outcome — in that order, with no interleaving.

**Why it matters:** writing the test first designs the interface from the caller's side and gives a fast "is this done" signal; a test that interleaves arrange/act/assert hides which action caused which failure.

**How to check:** one blank line between arrange, act, and assert? One behavior per test (a name with "and" is probably two tests)? Did a test go red *before* the fix — or was it written after, to "confirm" what you built rather than what was specified?

**Example (TypeScript / Vitest) — bad → good:**
```ts
// bad: setup, actions, and assertions interleaved; unclear what's under test
test("cart", () => {
  const cart = new Cart();
  expect(cart.total()).toBe(0);
  cart.add({ price: 10 });
  expect(cart.total()).toBe(10);
});

// good: one behavior, clear AAA blocks
test("total() sums the price of every item in the cart", () => {
  const cart = new Cart();                  // arrange
  cart.add({ price: 10 });
  cart.add({ price: 5 });

  const total = cart.total();               // act

  expect(total).toBe(15);                   // assert
});
```

**Misapplication / over-engineering trap:** dogmatic TDD for exploratory spikes where you don't yet know the interface; explore first, test once the design settles. Literal `// Arrange` comments on one-liners are noise.

## 4. Test doubles: prefer fakes over mocks
**Definition:** a *dummy* fills a required parameter, unused; a *stub* returns canned answers; a *fake* is a working, simplified implementation (an in-memory repo instead of a real database); a *mock* is pre-programmed with call expectations and fails if they don't match; a *spy* records calls for later inspection. Stub/fake verify state; mock/spy verify interactions.

**Why it matters:** a mock asserts *how* code called its collaborator (method, args, order), so it breaks on any refactor that changes the call shape. A fake asserts *what happened* through a real simplified implementation: it survives refactors and actually executes logic (an in-memory map really rejects a duplicate key).

**How to check:** could you write one small in-memory fake per collaborator and reuse it, instead of programming call-expectations per test? Don't mock a type you don't own (a third-party SDK): wrap it in your own interface, then fake that. Each `toHaveBeenCalledWith(...)` on an internal collaborator couples the test to today's implementation.

**Example (Go) — bad → good:**
```go
// bad: mock asserts the exact call shape; breaks if you batch the writes later
ctrl := gomock.NewController(t) // go.uber.org/mock auto-verifies via t.Cleanup
mockRepo := NewMockOrderRepo(ctrl)
mockRepo.EXPECT().Save(gomock.Eq(order)).Times(1).Return(nil)
NewOrderService(mockRepo).Place(order)

// good: a small fake really stores it; assert on resulting state, not call shape
repo := NewInMemoryOrderRepo()
NewOrderService(repo).Place(order)
got, err := repo.FindByID(order.ID)
if err != nil || got.Status != StatusPlaced {
    t.Fatalf("order not persisted as placed: %+v, %v", got, err)
}
```

**Misapplication / over-engineering trap:** writing a fake for a collaborator with genuinely complex behavior you can't cheaply reimplement (a payment gateway's fraud rules) — stub the boundary response instead; a mock is still correct when the *interaction itself* is the requirement, e.g. an email-send triggered exactly once.

## 5. Property-based testing
**Definition:** state a property that must hold for *any* valid input (`decode(encode(x)) == x`, `sort` is idempotent, `add(a,b) == add(b,a)`); the library generates hundreds of inputs and shrinks any failure.

**Why it matters:** examples cover only inputs you thought of; properties explore the rest (empty, unicode, negatives, huge) and shrink failures to a minimal counterexample.

**How to check:** for pure functions with an algebraic invariant (round-trips, idempotence, commutativity), is there a property test, not just 2–3 hand-picked examples? Is the property actually invariant-shaped, not a restatement of the implementation (which proves nothing)?

**Example (Python / Hypothesis):**
```python
from hypothesis import given, strategies as st

@given(st.lists(st.integers()))
def test_sort_is_idempotent(xs):
    once = sorted(xs)
    twice = sorted(once)
    assert once == twice          # sorting a sorted list changes nothing
```
Equivalents: `fast-check` (TS/JS), `proptest` (Rust), `jqwik` (Java, maintenance mode).

**Misapplication / over-engineering trap:** inventing a property for code that has none (most UI, most workflows) tests less than a good example; dropping all examples loses documentation of intent.

## 6. Contract tests
**Definition:** a contract test verifies that a provider (API, message producer) and its consumer agree on a request/response shape through an artifact both sides check independently. Consumer-driven: the consumer's expectations become a contract file that the provider verifies in its own CI.

**Why it matters:** without it, a provider renames a field and finds out in production; cross-service e2e needs both stacks running and is slow and flaky (§8–9).

**How to check:** when a shape another service consumes changes, is there a contract (recorded interaction, schema, or generated type check) verified in CI on *both* sides, not just "they'll notice"? Does provider verification run against every consumer contract on file?

**Example (TypeScript / Pact JS, consumer side):** the recorded interaction becomes a pact file that the provider's CI replays against the real provider.
```ts
import { PactV3, MatchersV3 } from "@pact-foundation/pact";
const pact = new PactV3({ consumer: "web", provider: "orders-api" });

test("GET /orders/42 returns id and total", () => {
  pact.given("order 42 exists")
    .uponReceiving("a request for order 42")
    .withRequest({ method: "GET", path: "/orders/42" })
    .willRespondWith({ status: 200, body: MatchersV3.like({ id: 42, total: 1500 }) });
  return pact.executeTest(async (mock) => {
    expect((await getOrder(mock.url, 42)).total).toBe(1500);
  });
});
```

**Misapplication / over-engineering trap:** full contract infrastructure (broker, provider states, CI wiring) for two services owned by one team in one repo — a shared type import, checked by the compiler, is a cheaper contract; reserve this for boundaries crossing deploy or ownership.

## 7. Snapshot test pitfalls
**Definition:** a snapshot test records an output (DOM, serialized object, CLI text) once and fails when a later run differs; the diff is then accepted (update) or rejected (regression).

**Why it matters:** a broad snapshot (a whole page's DOM) turns any nearby change into a giant diff nobody reads, so reviews degrade into "update snapshot" and the test catches nothing; non-deterministic content (timestamps, random ids) fails for the wrong reason and trains reflex updates.

**How to check:** is the snapshot small (one component, one value), not a whole page? Are non-deterministic fields normalized or excluded? Did you read the diff before `--update`?

**Example (TSX / Vitest + `@solidjs/testing-library`) — bad → good:**
```tsx
// bad: whole-page snapshot embedding a live timestamp — fails every run,
// and any unrelated markup change nearby shows up in the same giant diff
expect(render(() => <Dashboard />).container).toMatchSnapshot();

// good: narrow, deterministic target
const { getByTestId } = render(() => <OrderSummary order={fixedOrder} />);
expect(getByTestId("total").textContent).toMatchInlineSnapshot('"$15.00"');
```
Solid Testing Library takes a function, `render(() => <X />)`; React Testing Library takes the element, `render(<X />)`.

**Misapplication / over-engineering trap:** banning snapshots outright — they're the right tool for structural, reviewable output (a generated SQL query, a serialized schema, a CLI `--help` text); the failure mode is scope and review discipline, not the mechanism.

## 8. E2E scope: keep it thin and deliberate
**Definition:** end-to-end tests drive the real system through its actual entry point (browser, CLI) for a few critical user journeys, not every input variation.

**Why it matters:** pushing every edge case into e2e, the slowest and flakiest level (§1, §9), makes the suite take minutes-to-hours, and one flaky step blocks unrelated work.

**How to check:** does this test cover a *journey* (sign up → verify email → first login), not a single field's validation rule (push that to the validator's unit test)? Are edge cases tested lower, with e2e covering the happy path plus one or two must-not-break failures?

**Example (Playwright, TS) — bad → good:**
```ts
// bad: 15 e2e tests, each really a validator unit test in a browser
test("shows error for invalid email", async ({ page }) => { /* ... */ });
test("shows error for empty email", async ({ page }) => { /* ... */ });
// (x13 more field-level cases)

// good: one e2e journey; field validation is unit-tested on the validator directly
test("user can sign up, verify email, and reach the dashboard", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill("new.user@example.com");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
});
```

**Misapplication / over-engineering trap:** zero e2e tests because "unit + integration cover everything" — they miss real browser behavior and the built app's wiring; keep a handful of critical-journey tests.

## 9. Flakiness: root causes, not retries
**Definition:** a flaky test passes and fails on the same code, nondeterministically. Fix the source of nondeterminism; a retry hides the signal.

**Why it matters:** a team that tolerates flakes stops trusting red builds, so a *real* regression gets rerun-until-green and shipped. Each cause has its own fix:

| Root cause | Symptom | Fix |
|---|---|---|
| Real time / clock | fails near midnight/DST/on CI | inject a fake/frozen clock; never `sleep()` to "wait long enough" |
| Async race | intermittent "not found"/"not yet updated" | wait on the real condition (`waitFor`, Playwright auto-wait), not a fixed delay |
| Shared/leftover state | fails only after test X, or in parallel | isolate data per test (unique ids, rollback, fresh fixture) |
| Real network/3rd-party call | rate limits, blips, outages | fake the boundary (§4) below e2e; e2e hits a stable test env |
| Unseeded randomness | fails ~1% of the time, hard to repro | seed the RNG, or assert the invariant instead of the exact value |
| Test-order dependence | fails only under `--shuffle`/full-suite | remove shared mutable globals; each test sets up its own state |

**How to check:** did a test fail once, pass on rerun, with no code change? Before adding `test.retry(2)`, name which row above it is. `node .agents/scripts/search.mjs 'sleep\(|waitForTimeout\(|setTimeout\(.*,\s*\d{3,}\)' -i <changed test files>` finds fixed-delay waits (Python `time.sleep`, Go `time.Sleep`, Playwright `page.waitForTimeout`, JS `setTimeout`).

**Example (Python) — bad → good:**
```python
# bad: fixed sleep guesses the job's duration; too short = flaky, too long = slow
time.sleep(2)
assert job_store.get(job_id).status == "done"

# good: poll the real condition with a deadline (your own helper; pytest has none)
def wait_until(predicate, timeout=5.0, interval=0.05):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(interval)
    raise AssertionError(f"condition not met within {timeout}s")

wait_until(lambda: job_store.get(job_id).status == "done")
```

**Misapplication / over-engineering trap:** quarantining (skipping) a flaky test and never returning to it is a silent coverage loss, not a fix; track it as time-boxed debt. This kit's Stop hook (`.agents/hooks/quality-gate.mjs`) flags newly added skips.

## 10. Coverage as a signal, not a target
**Definition:** coverage measures which lines *executed*, not whether an assertion checked the result: 100% coverage is compatible with zero assertions.

**Why it matters:** optimizing for a percentage produces tests that just move the number (call the function, assert "did not throw").

**How to check:** use coverage to find *completely untested* files/branches, not as a merge-blocking score. For "well-tested" code, would mutation testing (Stryker for JS/TS, PIT for JVM, `cargo-mutants` for Rust, `mutmut` for Python — break a line, see if a test fails) actually catch it?

**Misapplication / over-engineering trap:** running full mutation testing every commit is expensive — use it on critical modules or a CI schedule, not a per-PR gate; chasing one unreachable `else` for a compiler-exhaustive enum is the type system's job, not a test's.

## 11. Test data builders
**Definition:** a small helper (`anOrder(overrides)`, an Object Mother, a builder) that returns a valid domain object with sensible defaults, so each test overrides only the fields it cares about.

**Why it matters:** without a builder, adding a required field means editing every test that constructs the object; with one, only the defaults change, and each test shows only the fields it cares about.

**How to check:** does a new required field break only the builder (and tests that care about it), or dozens of literals? Does each test show only the fields its assertion depends on?

**Example (PHP) — bad → good:**
```php
// bad: every test repeats the full shape; a new required field breaks them all
$order = new Order(id: 1, customerId: 9, items: [], status: 'pending', currency: 'USD');

// good: builder supplies defaults; the test states only what matters to it
function anOrder(array $overrides = []): Order {
    // PHP 8.1+: string keys unpack into named constructor arguments
    return new Order(...array_merge(
        ['id' => 1, 'customerId' => 9, 'items' => [], 'status' => 'pending', 'currency' => 'USD'],
        $overrides,
    ));
}
$paidOrder = anOrder(['status' => 'paid']);
```

**Misapplication / over-engineering trap:** a configurable factory framework with its own DSL for three domain objects; a plain function per object is enough until real duplication appears (then `factory_boy`, `Fishery`, Laravel model factories).

## Checklist (copyable)
- [ ] Test level matches where the risk actually is, not a fixed pyramid/trophy ratio
- [ ] New tests assert behavior through a public entry point, not private internals
- [ ] AAA, one behavior per test; new logic had a test go red before the fix
- [ ] Collaborators are faked, not mock-asserted on call shape, unless the interaction is the requirement
- [ ] Pure functions with an algebraic invariant have a property test, not just hand-picked examples
- [ ] Cross-boundary changes have a contract check on both sides, not just an e2e hope
- [ ] Snapshots are narrow, deterministic, and every update was actually read before accepting
- [ ] E2E covers journeys, not per-field validation; the suite stays small enough for every PR
- [ ] No new fixed-delay waits; flaky tests are root-caused (§9), not retried or skipped silently
- [ ] Coverage finds untested code; it's not the reason a test was written
- [ ] New domain-object tests use a builder with overrides, not full literals everywhere

## References
- Pyramid: Fowler, "TestPyramid" — https://martinfowler.com/bliki/TestPyramid.html · Trophy: Kent C. Dodds — https://kentcdodds.com/blog/write-tests
- Test doubles: Fowler, "Mocks Aren't Stubs" — https://martinfowler.com/articles/mocksArentStubs.html
- Property-based: https://fast-check.dev/ · https://hypothesis.readthedocs.io/ · https://docs.rs/proptest
- Contract testing: https://pact.io/ · Mutation testing: https://stryker-mutator.io/ · https://pitest.org/ · https://github.com/sourcefrog/cargo-mutants
- Flaky tests: Google Testing Blog — https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
- Related: `.agents/guides/principles/code-review.md`, `error-handling.md`
