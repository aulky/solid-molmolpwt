# Per-stack profilers

Everything under "Verified here" was actually run on this machine (Windows 11, Node 25.6, Python 3.14.2,
Go 1.26.3, Cargo 1.97.1, no .NET SDK, no PHP) on 2026-09-28. Everything under "Not installed here - check
first" is the standard, well-known invocation - run `<tool> --help` before relying on exact flags, since
profiler CLIs change flags across versions more often than languages change syntax.

## Web (browser-rendered pages, Core Web Vitals, bundle size)
- **chrome-devtools MCP** (configured in this workspace's global MCP list - `agy mcp list` shows
  `chrome-devtools-mcp`, VERIFIED): drive a real Chrome, start a performance trace, navigate/interact, stop
  the trace, and read back Core Web Vitals (LCP, CLS, INP) and the top time/script-execution consumers.
  Prefer this over reading Lighthouse scores off a cached run - it measures THIS build. Tool names are
  whatever `list_resources`/the tool list shows once connected (they may differ by server version); do not
  assume exact tool names without checking.
- **Lighthouse** (CLI, if installed): `npx lighthouse <url> --output=json --output-path=./lh.json` (or
  `--preset=desktop`). Needs a running server - build then serve first with the project's build and start
  commands from AGENTS.md (e.g. `bun run build`, then `bun run start`); never profile the dev server (unminified, uninstrumented, unrepresentative).
- **Bundle size**: the project's own bundle analyzer if configured (check `vite.config.ts`/`webpack.config.*`
  for one first); otherwise `du -sh .output/**/*.js` / `Get-ChildItem -Recurse | Measure-Object Length -Sum`
  as a coarse proxy, or `npx vite-bundle-visualizer` for a Vite project (verify it's still the current
  package name for this project's Vite major before installing).

## Node / Bun (server or CLI hot paths) - Verified here
- CPU: `node --cpu-prof --cpu-prof-dir=<dir> <script or test cmd>` (VERIFIED flag on Node 25.6; also
  `--cpu-prof-interval=<us>` for sampling rate) - writes a `.cpuprofile` you open in Chrome DevTools'
  Performance panel ("Load profile") or via the chrome-devtools MCP.
- Memory: `node --heap-prof --heap-prof-dir=<dir> <script>` (VERIFIED flag) for allocation profiling, or
  `--prof` + `--prof-process` for the older text-based V8 log format.
- Bun: `bun run --smol <script>` reduces memory but is not a profiler; for CPU, Bun's own `--inspect`
  flag connects Chrome DevTools over the inspector protocol - check `bun --help` for this Bun's exact flags
  before relying on them (verify per version, Bun ships new profiling flags frequently).

## Python - Verified here (cProfile), check first (py-spy)
- No-install fallback (stdlib, VERIFIED on Python 3.14.2): `python -m cProfile -o out.prof -m pytest -k slow`
  (or your script directly), then `python -m pstats out.prof` (interactive: `sort cumulative`, `stats 20`)
  or `snakeviz out.prof` for a flame-graph view if `snakeviz` is installed.
- **py-spy** (sampling profiler, works on a running process without code changes - `pip install py-spy`,
  not installed on this machine, check `py-spy --help` first): `py-spy record -o profile.svg --pid <pid>`
  for a flamegraph, `py-spy top --pid <pid>` for a live top-like view. Useful when you cannot restart the
  process with cProfile flags (a running server).

## Go - Verified here
- `go test -bench=. -cpuprofile=cpu.out -memprofile=mem.out ./...` (VERIFIED flags via `go help testflag`
  on Go 1.26.3), then `go tool pprof cpu.out` (interactive: `top`, `list <func>`, `web` for a graph if
  graphviz is installed).
- A running service: import `net/http/pprof` (registers `/debug/pprof/*`), then
  `go tool pprof http://localhost:<port>/debug/pprof/profile?seconds=30`.

## Rust - check first (not installed here)
- `cargo install flamegraph` then `cargo flamegraph --bin <name> -- <args>` produces `flamegraph.svg`.
  On Windows this needs either WSL/Linux `perf`, or a Windows ETW-based backend depending on the installed
  version - run `cargo flamegraph --help` and read its README for the current Windows story before
  assuming it works out of the box; it may need an elevated terminal.
- `cargo bench` (with the `criterion` dev-dependency if the project has it) for statistically sound
  micro-benchmarks with built-in before/after comparison - check `Cargo.toml` for whether it's already set up.

## .NET - check first (no SDK installed on this machine)
- `dotnet tool install --global dotnet-trace`, then `dotnet-trace collect --process-id <pid>` (or
  `-- <cmd>` to launch and trace) produces a `.nettrace` file; `dotnet-trace report topN` or open it in
  Visual Studio / PerfView. Verify exact flags with `dotnet-trace collect --help` for the installed version.
- `dotnet-counters monitor -p <pid>` for a live metrics view (GC, thread pool, custom `EventCounters`)
  without a full trace.

## PHP - check first (not installed here)
- **Xdebug**: set `xdebug.mode=profile` (php.ini or `-d`), run the request/script, produces a `cachegrind.out.*`
  file under `xdebug.output_dir`; view with QCachegrind/KCachegrind or the web-based Webgrind. Adds real
  overhead - never enable profiling mode in production, only on a copy/staging request.
- **Blackfire**: `blackfire run php script.php` or the browser companion for a live request; needs the
  Blackfire agent + probe installed and an account - check `blackfire version` first.

## General
- Whatever the profiler, run the SAME command for baseline and after-fix, with the same inputs/warm-up,
  and prefer the median of 3+ runs over a single sample - single-run numbers on a shared/laptop machine are
  routinely +/-20%.
