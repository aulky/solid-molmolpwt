---
trigger: model_decision
globs: "**/*.php"
description: "Apply when working in a Laravel codebase (composer.json requires laravel/framework): structure, Eloquent, auth, queues, migrations, testing, security."
---
# Laravel — quick card
Applies only if composer.json requires laravel/framework. Otherwise ignore this rule.
Deep guide: `.agents/guides/frameworks/laravel.md` — read before non-trivial work (auth, queues, migrations, Octane, performance).
PHP language idioms: `.agents/rules/lang-php.md` (always applies to `.php` files, not repeated here).

## Project shape
- Laravel 12/13 (verify `composer.json` `require.php`, min PHP 8.2/8.3): `bootstrap/app.php` is the single entry for routing, middleware and exceptions — no `app/Http/Kernel.php`, no `app/Console/Kernel.php` (pre-11 shape, removed).
- `routes/web.php` (session + CSRF), optional `routes/api.php` (stateless), wired via `Application::configure()->withRouting()`.
- `app/Models`, `app/Http/{Controllers,Requests,Resources,Middleware}`, `app/Policies`, `app/Providers`, `app/Jobs`, `app/Events`, `database/{migrations,factories,seeders}`.

## Invariants (MUST / NEVER — with reason → alternative)
1. MUST guard every mutable Eloquent model with `$fillable` or `$guarded` — `Model::create($request->all())` writes any column the client sends. Instead: an explicit `$fillable` array, and pass only `$request->validated()` from a Form Request.
2. NEVER build a query with string-interpolated user input (`DB::select("...= '$x'")`, `whereRaw("col = '$x'")`) — SQL injection. Instead: query-builder/Eloquent methods, or bound parameters (`whereRaw('col = ?', [$x])`).
3. NEVER gate a mutation only with a controller `if` — Instead define a Policy (`php artisan make:policy`) and call `$this->authorize(...)`/`Gate::authorize(...)`; a Form Request's `authorize()` does the same check earlier.
4. NEVER `{!! $var !!}` a value with user input — it skips Blade's default escaping (XSS). Instead `{{ $var }}`, and reserve `{!! !!}` for content you generated or explicitly sanitized.
5. NEVER edit a migration that has already run in any shared environment — its order/checksum is recorded. Instead write a new migration; every migration needs a correct `down()` (or `shouldRun()` if conditional) so it stays reversible.
6. NEVER call `env()` outside `config/*.php` — Instead read `config('app.name')`; after `php artisan config:cache` in prod, `.env` is not reloaded and other `env()` calls return null.
7. MUST eager-load a relationship accessed in a loop (`Model::with('rel')->get()`) — avoids N+1. Enable `Model::preventLazyLoading(!app()->isProduction())` in `AppServiceProvider::boot()` to catch violations in dev/tests.
8. NEVER delete or weaken a failing test (`RefreshDatabase`, factories) to turn a red suite green — Instead fix the code, or report the assertion as wrong with evidence.

## Patterns
- Validation + authorization: a Form Request (`php artisan make:request`) with `rules()` + `authorize()`; the controller reads only `$request->validated()`.
- Output shape: model → `JsonResource`/`ResourceCollection` (`toArray()`) — never return a raw Eloquent model from an API controller.
- Background work: `ShouldQueue` jobs MUST be idempotent (a job may run more than once — upsert, not insert); `ShouldBeUnique`/`#[UniqueFor]` stops duplicate concurrent runs; `#[Tries(n)]`/`backoff()` control retries; check `php artisan queue:failed` for stuck jobs.
- Deploy caching: `php artisan config:cache route:cache view:cache` — only after confirming no `env()` call exists outside `config/*.php`.

## Pitfalls
- Octane (`laravel/octane`) keeps the app in memory between requests: a static property/array that accumulates data (`Service::$data[] = ...`) now leaks across requests — don't hold per-request state in statics/singletons.
- `withoutGlobalScopes()` / raw `DB::` facade calls bypass Policies and model events (`created`, `deleting`) — go through Eloquent when authorization or side effects matter.
- A route "protected" only by a Blade `@can` in the view is still directly reachable (curl, direct POST) — check inside the controller/Form Request too.
- Livewire/Inertia component actions are real request boundaries — validate and authorize inside the component/controller method, not only client-side.

## Example — bad → good
```php
// bad: mass assignment, no authorization, hand-built SQL
public function update(Request $request, $id) {
    $post = DB::select("select * from posts where id = $id")[0];
    $post->update($request->all());
}
```
```php
// good: Form Request validates, Policy authorizes, only $fillable columns pass through
public function update(UpdatePostRequest $request, Post $post) {
    $this->authorize('update', $post);
    $post->update($request->validated());
    return new PostResource($post);
}
```

## Before finishing
- [ ] every mutable model has `$fillable`/`$guarded` · [ ] no string-built SQL/`whereRaw` with interpolated input · [ ] every write path has a Policy/Gate check · [ ] migrations have a correct `down()`, none edited after running · [ ] `env()` only in `config/*.php` · [ ] Pint/Larastan clean, Pest/PHPUnit passes new behavior — `node .agents/scripts/verify.mjs --only php`
