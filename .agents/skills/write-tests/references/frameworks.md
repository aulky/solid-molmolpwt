# Test frameworks per ecosystem: defaults, escape hatches, commands

Rule for every row: use what the package already uses. The default applies only when the package has no test
framework yet. Never add a second runner to a package. Run commands from the package root with the package
manager or wrapper the repo uses, and prefer the project's own scripts (`package.json`, `composer.json`, `Makefile`).
Last verified 2026-09: local runs with Node 25 (`node:test`), Go 1.26, Rust 1.97 (edition 2024), Python 3.14 +
pytest 9, Java 25 + JUnit 6.1 and the Flutter CLI help; docs for Vitest 4.1, Jest, PHPUnit 13, Pest, xUnit v3,
mix, RSpec 3.13, Laravel, Spring Boot, tokio and .NET `FakeTimeProvider`. Everything else is long-standing API;
if a flag is rejected, run the tool's `--help` instead of guessing.

## Detection table
| Signal in the repo | Use | Default when nothing is set up |
|---|---|---|
| `vitest` devDependency or `vitest.config.*` | vitest | vitest (Vite/Solid/Vue/Svelte/React apps) |
| `jest` devDependency, `jest.config.*` or a `"jest"` key | jest | - |
| Node library or scripts, no runner, zero-dependency wanted | `node:test` | `node:test` for plain Node scripts |
| `bun test` in scripts / `deno.json` tasks | `bun test` / `deno test` | - |
| `pytest` in deps, `conftest.py`, `[tool.pytest.ini_options]` | pytest | pytest |
| `Cargo.toml` | `cargo test` (`cargo nextest run` only if `.config/nextest.toml`) | `cargo test` |
| `go.mod` | `go test` (+ testify only if in `go.mod`) | `go test` |
| `pestphp/pest` in require-dev or `tests/Pest.php` | Pest | Pest for Laravel, else PHPUnit |
| `phpunit.xml(.dist)` without Pest | PHPUnit | - |
| `junit-jupiter` in pom/gradle | JUnit Jupiter (JUnit 5 or 6) | JUnit Jupiter |
| `*.csproj` referencing xunit / NUnit / MSTest | that one | xUnit |
| `spec/` + `rspec` in Gemfile / `test/` + minitest | RSpec / Minitest | RSpec, Minitest in Rails apps |
| `mix.exs` | ExUnit | ExUnit |
| `pubspec.yaml` with `flutter:` / without | `flutter test` / `dart test` | same |
| `Package.swift` | the suite in use (Swift Testing or XCTest) | Swift Testing |
| `CMakeLists.txt` with `enable_testing()` | GoogleTest / Catch2 / doctest via `ctest` | GoogleTest |

## JavaScript / TypeScript
- **Files:** `<name>.test.ts(x)` next to the source unless the repo uses `tests/` or `__tests__/`; the config's `include` glob (e.g. `src/**/*.test.tsx`) decides.
- **Run one:** `bunx vitest run <file> -t "<name>"` (bun). With npm `npx vitest run ...`, pnpm `pnpm exec vitest run ...`.
  Always `vitest run`: plain `vitest` starts watch mode in an interactive terminal. Jest: `npx jest <file> -t "<name>"`.
  node:test: `node --test <file>` and `--test-name-pattern="<regex>"`.
- **Table:** `test.each([[1, 2, 3], [0, 0, 0]])("adds %i + %i", (a, b, sum) => { expect(add(a, b)).toBe(sum) })`.
- **Setup:** `beforeEach`/`afterEach`. DOM tests need a DOM environment: config `environment: "jsdom"` or the file
  comment `// @vitest-environment jsdom`.
- **Components:** Solid: `render(() => <Counter />)` from `@solidjs/testing-library` (pass a function, not the element;
  there is no `rerender`, drive updates through signals). React: `render(<Counter />)` from `@testing-library/react`.
  Query like a user: `screen.getByRole("button", { name: "Save" })`, then `getByLabelText`, `getByText`; `getByTestId` last.
  `fireEvent.click(el)`, or `@testing-library/user-event` if installed. Use `findBy*` for content that appears later.
- **Errors:** `expect(() => parse("")).toThrow(/empty/)`; async: `await expect(load()).rejects.toThrow("404")`.
- **Fakes:** `vi.fn()`, `vi.spyOn(obj, "method")`, `vi.mock("./mod", () => ({ fetchUser: vi.fn() }))` (hoisted to
  the top of the file; for variables used inside the factory use `vi.hoisted`). `afterEach(() => vi.restoreAllMocks())`.
  Jest: same names on `jest`. node:test: `mock.fn()`, `mock.method(obj, "m")`.
- **Time:** `vi.useFakeTimers()`, `vi.setSystemTime(new Date("2026-01-15T12:00:00Z"))`, `vi.advanceTimersByTime(ms)`,
  `await vi.runAllTimersAsync()`, and `vi.useRealTimers()` in `afterEach`. Jest: `jest.useFakeTimers()`,
  `jest.setSystemTime(...)`, `jest.advanceTimersByTime(ms)`. node:test: `mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 })`,
  `mock.timers.tick(ms)`, `mock.timers.reset()`. Polling: `await vi.waitFor(() => expect(x).toBe(1))`, never a sleep.
- **Order/repeat:** `vitest run --sequence.shuffle` (seed with `--sequence.seed <n>`); repeat with `repeat-run.mjs`.
- **Coverage:** `vitest run --coverage` (needs `@vitest/coverage-v8` or `-istanbul`), `jest --coverage`,
  `node --test --experimental-test-coverage`.
- **Pitfalls:** `toBe` on objects compares identity (use `toEqual`/`toStrictEqual`); forgetting `await` on
  `expect(...).rejects` makes the test pass vacuously; snapshot updates (`-u`) only after reading the diff;
  Solid props destructured in the component lose reactivity, so a test that renders once can miss the bug; assert after an update.

## Python
- **Runner:** `uv run pytest` when `uv.lock` exists, `poetry run pytest` for `poetry.lock`, else `python -m pytest`
  (on this machine `python`, never `python3`).
- **Files:** `tests/test_<module>.py` (or the repo's layout); functions `test_<behaviour>`; shared fixtures in `conftest.py`.
- **Run one:** `python -m pytest -q tests/test_slug.py::test_slugify`; one parametrized case: `"tests/test_slug.py::test_slugify[empty]"`;
  by expression `-k "slug and not unicode"`; stop at first failure `-x`; rerun last failures `--lf`.
- **Table:** `@pytest.mark.parametrize(("text", "expected"), [("Hello World", "hello-world"), ("", "")], ids=["basic", "empty"])`.
- **Setup:** built-in fixtures `tmp_path`, `monkeypatch` (`setenv`, `delenv`, `setattr`), `capsys`, `caplog`. Keep the default
  function scope; wider scopes share state between tests.
- **Errors:** `with pytest.raises(ValueError, match="qty"):`; floats: `assert total == pytest.approx(0.3)`.
- **Fakes:** `monkeypatch.setattr(module, "fetch", fake_fetch)` or `unittest.mock.patch("pkg.orders.fetch", autospec=True)`.
  Patch where the name is looked up (the module that imports it), not where it is defined.
- **Time:** pass `now`/a clock into the code; use `freezegun` or `time-machine` only if already a dependency.
- **Async:** whichever plugin the repo has: `pytest-asyncio` (`@pytest.mark.asyncio`) or anyio (`@pytest.mark.anyio`).
- **Frameworks:** Django: `pytest-django` (`@pytest.mark.django_db`) or `python manage.py test`. FastAPI: `TestClient(app)`
  and `app.dependency_overrides[get_db] = fake_db` (clear it after the test).
- **Order/repeat:** `pytest-randomly` shuffles when installed (`-p no:randomly` to pin order while debugging).
- **Coverage:** `pytest --cov=<package>` (pytest-cov). Property-based: `hypothesis` if present.

## Rust
- **Files:** unit tests in the same file: `#[cfg(test)] mod tests { use super::*; #[test] fn rejects_zero() { ... } }`;
  integration tests in `tests/<name>.rs` (public API only); examples in `///` doc comments run as doc tests.
- **Run one:** `cargo test rejects_zero` (substring); exact: `cargo test tests::rejects_zero -- --exact`; one integration
  file: `cargo test --test api`; show prints: `-- --nocapture`; doc tests only: `cargo test --doc`.
- **Table:** loop over `[(input, want), ...]` with `assert_eq!(got, want, "case {input:?}")`, or `rstest` if a dependency.
- **Errors:** `assert!(matches!(parse(""), Err(ParseError::Empty)))`; panics: `#[should_panic(expected = "divisor must be non-zero")]`;
  a test may return `Result<(), E>` and use `?`.
- **Async/time:** `#[tokio::test]`; paused clock with `#[tokio::test(start_paused = true)]` or `tokio::time::pause()`
  (needs tokio features `test-util` and `time`).
- **Fakes:** define a trait at the boundary and pass a hand-written fake; `mockall` only if already used. Temp dirs:
  `tempfile` if a dev-dependency.
- **Pitfalls:** tests run in parallel threads: no shared globals; in edition 2024 `std::env::set_var` is `unsafe` and
  races other tests, so pass config explicitly instead. `--test-threads=1` is a diagnosis, not a fix.
- **Snapshots/properties:** `insta` / `proptest` if present (`cargo insta review` before accepting).

## Go
- **Files:** `x_test.go` beside `x.go`; `package x` for white-box, `package x_test` for public-API tests.
- **Run one:** `go test ./parser -run 'TestParse/empty_input' -v -count=1` (subtest spaces become `_`; `-count=1` bypasses the cache).
- **Table:** `tests := []struct{ name string; in string; want int; wantErr error }{...}` then
  `for _, tc := range tests { t.Run(tc.name, func(t *testing.T) { ... }) }`.
- **Helpers:** `t.Helper()`, `t.TempDir()`, `t.Setenv()` (not allowed with `t.Parallel()`), `t.Cleanup()`, `t.Context()`
  and `t.Chdir()` (Go 1.24+). `t.Fatalf` when continuing is pointless, `t.Errorf` otherwise.
- **Errors:** `errors.Is(err, ErrNotFound)` / `errors.As`, never string comparison of `err.Error()` unless that is the contract.
- **HTTP:** `httptest.NewRecorder()` for handlers, `httptest.NewServer(h)` for clients.
- **Time/concurrency:** inject a clock, or `synctest.Test(t, func(t *testing.T) { ... })` from `testing/synctest`
  (Go 1.25+): inside the bubble `time.Sleep`/timers use a fake clock that advances when all goroutines block.
- **Golden files:** `testdata/<case>.golden` plus an `-update` flag you define; `testdata/` is ignored by the build.
- **Order/repeat/race:** `-shuffle=on`, `-count=20`, `-race` (needs cgo and a working 64-bit C compiler; on
  Windows it often fails to build: report it as SKIP, not PASS).
- **Fuzz/bench:** `func FuzzX(f *testing.F)` with `go test -fuzz=FuzzX -fuzztime=30s ./pkg`; benchmarks `for b.Loop() { ... }` (Go 1.24+).
- **Coverage:** `go test -cover ./...` or `-coverprofile=cover.out`.

## PHP
- **Runner:** `php vendor/bin/pest` or `php vendor/bin/phpunit` (the `php` prefix works in PowerShell and POSIX);
  Laravel: `php artisan test`.
- **Run one:** `php vendor/bin/pest --filter "rejects negative qty"`, `php vendor/bin/phpunit --filter testRejectsNegativeQty`,
  `php artisan test --filter=testRejectsNegativeQty`.
- **Pest:** `it("rejects negative qty", function () { expect(fn () => total(1, -1))->toThrow(InvalidArgumentException::class); });`
  tables: `->with([[1, 100], [3, 300]])`; `beforeEach(...)`; `describe(...)`.
- **PHPUnit:** `final class CartTest extends TestCase`; attributes `#[Test]`, `#[DataProvider('cases')]` with
  `public static function cases(): array`. PHPUnit 12+ removed docblock annotations (`@test`, `@dataProvider`), so
  use attributes. Exceptions: `$this->expectException(X::class)` before the call. Prefer `assertSame` over `assertEquals`.
- **Laravel:** `RefreshDatabase` trait, model factories, `$this->getJson("/api/orders/1")->assertOk()->assertJsonPath("data.id", 1)`,
  fakes `Http::fake()`, `Queue::fake()`, `Mail::fake()`, `Event::fake()`; time `$this->travelTo(...)`, `$this->travel(5)->days()`,
  `$this->freezeTime()`, `$this->travelBack()`. Do not mock `Request` or `Config`: pass input to `get`/`post`, use `Config::set`.
- **Order/coverage:** PHPUnit `--order-by random --random-order-seed 42`; coverage `--coverage` needs Xdebug or PCOV.

## JVM (Java, Kotlin)
- **Framework:** JUnit Jupiter (`org.junit.jupiter.api`), the same API in JUnit 5 and JUnit 6. Keep JUnit 4
  (`org.junit.Test`) only in modules that still use it; TestNG or Kotest only if the repo uses them.
- **Files:** `src/test/java/<same package>/<Class>Test.java` (Kotlin: `src/test/kotlin`).
- **Run one:** Maven `./mvnw -q test -Dtest=PriceCalculatorTest#multiplies`; Gradle
  `./gradlew test --tests "com.example.PriceCalculatorTest.multiplies"` (Windows wrappers: `mvnw.cmd`, `gradlew.bat`).
- **Table:** `@ParameterizedTest(name = "{0} x {1} = {2}")` + `@CsvSource({"100, 3, 300", "0, 5, 0"})`, or `@ValueSource`/`@MethodSource`.
- **Structure:** `@Nested` classes per scenario, `@DisplayName("rejects negative quantity")`, `@TempDir Path dir`.
- **Errors:** `var ex = assertThrows(IllegalArgumentException.class, () -> calc.totalCents(1, -1)); assertTrue(ex.getMessage().contains("qty"));`
  Group related checks with `assertAll(...)`. AssertJ (`assertThat(x).isEqualTo(y)`) and Mockito only if present.
- **Time:** inject `java.time.Clock`; in tests `Clock.fixed(Instant.parse("2026-01-15T12:00:00Z"), ZoneOffset.UTC)`.
- **Spring Boot:** slice tests first (`@WebMvcTest`, `@DataJpaTest`), `@SpringBootTest` only for wiring. Bean mocks:
  `@MockitoBean` (`org.springframework.test.context.bean.override.mockito`); `@MockBean` is deprecated since Boot 3.4
  and removed in Boot 4. Testcontainers only if present.
- **Order:** random method order via `junit.jupiter.testmethod.order.default=org.junit.jupiter.api.MethodOrderer$Random`
  in `src/test/resources/junit-platform.properties`. Coverage: JaCoCo if configured.

## .NET (C#)
- **Framework:** xUnit by default; NUnit (`[Test]`, `[TestCase]`) or MSTest (`[TestMethod]`, `[DataRow]`) when the test
  project already references them. xUnit v3 (`xunit.v3*` packages) test projects are executables (`OutputType Exe`);
  the attributes are the same as v2.
- **Files:** a separate `<Project>.Tests` project; one class per unit, `OrderServiceTests`.
- **Run one:** VSTest: `dotnet test --filter "FullyQualifiedName~OrderServiceTests"`. Microsoft Testing Platform:
  `dotnet test -- --filter-class OrderServiceTests` (SDK 8/9) or `dotnet test --filter-class OrderServiceTests`
  (SDK 10+ with MTP enabled in `global.json`). `dotnet test -?` lists what your project accepts.
- **Table:** `[Theory]` + `[InlineData(100, 3, 300)]` or `[MemberData(nameof(Cases))]`.
- **Asserts:** `Assert.Equal(expected, actual)` (expected first), `Assert.Throws<ArgumentException>(() => ...)`,
  `await Assert.ThrowsAsync<HttpRequestException>(() => ...)`.
- **Setup:** xUnit creates a new class instance per test (constructor = setup, `IDisposable`/`IAsyncLifetime` = teardown);
  expensive read-only setup in `IClassFixture<T>`. Cancellation in v3: `TestContext.Current.CancellationToken`.
- **Time:** inject `TimeProvider`; tests use `FakeTimeProvider` (`Microsoft.Extensions.TimeProvider.Testing`):
  `Advance(TimeSpan)` / `SetUtcNow(...)` fire due timers.
- **Web:** `WebApplicationFactory<Program>` (`Microsoft.AspNetCore.Mvc.Testing`). Mocks: NSubstitute or Moq if present.

## Ruby
- **RSpec:** `bundle exec rspec spec/models/order_spec.rb:42`; by name `-e "returns 0"`; `--only-failures` and
  `--next-failure` need `config.example_status_persistence_file_path`; order-dependent failures: `--order random --seed 1234`
  then `--bisect`.
  `RSpec.describe Order do describe "#total" do context "when empty" do it "returns 0" do expect(order.total).to eq(0) end ...`;
  `let` (lazy) / `let!`; errors `expect { order.add(-1) }.to raise_error(ArgumentError, /qty/)`;
  `instance_double(Payment, charge: true)` over bare doubles (it checks the interface).
- **Minitest/Rails:** `bin/rails test test/models/order_test.rb:42`. Time: `travel_to(Time.zone.parse("2026-01-15 12:00"))`
  (ActiveSupport `TimeHelpers`); FactoryBot if present; request specs over controller specs. Coverage: SimpleCov if configured.

## Elixir
- **Files:** `test/<path>_test.exs`; `use ExUnit.Case, async: true` unless tests share global state (Ecto SQL sandbox makes DB tests async-safe).
- **Run one:** `mix test test/cart_test.exs:12`; `--failed`; `--seed 0` fixes the order; `--repeat-until-failure 50`
  hunts flakes; `--max-failures 1`.
- **Style:** `describe "total/1" do test "returns 0 for an empty cart" do assert Cart.total([]) == 0 end end`; pattern
  asserts `assert {:ok, %Order{id: id}} = Orders.create(attrs)`; `assert_raise ArgumentError, ~r/qty/, fn -> ... end`; `refute`.
- **Phoenix/fakes:** `ConnCase`, `DataCase`; Mox for behaviours if present (`expect/3`, `verify_on_exit!`);
  `ExUnit.CaptureLog.capture_log/1`; `doctest MyModule`. Time: pass `now` in or configure a clock module.

## Dart / Flutter
- **Runner:** Dart `dart test` (`package:test`); Flutter `flutter test` (`flutter_test`). Files `test/<name>_test.dart`.
- **Run one:** `dart test test/cart_test.dart -N "plain name"` (`-n` = regex); `flutter test test/cart_test.dart --plain-name "name"` (`--name` = regex).
- **Style:** `group(...)`, `test(...)`, `setUp`, `tearDown`, `expect(actual, equals(x))`, `expect(() => f(), throwsA(isA<FormatException>()))`.
- **Widgets:** `testWidgets("increments", (tester) async { await tester.pumpWidget(const MaterialApp(home: Counter())); await tester.tap(find.byIcon(Icons.add)); await tester.pump(); expect(find.text("1"), findsOneWidget); });`
  `pumpAndSettle()` waits for animations and times out on endless ones (spinners): use `pump(duration)` there.
- **Goldens:** `matchesGoldenFile("goldens/card.png")`; `flutter test --update-goldens` only after reviewing the images.
- **Order/fakes:** `--test-randomize-ordering-seed random`; mocktail or mockito if present; `fake_async` or `tester.pump(Duration)` for time.

## Swift
- Swift Testing (`import Testing`, `@Test`, `#expect(a == b)`, `try #require(x)`, `@Test(arguments: [...])`) ships with
  the Swift 6 toolchain; keep XCTest (`XCTestCase`, `XCTAssertEqual`) in suites that use it. Run one: `swift test --filter <name>`.

## C / C++
- Use the framework already wired into CMake (GoogleTest `TEST(Suite, Name)`, Catch2 `TEST_CASE`, doctest). Build, then
  `ctest --test-dir <build dir> -R <regex> --output-on-failure`. GoogleTest binary: `--gtest_filter=Suite.Name --gtest_repeat=20 --gtest_shuffle`.
