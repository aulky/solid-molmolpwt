---
trigger: model_decision
globs: "**/*.rs"
description: "Apply when working in a Rust web codebase (Cargo.toml depends on axum, actix-web, rocket or tokio): routing, state, middleware, async, errors, sqlx."
---
# Rust web (axum/actix-web/rocket/tokio) — quick card
Applies only if Cargo.toml depends on axum, actix-web, rocket or tokio. Otherwise ignore this rule.
Deep guide: `.agents/guides/frameworks/rust-web.md` — read before non-trivial routing/state/middleware/error/sqlx work.
Language card: `.agents/rules/lang-rust.md` (borrowing, errors, async, clippy) — this pack does not repeat it.

## Project shape
- Detect the framework from `Cargo.toml` first: axum is `Router::new().route(...)` + extractors as fn args;
  actix-web is `HttpServer::new(|| App::new().service(...))` + `web::Data`; Rocket is `#[get("/x")]` + `#[launch]`.
  Open an existing route file before writing a new one — the three do not mix.
- axum 0.8+ (VERIFIED crates.io + CHANGELOG): dynamic segments are `/{id}`, catch-all `/{*rest}` — matchit 0.8
  made the old `/:id`/`/*rest` PANIC at router-build time. Never write `:id` in new axum code.
- One `#[tokio::main] async fn main()` builds tracing, config, the pool and router/HttpServer once, then calls
  `.serve()`/`.run()` — never re-create a pool, subscriber or client inside a handler.

## Invariants (MUST / NEVER — with reason → alternative)
1. MUST validate external input (path, query, JSON body, headers) with a typed extractor plus a `garde`/`validator`
   derive — NEVER trust a deserialized struct just because `serde` compiled it; serde checks shape, not domain
   rules (format, length, range).
2. MUST put the body-consuming extractor (`Json<T>`, `String`, `Bytes`, `Form<T>`) LAST in an axum handler's args
   — only one extractor may read the body and axum enforces "last" at compile time; reorder args, don't delete
   an extractor to dodge the error.
3. MUST share state via `State<Arc<AppState>>` (axum) or `web::Data<AppState>` (actix-web), built once at startup
   — NEVER a fresh `Arc::new(...)` per call, and NEVER wrap the *whole* state in one `Mutex` when one field
   needs interior mutability — that serializes every request through one lock.
4. MUST implement one `AppError` enum with `impl IntoResponse`/`ResponseError` mapping each variant to a status
   + safe body — NEVER mix ad hoc `(StatusCode, String)` returns with a typed error.
5. NEVER block the async runtime — no `std::thread::sleep`, `std::fs::*`, a blocking client, or a CPU-heavy loop
   in `async fn` — use `tokio::time::sleep`/`tokio::fs`/an async driver, or `spawn_blocking` for the rest; a
   blocked worker stalls every other task on it. NEVER hold a lock guard across an `.await`.
6. MUST layer `TraceLayer` + `TimeoutLayer` + an explicit `CorsLayer` allowlist onto every axum `Router`
   (actix-web: `Logger` + `actix_cors::Cors` + a client timeout) — no timeout lets a stuck upstream call hang
   the connection forever.
7. MUST write SQL through `sqlx::query!`/`query_as!` (checked at compile time, or `.sqlx/` committed via
   `cargo sqlx prepare` for CI with no live DB) over one shared pool built once at boot — NEVER
   `format!()`/concatenate request data into a query (sqlx 0.9's `query()` needs `AssertSqlSafe` for
   non-`&'static str`) and NEVER a per-request connection.

## Patterns
- Handlers return `impl IntoResponse` or `Result<T, AppError>` so `?` converts via `From<E> for AppError`.
- Shutdown: `axum::serve(listener, app).with_graceful_shutdown(shutdown_signal())`, awaiting
  `tokio::signal::ctrl_c()` (+ SIGTERM on Unix) so the pool drains before exit — never `process::exit()` directly.

## Pitfalls
- `#[axum::debug_handler]` turns a misordered-extractor error into readable text before you guess why.
- Rocket 0.5.1 (VERIFIED crates.io, last published May 2024) — confirm the project wants Rocket before adding
  new Rocket code.
- `tokio::spawn` needs `Send + 'static` — clone the `Arc` into `async move`. `select!` drops every losing
  branch's work — only cancel-safe calls (`mpsc::Receiver::recv`), never a partial `read_exact`.
- `web::Data<T>` (actix-web) is already an `Arc` — an `Arc<Mutex<T>>` for read-only access is needless.

## Example — bad → good
```rust
// BAD: blocking call in async fn, string-built query (SQL injection), ad hoc error shape
async fn create_user(Json(body): Json<CreateUser>) -> Response {
    std::thread::sleep(std::time::Duration::from_millis(1));
    let q = format!("INSERT INTO users (email) VALUES ('{}')", body.email);
    (StatusCode::OK, "ok").into_response()
}
```
```rust
// GOOD: axum 0.8, validated input, shared pool, one typed error, no blocking
async fn create_user(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateUser>, // body extractor last
) -> Result<Json<User>, AppError> {
    body.validate()?; // garde/validator derive on CreateUser
    let user = sqlx::query_as!(User, "INSERT INTO users (email) VALUES ($1) RETURNING id, email", body.email)
        .fetch_one(&state.db) // one shared PgPool
        .await?;
    Ok(Json(user))
}
```

## Before finishing
- [ ] handlers validate input · [ ] one `AppError` → `IntoResponse`/`ResponseError` · [ ] no blocking in async fns
      · [ ] router has timeout + tracing + CORS · [ ] SQL via `query!`/`query_as!` (offline data committed if no
      live DB in CI) · [ ] `node .agents/scripts/verify.mjs --only rust` passes
