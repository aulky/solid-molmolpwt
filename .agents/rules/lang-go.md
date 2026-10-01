---
trigger: glob
globs: "**/*.go,**/go.mod"
description: "Go quick card: toolchain, invariants, idioms, pitfalls. Loaded when editing .go files or go.mod."
---
# Go — quick card
Deep guide: `.agents/guides/languages/go.md` — read it before non-trivial Go work (new package, concurrency, public API, perf).
Principles: `.agents/guides/principles/error-handling.md`, `.agents/guides/principles/concurrency.md`, `.agents/guides/principles/testing-strategy.md`, `.agents/guides/principles/simplicity.md`.

## Toolchain (use the project's own config first)
- Format: `gofmt -l .` (fix: `gofmt -w <file>`) · Lint: `go vet ./...`, then `golangci-lint run` if a `.golangci.*` file exists, else `staticcheck ./...` if installed · Build: `go build ./...` · Test: `go test ./...` (`go test -race ./...` after concurrency changes; needs cgo + a 64-bit C compiler) · All: `node .agents/scripts/verify.mjs --only go`
- The language version is the `go` line in `go.mod`, not the installed toolchain. Read it before using any feature below. `go build` accepts too-new stdlib APIs; `go vet` (stdversion) reports them.
- PowerShell splits `-flag=file.ext` at the dot: quote it, e.g. `go test "-coverprofile=cover.out" ./...`.

## Invariants (MUST / NEVER — with reason → alternative)
1. NEVER discard an error (`x, _ := f()` or an unchecked call) — failures turn into silent wrong results. Instead return it with context: `return fmt.Errorf("load user %s: %w", id, err)`. Handle it once: log it OR return it, not both.
2. NEVER compare errors with `==` or match `err.Error()` text — wrapping and message changes break both. Instead use `errors.Is(err, ErrNotFound)` or `errors.As(err, &target)` (Go 1.26+: `errors.AsType[*MyErr](err)`).
3. MUST take `ctx context.Context` as the first parameter of every function that does I/O or can block, and pass it down — cancellation stops at the first function that drops it. NEVER store ctx in a struct or pass `nil`; use `context.TODO()` as a marked placeholder.
4. NEVER start a goroutine without an owner that waits for it and an exit path (ctx done, channel closed) — leaked goroutines hold memory and connections forever. Instead use `errgroup.WithContext` for fallible fan-out, `sync.WaitGroup` otherwise (Go 1.25+: `wg.Go(f)`).
5. MUST `defer cancel()` right after `context.WithCancel/WithTimeout`, and `defer resp.Body.Close()` / `rows.Close()` right after the error check — otherwise contexts, connections and file handles leak.
6. NEVER hand-edit `go.sum` or add `replace ../local` to a committed `go.mod` — builds break for everyone else. Instead run `go get mod@version` then `go mod tidy`; use an uncommitted `go.work` for local multi-module work.
7. NEVER `panic` for expected failures (bad input, I/O) in library code — callers cannot handle it. Instead return an error; panic only for programmer bugs.

## Idioms & pitfalls Flash models get wrong
- Go ≥ 1.22 loop variables are per-iteration: do not write `v := v` or `tc := tc` (only for modules with `go 1.22`+). `for i := range n` works since 1.22.
- `maps.Keys`/`maps.Values` return iterators (1.23), not slices: use `slices.Sorted(maps.Keys(m))`. Map iteration order is random.
- A range-over-func iterator must stop when `yield` returns false, or the program panics at runtime.
- An interface holding a typed nil pointer is not nil: in a func returning `error`, write `return nil`, never return a nil `*MyErr` variable.
- Writing to a nil map panics. The zero values of `sync.Mutex`, `bytes.Buffer`, `strings.Builder` and nil slices are ready to use. Never copy a struct that holds a mutex; use pointer receivers.
- Declare interfaces in the consuming package, 1–3 methods; return concrete types. No interface for a single implementation "for mocking".
- Generics only when the same code is needed for 2+ concrete types; first check `slices`, `maps`, `cmp`.
- `defer` in a loop runs at function end: move the loop body into a function.
- `http.Get` and a zero `http.Client` have no timeout; a zero `http.Server` has no `ReadHeaderTimeout`. Set timeouts and use `http.NewRequestWithContext`.
- Logging: `log/slog` with key-value pairs and an injected `*slog.Logger`; never `fmt.Println` for logs; never log secrets.
- Tests: standard `testing`, table-driven with `t.Run`; `t.Helper()`, `t.TempDir()`, `t.Context()` (1.24). Add testify only if `go.mod` already requires it. No `time.Sleep` to wait for goroutines.
- Package names: short, lowercase, no `util`/`common`; no stutter (`user.Service`, not `user.UserService`).

## Example — bad → good
```go
func Load(path string) *Config {
	data, _ := os.ReadFile(path)
	var c Config
	json.Unmarshal(data, &c)
	return &c
}
```
```go
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("load config: %w", err) // *PathError already names the path
	}
	var c Config
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	return &c, nil
}
```

## Before finishing
- [ ] `gofmt -l .` prints nothing · [ ] `go vet ./...` clean (and golangci-lint if configured) · [ ] `go test ./...` passes; `-race` run or SKIP reason stated if goroutines changed · [ ] `go mod tidy` leaves go.mod/go.sum unchanged · [ ] no discarded errors, no goroutine without an exit path, no dropped ctx
