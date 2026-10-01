# Go web services — engineering guide
> Scope: framework-agnostic Go HTTP service engineering — stdlib `net/http` (Go 1.22+ `ServeMux`), chi, gin, echo,
> fiber — plus `database/sql`, pgx, and sqlc. Quick card: `.agents/rules/fw-go-web.md`. Go fundamentals (errors,
> context, goroutines, testing): `.agents/rules/lang-go.md`, `.agents/guides/languages/go.md`.
> Last verified: 2026-09-30 — GitHub tags/releases feeds (live) for chi, gin, echo, fiber, pgx, sqlc,
> golang-migrate, go-playground/validator; go.dev/doc/devel/release for Go itself. Re-check go.mod before trusting
> a version claim — it drifts.

## 1. Mental model / philosophy
- **A Go web service is composed `http.Handler`s.** Routing selects one, middleware wraps it, `net/http` (or the
  chosen router) dispatches. Every framework here is a thin adapter over this shape — don't let it change the
  shape of your business logic.
- **Explicit over implicit.** Go has no framework-standard DI container; wire dependencies (DB pool, logger,
  config) by hand once in `main` as struct fields or closures. Don't add a wiring layer for a handful of handlers
  (YAGNI).
- **The `http.Server` boundary is the trust line.** Everything from a request is untyped bytes from an untrusted,
  possibly slow client until a decode+validation step says otherwise.
- **Context flows one direction:** request → handler → service → store. Every I/O function takes a
  `context.Context` and honors its deadline/cancellation; dropping it anywhere breaks the chain downstream.
- **Errors are values with an explicit status mapping.** Business/store code returns a plain Go `error`; exactly
  one place at the HTTP edge decides the client-facing status and body — never let a raw error string reach a
  response.
- Go's per-request goroutine model (§8) means a service scales by adding independent, short-lived units of work —
  not by architecting around threads.

## 2. Project structure & tooling
### Versions (verified live against GitHub tags/releases feeds, 2026-09-30 — re-check go.mod, this drifts)
| Module | Verified current | Notes |
|---|---|---|
| Go toolchain | 1.27.0 stable (2026-08-19); 1.26.0 (2026-02-10) | `ServeMux` method+wildcard routing since 1.22; check go.mod's `go` line first |
| `go-chi/chi/v5` | v5.3.2 (2026-08-20) | needs Go ≥ 1.23; middleware = `func(http.Handler) http.Handler` |
| `gin-gonic/gin` | v1.12.0 (2026-02-28) | own `*gin.Context`, not stdlib-middleware-compatible |
| `labstack/echo` | v5.4.0 and v4.16.0, both 2026-09-27 | both majors maintained — check go.mod's `/v4` vs `/v5` |
| `gofiber/fiber` | v3.5.0 (2026-08-13), v2.52.15 (2026-08-12), both maintained | wraps fasthttp; `fiber.Ctx` (v3) vs `*fiber.Ctx` (v2) |
| `jackc/pgx/v5` | v5.11.0 (2026-09-07) | preferred Postgres driver; own pool (`pgxpool`), independent of `database/sql` |
| `sqlc-dev/sqlc` | v1.31.1 (2026-04-22) | CLI generating typed Go from `.sql` files + schema, not a library import |
| `golang-migrate/migrate/v4` | v4.20.1 (2026-09-09) | schema migrations; works with pgx, `database/sql`, others |
| `go-playground/validator/v10` | v10.30.5 (2026-09-20) | struct-tag validation; what gin's `ShouldBindJSON` uses |

### Typical project shape
```
cmd/server/main.go   # wiring only: config, DB pool, router, http.Server, run, wait for shutdown signal
internal/
  api/               # handlers, request/response DTOs, middleware
  service/           # business logic — framework-agnostic, no *http.Request/framework Context here
  store/             # database/sql or pgx queries; sqlc-generated code under store/gen or db/gen
db/
  migrations/        # golang-migrate .up.sql/.down.sql pairs, numbered
  query/             # sqlc: .sql files, "-- name: GetUser :one" style annotations
  sqlc.yaml
go.mod
```
Keep `internal/service` free of `net/http`/framework types: a handler decodes+validates, calls a service method
with plain Go values, then encodes the result — that's what makes it testable with plain unit tests and reusable
from a CLI or cron job later.

### Commands (same on POSIX and Windows — Go's own CLI)
| Task | Command |
|---|---|
| Run · Build | `go run ./cmd/server` · `go build ./...` |
| Format · Vet | `gofmt -l .` (fix: `gofmt -w <file>`) · `go vet ./...` (+ `golangci-lint run` if configured) |
| Test | `go test ./...` (add `-race` after concurrency changes) |
| Generate DB code | `sqlc generate` (reads `sqlc.yaml`, no DB connection needed) |
| Apply migrations | POSIX `migrate -database "$DATABASE_URL" -path db/migrations up`; PowerShell `migrate -database "$env:DATABASE_URL" -path db/migrations up` |
| Everything (this kit) | `node .agents/scripts/verify.mjs --only go` |

## 3. Core idioms
### Routing: stdlib `ServeMux` since Go 1.22
Verified (go.dev Go 1.22 release notes): `ServeMux` patterns can include an HTTP method and wildcard segments.
```go
mux := http.NewServeMux()
mux.HandleFunc("GET /users/{id}", getUser)      // method + named wildcard
mux.HandleFunc("POST /users", createUser)
mux.HandleFunc("GET /files/{path...}", getFile) // trailing wildcard captures the rest of the path
func getUser(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id") // a plain string — parse/validate before use, it is not pre-checked
    ...
}
```
A more specific pattern wins over a wildcard; a trailing `/` matches a whole subtree, while `/users/{id}` won't
match bare `/users/`. Zero dependencies needed when a service has no other reason to pull in a router.

### Routing: chi — `http.Handler`-compatible
Middleware type is exactly `func(http.Handler) http.Handler`, so ordinary stdlib middleware works unmodified:
```go
r := chi.NewRouter()
r.Use(middleware.RequestID, middleware.Recoverer, middleware.Logger)
r.Route("/users", func(r chi.Router) {
    r.Get("/{id}", getUser)  // id via chi.URLParam(r, "id")
    r.Post("/", createUser)
})
http.ListenAndServe(":8080", r) // wrap in an explicit &http.Server{} for timeouts (Invariant 1)
```

### Routing: gin — own Context, not `(w, r)`
```go
r := gin.New()
r.Use(gin.Recovery(), gin.Logger())
r.POST("/users", func(c *gin.Context) {
    var body CreateUser
    if err := c.ShouldBindJSON(&body); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusCreated, gin.H{"id": body.Email})
})
```
`ShouldBindJSON` already runs `validator` against `binding:"required,..."` tags (verified, gin docs) — a
hand-written check on the same fields after a successful bind is dead code.

### Routing: echo — check `/v4` vs `/v5`
Check go.mod's import path first — both majors are maintained and their Context method sets differ:
```go
e := echo.New()
e.Use(middleware.Recover(), middleware.Logger())
e.GET("/users/:id", func(c echo.Context) error {
    return c.JSON(http.StatusOK, map[string]string{"id": c.Param("id")})
})
```
Echo handlers return `error`; `HTTPErrorHandler` converts it to the response. Return
`echo.NewHTTPError(http.StatusNotFound, "user not found")` — never call `c.JSON(...)` **and then also** `return
err`; that double-writes or silently drops one.

### Routing: fiber — wraps fasthttp, not net/http
`fiber.Ctx` (v3) / `*fiber.Ctx` (v2) isn't an `http.ResponseWriter`/`*http.Request`; stdlib middleware doesn't plug
in directly:
```go
app := fiber.New()
app.Get("/users/:id", func(c fiber.Ctx) error { // v3: value, not a pointer
    return c.JSON(fiber.Map{"id": c.Params("id")})
})
```
fasthttp reuses request/response byte buffers — copy anything from `c` that must outlive the handler's return.

### Middleware composition (stdlib + chi)
```go
func RequestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            start := time.Now()
            next.ServeHTTP(w, r)
            logger.InfoContext(r.Context(), "request",
                "method", r.Method, "path", r.URL.Path, "dur_ms", time.Since(start).Milliseconds())
        })
    }
}
// compose outer -> inner, e.g.: Recover(RequestID(RequestLogger(logger)(mux)))
```
Order: recover outermost (catches panics from every layer below, including the logger), then request-id, logging,
auth, then route-specific.

### Context timeouts & cancellation
`r.Context()` cancels on client disconnect or a server timeout (below) — thread it, or a bounded child, into every
downstream call:
```go
func getUser(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second) // bound one slow downstream dependency
    defer cancel()
    u, err := store.GetUser(ctx, r.PathValue("id"))
    if err != nil {
        writeError(w, err)
        return
    }
    json.NewEncoder(w).Encode(u)
}
```
Never call `context.Background()`/`context.TODO()` inside a handler — it detaches from the client's
cancellation/deadline and drops any request-scoped value a middleware set upstream.

### `http.Server` timeouts (the zero-value server has none)
```go
srv := &http.Server{
    Addr:              ":8080",
    Handler:           mux,
    ReadHeaderTimeout: 5 * time.Second,   // mitigates Slowloris — set this one at minimum
    ReadTimeout:       10 * time.Second,  // whole-request read deadline
    WriteTimeout:      10 * time.Second,  // response write deadline
    IdleTimeout:       120 * time.Second, // reclaim idle keep-alive connections
}
```
`http.ListenAndServe(addr, handler)` builds a zero-value `*http.Server` internally with **no** timeouts — fine for
a throwaway script, never for anything reachable by real traffic.

### Graceful shutdown
```go
srv := &http.Server{Addr: ":8080", Handler: mux, ReadHeaderTimeout: 5 * time.Second}
go func() {
    if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
        logger.Error("listen failed", "err", err)
        os.Exit(1)
    }
}()

ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()
<-ctx.Done() // blocks until SIGINT/SIGTERM

shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
if err := srv.Shutdown(shutdownCtx); err != nil {
    logger.Error("shutdown error", "err", err)
}
dbPool.Close() // only after Shutdown returns — handlers may still be draining
```
`srv.Shutdown` stops accepting new connections and waits for active handlers to return, bounded by the context
passed in. Never `os.Exit` before it completes — that severs in-flight responses mid-write.

### JSON decode: `DisallowUnknownFields` + size limits
```go
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
    r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MiB cap; arms *http.MaxBytesError on overflow
    dec := json.NewDecoder(r.Body)
    dec.DisallowUnknownFields()
    if err := dec.Decode(dst); err != nil {
        var maxErr *http.MaxBytesError
        if errors.As(err, &maxErr) {
            return &apiError{http.StatusRequestEntityTooLarge, "request body too large"}
        }
        return &apiError{http.StatusBadRequest, "invalid request body"}
    }
    if dec.More() { // reject a second JSON value appended after the first
        return &apiError{http.StatusBadRequest, "body must contain exactly one JSON value"}
    }
    return nil
}
```
Use `http.MaxBytesReader`, not a bare `io.LimitReader` — its `*http.MaxBytesError` (Go 1.19+) lets an overflow map
to 413 instead of a generic 400.

### Validation
Pair decode with `go-playground/validator` struct tags for anything beyond "is this syntactically valid JSON":
```go
type CreateUser struct {
    Email string `json:"email" validate:"required,email"`
    Name  string `json:"name"  validate:"required,min=1,max=200"`
}
var validate = validator.New(validator.WithRequiredStructEnabled()) // built once at startup, reused

if err := validate.Struct(body); err != nil {
    var ve validator.ValidationErrors
    if errors.As(err, &ve) { // ve[i].Field(), ve[i].Tag() -> per-field 400 message list
    }
}
```
Reflection-caching means constructing `*validator.Validate` per request (instead of once at startup) is wasted work.

### Errors → status mapping
One small taxonomy, converted to a response in exactly one place:
```go
type apiError struct {
    Status int
    Msg    string
}
func (e *apiError) Error() string { return e.Msg }

var ErrNotFound = &apiError{http.StatusNotFound, "not found"}

func writeError(w http.ResponseWriter, err error) {
    var ae *apiError
    if errors.As(err, &ae) {
        http.Error(w, ae.Msg, ae.Status)
        return
    }
    slog.Error("unhandled error", "err", err)                       // log the real error server-side
    http.Error(w, "internal error", http.StatusInternalServerError) // never leak err.Error() to the client
}
```
Translate `pgx.ErrNoRows`/`sql.ErrNoRows` to `ErrNotFound` once, in the store/service layer — not re-checked in
every handler that calls it.

### `database/sql`, pgx, and sqlc
- `database/sql` is driver-agnostic; `pgx/v5` has its own interface (`pgxpool.Pool`) with Postgres-only features
  (`COPY`, `LISTEN`/`NOTIFY`, binary protocol) — use `pgxpool` directly for Postgres-only work, `pgx/v5/stdlib`
  under `database/sql` only if the code must stay driver-agnostic.
- `sqlc` (v1.31.1) generates typed Go query functions from `.sql` files + schema — write SQL once, get a
  compile-checked `*Queries` struct; don't hand-write `rows.Scan(...)` for anything it can generate.
```go
pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL")) // one pool, created once at boot
if err != nil { log.Fatal(err) }
defer pool.Close()

q := db.New(pool) // sqlc-generated constructor
user, err := q.GetUser(ctx, id)
if errors.Is(err, pgx.ErrNoRows) {
    return nil, ErrNotFound
}
```
- Size the pool (`pgxpool.Config.MaxConns`, `MinConns`, `MaxConnLifetime`) against the DB's connection limit ÷
  running instances — an unbounded pool can starve the database. Open at boot; close after `srv.Shutdown`.

### Structured request logging with `slog`
Build one JSON logger at boot — `slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level:
slog.LevelInfo}))`, then `slog.SetDefault(logger)` — and pass it into `RequestLogger` above. Wrap
`http.ResponseWriter` to capture the status code after the fact (chi ships `middleware.WrapResponseWriter`) and
add it as a structured field alongside `method`/`path`/`dur_ms`, never an interpolated sentence. Never log bodies,
auth headers, or tokens.

## 4. Error handling
- One small taxonomy, one conversion point (§3) — no handler hand-rolls its own shape or status-code guess.
- Wrap errors with context as they cross layers (`fmt.Errorf("get user %s: %w", id, err)`) so a server log shows
  the full call chain; decide the client-facing *message* only at the HTTP edge, never mid-stack.
- Never send an internal/DB error's `Error()` text straight to a client — it can leak table/column names or
  driver-specific detail an attacker can use to fingerprint the backend.

## 5. Testing
- **Handler unit tests**: `httptest.NewRequest` + `httptest.NewRecorder()`, call the handler directly, assert on
  `rec.Code`/`rec.Body` — no real socket needed.
```go
req := httptest.NewRequest(http.MethodGet, "/users/42", nil)
req.SetPathValue("id", "42") // Go 1.22+: set path values without a mux
rec := httptest.NewRecorder()
getUser(rec, req)
if rec.Code != http.StatusOK {
    t.Fatalf("status = %d, want 200", rec.Code)
}
```
- **Full-router tests**: build the real mux/router in a helper, call `mux.ServeHTTP(rec, req)` (`app.Test(req)`
  for fiber) — catches routing/middleware-order mistakes a direct handler call misses, still in-process.
- **True e2e tests**: `httptest.NewServer` binds a real socket, so a request round-trips the actual network stack
  instead of the in-process call above:
```go
ts := httptest.NewServer(mux) // real listener; ts.URL e.g. http://127.0.0.1:port
defer ts.Close()
resp, err := ts.Client().Get(ts.URL + "/users/42")
if err != nil { t.Fatal(err) }
defer resp.Body.Close()
if resp.StatusCode != http.StatusOK {
    t.Fatalf("status = %d, want 200", resp.StatusCode)
}
```
- **Service-layer tests**: `internal/service` takes no `*http.Request`/framework Context (§2) — test it with plain
  Go values and a fake/mock store, no HTTP involved.
- **DB-touching tests**: a real test database (Docker Postgres/`testcontainers-go`), migrated first — a mocked
  `pgx` interface can't catch a wrong query or schema mismatch.
- Table-driven tests with `t.Run` (see `lang-go.md`): `{name, method, path, body, wantStatus}`.
- New behavior needs a new test; a bug fix needs a regression test that fails before the fix.

## 6. Performance
- Reuse one DB pool and one outbound HTTP client per process (§3) — never construct either inside a handler.
- Paginate every list endpoint (keyset for large tables, offset/limit fine for small ones) — never return an
  unbounded row set as JSON.
- Stream large responses (`io.Copy` into `http.ResponseWriter`) instead of buffering a large payload in memory.
- Bound every downstream call with `context.WithTimeout` (§3) — one hung dependency shouldn't exhaust available
  handler goroutines under load.
- fasthttp frameworks (fiber) reuse request/response buffers — retaining a slice/string derived from `fiber.Ctx`
  past the handler's return is a correctness bug, not just style.
- Profile with `net/http/pprof` (a separate, internal-only port) before guessing at a bottleneck.

## 7. Security
- Validate every external input (body, query, path, headers) before business logic sees it (§3) — never trust
  `r.PathValue(...)`/router params/query as pre-checked.
- Parameterized queries only — `sqlc`/`pgx` args are already parameterized; never string-concatenate user input
  into SQL (`.agents/rules/topic-database-design.md`).
- Secrets (DB URLs, signing keys, API keys) from validated env vars, never hardcoded or logged.
- Set at least `ReadHeaderTimeout` on every `http.Server` (§3) — the single highest-leverage defense against a
  slow-client DoS.
- Browser-facing API: an explicit CORS origin allowlist, never a wildcard combined with credentials/cookies.
- Rate-limit auth endpoints specifically (token-bucket by IP/account) — the highest-value target, often missed by
  a limiter scoped only to "expensive" routes.
- JWTs: pin `algorithms` on every verify call, check `exp`, keep claims minimal (`.agents/rules/topic-security.md`).

## 8. Concurrency / async
- `net/http` runs each request's handler in its own goroutine — never share a mutable struct across requests
  without a `sync.Mutex`/channel; the DB pool, `*sql.DB`, a prepared `*validator.Validate`, and `*slog.Logger` are
  already safe for concurrent use, but a package-level `var` you add is not, by default.
- Fire independent downstream calls concurrently: `errgroup.WithContext(ctx)` for fallible fan-out (one failing
  cancels the rest), `sync.WaitGroup`/`wg.Go` (Go 1.25+) otherwise.
- Never start a goroutine from a handler with no owner waiting on it — one still running against `r.Context()`
  sees it canceled the instant the handler returns. If work must outlive the request, detach with
  `context.WithoutCancel` (Go 1.21+) and give it its own bounded timeout.
- See `lang-go.md`/`guides/languages/go.md` for goroutine/channel fundamentals — this covers only the
  request-lifetime-specific parts on top.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `http.ListenAndServe(addr, mux)` in prod | zero-value server, no timeouts; Slowloris exhausts it | `&http.Server{..., ReadHeaderTimeout: ...}` |
| No signal handling, `os.Exit()` on shutdown | in-flight requests cut, DB connections orphaned | `signal.NotifyContext` + `srv.Shutdown`, close pool after |
| `json.NewDecoder(r.Body).Decode` unbounded | unbounded body = memory-exhaustion DoS | `http.MaxBytesReader` + `DisallowUnknownFields()` |
| `http.Error(w, err.Error(), 500)` any error | leaks internals; no status taxonomy | typed `apiError`/framework error at one point |
| `context.Background()` in a handler | drops cancellation/deadline, upstream values | pass/bound `r.Context()` |
| new `*sql.DB`/`pgxpool.Pool` per request | exhausts the DB's connection limit under load | one pool per process, opened at boot |
| mixing echo v4/v5 or fiber v2/v3 imports | Context APIs differ — wrong code compiles/panics | check go.mod's exact import path first |
| hand-scanned SQL rows per query | error-prone, no compile-time schema check | `sqlc generate` from schema + `.sql` files |
| goroutine started in a handler, no owner | leaks, or dies when the request context cancels | `errgroup`/`WaitGroup`, or `WithoutCancel` + timeout |
| `validator.New()` inside the handler | re-parses struct tags via reflection per request | one `*validator.Validate` at startup, reused |

## 10. Review checklist
- [ ] every `http.Server` sets `ReadHeaderTimeout` (+ Read/Write/Idle as needed) · [ ] graceful shutdown wired:
      signal → `srv.Shutdown(ctx)` → close DB pool, in that order
- [ ] JSON decode bounded (`MaxBytesReader`) + rejects unknown fields · [ ] handler validates path/query/body
      before the service layer sees it
- [ ] errors map to an explicit status in one place; no raw `err.Error()` reaches a client
- [ ] `r.Context()` (or a bounded child) threaded into every DB/outbound call
- [ ] one DB pool per process, sized against the DB's connection limit, closed on shutdown
- [ ] all SQL parameterized (sqlc/pgx args or `database/sql` placeholders) — never string-built
- [ ] framework major/import path in code (echo v4/v5, fiber v2/v3, chi v5) matches go.mod
- [ ] handler tests via `httptest`/the framework's helper; DB tests use a real test database
- [ ] no goroutine started from a handler lacks an owner or an explicit detach-with-timeout
- [ ] `node .agents/scripts/verify.mjs --only go` passes

## 11. References
- `net/http`: https://pkg.go.dev/net/http · Go 1.22 routing: https://go.dev/doc/go1.22 · releases: https://go.dev/doc/devel/release
- chi: https://github.com/go-chi/chi · gin: https://gin-gonic.com/en/docs/
- echo (match docs to go.mod's `/v4`/`/v5`): https://echo.labstack.com/
- fiber (v3/v2 separate sites): https://docs.gofiber.io/ · https://docs.gofiber.io/v2/
- pgx: https://github.com/jackc/pgx · sqlc: https://docs.sqlc.dev/
- golang-migrate: https://github.com/golang-migrate/migrate · validator: https://github.com/go-playground/validator
- Principles: `.agents/guides/principles/error-handling.md`, `concurrency.md`, `testing-strategy.md`,
  `security.md`, `performance.md`, `database-design.md`, `api-design.md`
