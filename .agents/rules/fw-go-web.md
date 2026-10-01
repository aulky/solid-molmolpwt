---
trigger: model_decision
globs: "**/*.go"
description: "Apply when working in a Go web codebase (go.mod requires chi, gin, echo, fiber — or code imports net/http): routing, middleware, timeouts, JSON, DB, testing."
---
# Go web services (net/http · chi · gin · echo · fiber) — quick card
Applies only if go.mod requires chi, gin, echo, fiber — or code imports net/http. Otherwise ignore this rule.
Deep guide: `.agents/guides/frameworks/go-web.md` — read before non-trivial routing/DB/shutdown work.
Go language basics: `.agents/rules/lang-go.md`.

## Project shape
- Detect the framework from `go.mod` first: bare `net/http` (Go 1.22+ `ServeMux`), chi, gin, echo (`/v4` vs `/v5`
  import path, both maintained), or fiber (wraps fasthttp) — handlers and middleware types differ completely. Open
  an existing handler before writing a new one.
- Typical shape: `cmd/server/main.go` wires config, logger, DB pool, mux/router, one `*http.Server`; `internal/api`
  holds handlers/middleware, `internal/service` holds framework-free logic, `internal/store` holds `database/sql`/
  `pgx` queries (often `sqlc`-generated). Deep guide §2.
- One process boots all of this once — never re-create a DB pool, logger, or router per request.

## Invariants (MUST / NEVER — with reason → alternative)
1. MUST set `ReadHeaderTimeout` (and usually `ReadTimeout`/`WriteTimeout`/`IdleTimeout`) on every `http.Server` —
   NEVER rely on the zero-value server; it has no timeouts and a slow/stalled client (Slowloris) exhausts it.
2. MUST shut down gracefully: catch `SIGINT`/`SIGTERM` (`signal.NotifyContext`), `srv.Shutdown(ctx)`, close the DB
   pool after — NEVER `os.Exit()` immediately; in-flight requests get cut and connections leak.
3. MUST bound+validate JSON bodies (`http.MaxBytesReader` + `DisallowUnknownFields()`) and check path/query params
   before use — NEVER decode unbounded or trust `r.PathValue(...)`/query as pre-checked; unbounded body = DoS,
   unchecked param = raw text.
4. MUST map every error to an HTTP status at one place (a typed `apiError{status,msg}` or the framework's error
   handler) — NEVER `http.Error(w, err.Error(), 500)`; that leaks internals, one status for all.
5. MUST pass `r.Context()` (or a bounded child) into every downstream call — NEVER `context.Background()` inside a
   handler; that drops the client's cancellation/deadline and any request-scoped value set upstream.
6. MUST reuse one `*sql.DB` / `*pgxpool.Pool` per process — NEVER open a new connection/pool per request; that
   exhausts the database's connection limit under load.
7. NEVER let a recover-from-panic middleware swallow the panic silently — it MUST log the stack, return 500, and
   sit outermost in the chain so it catches panics from every layer, including logging.

## Patterns
- Since Go 1.22, stdlib `ServeMux` does method + wildcard routing (`mux.HandleFunc("POST /users/{id}", h)`,
  `r.PathValue("id")`) — prefer this over a router dependency for a small service; reach for chi/gin/echo/fiber only
  when go.mod already pulls one in.
- Middleware composes as `func(http.Handler) http.Handler` (net/http, chi) chained outer→inner: recover,
  request-id, logging, auth, then route-specific ones.
- Keep `internal/service` free of `net/http`/framework types — a handler decodes+validates, calls a service method
  with plain Go values; that's what makes it testable without a server.

## Pitfalls
- gin/echo/fiber use their own Context type (`*gin.Context`, `echo.Context`, `fiber.Ctx`), not `(w, r)` — a bare
  net/http snippet compiles wrong there. Echo ships a v5 major alongside a maintained v4 — check go.mod's exact
  import path (`/v4` vs `/v5`); their Context APIs differ.
- Fiber wraps fasthttp: `fiber.Ctx` byte slices are recycled after the handler returns — don't retain them.
- `pgx.ErrNoRows`/`sql.ErrNoRows` is a raw driver error — translate to a domain `ErrNotFound` once in the
  store/service layer, not in every handler.

## Example — bad → good
```go
// bad: no timeouts, unbounded body, raw error leaked, no shutdown path
http.HandleFunc("/users", func(w http.ResponseWriter, r *http.Request) {
	var u User
	json.NewDecoder(r.Body).Decode(&u)
	if err := save(r.Context(), u); err != nil {
		http.Error(w, err.Error(), 500) // leaks err text, no status taxonomy
	}
})
http.ListenAndServe(":8080", nil) // zero-value server: no timeouts
```
```go
// good: bounded+strict decode, mapped error, explicit timeouts (Go 1.22+ ServeMux)
mux := http.NewServeMux()
mux.HandleFunc("POST /users", func(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var u User
	if err := dec.Decode(&u); err != nil {
		writeError(w, &apiError{http.StatusBadRequest, "invalid body"})
		return
	}
	if err := save(r.Context(), u); err != nil { // r.Context(), not Background()
		writeError(w, err) // maps apiError -> status; else logs + 500
		return
	}
})
srv := &http.Server{Addr: ":8080", Handler: mux, ReadHeaderTimeout: 5 * time.Second}
```

## Before finishing
- [ ] `http.Server` sets `ReadHeaderTimeout` · [ ] graceful shutdown (signal → `Shutdown(ctx)` → close pool) ·
      [ ] JSON decode bounded + `DisallowUnknownFields` · [ ] errors mapped to status, never raw `err.Error()` ·
      [ ] `r.Context()` threaded through · [ ] one DB pool per process ·
      [ ] `node .agents/scripts/verify.mjs --only go` passes
