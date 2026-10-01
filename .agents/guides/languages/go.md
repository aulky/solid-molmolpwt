# Go — engineering guide
> Scope: writing, reviewing and testing Go modules (services, CLIs, libraries). Quick card: `.agents/rules/lang-go.md`.
> Last verified: 2026-09 — release notes go.dev/doc/go1.21 to go1.27 (newest release: go1.27.1, 2026-09-01); `go doc`, `go help` and `go tool fix help` on the installed go1.26.3; errgroup source (golang.org/x/sync v0.23.0); golangci-lint v2 docs; go.dev/ref/mod; race detector docs. Every code block here was compiled, vetted and tested with go1.26.3.

## 1. Mental model / philosophy
- Clear beats clever. Write boring, explicit code with early returns.
- Errors are values. Handle them where they occur, with context.
- Make the zero value useful: `sync.Mutex`, `bytes.Buffer`, `strings.Builder` and nil slices need no constructor.
- Compose small interfaces and concrete structs. Embed only when you want the whole method set.
- Write code sequentially first. Add goroutines for I/O fan-out or measured CPU wins, and give each one an owner that waits for it.
- Use the standard library first. Each dependency is code you now maintain.
- The `go` line in `go.mod` sets both the language version and the stdlib API level (see the §2 table).

## 2. Project structure & tooling
Layout (see go.dev/doc/modules/layout):
```text
cmd/api/main.go     # thin: read config, wire dependencies, call run(ctx)
internal/user/      # packages by domain, not by layer; internal/ is not importable from outside the module
internal/postgres/  # adapters to external systems
```
- Package names are short, lowercase and singular. No `util`/`common`/`models`. No stutter: `user.Service`, not `user.UserService`. You do not need a `pkg/` or `src/` directory. Do not create layers before code needs them.
- Keep `main` tiny and put the logic in `run(ctx, args, stdout) error` so it can be tested.

These commands work in PowerShell and POSIX shells. Quote `-flag=name.ext`: PowerShell 7.6 split an unquoted `-coverprofile=cover.out` into `-coverprofile=cover` and `.out` (observed).

| Task | Command |
|---|---|
| Format check / fix | `gofmt -l .` / `gofmt -w path/to/file.go` |
| Vet (`stdversion`, `lostcancel`, `copylocks`, `waitgroup`, `printf`, …) | `go vet ./...` |
| Lint | `golangci-lint run` if a `.golangci.*` file exists; else `staticcheck ./...` if installed |
| Test / race | `go test ./...` / `go test -race ./...` |
| One subtest | `go test -run '^TestParseKV$/^no_separator$' ./parse` (spaces become `_`) |
| Coverage | `go test "-coverprofile=cover.out" ./...` then `go tool cover "-html=cover.out"` |
| Fuzz (one package, one target) | `go test -run '^$' -fuzz '^FuzzParseKV$' -fuzztime 30s ./parse` |
| Benchmark | `go test -run '^$' -bench . -benchmem ./parse` |
| Vulnerabilities | `govulncheck ./...` (install: `go install golang.org/x/vuln/cmd/govulncheck@latest`) |
| Dependencies | `go get example.com/mod@v1.2.3`, `go mod tidy`, `go list -m -u all`, `go mod why -m example.com/mod` |
| Modernize (1.26+) | `go fix -diff ./...` to preview, `go fix ./...` to apply. Only when asked, as a separate change |
| Kit gate | `node .agents/scripts/verify.mjs --only go` |

Toolchain facts:
- `-race` needs cgo and a C compiler. On Windows that means mingw-w64 with runtime v8+. Observed here: a 32-bit MinGW failed with `cc1.exe: sorry, unimplemented: 64-bit mode not compiled in`, and `CGO_ENABLED=0` gave `-race requires cgo`. When it cannot run, report SKIP with the reason, never PASS.
- `go build` accepts stdlib APIs newer than the `go` line; `go vet` rejects them. With `go 1.24` in go.mod and toolchain 1.26, vet printed `sync.Go requires go1.25 or later (module is go1.24)`. Go 1.27's `go test` runs this check by default.
- Since 1.21 the `go` directive is a strict minimum. `GOTOOLCHAIN` decides whether a newer toolchain is downloaded, and `toolchain` only suggests one. Never raise the `go` line as a side effect, because every consumer must then upgrade. Check the go.mod diff after `go get`.
- Only go commands write `go.sum`. Commit it together with go.mod. `go mod tidy` must be a no-op before you finish.
- Workspaces: `go work init ./svc ./lib`, then `go work use ./tools`. The modules reference calls committing go.work "generally inadvisable" because CI then tests the wrong dependency versions. Run CI without it: POSIX `GOWORK=off go test ./...`; PowerShell `$env:GOWORK='off'; go test ./...`. Prefer go.work over committed `replace` lines.
- Tools (1.24+): `go get -tool honnef.co/go/tools/cmd/staticcheck@latest`, then `go tool staticcheck ./...`. golangci-lint recommends its binary release over `go install`/`go tool`.
- A golangci-lint v2 config starts with `version: "2"`. Its `standard` set is errcheck, govet, ineffassign, staticcheck and unused; gosimple and stylecheck are now part of staticcheck. `golangci-lint migrate` converts v1 configs. Enable new linters only when asked.

Version table. Check the module's `go` line before you use a row:

| Go | Changes that affect how you write code |
|---|---|
| 1.21 | `min`/`max`/`clear`; `log/slog`, `slices`, `maps`, `cmp`; `context.WithoutCancel`/`AfterFunc`; `sync.OnceValue`; PGO via `default.pgo` |
| 1.22 | per-iteration loop variables; `for i := range n`; ServeMux `"GET /items/{id}"` + `r.PathValue`; `math/rand/v2`; `cmp.Or` |
| 1.23 | range-over-func (`iter.Seq`/`Seq2`); `slices.Collect/Sorted`; `maps.Keys` returns an iterator; unstopped timers are collected and timer channels are unbuffered |
| 1.24 | generic type aliases; `tool` directive; `b.Loop()`, `t.Context()`; `os.Root`; `json:",omitzero"`; `strings.SplitSeq/Lines`; `crypto/rand.Text` |
| 1.25 | `wg.Go(f)`; `testing/synctest`; `http.CrossOriginProtection`; GOMAXPROCS follows cgroup limits; vet `waitgroup`/`hostport`; code that uses a result before checking `err` now panics (compiler fix) |
| 1.26 | `new(expr)`; `errors.AsType[E]`; `slog.NewMultiHandler`; `go fix` modernizers; Green Tea GC by default; experimental `goroutineleak` profile |
| 1.27 | generic methods (not in interfaces); `encoding/json` runs on the v2 engine (+ `encoding/json/v2`; error texts may differ); `uuid` package; `goroutineleak` GA; `strings.CutLast` |

## 3. Core idioms
- Use guard clauses so the happy path stays left-aligned. No `else` after `return`.
- Write a constructor only when there are invariants or dependencies. Prefer a `Config` struct over functional options until several callers need different optional settings.
- Declare interfaces in the consumer, with 1–3 methods. Accept interfaces and return concrete types. In tests, pass a small hand-written fake.
```go
// package handler declares only what it calls:
type userGetter interface {
	GetUser(ctx context.Context, id string) (User, error)
}
```
- Generics: write the concrete version first. Generalize only when a second type needs the same logic, and check `slices`, `maps`, `cmp` and `sync.OnceValue` before writing your own. If the code calls methods, take an interface instead. Use tight constraints (`cmp.Ordered`, `comparable`, `~string`), not `any` plus a type switch.
- Iterators: return `iter.Seq`/`iter.Seq2` for lazy, large or streaming data. Return a slice when the data is small or the caller needs `len` or indexing. Stop as soon as `yield` returns false; otherwise the runtime panics with `range function continued iteration after function for loop body returned false`.
```go
func Ints(s string) iter.Seq2[int, error] {
	return func(yield func(int, error) bool) {
		for f := range strings.SplitSeq(s, ",") {
			n, err := strconv.Atoi(strings.TrimSpace(f))
			if !yield(n, err) || err != nil {
				return
			}
		}
	}
}
```
- Slices: `append` can share the backing array, so `slices.Clone` before you keep a caller's slice or return an internal one. Preallocate with `make([]T, 0, n)`. A nil slice encodes to JSON `null` and an empty one to `[]`, so pick deliberately.
- Maps: reading a nil map is fine; writing to one panics. Iteration order is random, so use `slices.Sorted(maps.Keys(m))` when you need a stable order. Maps are not safe for concurrent writes.
- Receivers: use a pointer receiver when the method mutates, the type is large, or it holds a mutex. Use one receiver kind per type. Never copy a value that holds a lock (vet `copylocks`).
- Naming: MixedCaps; keep initialisms upper-case (`userID`, `ServeHTTP`); no `Get` prefix on getters; short receivers (`s *Store`); `ErrX` for sentinels, `XError` for error types. Doc comments are full sentences that start with the name.
- Enums: `type State int` with `iota`. Make the zero value `StateUnknown` so an unset field is detectable.
- Avoid `init()` side effects and package-level mutable state. Wire dependencies explicitly in `main`.
- Logging: inject a `*slog.Logger` and log at the boundary. Use constant lowercase keys and `InfoContext(ctx, ...)`. vet's `slog` check catches broken key-value pairs. Redact secrets with a `slog.LogValuer`.

## 4. Error handling
1. Check each error immediately. Do not touch the other return values until `err == nil`.
2. Add context once per layer: `fmt.Errorf("get user %q: %w", id, err)`. Keep it lowercase, with no trailing punctuation and no "failed to" prefix. Do not repeat what the wrapped error already says (`*os.PathError` already includes the path).
3. Handle each error once: log it or return it, never both.
4. `%w` makes the wrapped error part of your API. Use `%v` to hide implementation details such as driver errors.
5. Use `errors.Join` for independent failures such as validation or cleanup. It returns nil when every input is nil.
6. Reserve `panic` for programmer bugs. `net/http` recovers a panic in a handler per request, but a panic in a goroutine you started crashes the process. errgroup deliberately does not propagate panics (see its v0.23.0 source).

| Kind | Declare | Caller checks | Use when |
|---|---|---|---|
| Sentinel | `var ErrNotFound = errors.New("store: not found")` | `errors.Is(err, ErrNotFound)` | callers branch on *which* failure |
| Typed | `type ValidationError struct{ Field string }` | `errors.As` / `errors.AsType` (1.26+) | callers need data from the error |
| Opaque | `fmt.Errorf("...: %v", err)` | `err != nil` | default for internal failures |

```go
func Classify(err error) string {
	switch {
	case err == nil:
		return "ok"
	case errors.Is(err, ErrNotFound):
		return "404"
	}
	if ve, ok := errors.AsType[*ValidationError](err); ok { // Go 1.26+
		return "400 " + ve.Field
	}
	var ve *ValidationError // before Go 1.26
	if errors.As(err, &ve) {
		return "400 " + ve.Field
	}
	return "500"
}
```
Typed-nil trap: `var ve *ValidationError; return ve` returns a non-nil `error` that holds a nil pointer, so `err != nil` is true. Return a literal `nil` instead.

## 5. Testing
- Use the standard `testing` package. Use testify or go-cmp only if go.mod already requires them.
- Write table-driven tests with named cases, `t.Run` and `t.Parallel()`. Since Go 1.22 you do not need `tc := tc`.
```go
for _, tc := range tests {
	t.Run(tc.name, func(t *testing.T) {
		t.Parallel()
		k, v, err := ParseKV(tc.in)
		if (err != nil) != tc.wantErr {
			t.Fatalf("ParseKV(%q) err = %v, wantErr %v", tc.in, err, tc.wantErr)
		}
		if k != tc.wantK || v != tc.wantV {
			t.Errorf("ParseKV(%q) = %q, %q; want %q, %q", tc.in, k, v, tc.wantK, tc.wantV)
		}
	})
}
```
- Write failure messages as `F(in) = got, want x`. Use `t.Fatalf` when the test cannot continue and `t.Errorf` otherwise. Useful helpers: `t.Helper()`, `t.Cleanup`, `t.TempDir()`, `t.Context()` (1.24, canceled before cleanups run) and `t.Setenv` (not allowed in parallel tests).
- HTTP: test handlers with `httptest.NewRecorder()` and clients with `httptest.NewServer(h)` plus `srv.Client()`.
- Prefer fakes to mocks. With consumer-side interfaces, a fake is about 10 lines. Do not add a mock generator the project does not already use.
- Never `time.Sleep` to wait for goroutines. Use channels, a WaitGroup, or `synctest.Test(t, func(t *testing.T) {...})` (1.25) for virtual time.
- Fuzz parsers and decoders, and assert invariants rather than exact outputs. Failing inputs land in `testdata/fuzz/<FuzzName>/`; commit them as regression cases.
```go
func FuzzParseKV(f *testing.F) {
	f.Add("a=1")
	f.Fuzz(func(t *testing.T, s string) {
		k, v, err := ParseKV(s)
		if err != nil {
			return
		}
		if k == "" || strings.Contains(k, "=") || k+"="+v != s {
			t.Errorf("ParseKV(%q) = %q, %q", s, k, v)
		}
	})
}
```
- Benchmarks: `for b.Loop() {...}` (1.24) keeps the body from being optimized away and does not time setup. Compare runs with `benchstat` (golang.org/x/perf).
- Gate slow tests with `testing.Short()` or a `//go:build integration` tag. Keep golden files in `testdata/`. `ExampleX()` functions with `// Output:` are docs and tests at once.

## 6. Performance
- Measure first. Profile with `go test "-cpuprofile=cpu.out" -run '^$' -bench . ./parse`, then `go tool pprof -http=localhost:8080 cpu.out`. See heap escapes with `go build "-gcflags=-m" ./parse`.
- Allocations are usually the lever. Preallocate, use `strings.Builder`, use `strconv` rather than `fmt.Sprintf` in hot loops, and avoid repeated `[]byte`/`string` conversions.
- Reuse one `http.Client` (it pools connections) and always close response bodies. Wrap syscall-heavy I/O in `bufio`. Add `sync.Pool` only after a profile shows allocation pressure.
- Avoid N+1 queries: batch them, and configure the `database/sql` pool (`SetMaxOpenConns`, `SetConnMaxLifetime`).
- PGO: commit a representative CPU profile as `default.pgo` in the main package directory. Since 1.25, GOMAXPROCS follows Linux cgroup CPU limits, so `automaxprocs` is usually redundant. Tune `GOMEMLIMIT`/`GOGC` only after measuring.

## 7. Security
- Run `govulncheck ./...` after dependency changes and in CI. It reports only vulnerabilities your code can reach.
- SQL: always use placeholders, e.g. `db.QueryContext(ctx, q, args...)` (`$1` for Postgres, `?` for MySQL/SQLite). Never build SQL with `fmt.Sprintf`.
- Render HTML with `html/template`, never `text/template`.
- Run processes as `exec.CommandContext(ctx, "git", "log", arg)`. Never pass user input to `sh -c` or `cmd /c`.
- Open user-supplied paths through `os.OpenRoot(dir)` (1.24), or reject a name when `filepath.IsLocal` is false.
- Servers: set `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout` and `IdleTimeout` (zero means no limit). Cap bodies with `http.MaxBytesReader`. Wrap cookie-authenticated endpoints in `http.NewCrossOriginProtection().Handler(mux)` (1.25).
- Clients: `http.DefaultClient` has no timeout. Set `Timeout` or a ctx deadline, and read through `io.LimitReader`.
- Generate secrets with `crypto/rand` (`rand.Text()`, 1.24), never `math/rand/v2`. Compare them with `subtle.ConstantTimeCompare`. Hash passwords with bcrypt or argon2id (golang.org/x/crypto).
- Never set `InsecureSkipVerify: true` outside tests. Keep secrets out of source, logs and error strings. Check bounds before narrowing conversions like `int32(n)`. Review every `unsafe` or cgo change as a security change.

## 8. Concurrency
| Need | Use |
|---|---|
| Shared state (cache, counters) | `sync.Mutex` (`RWMutex` only if read-heavy and measured), `atomic.Int64` |
| Hand off data or ownership, pipelines | channels |
| Wait for N tasks that cannot fail | `sync.WaitGroup` + `wg.Go(f)` (1.25+) |
| Fallible fan-out, cancellation, concurrency limit | `errgroup.WithContext` + `SetLimit` |
| Lazy one-time init | `sync.OnceValue` / `sync.Once` |
| Stop many goroutines | cancel a `context` (or close a channel) |

```go
func FetchAll(ctx context.Context, c *http.Client, urls []string) ([][]byte, error) {
	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(8)
	bodies := make([][]byte, len(urls)) // each goroutine writes only its own index
	for i, u := range urls {
		g.Go(func() error {
			b, err := get(ctx, c, u) // stops early once ctx is canceled
			if err != nil {
				return fmt.Errorf("fetch %s: %w", u, err)
			}
			bodies[i] = b
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, err
	}
	return bodies, nil
}
```
- errgroup: the derived ctx is canceled by the first error or when `Wait` returns, and `Wait` returns that first error. Do not reuse a Group for another task.
- Every goroutine needs an owner that waits for it and an exit path. The classic leak is a send nobody receives after a timeout:
```go
ch := make(chan int, 1) // make(chan int) would block this sender forever once ctx wins
go func() { ch <- work() }()
select {
case v := <-ch:
	return v, nil
case <-ctx.Done():
	return 0, ctx.Err()
}
```
- Channels: only the sender closes. A send on a closed channel panics. A nil channel blocks forever, which disables a `select` case. `for v := range ch` ends only when the channel is closed.
- Context goes first in the parameter list. Never store it in a struct and never pass nil. Always `defer cancel()` (vet `lostcancel`). Check `ctx.Err()` in long loops. Send with `select { case ch <- v: case <-ctx.Done(): return ctx.Err() }`. Use `context.WithoutCancel(ctx)` for work that must outlive the request.
- WaitGroup: call `Add` before the `go` statement, never inside the goroutine (vet `waitgroup`). `wg.Go` avoids the issue.
- Mutexes: lock, then `defer` the unlock. Never hold a lock across I/O or channel operations. Place the mutex directly above the fields it guards. Use `sync.Map` only for grow-only caches or goroutines working on disjoint keys.
- Finding bugs: `go test -race` costs 5–10x memory and 2–20x time, so run it in tests and CI, not in production. For leaks, use goroutine dumps (`/debug/pprof/goroutine?debug=2`) or the `goroutineleak` profile (1.26 behind `GOEXPERIMENT=goroutineleakprofile`, GA in 1.27).
- Timers: in modules with `go 1.23` or later, unstopped timers are garbage-collected, so the old "`time.After` leaks" advice no longer applies. Still `defer ticker.Stop()`.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `data, _ := os.ReadFile(p)` | silent wrong results | check, wrap with `%w`, return |
| `err == ErrX` on wrapped errors, `err.Error() == "..."` | breaks on wrapping or when the text changes | `errors.Is` / `errors.As` / `errors.AsType` |
| log the error and also return it | duplicate log lines | return with context; log at the boundary |
| `v := v` / `tc := tc` (go ≥ 1.22) | noise | delete (`go fix` `forvar`) |
| goroutine with no owner or exit | leaks memory and connections | errgroup/WaitGroup + ctx |
| `wg.Add(1)` inside the goroutine | races with `Wait` | `wg.Go(f)` or `Add` before `go` |
| `time.Sleep` to synchronize tests | flaky and slow | channels, WaitGroup, `synctest` |
| `IUser` interface beside its only implementation | indirection with no benefit | concrete type; the consumer declares the interface |
| generics for one type; `any` + type switch | complexity, lost type safety | concrete code; tight constraints |
| `http.Get(url)`, `http.Server{}` without timeouts | hangs; Slowloris | client `Timeout`/ctx; server timeouts |
| `defer f.Close()` inside a loop | handles pile up until the function returns | move the loop body into a function |
| returning a nil `*MyErr` as `error` | `err != nil` is true | `return nil` |
| `panic` on bad input in a library | crashes callers | return an error |
| hand-edited go.sum; committed `replace ../x` | builds break for others | go commands; uncommitted go.work |
| `fmt.Sprintf` SQL; `math/rand` tokens | injection; predictable secrets | placeholders; `crypto/rand` |
| `context.Background()` deep in the call stack | cancellation is lost | accept `ctx` from the caller |

## 10. Review checklist
- [ ] `gofmt -l .` prints nothing; `go vet ./...` is clean (no stdlib API newer than the `go` line); golangci-lint/staticcheck clean if configured
- [ ] every error is checked, wrapped once with context and matched with `errors.Is/As`; no typed-nil returns
- [ ] every blocking or I/O function takes `ctx` first and passes it on; every `cancel` is deferred
- [ ] every goroutine has an owner, an exit path and a waiter; `go test -race ./...` ran, or the SKIP reason is stated
- [ ] shared state is guarded by a mutex, atomics or channel ownership; no copied locks
- [ ] interfaces are small and consumer-side; no speculative abstractions or generics
- [ ] bodies, rows, files and tickers are closed right after the error check
- [ ] tests are table-driven and cover error paths; parsers have fuzz tests; no sleeps; no weakened assertions
- [ ] placeholders, timeouts, body limits and `crypto/rand` are used; no secrets in logs; `govulncheck` ran after dependency changes
- [ ] go.mod/go.sum changed only through go commands; `go mod tidy` is a no-op; the `go` line was not raised by accident

## 11. References
- Releases: https://go.dev/doc/devel/release · https://go.dev/doc/go1.26 · https://go.dev/doc/go1.27
- Style: https://go.dev/doc/effective_go · https://go.dev/wiki/CodeReviewComments · https://google.github.io/styleguide/go/ · https://go.dev/doc/comment
- Modules: https://go.dev/doc/modules/layout · https://go.dev/ref/mod · https://go.dev/doc/toolchain
- Language: https://go.dev/blog/go1.13-errors · https://go.dev/blog/range-functions · https://go.dev/blog/loopvar-preview
- Testing: https://go.dev/blog/synctest · https://go.dev/doc/security/fuzz/ · https://go.dev/doc/articles/race_detector
- Performance: https://go.dev/doc/diagnostics · https://go.dev/doc/pgo
- Security: https://go.dev/doc/security/best-practices · https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck
- Tools: https://pkg.go.dev/golang.org/x/sync/errgroup · https://golangci-lint.run/docs/ · https://staticcheck.dev/docs/
- Kit principles: `.agents/guides/principles/error-handling.md`, `.agents/guides/principles/concurrency.md`, `.agents/guides/principles/testing-strategy.md`, `.agents/guides/principles/simplicity.md`, `.agents/guides/principles/security.md`
