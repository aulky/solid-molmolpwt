# PHP — engineering guide
> Scope: modern PHP (8.3–8.5) libraries, services and web apps, framework-agnostic. Audience: agents and engineers writing or reviewing PHP. Laravel specifics live in `.agents/guides/frameworks/laravel.md`.
> Last verified: 2026-09 — php.net release/support pages; PHPStan, Pest, PHPUnit, Pint, PHP-CS-Fixer, Larastan, Composer docs and Packagist; every code sample below was executed on PHP 8.4.22 / 8.5.7 with Pest 5.2 and PHPStan 2.2 (level 10 on `src/`).

## 1. Mental model / philosophy
- **Shared-nothing requests.** Classic PHP builds the world per request and throws it away. That hides bugs (static state, leaks) until the code runs in a long-lived worker (queue consumer, FrankenPHP/RoadRunner/Swoole, Laravel Octane).
- **Opt-in strictness.** `declare(strict_types=1)` + types on every signature and property + PHPStan at a high level are your compiler; treat their errors as build failures.
- **Composer is the module system.** PSR-4 maps namespaces to directories; `require.php` in `composer.json` fixes the syntax you may use; `composer.lock` pins the rest.
- **Values vs services.** Values are immutable (`final readonly class`, enums) and validate in the constructor. Services are stateless, constructor-injected and depend on interfaces at I/O seams (DB, HTTP, clock, filesystem). This split delivers most of SOLID and testability.
- **Boring beats clever.** No magic `__get`/`__call` in domain code, no global helpers with hidden state, composition over inheritance. See `.agents/guides/principles/simplicity.md` and `.agents/guides/principles/design-principles.md`.

## 2. Project structure & tooling
Versions (php.net, 2026-09): 8.5 (released 2025-11-20) and 8.4 are in active support; 8.3 and 8.2 get security fixes only (8.2 until 2026-12-31, 8.3 until 2027-12-31); 8.1 and older are end-of-life. 8.6 is a release candidate (GA scheduled 2026-11-19) — no 8.6 features unless `composer.json` requires `^8.6`.

Layout: `composer.json`, `composer.lock`, `phpstan.neon`, `phpunit.xml`, `pint.json` or `.php-cs-fixer.dist.php`, `src/`, `tests/`, `vendor/` (never edit, never commit).

```json
{
    "require": { "php": "^8.4" },
    "autoload": { "psr-4": { "App\\": "src/" } },
    "autoload-dev": { "psr-4": { "Tests\\": "tests/" } },
    "config": { "sort-packages": true }
}
```

Commands (all work in PowerShell and POSIX shells from the project root; to pick a PHP binary run `php vendor/bin/<tool> ...`):

| Task | Command |
|---|---|
| Install / add dep | `composer install` · `composer require vendor/pkg` · `composer require --dev vendor/pkg` |
| Validate manifest | `composer validate --no-check-publish` |
| Vulnerable deps | `composer audit` |
| PSR-4 mapping errors | `composer dump-autoload --optimize --strict-psr` (exit 1 on a misplaced class) |
| Production install | `composer install --no-dev --classmap-authoritative` |
| Syntax lint | `php -l src/Foo.php` (8.3+ accepts several files) |
| Format check / fix | `vendor/bin/pint --test` / `vendor/bin/pint` (or `vendor/bin/php-cs-fixer check` / `fix`) |
| Static analysis | `vendor/bin/phpstan analyse` (`--memory-limit=1G` on big repos) |
| Tests | `vendor/bin/pest` · `vendor/bin/phpunit` · Laravel: `php artisan test` |
| Kit gate | `node .agents/scripts/verify.mjs --only php` |

Tool notes (verified 2026-09; use the majors the lockfile pins):
- **Tools parse with the PHP they run on**: PHPStan/Pint on 8.4 error on 8.5 syntax (`|>`, `clone($x, [...])`). Run tooling on the newest PHP you target.
- **Composer ≥ 2.10** blocks versions with known security advisories during `update`/`require`/`remove` via `config.policy.advisories.block` (default `true`); the older `config.audit.block-insecure` (2.9+) still works but is deprecated. Upgrade the flagged package — don't disable the block.
- **Style: PER Coding Style 3.x** (PHP-FIG, successor of PSR-12): 4 spaces, braces on their own line, `declare` right after the opening tag, trailing comma in multi-line lists, `fn()` without a space. **Pint** (PHP-CS-Fixer under the hood) defaults to the `laravel` preset (`fn ()`, `! $x`); `{"preset": "per"}` in `pint.json` gives PER. Never hand-format; run the repo's fixer.
- **PHPStan levels 0–10** (10 = max, added in PHPStan 2, rejects implicit `mixed`). New code: level 10. Legacy: highest reachable level + a baseline that only shrinks (`--generate-baseline`, include `phpstan-baseline.neon`). Extras: `phpstan-strict-rules`, `phpstan-deprecation-rules`. Laravel: **Larastan** (include `vendor/larastan/larastan/extension.neon`).
- **Tests:** Pest 5 needs PHP ≥ 8.4 (PHPUnit 13); Pest 4 needs PHP ≥ 8.3 (PHPUnit 12). PHPUnit 12+ reads metadata only from attributes (`#[Test]`, `#[DataProvider]`) — doc-comment annotations are gone.

```neon
# phpstan.neon
parameters:
    level: 10
    paths:
        - src
        - tests
```

## 3. Core idioms
**Value object** (8.2+ `readonly class`, constructor promotion, validation at construction):
```php
<?php

declare(strict_types=1);

namespace App;

use InvalidArgumentException;

final readonly class Money
{
    public function __construct(
        public int $amountMinor,
        public Currency $currency,
    ) {
        if ($amountMinor < 0) {
            throw new InvalidArgumentException('Amount must not be negative.');
        }
    }

    public function add(self $other): self
    {
        if ($other->currency !== $this->currency) {
            throw CurrencyMismatch::between($this->currency, $other->currency);
        }

        return new self($this->amountMinor + $other->amountMinor, $this->currency);
    }
}
```

**Enums + `match`** (exhaustive, strict, no `default` so PHPStan flags a new case):
```php
enum OrderStatus: string
{
    case Pending = 'pending';
    case Paid = 'paid';
    case Shipped = 'shipped';
    case Cancelled = 'cancelled';

    public function canTransitionTo(self $next): bool
    {
        return match ($this) {
            self::Pending => $next === self::Paid || $next === self::Cancelled,
            self::Paid => $next === self::Shipped,
            self::Shipped, self::Cancelled => false,
        };
    }
}

$status = OrderStatus::tryFrom($input) ?? throw new InvalidArgumentException("Unknown status: {$input}");
```

**Property hooks + asymmetric visibility** (8.4) replace getter/setter boilerplate; keep hooks small and side-effect free. Hooked properties cannot be `readonly`; `readonly` alone implies `protected(set)`.
```php
final class User
{
    public private(set) int $loginCount = 0; // public read, write only inside the class

    public string $email {
        set(string $value) {
            $normalized = strtolower(trim($value));
            if (filter_var($normalized, FILTER_VALIDATE_EMAIL) === false) {
                throw new InvalidArgumentException('Invalid email address.');
            }
            $this->email = $normalized;
        }
    }

    public string $displayName {
        get => $this->name ?? explode('@', $this->email)[0]; // virtual: no storage
    }

    public function __construct(string $email, public ?string $name = null)
    {
        $this->email = $email; // runs the set hook
    }
}
```

**Everyday syntax:**
```php
$emails = array_map(strtolower(...), $rawEmails);                 // first-class callable (8.1)
$admin = array_find($users, fn(Admin $u): bool => $u->isAdmin);   // 8.4; null when none match
$price = new Money(amountMinor: 1999, currency: Currency::Eur);   // named args: param names become API
$city = $order?->customer?->address?->city;                        // null-safe, read-only, short-circuits
```

**PHP 8.5 only** (check `require.php` first):
```php
public function withPageSize(int $pageSize): self // wither on a readonly class
{
    return clone($this, ['pageSize' => $pageSize]); // readonly props: only from inside the class
}

$slug = $title
    |> trim(...)
    |> strtolower(...)
    |> (fn(string $s): string => str_replace(' ', '-', $s)); // arrow fns need parentheses
```
Also 8.5: `array_first()`/`array_last()` (null on empty), `#[\NoDiscard]` (warns on an ignored result; `(void) f()` discards on purpose), `final` promoted properties, `Uri\Rfc3986\Uri` / `Uri\WhatWg\Url`. Deprecated in 8.5: backtick shell operator, `__sleep()`/`__wakeup()` (use `__serialize()`/`__unserialize()`), `(integer)`/`(boolean)`/`(double)` casts.
From 8.3: typed class constants (`const string VERSION = '1';`), `#[\Override]`, `json_validate()`.

**Generics live in PHPDoc** — PHPStan enforces them:
```php
/**
 * @template T
 * @param list<T> $items
 * @param callable(T): bool $keep
 * @return list<T>
 */
function filterList(array $items, callable $keep): array
{
    return array_values(array_filter($items, $keep)); // array_values: filter keeps keys
}
```

**Seams for testability:** inject an interface for anything non-deterministic — time (`Psr\Clock\ClockInterface` if `psr/clock` is installed, else a one-method `Clock` returning `DateTimeImmutable` in UTC), randomness, HTTP, filesystem. Tests pass a `FrozenClock` or an in-memory fake.

## 4. Error handling
- Exceptions for failures; `null` only for a legitimate "not found". `LogicException` family = caller bug (invalid argument, wrong state); `RuntimeException` family = environment failed (I/O, gateway). Give domain errors their own `final` class with a named constructor.
- Catch only what you can handle, at the layer that can decide. Wrap to add context and keep the cause:
```php
final class PaymentFailed extends RuntimeException
{
    public static function forOrder(string $orderId, Throwable $previous): self
    {
        return new self("Payment failed for order {$orderId}.", previous: $previous);
    }
}

try {
    $gateway->charge($order);
} catch (GatewayTimeout $e) {
    throw PaymentFailed::forOrder($order->id, $e);
}
```
- Catch `Throwable` only in top-level handlers and in cleanup that rethrows (transaction rollback, §8). Use `finally` for cleanup that must always run.
- Legacy functions signal failure with `false`/`null` plus a warning: check `=== false` (`file_get_contents`, `fopen`, `preg_match`) and pass `JSON_THROW_ON_ERROR` to `json_encode`/`json_decode`. Never silence with `@`.
- Mark secrets with `#[\SensitiveParameter]` (8.2) so they are redacted from stack traces; never log passwords, tokens or full request bodies.
- Production: `display_errors=Off`, `log_errors=On`; one central handler turns uncaught exceptions into a generic 500 plus a structured log line. More: `.agents/guides/principles/error-handling.md`.

## 5. Testing
Default: Pest if `pestphp/pest` is in `composer.json`, else PHPUnit — never mix styles within one file. Arrange-Act-Assert, one behaviour per test, name tests after the behaviour.
```php
<?php

declare(strict_types=1);

use App\Currency;
use App\CurrencyMismatch;
use App\Money;

it('adds amounts in the same currency', function (): void {
    $sum = new Money(150, Currency::Eur)->add(new Money(50, Currency::Eur));

    expect($sum)->toEqual(new Money(200, Currency::Eur));
});

it('refuses to add different currencies', function (): void {
    new Money(1, Currency::Eur)->add(new Money(1, Currency::Usd));
})->throws(CurrencyMismatch::class);

it('rejects negative amounts', function (int $amount): void {
    new Money($amount, Currency::Eur);
})->with([-1, PHP_INT_MIN])->throws(InvalidArgumentException::class);
```
PHPUnit (attributes; data providers are `public static`):
```php
final class OrderStatusTest extends TestCase
{
    #[Test]
    #[DataProvider('transitions')]
    public function it_allows_only_valid_transitions(OrderStatus $from, OrderStatus $to, bool $allowed): void
    {
        self::assertSame($allowed, $from->canTransitionTo($to));
    }

    /** @return iterable<string, array{OrderStatus, OrderStatus, bool}> */
    public static function transitions(): iterable
    {
        yield 'pending -> paid' => [OrderStatus::Pending, OrderStatus::Paid, true];
        yield 'paid -> pending' => [OrderStatus::Paid, OrderStatus::Pending, false];
    }
}
```
- Commands: `vendor/bin/pest --filter "adds amounts"`, `vendor/bin/pest --parallel`, `vendor/bin/pest --bail`, `vendor/bin/pest --ci` (ignores `->only()`); PHPUnit: `vendor/bin/phpunit --filter OrderStatusTest`.
- Coverage needs Xdebug or PCOV: `php -d xdebug.mode=coverage vendor/bin/pest --coverage --min=80` (works in both shells). Mutation testing: `vendor/bin/pest --mutate` with `covers(Money::class)` in the test file; with plain PHPUnit use Infection.
- Fakes over mocks: a `FrozenClock implements Clock` or an in-memory repository beats five `expects()` calls. Mock only interfaces you own.
- Repository tests hit a real database (Docker service or SQLite `:memory:` when the SQL is portable) inside a transaction rolled back per test. Unit tests never touch the network.
- Set `failOnWarning="true"` and `failOnDeprecation="true"` in `phpunit.xml` so deprecations surface before the next PHP upgrade. Testing strategy: `.agents/guides/principles/testing-strategy.md`.

## 6. Performance
- Measure first: Xdebug profiler, SPX or Blackfire for CPU; the DB slow-query log and `EXPLAIN` for queries. Most PHP latency is I/O, not CPU — the JIT rarely helps web apps.
- Production: OPcache on (`opcache.enable=1`; with immutable deploys `opcache.validate_timestamps=0` and reset on deploy), `composer install --no-dev --classmap-authoritative`.
- Kill N+1 queries: one `WHERE id IN (...)` or a JOIN instead of a query per row (framework: eager loading). Paginate or stream large result sets.
- Stream with generators (`yield`) instead of building huge arrays; read files line by line (`SplFileObject`), not `file()` on multi-GB input.
- Lookups: build `array_flip($ids)` once and use `isset($set[$id])` (O(1)) instead of `in_array` inside loops (O(n²)). Collect chunks and `array_merge(...$chunks)` once instead of merging in a loop.
- Build strings with `implode()` or an output buffer; cache expensive pure results per request in a property, across requests in APCu/Redis with a TTL and explicit invalidation. Guide: `.agents/guides/principles/performance.md`.

## 7. Security
**Database.** Prepared statements for every value; allow-list identifiers:
```php
$pdo = new PDO('mysql:host=127.0.0.1;dbname=app;charset=utf8mb4', $user, $password, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, // default since 8.0; explicit for readers
    PDO::ATTR_EMULATE_PREPARES => false,         // real server-side prepares, native types
]);

$column = match ($sort) {
    'created' => 'created_at',
    'email' => 'email',
    default => throw new InvalidArgumentException('Unsupported sort column.'),
};
$stmt = $pdo->prepare("SELECT id, email FROM users ORDER BY {$column} LIMIT :limit");
$stmt->bindValue('limit', $limit, PDO::PARAM_INT);
$stmt->execute();

$placeholders = implode(',', array_fill(0, count($ids), '?')); // IN list; guard $ids === [] first
$stmt = $pdo->prepare("SELECT email FROM users WHERE id IN ({$placeholders})");
$stmt->execute($ids);
```
With native prepares a named placeholder may appear only once per statement — use `:take` and `:min`, not `:n` twice.

**Output.** Escape for the context at output time: HTML body/attribute → `htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8')` (or Blade `{{ }}` / Twig autoescape); inside `<script>` → `json_encode($v, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR)`; URL parts → `rawurlencode()`. Never build HTML by concatenating request data.

**Passwords and tokens.**
```php
$hash = password_hash($plain, PASSWORD_DEFAULT); // bcrypt, cost 12 by default since 8.4

if (!password_verify($plain, $user->passwordHash)) {
    throw new InvalidCredentials();
}
if (password_needs_rehash($user->passwordHash, PASSWORD_DEFAULT)) {
    $users->updatePasswordHash($user->id, password_hash($plain, PASSWORD_DEFAULT));
}
```
Tokens, IDs and CSRF secrets: `bin2hex(random_bytes(32))`; compare with `hash_equals($expected, $submitted)`. Never `rand()`, `mt_rand()`, `uniqid()` or `md5(time())` for anything security-relevant.

**CSRF and sessions.** Every state-changing request (POST/PUT/PATCH/DELETE) carries a per-session token checked with `hash_equals`; frameworks ship this — use theirs. Cookies: `session.cookie_secure=1`, `session.cookie_httponly=1`, `session.cookie_samesite=Lax` (or `Strict`), `session.use_strict_mode=1`; `session_regenerate_id(true)` on login and privilege change.

**Other sinks.**
- Deserialization: never `unserialize()` user data (object injection); use JSON. If unavoidable: `unserialize($s, ['allowed_classes' => false])`.
- Shell: prefer a library; otherwise `proc_open(['convert', $in, $out], ...)` (array form bypasses the shell) or `escapeshellarg()` for every argument.
- Files: resolve with `realpath()` and check `str_starts_with($real, $baseDir)`; uploads via `move_uploaded_file()`, random server-side names, MIME from `finfo`, stored outside the web root.
- SSRF: allow-list hosts/schemes for server-side fetches of user-supplied URLs; block private IP ranges.
- `php.ini` (OWASP): `expose_php=Off`, `display_errors=Off`, `allow_url_include=Off`. Secrets come from the environment or a vault, never from committed files. Run `composer audit` in CI. Full checklist: `.agents/guides/principles/security.md`.

## 8. Concurrency / async
- Requests run in parallel processes, so races happen **in the database**. Replace check-then-act with one atomic statement or a transaction plus row lock (`SELECT ... FOR UPDATE`), and enforce invariants with unique constraints.
```php
public function reserve(string $sku, int $qty): void
{
    $this->pdo->beginTransaction();
    try {
        $stmt = $this->pdo->prepare(
            'UPDATE stock SET qty = qty - :take WHERE sku = :sku AND qty >= :min',
        );
        $stmt->execute(['take' => $qty, 'sku' => $sku, 'min' => $qty]);
        if ($stmt->rowCount() !== 1) {
            throw new RuntimeException("Insufficient stock for {$sku}.");
        }
        $this->pdo->commit();
    } catch (Throwable $e) {
        $this->pdo->rollBack();
        throw $e;
    }
}
```
- Retries (HTTP clients, queue jobs) must be idempotent: idempotency keys, upserts, "already processed" checks in the same transaction.
- Long-running workers (queues, FrankenPHP worker mode, RoadRunner, Swoole, Octane): no mutable static/global state, no request data in singletons, close/reset connections, watch memory, restart workers periodically.
- Concurrent I/O in one request: `curl_multi_*`, Guzzle promises or Symfony HttpClient's concurrent responses. Fibers (8.1) are a low-level primitive for libraries like Revolt/AMPHP/ReactPHP — don't hand-roll schedulers. `pcntl_*` is CLI-only. More: `.agents/guides/principles/concurrency.md`.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `"... WHERE id = $id"` | SQL injection | `prepare()` + bound params; allow-list identifiers |
| `echo $_GET['q']` | XSS | escape at output (`htmlspecialchars`, template autoescape) |
| `md5($password)` / `sha1()` | offline cracking | `password_hash()` / `password_verify()` |
| `==`, `in_array($x, $a)` | `'1e1' == '10'` is true | `===`, `in_array($x, $a, true)`, `match` |
| `catch (Exception $e) {}` / `@` | failures vanish | catch narrowly, wrap with `previous:`, or let it bubble |
| untyped params, `array` everywhere | runtime surprises, no analysis | native types + `list<T>` / `array{...}` PHPDoc; value objects |
| `function f(Foo $x = null)` | deprecated since 8.4 | `?Foo $x = null` |
| `switch` / `default =>` on an enum | loose compare, new cases slip through | exhaustive `match` |
| `new PdoRepo()` inside a service | untestable, hidden dependency | constructor injection of an interface |
| static mutable caches/singletons | leaks between requests in workers, flaky tests | request-scoped object or a real cache |
| `float` money, mutable `DateTime` | rounding errors, action at a distance | minor-unit `int` / `BcMath\Number`; `DateTimeImmutable` |
| `json_decode($s)` without flags | `null` on error, silently | `JSON_THROW_ON_ERROR` |
| `unserialize($_COOKIE[...])` | object injection / RCE | JSON + validation |
| raising `ignoreErrors` / baseline to go green | debt hidden, types lie | fix the type; the baseline only shrinks |
| editing `vendor/` or `composer.lock` | lost on install, broken integrity | `composer require/update`, patches upstream |

## 10. Review checklist
- [ ] New files have `declare(strict_types=1)`; namespace/path/class name match PSR-4 (`composer dump-autoload --optimize --strict-psr` passes).
- [ ] Every param, return and property is typed; arrays carry PHPDoc shapes; no implicit nullable.
- [ ] No syntax newer than `require.php` in `composer.json`.
- [ ] Values are `final readonly` with constructor validation; services are `final`, stateless, constructor-injected.
- [ ] Enum `match` lists every case; comparisons are strict.
- [ ] SQL uses bound parameters; identifiers are allow-listed; no N+1 loop queries.
- [ ] Output escaped for its context; CSRF on state-changing routes; passwords via `password_hash`.
- [ ] Exceptions carry context and `previous`; no empty `catch`, no `@`; secrets never logged.
- [ ] Multi-step writes in a transaction; concurrent paths safe (atomic update, lock or unique constraint).
- [ ] Tests cover the new behaviour and failure paths; no network in unit tests.
- [ ] `node .agents/scripts/verify.mjs --only php` passes (Composer validate, Pint, PHPStan, tests) with no new ignores or baseline entries.

## 11. References
- Supported versions: https://www.php.net/supported-versions.php · Releases: https://www.php.net/releases/8.5/en.php (also /8.4/, /8.3/)
- Strict typing: https://www.php.net/manual/en/language.types.declarations.php · Property hooks: https://www.php.net/manual/en/language.oop5.property-hooks.php · Enums: https://www.php.net/manual/en/language.enumerations.php
- PDO prepare: https://www.php.net/manual/en/pdo.prepare.php · password_hash: https://www.php.net/manual/en/function.password-hash.php
- PER Coding Style: https://www.php-fig.org/per/coding-style/ · PSR-4: https://www.php-fig.org/psr/psr-4/
- Composer autoload: https://getcomposer.org/doc/04-schema.md#autoload · security policy config: https://getcomposer.org/doc/06-config.md#policy
- PHPStan levels: https://phpstan.org/user-guide/rule-levels · baseline: https://phpstan.org/user-guide/baseline · Larastan: https://github.com/larastan/larastan
- Pest: https://pestphp.com/docs/installation · PHPUnit: https://docs.phpunit.de/
- Pint: https://laravel.com/docs/pint
- OWASP PHP configuration: https://cheatsheetseries.owasp.org/cheatsheets/PHP_Configuration_Cheat_Sheet.html · CSRF: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
