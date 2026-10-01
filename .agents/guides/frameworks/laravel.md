# Laravel — engineering guide
> Scope: application structure, Eloquent, request/response lifecycle, authorization, queues/events, testing,
> deployment. Quick card: `.agents/rules/fw-laravel.md`. PHP idioms (types, `strict_types`, PSR-4, `match`/enums):
> `.agents/guides/languages/php.md` — not repeated here. This
> guide is for when the kit is copied into a Laravel/PHP repo (`/onboard-repo`).
> Last verified: 2026-09 — Context7 `laravel/docs` (13.x branch: releases, upgrade, structure, routing, eloquent,
> eloquent-relationships, eloquent-mutators, eloquent-resources, validation, authorization, queues, events, blade,
> migrations, testing, database-testing, pint, octane, frontend, starter-kits, deployment, helpers, controllers).
> Current major is **13** (PHP **8.3** minimum; 8.4/8.5 supported — Sail/Octane runtimes ship 8.0–8.5). Laravel 12
> (PHP 8.2 minimum) is still widely deployed and nearly identical in the APIs below — 13's own release notes call
> it "a relatively minor upgrade in terms of effort". Re-check `composer.json`'s `require.php` and
> `require["laravel/framework"]` before trusting a version claim; where behavior differs by major, this says so.

## 1. Mental model / philosophy
- Full-stack MVC-ish framework: `routes/*.php` → controllers → Eloquent models/services → Blade, Inertia, or a
  JSON `Resource`. Convention over configuration — predictable directory names let `php artisan make:*` and the
  framework's own discovery wire things together with no manual registration in most cases.
- The **service container** is the backbone: every class Laravel resolves for you (controllers, jobs, form
  requests, and anything you type-hint in a constructor) can ask for its own dependencies by type — you rarely
  call `new` for a service with dependencies; you type-hint it and let the container inject it.
- "Skinny controller, fat model/service": a controller method should read as a short sequence of framework calls
  (validate → authorize → act → respond). Business logic belongs in the model, a dedicated action/service class, or
  a job — not inlined in the controller.
- KISS/YAGNI first: Laravel already ships auth scaffolding, validation, queues, caching, mail, notifications,
  authorization, and testing helpers. Before adding a package or hand-rolling an abstraction, check `composer show`
  and the docs — the framework very often already has it.

## 2. Project structure & tooling
### Release status (verified 2026-09 via Context7 `laravel/docs` 13.x — re-check the lockfile first)
- Current major: **Laravel 13** (PHP 8.3+; a new major ships yearly with a strong focus on minimal breaking
  changes). Laravel 12 (PHP 8.2+) is the prior major; both share the `bootstrap/app.php`-centric structure from
  Laravel 11 — there is no `app/Http/Kernel.php`, `app/Console/Kernel.php`, or `app/Exceptions/Handler.php`.
- Starter kits scaffold auth + frontend in one command: React/Vue/Svelte (via **Inertia** + Tailwind + Vite), or
  **Livewire** (Blade + Tailwind + Flux UI) for teams preferring PHP-driven reactivity over a JS SPA. Match the kit
  to the project's frontend; don't mix Inertia and Livewire patterns in one app without a reason.
- Testing scaffolds with **Pest** by default (functional syntax); PHPUnit class-based tests are equally supported —
  check `tests/Pest.php` vs a `PHPUnit\Framework\TestCase` base before assuming which one a project uses.

### Directory layout
- `bootstrap/app.php` — the single entry point for routing, middleware, and exception handling
  (`Application::configure()->withRouting(...)->withMiddleware(...)->withExceptions(...)->create()`).
- `routes/web.php` (stateful, session + CSRF via the `web` middleware group), `routes/console.php` (Artisan
  closures), and — only if wired in `withRouting()` or added by a starter kit — `routes/api.php` (stateless, no
  CSRF, typically under `/api`).
- `app/Models`, `app/Http/{Controllers,Requests,Resources,Middleware}`, `app/Policies`, `app/Providers` (only
  `AppServiceProvider` by default — add more only when you actually group related bindings), `app/Jobs`,
  `app/Events`, `app/Listeners`.
- `database/migrations`, `database/factories`, `database/seeders`; `config/*.php`; `tests/{Unit,Feature}`; `.env`
  (never committed — `.env.example` is the template).

### Commands (swap `php` for the project's own wrapper, e.g. Sail's `./vendor/bin/sail`, if present)
| Task | Command |
|---|---|
| Install deps | `composer install` |
| Dev server | `php artisan serve` (plus `npm run dev` for Vite HMR) |
| Generate a piece | `php artisan make:{model,controller,request,policy,resource,job,event,listener,migration,test}` |
| List all `make:*` | `php artisan list make` |
| Migrate | `php artisan migrate` · rollback: `migrate:rollback` · reset+reseed: `migrate:fresh --seed` |
| Inspect routes | `php artisan route:list` |
| REPL | `php artisan tinker` |
| Format | `vendor/bin/pint` (check only: `--test`; changed files only: `--dirty`) |
| Static analysis | `vendor/bin/phpstan analyse` (Larastan) |
| Test | `php artisan test` (recommended — verbose, supports `--parallel`) or `vendor/bin/pest` / `vendor/bin/phpunit` |
| Queue worker | `php artisan queue:work` (dev: `queue:listen` auto-reloads code changes) |
| Failed jobs | `php artisan queue:failed` · retry: `queue:retry <id>\|--queue=<name>\|all` |
| Deploy caches | `php artisan config:cache route:cache view:cache` (clear: `config:clear` etc.) |
| Everything (this kit) | `node .agents/scripts/verify.mjs --only php` |

### Config: `env()` only inside `config/*.php`
`config/*.php` files read `env('KEY', $default)` at boot and expose it via `config('app.name')`. In production, run
`php artisan config:cache` to combine every config file into one cached file — after that, `.env` is **not**
re-read, so any `env()` call outside `config/*.php` (a controller, a service, a Blade view) silently returns `null`.
Read configuration everywhere else via `config('section.key')`.

## 3. Core idioms
### Routing & bootstrap/app.php
```php
<?php
// bootstrap/app.php
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias(['subscribed' => \App\Http\Middleware\EnsureUserIsSubscribed::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // custom report()/render() hooks — see §4
    })->create();
```

### Eloquent: mass-assignment guard, casts, scopes, eager loading
```php
class Flight extends Model
{
    protected $fillable = ['name', 'airline']; // only these are writable via create()/update($array)
    // or: protected $guarded = ['id'];         // everything EXCEPT these is writable — riskier, prefer $fillable

    protected function casts(): array
    {
        return ['departs_at' => 'datetime', 'is_active' => 'boolean'];
    }

    #[Scope] // Laravel 13 attribute form; a method named `scopePopular` (no attribute) still works too
    protected function popular(Builder $query): void
    {
        $query->where('votes', '>', 100);
    }
}

// N+1: one query per row
foreach (Flight::all() as $flight) { echo $flight->airline->name; }
// eager-loaded: two queries total
foreach (Flight::with('airline')->get() as $flight) { echo $flight->airline->name; }
```
Catch N+1s in dev/tests before they reach production — in `AppServiceProvider::boot()`:
```php
Model::preventLazyLoading(! $this->app->isProduction());
```

### Form Requests: validation + authorization together
```php
class UpdatePostRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('post'));
    }
    public function rules(): array
    {
        return ['title' => ['required', 'string', 'max:255'], 'body' => ['required', 'string']];
    }
}
// controller: $post->update($request->validated());
```

### Policies & Gates
```php
// app/Policies/PostPolicy.php
class PostPolicy
{
    public function update(User $user, Post $post): bool { return $user->id === $post->user_id; }
}
// controller or anywhere:
$this->authorize('update', $post);      // throws AuthorizationException (403) if it fails
Gate::authorize('update', $post);       // same, outside a controller
// simple, model-less checks go in a Gate closure instead, registered in AppServiceProvider::boot()
```

### API Resources: never return a raw model from an API
```php
class PostResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'title' => $this->title, 'created_at' => $this->created_at];
    }
}
// controller: return new PostResource($post); or PostResource::collection($posts);
```

### Queues & jobs: idempotent, retried, unique
```php
#[Tries(3)]
class SyncChatHistory implements ShouldQueue, ShouldBeUnique
{
    use Queueable;
    public function __construct(public User $user) {}
    public function uniqueId(): string { return (string) $this->user->id; }
    public function handle(): void { /* upsert, not insert — this MAY run more than once */ }
    public function middleware(): array { return [new FailOnException([AuthorizationException::class])]; }
}
```
`ShouldBeUnique` (+ `#[UniqueFor(seconds)]`) stops a duplicate from queuing while one is already pending/running.
`#[Tries(n)]` plus `backoff()` control retries; `FailOnException` fails fast on a non-retryable error instead of
burning all retries. Inspect stuck/failed jobs with `queue:failed`; retry with `queue:retry`.

### Events & listeners
```php
class OrderShipped { use Dispatchable, SerializesModels; public function __construct(public Order $order) {} }
class SendShipmentNotification { public function handle(OrderShipped $event): void { /* ... */ } }
// OrderShipped::dispatch($order); — listener runs synchronously unless it implements ShouldQueue
```
`SerializesModels` re-fetches the model fresh from the database when a **queued** listener/job wakes up — treat the
value as a fresh read, not a snapshot frozen at dispatch time.

### Migrations: reversible, additive
```php
return new class extends Migration {
    public function up(): void {
        Schema::create('flights', function (Blueprint $table) {
            $table->id(); $table->string('name'); $table->timestamps();
        });
    }
    public function down(): void { Schema::drop('flights'); }
};
```
Every migration ships a correct `down()` (schema changes should be mechanically reversible). **Never edit a
migration that has already run** in any shared environment (CI, staging, another developer's machine) — its
checksum/order is recorded in the `migrations` table; instead write a new migration that alters the same table.

### Blade, Livewire, Inertia
- Blade: `{{ $var }}` escapes by default (safe); `{!! $var !!}` outputs raw HTML — reserve it for content you
  generated or explicitly sanitized, never for raw user input. Components: `<x-alert :type="$type" />` backed by a
  class in `app/View/Components` or an anonymous component in `resources/views/components`.
- Livewire: a component's public properties are request-scoped state re-hydrated on every network round-trip —
  validate and authorize inside the component's action methods exactly like a controller; a Livewire request is a
  real HTTP POST, reachable outside the rendered page.
- Inertia: the controller returns `Inertia::render('Posts/Edit', ['post' => $post])`; the page component receives
  props like a normal SPA page. Validation errors set via `session('errors')` (Form Request failures) surface
  automatically as Inertia's shared `errors` prop — no separate error-handling path needed on the frontend.

## 4. Error handling
- `bootstrap/app.php`'s `withExceptions(function (Exceptions $exceptions) { ... })` registers custom
  `report()`/`render()` callbacks (e.g. render a specific exception as JSON for API routes, or forward it to an
  error tracker) instead of an `app/Exceptions/Handler.php` subclass (removed since Laravel 11).
- A `ValidationException` (thrown automatically by a failed Form Request) becomes a 422 with an `errors` bag for
  JSON clients, or redirects back with `$errors` for a traditional Blade form — you rarely catch it yourself.
- `AuthorizationException` (from `$this->authorize()`/`Gate::authorize()`) becomes a 403 automatically.
- Never swallow an exception silently (`catch (Throwable) {}`) in a controller or job — a job's caught-and-ignored
  exception looks like success to the queue, hiding real failures. Let it propagate (queues will retry per
  `#[Tries]`) or explicitly call `$this->fail($e)` inside a job's `handle()` to record it as failed with a reason.

## 5. Testing
- **Pest** is the default for new Laravel apps; PHPUnit class-based tests are equally supported — match whichever
  the project already uses (check `tests/Pest.php` for a Pest setup, or a `TestCase` base class for PHPUnit).
- `RefreshDatabase` (a trait, or `pest()->use(RefreshDatabase::class)` in `tests/Pest.php`) wraps each test in a
  migration + rollback so tests never see another test's data.
  ```php
  use Illuminate\Foundation\Testing\RefreshDatabase;
  pest()->use(RefreshDatabase::class);

  test('a post can be updated by its owner', function () {
      $user = User::factory()->create();
      $post = Post::factory()->for($user)->create();

      $response = actingAs($user)->put("/posts/{$post->id}", ['title' => 'New', 'body' => 'Body']);

      $response->assertRedirect();
      expect($post->fresh()->title)->toBe('New');
  });
  ```
- Model factories (`database/factories/PostFactory.php`, `Post::factory()->count(3)->create()`) generate realistic
  fixtures; `->for($user)` sets a relationship; `$this->seed()` runs a `DatabaseSeeder` when a test needs reference
  data beyond one factory call.
- HTTP assertions: `assertOk()`, `assertStatus(422)`, `assertJson([...])`, `assertDatabaseHas('posts', [...])`,
  `assertDatabaseMissing(...)`. Fake side effects instead of letting them really happen:
  `Queue::fake()`/`Bus::fake()`/`Event::fake()`/`Http::fake()`/`Mail::fake()`, then assert
  `Queue::assertPushed(SyncChatHistory::class)` — this tests that the job was dispatched, not what it does (test
  the job's `handle()` separately, unqueued).
- Run with `php artisan test` (recommended: verbose output, `--parallel` support) or the underlying runner directly
  (`vendor/bin/pest`).
- E2E/browser: **Laravel Dusk** (ChromeDriver-based, first-party) for full-page JS interaction, or Playwright
  against a running build for a JS-heavy Inertia/Livewire frontend — locate by role/label, avoid hard sleeps
  (`.agents/guides/principles/testing-strategy.md`).

## 6. Performance
- Eager-load every relationship accessed in a loop (`with()`, `withCount()` when only a count is needed — it skips
  loading full related rows).
- Stream large datasets instead of loading them whole: `Model::chunk(200, fn ($rows) => ...)` or
  `Model::cursor()` (one row in memory at a time) instead of `Model::all()` for anything that might be large.
- Cache expensive, rarely-changing reads: `Cache::remember('key', $ttl, fn () => ...)`; invalidate explicitly on the
  write path rather than relying on a short TTL to paper over staleness.
- Push slow, non-blocking work onto a queued job instead of doing it inline in the request (email sending, webhook
  calls, report generation, image processing).
- In production, run `config:cache`, `route:cache`, `view:cache` to remove per-request filesystem/compile work.
- **Octane** (Swoole/RoadRunner) keeps the app booted in memory across requests for much higher throughput — but it
  changes the execution model: a static property or singleton that accumulates data
  (`Service::$data[] = Str::random(10)`) now leaks across every subsequent request instead of being freed at the
  end of one. Audit statics/singletons for per-request state before adopting Octane; don't adopt it by default.

## 7. Security
- **Mass assignment**: every mutable model declares `$fillable` (preferred: an explicit allow-list) or `$guarded`;
  never `Model::create($request->all())` or `$model->update($request->all())` — pass `$request->validated()` from
  a Form Request instead, so only vetted fields ever reach the database.
- **SQL injection**: never interpolate user input into a query string (`DB::select("...= '$x'")`,
  `whereRaw("col = '$x'")`). Use Eloquent/query-builder methods, or bound parameters:
  `whereRaw('col = ?', [$x])`/`DB::select('... where col = ?', [$x])`.
- **XSS**: `{{ $var }}` escapes automatically; `{!! $var !!}` does not — never feed it unsanitized user input.
- **CSRF**: the `web` middleware group auto-verifies a token on state-changing requests; every Blade form needs
  `@csrf`. `routes/api.php` is stateless (no CSRF) — it must authenticate every request some other way (Sanctum
  tokens, signed requests) instead.
- **Authorization**: check it in the controller/Form Request/job — not only in a Blade `@can` directive. A
  `@can`-hidden button does not stop a direct POST to the same route; the server-side check is the real boundary.
- **Passwords & secrets**: `Hash::make()`/`Hash::check()` (bcrypt/argon2id under the hood) — never `md5`/`sha1`.
  `.env` holds all secrets and is git-ignored; nothing secret belongs in a committed `config/*.php` default.
- **File uploads**: validate `mimes`/`max` in the Form Request; store outside the public webroot or under a
  non-guessable generated name; never trust a client-supplied filename or `Content-Type` for anything sensitive.
- Never `unserialize()` untrusted input (PHP object-injection); prefer `json_decode(..., true, flags:
  JSON_THROW_ON_ERROR)` for structured untrusted data (this is a PHP-language rule too —
  `.agents/guides/languages/php.md` §7).

## 8. Concurrency / async (queues, events, jobs)
- A queue worker runs jobs in a separate, long-lived PHP process; job constructor arguments are serialized onto the
  queue and rehydrated later — `SerializesModels` re-fetches an Eloquent model fresh rather than freezing its state
  at dispatch time.
- **Idempotency is the caller's responsibility**: a queue's delivery guarantee is at-least-once — a job's own
  timeout, a worker restart, or a retried failure can run `handle()` more than once for the same logical unit of
  work. Design it so re-running is safe: upsert instead of insert, a unique constraint plus a caught duplicate-key
  error, or an explicit "already processed" check keyed by an idempotency token.
- `ShouldBeUnique` (optionally `#[UniqueFor($seconds)]`) prevents a second copy of the *same* job from being queued
  while one is pending — this is deduplication at enqueue time, not a substitute for idempotent `handle()` logic.
- Events dispatch **synchronously** by default (the listener runs inline, in the same request); make a listener
  `implements ShouldQueue` only when its work is slow enough to defer — the event itself does not change, only the
  listener's execution mode.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `Model::create($request->all())` | mass-assigns any client-supplied field | `$fillable`/`$guarded`, pass `$request->validated()` |
| `DB::select("...= '$x'")` / `whereRaw("col = '$x'")` | SQL injection | query builder, or bound `?` parameters |
| `{!! $userInput !!}` in Blade | raw HTML injection (XSS) | `{{ $userInput }}` (auto-escaped), or sanitize first |
| Editing a migration that already ran | breaks recorded history on every other environment | write a new migration instead |
| `env()` in a controller/service | returns `null` in prod after `config:cache` | read via `config('section.key')` |
| Relationship accessed in a loop, no `with()` | N+1 queries | eager-load: `Model::with('relation')->get()` |
| Authorization only in a Blade `@can` | the route is still reachable directly | check in the controller/Policy too |
| Job assumes exactly-once execution | at-least-once delivery — retries duplicate side effects | idempotent `handle()` (upsert/unique key) |
| Static prop accumulating data, under Octane | leaks across requests instead of resetting | no per-request state in statics; reset it |
| Deleting/weakening a failing test | hides the real regression it caught | fix the code, or show the test is wrong |

## 10. Review checklist
- [ ] every mutable model has `$fillable` or `$guarded`; no `create($request->all())`/`update($request->all())`
- [ ] no string-interpolated SQL or `whereRaw`/`DB::select` built from unescaped input
- [ ] every write path (controller action, job, Livewire action) re-checks authorization server-side via a
      Policy/Gate — not only hidden in the view
- [ ] new/changed migrations have a correct `down()`; nothing edits a migration that has already run
- [ ] `env()` appears only inside `config/*.php`
- [ ] a relationship accessed in a loop is eager-loaded; `Model::preventLazyLoading()` is enabled outside production
- [ ] new behavior has a Pest/PHPUnit test (`RefreshDatabase` + factories where DB state is involved); no test
      deleted or weakened to pass
- [ ] queued jobs designed for at-least-once delivery (idempotent `handle()`); unique jobs use `ShouldBeUnique`
      where a duplicate would cause a problem
- [ ] Pint formatted, Larastan/PHPStan clean — `node .agents/scripts/verify.mjs --only php`

## 11. References
- Docs home https://laravel.com/docs · releases /13.x/releases · upgrade /13.x/upgrade · structure /13.x/structure
  · routing /13.x/routing · middleware /13.x/middleware (base: `https://laravel.com/docs`)
- Eloquent /13.x/eloquent · eager loading /13.x/eloquent-relationships · casts /13.x/eloquent-mutators · resources
  /13.x/eloquent-resources · validation /13.x/validation · authorization /13.x/authorization
- Queues /13.x/queues · events /13.x/events · migrations /13.x/migrations
- Testing /13.x/testing · database testing /13.x/database-testing
- Blade /13.x/blade · frontend /13.x/frontend · starter kits /13.x/starter-kits · Livewire
  https://livewire.laravel.com · Inertia https://inertiajs.com
- Pint /13.x/pint · Larastan https://github.com/larastan/larastan · Pest https://pestphp.com · Octane /13.x/octane
  · deployment /13.x/deployment
- Principles: `.agents/guides/principles/security.md`, `testing-strategy.md`, `performance.md`,
  `error-handling.md`, `database-design.md` · PHP idioms: `.agents/guides/languages/php.md`
