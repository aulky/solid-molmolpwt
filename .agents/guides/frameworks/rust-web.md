# Rust web services (axum/actix-web/rocket + tokio/sqlx) — engineering guide
> Scope: production HTTP services in Rust, axum-first, actix-web/Rocket noted where they diverge, plus the tokio
> runtime and sqlx underneath all three. Quick card: `.agents/rules/fw-rust-web.md`. Language-level Rust
> (borrowing, error types, clippy) is in `.agents/guides/languages/rust.md`, not repeated here.
> Last verified: 2026-09 — crates.io `max_stable_version` (live API, 2026-09-30) for every version below; axum's
> and sqlx's own `CHANGELOG.md` for the 0.8 path-syntax and `AssertSqlSafe` breaking changes.
> Re-check `Cargo.toml`/`Cargo.lock` before trusting an exact version.

## 1. Mental model / philosophy
- **A handler is: extract → validate → do the thing → respond**, the same shape in every framework. axum,
  actix-web and Rocket are thin dispatch layers (URL + method → a function) around that shape.
- **The extractor is the trust line.** A `Json<T>`/`Path<T>` only proves the request *parsed*; it proves nothing
  about domain validity (an email that isn't an email, a negative page size). Validate right after extracting.
- **One process, one set of shared resources.** A DB pool, HTTP client, tracing subscriber, config: built once at
  startup, held for the process lifetime, drained on shutdown. Recreating any per request is the most common
  correctness/performance defect here, and the compiler will not catch it.
- **The async runtime is cooperative.** Every `.await` is a point where the task may be paused so another task
  runs on that worker thread. A blocking syscall, a long CPU loop, or a sync mutex held across an await stalls
  every other task on that worker, not just the caller.

## 2. Project structure & tooling
### Versions (verified live against crates.io, 2026-09-30 — re-check `Cargo.lock`, this drifts fast)
| Crate | Verified current | Notes |
|---|---|---|
| axum | 0.8.9 | path syntax `/{id}`/`/{*rest}` since 0.8.0 (§3); MSRV 1.75 |
| actix-web | 4.15.0 | own runtime built on tokio |
| rocket | 0.5.1 | **last published May 2024** — confirm the project wants it over axum/actix-web |
| tokio | 1.53.1 | the runtime under all three frameworks |
| tower / tower-http | 0.5.3 / 0.7.1 | `Service`/`Layer`, `ServiceBuilder`; `TraceLayer`/`CorsLayer` |
| tokio-util | 0.7.19 | `CancellationToken` |
| sqlx / sqlx-cli | 0.9.0 | `AssertSqlSafe` requirement is new in 0.9 (§3, §7) |
| serde / serde_json | 1.0.229 | derive-based (de)serialization |
| tracing / tracing-subscriber | 0.1.44 / 0.3.23 | structured, span-based logging |
| thiserror | 2.0.21 | derive for library error enums |
| garde / validator | 0.23.0 / 0.21.0 | validation derives — garde is newer; pick one, don't mix |
| axum-extra | 0.12.6 | typed headers, cookie jars, multipart — not in axum core |
| config | 0.15.27 | layered file+env config; Rocket ships its own (`figment`) |

### Project shape (axum, this guide's default)
```
src/main.rs        # #[tokio::main]: config, tracing, pool, router; axum::serve(...)
src/routes/        # one module per resource, each a Router<Arc<AppState>> (users.rs, health.rs)
src/state.rs       # AppState { db: PgPool, config: Config, ... }
src/error.rs       # AppError enum + impl IntoResponse
src/models.rs      # request/response structs (serde + garde/validator derives)
migrations/        # sqlx: 0001_init.sql, 0002_add_users.sql
tests/api.rs       # integration tests via tower::ServiceExt::oneshot or a bound TcpListener
```
Compose the router in one place, mounted from `main.rs`:
```rust
// routes/mod.rs
pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .nest("/api/users", users::router())
        .merge(health::router())
        .layer(middleware_stack())            // §3 — one shared layer stack
        .with_state(state)                    // Router<Arc<AppState>> -> Router<()>, ready to serve
}
```
`.with_state(state)` must be the *last* call on a composed router — every nested/merged sub-router needs the same
state type first, or use `axum::extract::FromRef` to project one field out of a larger state.

### Commands (identical on Windows PowerShell and POSIX — plain `cargo`/`sqlx` invocations)
| Task | Command |
|---|---|
| Format / lint | `cargo fmt --all --check` · `cargo clippy --all-targets -- -D warnings` |
| Build / run / test | `cargo build` · `cargo run` · `cargo test` |
| DB migration | `sqlx migrate add -r <name>` (add) · `sqlx migrate run` (apply) |
| Offline query cache | `cargo sqlx prepare` (writes `.sqlx/`; commit so CI builds with `SQLX_OFFLINE=true`, no live DB) |
| Everything (this kit) | `node .agents/scripts/verify.mjs --only rust` |

## 3. Core idioms
### Routing and extractor order (axum)
Path syntax is `/{id}` and `/{*rest}` (verified, axum 0.8 CHANGELOG — matchit 0.8 made the old `/:id`/`/*rest`
**panic** at router-build time rather than silently misroute):
```rust
Router::new()
    .route("/users/{id}", get(get_user).put(update_user))
    .route("/files/{*path}", get(serve_file));
```
Extractors run in argument order and **the body-consuming one must be last** — only one extractor may consume the
body, and axum enforces this at compile time:
```rust
async fn update_user(
    State(state): State<Arc<AppState>>,  // state, path, query, headers first
    Path(id): Path<Uuid>,
    Query(q): Query<ListParams>,
    Json(body): Json<UpdateUser>,        // body extractor always last
) -> Result<Json<User>, AppError> { ... }
```
`axum::debug_handler` on a handler that fails to compile turns the trait-bound wall of text into a specific,
readable error — add it before guessing which extractor is out of order.

### State + `Arc`, router composition
```rust
struct AppState { db: PgPool, config: Config }
let state = Arc::new(AppState { db, config });
let app = router(state); // axum clones the Arc per request — cheap
```
Never wrap the whole `AppState` in a `Mutex`/`RwLock` because one field needs interior mutability — give that
field its own `RwLock`/atomic, or a message channel to a task that owns it; a lock around the whole state
serializes every concurrent request through it. `Router::nest("/prefix", sub)` mounts a sub-router under a path
prefix; `Router::merge(other)` combines two at the same level (paths must not collide). Compose the tree and
apply the middleware stack once at the top — `.layer(...)` at multiple nesting levels adds a *new* instance each
time (doubled tracing spans, doubled timeouts).

### tower middleware stack: timeouts, tracing, CORS
`ServiceBuilder::new().layer(A).layer(B).layer(C)` wraps as `A(B(C(handler)))`: `A` sees the request first, the
response last. Put tracing outermost so its span covers the whole request including other middleware:
```rust
ServiceBuilder::new()
    .layer(TraceLayer::new_for_http())                 // outermost: logs every request incl. timeouts
    .layer(TimeoutLayer::new(Duration::from_secs(10)))  // cancels a handler that hangs
    .layer(CorsLayer::new()
        .allow_origin(["https://app.example.com".parse().unwrap()])
        .allow_methods([Method::GET, Method::POST])
        .allow_credentials(true))                       // never `Any` origin + credentials(true)
```
A timed-out handler returns a generic 504 by default — map it to your `AppError` shape in a fallback layer if
clients need a typed body. actix-web: `.wrap(Logger::default()).wrap(Cors::permissive())` plus
`client_request_timeout` on `HttpServer`.

### Error type implementing `IntoResponse`
```rust
#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("not found")]
    NotFound,
    #[error("validation failed: {0}")]
    Validation(String),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::NotFound => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::Validation(_) => (StatusCode::UNPROCESSABLE_ENTITY, self.to_string()),
            AppError::Database(e) => {
                tracing::error!(error = %e, "database error"); // log the real cause, never send it
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error".to_string())
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}
```
actix-web: `impl ResponseError for AppError` (default `error_response()` uses `status_code()`); Rocket:
`impl<'r> Responder<'r, 'static> for AppError`.

### Validation
```rust
#[derive(Deserialize, garde::Validate)]
struct CreateUser {
    #[garde(email)]
    email: String,
    #[garde(length(min = 1, max = 100))]
    name: String,
}
body.validate()?; // after extracting Json(body); AppError::from(garde::Report) via #[from]
```
`validator` (`#[derive(Validate)]` + `#[validate(email)]`) is equivalent — pick one, don't mix both in one crate.
Neither replaces `serde`: serde produces the right *shape*; the validator enforces the *rules* on it.

### tokio runtime correctness
- **Never block**: `std::thread::sleep`, `std::fs::*`, a sync DB/HTTP client, or a tight CPU loop inside `async
  fn` stalls the worker thread — every other task scheduled there waits. Use `tokio::time::sleep`, `tokio::fs`, an
  async driver, or `spawn_blocking(move || bcrypt::hash(pw, cost)).await??` for the rest.
- **`JoinSet`** spawns a dynamic number of tasks and yields results as they finish (vs. a `Vec<JoinHandle<T>>`
  awaited one at a time):
  ```rust
  let mut set = JoinSet::new();
  for id in ids { let db = db.clone(); set.spawn(async move { fetch(&db, id).await }); }
  while let Some(res) = set.join_next().await { /* Result<T, JoinError> */ }
  ```
  Dropping a `JoinHandle` does **not** cancel the task; `set.abort_all()` does.
- **Cancellation safety**: `select!` **drops every branch but the one that resolved first** — in-progress work on
  the losing branches is abandoned mid-step. Only cancel-safe ops belong in a branch (`mpsc::Receiver::recv`,
  `Notify::notified`); never a partial `read_exact` or a multi-step write.
- **Cooperative shutdown**: clone a `CancellationToken` (tokio-util) into each long-running task; `.cancel()` from
  the shutdown handler, `select! { _ = token.cancelled() => return, ... }` inside loops.

### sqlx: compile-time checked queries, offline mode, pools, migrations
```rust
// compile-time checked against the live DB (or .sqlx/ cache) at `cargo build` time
let user = sqlx::query_as!(
    User,
    "SELECT id, email FROM users WHERE id = $1",
    id
)
.fetch_optional(&pool)
.await?
.ok_or(AppError::NotFound)?;
```
`query!`/`query_as!` need a reachable `DATABASE_URL` at build time, or a committed `.sqlx/` directory (`cargo sqlx
prepare`, then `SQLX_OFFLINE=true cargo build` in CI) — commit `.sqlx/` so CI never needs DB credentials to
compile. **Verified (sqlx 0.9 CHANGELOG):** every `query*()` fn now requires `impl SqlSafeStr`, implemented only
for `&'static str` and `AssertSqlSafe<S>` — a `format!()`-built query string no longer compiles against
`sqlx::query()` without wrapping it in `AssertSqlSafe(...)`, which exists to make "I built SQL from user input" a
visible, deliberate act. Never reach for that wrapper to silence the compiler on untrusted input — use bound
parameters (`$1`, `$2`, …); reserve dynamic SQL for trusted fragments (e.g., an allowlisted `ORDER BY` column).
One pool per process, built once at startup: `PgPoolOptions::new().max_connections(10)` (size against the DB's
own limit ÷ instance count) `.acquire_timeout(Duration::from_secs(5)).connect(&url).await?`.

Migrations: `sqlx migrate add -r <name>` creates a paired up/down `.sql` file; `sqlx migrate run` applies pending
ones; `sqlx::migrate!("./migrations").run(&pool).await?` embeds and runs them at startup (fine for one instance;
a multi-instance rollout should run migrations from one place, not every replica).

### serde
Derive `Serialize`/`Deserialize` on request/response structs; `#[serde(rename_all = "camelCase")]` at the struct
level for a JS-facing API instead of renaming every field; `#[serde(default)]` for optional fields with a sane
default instead of making every consumer handle `Option`; `#[serde(skip_serializing_if = "Option::is_none")]` to
omit null fields instead of `"field": null`.

### tracing + tracing-subscriber
```rust
tracing_subscriber::registry()
    .with(EnvFilter::from_default_env().add_directive("myapp=debug".parse()?))
    .with(tracing_subscriber::fmt::layer().json()) // structured logs in production
    .init();
```
`#[tracing::instrument(skip(state, pool))]` on a handler creates a span per call with its args as fields (skip
large/sensitive ones); prefer `tracing::info!(user_id = %id, "user created")` (structured fields) over an
interpolated string so logs stay queryable.

### Graceful shutdown
```rust
axum::serve(listener, app).with_graceful_shutdown(shutdown_signal()).await?;
pool.close().await; // after the await above returns — listener has actually stopped by then

async fn shutdown_signal() {
    let ctrl_c = async { tokio::signal::ctrl_c().await.expect("ctrl_c") };
    #[cfg(unix)] // SIGTERM only exists on Unix; Windows relies on ctrl_c alone
    let term = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("signal").recv().await;
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = term => {} }
}
```
This stops accepting new connections and waits for in-flight ones to finish before the `.await?` above returns.

### Config
Load once at startup — `#[derive(Deserialize)] struct Config` built via
`::config::Config::builder().add_source(::config::Environment::default()).build()?.try_deserialize()?` (or plain
`serde` + `std::env`) — validate eagerly and exit non-zero on a missing/invalid value rather than panicking deep
inside a handler on first use. Rocket reads config from `Rocket.toml`/env via its own `figment` — don't hand-roll a second loader.

### actix-web notes (where it diverges from axum)
- Body extractors have no "must be last" rule — actix-web buffers the body first, order is free.
- State: `web::Data<T>` (already an `Arc`) via `.app_data(web::Data::new(state))` — don't add another `Arc`.
- Errors: `impl ResponseError for AppError` (default `error_response()` uses `status_code()` + `Display`);
  middleware order is outermost-registered-runs-outermost, same mental model as tower. Routing already uses
  `{id}` (no 0.8-style migration needed).

## 4. Error handling
- One `AppError` enum per crate (`thiserror`, `#[from]` to wrap lower-level errors); exactly one
  `IntoResponse`/`ResponseError` impl decides the client-facing status and body.
- Never leak an internal error's `Display`/`Debug` output (a DB error, a file path, a panic message) to the
  client — log it with `tracing::error!` at the conversion site, return a generic message for anything not an
  explicitly modeled "safe to show" variant.
- Propagate with `?`, not `.unwrap()`/`.expect()`, on anything that can fail from external input, I/O, or a
  network call — a panic in a handler is caught as a 500, but it skips your error taxonomy and logging fields.
- `#[from]` on an `AppError` variant only for errors that map to that *specific* status — don't blanket
  `#[from] anyhow::Error` in a library-facing type; reserve `anyhow` for the binary's `main`.

## 5. Testing
- **Unit**: `#[cfg(test)] mod tests` next to pure functions/business logic — no HTTP layer, no real DB.
- **Route-level integration, axum**: build the `Router`, call it in-process with `tower::ServiceExt::oneshot` —
  no socket bound, fastest option:
  ```rust
  #[tokio::test]
  async fn returns_404_for_missing_user() {
      let app = router(test_state().await);
      let req = Request::builder().uri("/api/users/00000000-0000-0000-0000-000000000000")
          .body(Body::empty()).unwrap();
      assert_eq!(app.oneshot(req).await.unwrap().status(), StatusCode::NOT_FOUND);
  }
  ```
- **actix-web**: `test::init_service(App::new()...)` + `test::TestRequest::get().uri(...).to_request()` +
  `test::call_service(&app, req).await`.
- **Database-backed**: `#[sqlx::test]` spins up an isolated database/schema per test from migrations
  automatically — prefer it over mocking the pool; mock a repository trait for pure unit tests instead.
- **E2E**: a real bound `TcpListener` + an HTTP client for flows crossing process boundaries — keep it thin, push
  most coverage to route-level `oneshot` tests. New behavior needs a test; a bug fix needs a failing-then-passing one.

## 6. Performance
- One pool/client per process (§3) — never per request; size `max_connections` against the DB's real limit
  divided by the number of running instances.
- Paginate every list endpoint (keyset scales better than offset); never return an unbounded `SELECT *` as JSON.
- Check N+1 queries on any handler looping a query per row — batch with `WHERE id = ANY($1)` or a join instead.
- `JoinSet`/`tokio::spawn` for genuinely independent async work; don't spawn a task for something already fast
  and sequential — spawning has overhead too.
- `Arc::clone` is a cheap refcount bump; `.clone()` on the `String`/`Vec`/`HashMap` *inside* it copies the whole
  allocation — pass `&str`/`&[T]`, clone only at an ownership boundary.
- Stream large responses (`Body::from_stream`) instead of buffering a big payload in memory.

## 7. Security
- Validate every external input at the boundary (§3) — the highest-leverage fix in this stack.
- Parameterize all SQL via `query!`/`query_as!` — never `format!()` user input into a query (§3's `AssertSqlSafe`).
- CORS: an explicit origin allowlist, never a wildcard origin with `allow_credentials(true)` (invalid per the
  Fetch spec, a bypass risk if honored anyway).
- Secrets from validated env vars via the config loader (§3), never hardcoded or logged — don't log a full
  request body or an `Authorization` header; `tracing`'s filters don't redact for you.
- Rate-limit auth endpoints specifically (`tower_governor` or an edge limiter) — the highest-value target, often
  missed by a generic per-IP limiter scoped only to "expensive" routes.
- Keep dependencies current; run `cargo audit` periodically (owned by `topic-dependencies.md`, not this guide).
- Never write `unsafe` to "fix" a compile error — see `.agents/rules/lang-rust.md` invariant 4.

## 8. Concurrency / async
- Only genuine `.await` points yield control. Real work between awaits (parsing, hashing) is fine; a *loop* of
  CPU work with no await in it blocks that worker — move it to `spawn_blocking` if non-trivial.
- `Arc<AppState>` cloned per request shares read-mostly state; a field that changes needs its own
  synchronization (`RwLock` for occasional writes, a channel for serialized ones) — never a blanket lock.
- `select!`'s cancellation semantics (§3) are the most common async-Rust bug in handlers racing a timeout against
  real work — ask "what does the losing branch leave half-done?" before writing one.
- Prefer `JoinSet` over a hand-rolled `FuturesUnordered` loop — it also gives `abort_all()` for cancellation.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `:id`/`*rest` path syntax (axum) | panics at router-build time on 0.8+ (matchit 0.8) | `/{id}`, `/{*rest}` |
| `Json<T>` before `State`/`Path`/`Query` | won't compile — body must be extracted last | reorder args, body last |
| New `Arc::new(state)`/`Pool` per request | defeats sharing, exhausts the DB connection limit | build once at startup, share via `State`/`web::Data` |
| Whole `AppState` behind one `Mutex` | serializes every request through one lock | lock only the mutating field, or use a channel |
| `format!()`-built SQL passed to `query()` | injection; sqlx 0.9 needs `AssertSqlSafe` to compile it | bound parameters via `query!`/`query_as!` |
| Blocking call inside `async fn` | stalls every other task on that worker | `tokio::time::sleep`, async I/O, `spawn_blocking` |
| `select!` around a partial read/write | losing branch's progress is silently dropped | only cancel-safe ops in `select!` branches |
| Two error response shapes in one service | clients can't handle failures uniformly | one `AppError` → one `IntoResponse` |
| Wildcard CORS origin + `allow_credentials(true)` | invalid per spec; credential leak if honored | explicit origin allowlist |
| Router with no `TimeoutLayer` | one stuck upstream call hangs the connection | `TimeoutLayer` on every router |
| Raw error `Display`/full body sent to the client | leaks internals (DB errors, paths, stack info) | log server-side, generic message to client |

## 10. Review checklist
- [ ] every handler validates input (typed extractor + `garde`/`validator`) before business logic runs
- [ ] axum: body-consuming extractor is last in every handler's argument list
- [ ] state is `Arc`-shared, built once; no field-wide lock around state that only needs partial mutability
- [ ] exactly one `AppError` → `IntoResponse`/`ResponseError`; no ad hoc `(status, string)` returns
- [ ] no blocking call inside an `async fn`; CPU-heavy work goes through `spawn_blocking`
- [ ] every `select!` branch is cancel-safe; no partial reads/writes lost on the losing branch
- [ ] router has a timeout layer, tracing layer, explicit CORS allowlist (never wildcard + credentials)
- [ ] SQL goes through `query!`/`query_as!`; `.sqlx/` is committed if CI has no live database
- [ ] one shared pool per process, sized against the DB's connection limit ÷ instance count
- [ ] graceful shutdown drains the pool after in-flight requests finish; no `process::exit()` in a signal handler
- [ ] secrets come from validated config/env, never hardcoded or logged; auth endpoints are rate-limited
- [ ] new behavior has a route-level test (`oneshot`/`test::call_service`), plus `#[sqlx::test]` for DB code
- [ ] `node .agents/scripts/verify.mjs --only rust` passes (fmt, clippy `-D warnings`, test)

## 11. References
- axum (routing, extractors, `CHANGELOG.md` 0.8 path syntax) — https://github.com/tokio-rs/axum
- actix-web — https://actix.rs · Rocket — https://rocket.rs
- tokio (`spawn`, `JoinSet`, `select!`, `spawn_blocking`, `signal`) — https://tokio.rs
- tower / tower-http — https://docs.rs/tower, https://docs.rs/tower-http
- sqlx README + `CHANGELOG.md` (0.9 `AssertSqlSafe`) — https://github.com/launchbadge/sqlx
- serde https://serde.rs · tracing https://docs.rs/tracing · garde https://docs.rs/garde · thiserror https://docs.rs/thiserror
- Principles: `.agents/guides/principles/security.md`, `testing-strategy.md`, `performance.md`, `concurrency.md`,
  `error-handling.md`, `api-design.md`, `database-design.md`
