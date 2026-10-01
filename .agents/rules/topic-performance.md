---
trigger: model_decision
description: "Apply when asked to make code faster or lighter, or when touching hot paths, loops over large data, queries or HTTP calls in loops, caching, bundle size, rendering cost, or Core Web Vitals."
---
# Performance - topic rule
Principles guide: `.agents/guides/principles/performance.md` - read it before any optimization beyond the defaults below. Procedure: `/perf-audit`. Pipeline: section `performance` of `.agents/skills/orchestrate/references/task-types.md`: `debugger` baselines and profiles (steps 2-3, EXPLORE), one `implementer` task per hypothesis (step 4), `test-engineer` re-measures (TEST). React/Next.js code only: the installed `vercel-react-best-practices` skill (it does not apply to SolidJS components).

## Skip when
There is no performance goal and the code is not on a hot path: apply only the "Always" defaults and do not micro-optimize - readability wins.

## Protocol: measure -> profile -> optimize -> re-measure
1. State metric and budget in one line: `<metric>: <baseline> -> target <budget> on <workload>`, e.g. `p95 GET /search: 480 ms -> < 200 ms at 50 rps` or `mobile LCP: 3.4 s -> <= 2.5 s`. No number in the brief? Propose one, labelled `Guessed:` in your report, for the orchestrator to confirm. Never optimize blind.
2. Baseline with one repeatable command: same data, one warm-up, >= 5 runs, report median and p95. Keep the command for step 4.
3. Profile BEFORE changing code - find where the time goes:
   - Node `node --cpu-prof` - browser DevTools Performance panel or Lighthouse (or the chrome-devtools MCP if configured)
   - Python `py-spy` / `cProfile` - Go `pprof` - Rust `cargo flamegraph` - JVM JFR / async-profiler - .NET `dotnet-trace`
   - SQL `EXPLAIN ANALYZE` (see `topic-database-design.md`)
4. Implementer: apply only the ONE hypothesis in your brief, re-measure with the brief's baseline command, report both numbers. Keep it only if the metric moves beyond run-to-run noise; no gain -> revert it and report FAIL.
5. Verify correctness (`node .agents/scripts/verify.mjs`), then report before/after with the command.

## Always (cheap defaults, no measurement needed)
- No N+1: never a query or HTTP call per item inside a loop. Batch (`WHERE id IN (...)`, dataloader, eager-load or join).
- Independent I/O in parallel (`Promise.all`, `asyncio.TaskGroup`/`gather`, `errgroup`) with a cap on large fan-out (`topic-concurrency.md`).
- Lookups by key: build a `Map`/`Set`/dict/`HashMap` once instead of `find`/`includes`/`in list` inside a loop (O(n^2) -> O(n)).
- Paginate or stream unbounded result sets; never load a whole table or file into memory to count or filter.
- A cache needs a key, a TTL or invalidation trigger, a size bound, and a named owner that invalidates it.

## Web budgets (Core Web Vitals, "good" at the 75th percentile of page loads)
LCP <= 2.5 s - INP <= 200 ms - CLS <= 0.1. Do not lazy-load the LCP image. Set `width`/`height` or `aspect-ratio` on media and embeds. Split bundles by route, defer third-party scripts, keep event handlers short and move heavy work off the main thread (INP).

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER claim a speedup you did not measure - performance intuition is often wrong. Instead: before/after numbers from the same command.
2. NEVER trade correctness for speed silently (dropped validation, stale caches, removed awaits, weaker isolation). Instead: state the trade-off in your report and do not apply it until the user agrees (via the orchestrator).
3. NEVER add a cache, queue or new service before a profile shows the bottleneck - each adds invalidation bugs and ops cost. Instead: fix the algorithm or query first.
4. NEVER measure a dev/debug build and report it as production. Instead: the production build (the project's `build` script from root `AGENTS.md`, `cargo build --release`, ...).

## Pitfalls Flash models get wrong
- `await` inside a `for` loop over independent items (serial latency) - or the opposite: unbounded `Promise.all` over 10k items.
- Memoizing everything "for speed": cache keys that miss arguments -> stale or wrong results.
- Micro-optimizing code that runs once while the real cost is one slow query.
- Timing with a single run, or including the first (cold) run.

## Example - bad -> good
```ts
// BAD: N+1 (one query per order)
for (const order of orders) {
  order.customer = await db.customer.findUnique({ where: { id: order.customerId } });
}
// GOOD: one batched query + Map lookup
const ids = [...new Set(orders.map((o) => o.customerId))];
const customers = await db.customer.findMany({ where: { id: { in: ids } } });
const byId = new Map(customers.map((c) => [c.id, c]));
for (const order of orders) order.customer = byId.get(order.customerId);
```

## Before finishing
- [ ] Report line: `Metric: <name> | before <x> | after <y> | runs <n> | command: <cmd>` - or "not measured: <reason>"
- [ ] Changes that did not move the metric were reverted
- [ ] Verify passes after the last edit
