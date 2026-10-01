# Performance — engineering guide for AI agents
> Scope: runtime performance for any stack: measuring, budgets, complexity, N+1, caching, batching, I/O parallelism, memory, Web Vitals, load testing, regression guards. Quick card: `.agents/rules/01-engineering-standards.md` (performance defaults). Situational rule and protocol: `.agents/rules/topic-performance.md`.
> Last verified: 2026-09 — Core Web Vitals thresholds via web.dev/articles/vitals, /lcp and /inp; k6 v2.3.0 (2026-09-21) and the v2.0.0 breaking changes (JS script API unchanged) via github.com/grafana/k6/releases; `scheduler.yield()` support (Chromium, Firefox 142+, not Safari) via caniuse/MDN. All other tools are cited without versions: run `<tool> --version` before you cite one.

## 0. How to use this guide
Each section gives: definition, why, **how to check** (questions and commands for your own diff), bad → good, and the over-engineering trap. Default to readable code and optimize only when a number says so. Exception: apply the free defaults while you write (no N+1, hash lookups, concurrent independent I/O, bounded memory).

## 1. Measure first
**Definition:** find where the time or memory goes with a profiler or a benchmark before you change code. Change one thing, then measure again with the same command.
**Why:** guesses about the slow part are usually wrong. The real cost tends to be in serialization, logging, a missing index, or an allocation in a loop. An unmeasured "optimization" adds complexity and risk with no proven gain.
**How to check:**
- Does the change or PR text contain a before/after number and the command that produced it? If not, it is not a performance change. Treat it as a refactor and judge it on readability.
- Was the baseline taken on a release build with production-like data? Debug builds (`cargo build` without `--release`, dev bundles) and 10-row databases give numbers that do not transfer.
- Report the median and the p95 or p99 of at least 5 runs, not one run and not the average. Tail latency is what users feel.

| Stack | Profile | Micro-benchmark |
|---|---|---|
| Node/TS | `node --cpu-prof app.js` (open the `.cpuprofile` in DevTools), `node --inspect` | `tinybench`, `mitata` |
| Python | `py-spy record -o profile.svg -- python app.py`, `python -m cProfile -s cumtime app.py` | `python -m timeit`, `pytest-benchmark` |
| Go | `go test -bench . -benchmem -cpuprofile cpu.out`, then `go tool pprof -http=:8080 cpu.out` | `testing.B` (`b.Loop()` in Go 1.24+) + `benchstat` |
| Rust | `cargo flamegraph --release` (see its README for per-OS backends) | `criterion`, `divan` |
| JVM | JDK Flight Recorder (`-XX:StartFlightRecording`), async-profiler | JMH |
| PHP | Xdebug profiler, Blackfire, SPX | `phpbench` |
| SQL | `EXPLAIN ANALYZE` (Postgres), `EXPLAIN FORMAT=TREE` (MySQL) | the query log |
| Browser | DevTools Performance panel, Lighthouse, the `web-vitals` library | — |

**Trap:** profiling a monthly 4-second script, micro-benchmarking a function the profiler never flagged, or claiming a 3% win inside run-to-run noise (compare the spread first).

## 2. Budgets
**Definition:** a number fixed before the work starts: p95 latency, queries per request, JS bundle size, memory ceiling, or job duration. Every later change is checked against it.
**Why:** without a number, regressions arrive in defensible steps ("only +20 ms", fifty times). A budget turns "feels slow" into a failing check.
**How to check:** does the touched path have a budget in an SLO doc, a CI size limit, or a query-count test? Write the goal in one line, as the topic rule requires: `p95 GET /search: 480 ms -> < 200 ms at 50 rps`. Does your diff move the measured number toward or away from that line?
**Trap:** one blanket "everything < 100 ms" budget, including admin pages nobody waits on. Set budgets where a user or an SLA actually waits. A budget nothing enforces (§11) is decoration.

## 3. Algorithmic complexity
**Definition:** how cost grows with input size N. Fix the shape of the curve (the data structure or algorithm) before you tune constants.
**Why:** an O(n²) loop is invisible at N=100 and becomes a multi-second hang at N=100,000. No micro-tuning fixes a quadratic.
**How to check:**
- For each new loop, write down the production N. Inside the loop, look for linear searches: `.includes`, `.indexOf`, `.find`, `in list`, `array_search`, `in_array`, `contains`, or a nested `for`.
- Find loops with context, then read each hit: `node .agents/scripts/search.mjs "\bfor\b|\.forEach\(|\.map\(|\bwhile\b" src --glob "*.ts" --glob "*.tsx" -C 4`. Exit code 1 means no matches, not an error; widen the glob to your language (`*.py`, `*.go`, `*.php`). The script matches one line at a time, so judge the nesting by eye.
- Watch for hidden quadratics: string concatenation in a loop in languages with immutable strings, `list.pop(0)` in Python (use `collections.deque`), and re-sorting inside a loop.

```python
# bad: O(n*m) — `in` on a list is a linear scan for every order
vip_ids = [c.id for c in vip_customers]
vip_orders = [o for o in orders if o.customer_id in vip_ids]

# good: O(n+m) — build a set once, then O(1) lookups
vip_ids = {c.id for c in vip_customers}
vip_orders = [o for o in orders if o.customer_id in vip_ids]
```
**Trap:** replacing a clear scan over 8 fixed items with an index or a cache. Below a real N, O(n²) is not a bug, and the rewrite only costs readability.

## 4. N+1 queries
**Definition:** one query loads a list, then one more query (or HTTP call) runs per item to load related data.
**Why:** 5 dev rows means 5 unnoticed queries. 5,000 production rows means 5,000 round trips, and the connection pool becomes everyone's bottleneck.
**How to check:**
- Any `await`, query, ORM relation access, or HTTP call inside a loop or a per-item resolver is a suspect. Lazy ORM relations hide this: `post.author` in a template can be a query.
- Count the queries in a test, and make sure the count stays constant as the list grows: Django `assertNumQueries`, Laravel `Model::preventLazyLoading()` in non-production (throws on lazy loads), Rails `strict_loading`, Prisma `log: ['query']`, SQLAlchemy `echo=True` or `lazy="raise"`.
- Fixes: eager load (`include`, `with()`, `select_related` / `prefetch_related`, `selectinload`), `WHERE id IN (...)`, or DataLoader for GraphQL resolvers.

```ts
// bad: 1 + N queries
const posts = await db.post.findMany();
for (const p of posts) p.author = await db.user.findUnique({ where: { id: p.authorId } });

// good: 1–2 queries regardless of N, and only the columns used
const posts = await db.post.findMany({ include: { author: { select: { id: true, name: true } } } });
```
**Trap:** eager-loading every relation "just in case". That swaps N+1 for over-fetching and huge joins. Load exactly what this call site renders.

## 5. Caching layers and invalidation
**Definition:** keep a computed or fetched result so repeats skip the work. Layers, nearest first: request-scoped memo → in-process LRU → shared cache (Redis, Memcached) → HTTP/CDN (`Cache-Control`, `ETag`). Storing is easy. The hard parts are knowing when the value stops being true, and scoping the key so it never serves the wrong caller.
**Why:** a stale cache returns wrong answers with confidence. A key without a tenant or user id leaks data between customers. A cache with no bound is a memory leak. When a hot key expires, hundreds of requests recompute it at once (a stampede) and can take the database down.
**How to check:**
- Every entry has a TTL **and** a named invalidation path (write-through, delete on update, or an event). "Restart to clear" is not one.
- The key includes every input the value depends on: tenant, user, locale, permissions, and a schema or version prefix.
- On a cache miss or a cache outage, the code falls back to the source. The cache is an optimization, not a hard dependency.
- For hot keys, concurrent misses are coalesced: Go `golang.org/x/sync/singleflight`, a lock per key, or stale-while-revalidate.
- In-process caches are bounded (LRU with a max size). Remember that N replicas mean N different copies.

```go
// bad: global key (leaks across users), no TTL, never invalidated
val, _ := rdb.Get(ctx, "user-profile").Result()

// good: scoped + versioned key, TTL, coalesced misses, bust on write
key := fmt.Sprintf("v2:user-profile:%d", userID)
v, err, _ := group.Do(key, func() (any, error) { // singleflight.Group
    if s, err := rdb.Get(ctx, key).Result(); err == nil { return s, nil }
    s, err := loadProfileJSON(ctx, userID) // source of truth
    if err == nil { rdb.Set(ctx, key, s, 5*time.Minute) }
    return s, err
})
// on the update path, after the DB commit:
rdb.Del(ctx, key)
```
Limits: `singleflight` coalesces per process; across replicas use a short Redis lock (`SET key NX PX`) or stale-while-revalidate. A loader that read the row before the commit can re-`SET` the old value after the `DEL`; the TTL bounds that. For strict freshness, delete again shortly after the commit or bump the key version on write.
**Trap:** caching something never measured as hot (§1). Every cache adds an invalidation bug surface. The usual cheaper fix is an index or removing an N+1.

## 6. Batching
**Definition:** group many small operations into fewer round trips: bulk insert, `IN (...)`, pipelining, batch APIs.
**Why:** every round trip pays a fixed cost (RTT, parsing, transaction setup) however little data it carries. Batching spreads that cost across many items, and usually beats any per-item tuning.
**How to check:** is there a loop issuing one insert, update, query or API call per item where a bulk form exists? Is the batch **bounded** (chunked, for example 500–1,000 rows or the API's documented maximum) so it cannot hit timeouts, packet limits or parameter limits on large inputs? Is partial failure handled per chunk?

```php
// bad: one INSERT per row — N round trips, N implicit transactions
foreach ($rows as $row) { DB::table('events')->insert($row); }

// good: bounded chunks — few round trips, predictable memory
foreach (array_chunk($rows, 500) as $chunk) { DB::table('events')->insert($chunk); }
```
**Trap:** one unbounded batch built from user-controlled input. Or wrapping independent items in one all-or-nothing transaction, so one bad row rejects 10,000 good ones. Chunk for efficiency, and decide failure semantics on purpose.

## 7. I/O parallelism
**Definition:** independent I/O calls (no data dependency between them) run concurrently instead of one after another.
**Why:** sequential awaits add latencies together (3 × 200 ms = 600 ms). Concurrent calls cost about the slowest one (~200 ms), on every request.
**How to check:** for each run of consecutive `await`s or blocking calls, does call B use the result of call A? If not, combine them: `Promise.all`, `asyncio.TaskGroup` / `gather`, `tokio::join!` / `try_join!`, `errgroup`. If the number of calls grows with input size, bound it (see `.agents/guides/principles/concurrency.md` §7).

```ts
// bad: 3 sequential round trips, none depends on another
const user = await getUser(id);
const orders = await getOrders(id);
const prefs = await getPrefs(id);

// good: concurrent — latency ≈ the slowest call
const [user, orders, prefs] = await Promise.all([getUser(id), getOrders(id), getPrefs(id)]);
```
```rust
let (user, orders) = tokio::try_join!(get_user(id), get_orders(id))?; // fails fast on the first error
```
**Trap:** `Promise.all(items.map(fetch))` over 10,000 items floods your own dependency or the connection pool. CPU-bound work also gains nothing from `async`. It needs threads, processes or workers (concurrency.md §1).

## 8. Memory and allocations
**Definition:** how much a program allocates and retains. That covers per-iteration garbage, references that live too long, and unbounded growth.
**Why:** a high allocation rate means GC pauses, which show up in p99 while the average looks fine. A forgotten reference (a listener never removed, an ever-growing map) is a slow leak that crashes the process hours after deploy.
**How to check:**
- Is data loaded whole when it could be streamed or paginated? Look for `readFileSync` on uploads, `fetchAll()`, `.all()` on large tables, `json.load` on huge files, `Collection::all()`. Prefer iterators, cursors, `chunk()`/`lazy()`, and streams.
- Does every added listener, timer or subscription have a matching removal in the same lifecycle (`removeEventListener`, `clearInterval`, `onCleanup`, `AbortController.abort()`)?
- Do module-level maps or arrays grow per request without a bound?
- Tools: heap snapshots (DevTools, `node --heapsnapshot-signal=SIGUSR2` on POSIX; on Windows `node --inspect` + DevTools Memory tab, or `v8.writeHeapSnapshot()`), Python `tracemalloc`, Go `-memprofile` / `-benchmem` (allocs/op), JFR allocation events.

```python
# bad: loads a multi-GB file into memory
rows = open("events.csv").read().splitlines()

# good: streams line by line — constant memory
with open("events.csv", encoding="utf-8") as f:
    for line in f:
        handle(line)
```
**Trap:** object pools and manual buffer reuse in ordinary code before a profile shows GC pressure. They add real bugs (a buffer reused while still referenced) in exchange for a guessed win.

## 9. Web Vitals (frontend)
**Definition (verified 2026-09):** Core Web Vitals are judged at the **75th percentile of real page loads**, split into mobile and desktop.

| Metric | Measures | Good | Poor |
|---|---|---|---|
| LCP (Largest Contentful Paint) | loading | ≤ 2.5 s | > 4.0 s |
| INP (Interaction to Next Paint; replaced FID in March 2024) | responsiveness | ≤ 200 ms | > 500 ms |
| CLS (Cumulative Layout Shift) | visual stability | ≤ 0.1 | > 0.25 |

**Why:** these are field numbers from real users on mid-range phones and slow networks. A page that is instant on a dev laptop can still fail p75, which costs ranking and conversions.
**How to check:**
- **LCP:** is the hero image or text in the server HTML? The LCP image must never have `loading="lazy"`. Give it `fetchpriority="high"` and avoid rendering it only after a client-side fetch.
- **INP:** does a click, key or input handler run long synchronous work (large renders, sorting big lists, JSON parsing)? Break it up. Yield with `await scheduler.yield()` after feature detection, falling back to `setTimeout(0)` because Safari lacks it as of 2026-09. Otherwise move the work to a Web Worker.
- **CLS:** do images, embeds, ads, banners or web fonts appear without reserved space? Set `width`/`height` or `aspect-ratio`, use skeletons, use `font-display` with metric-matched fallbacks, and never insert content above what the user is reading.
- Measure field data with the `web-vitals` library or CrUX. A Lighthouse navigation run is lab data with no real interactions, so it reports Total Blocking Time as an INP proxy, not INP.

```html
<!-- bad: lazy-loaded LCP image with no reserved space → slow LCP and a layout shift -->
<img src="hero.jpg" alt="Product" loading="lazy">

<!-- good: prioritized, with dimensions (the browser derives the aspect ratio) -->
<img src="hero.jpg" alt="Product" width="1200" height="600" fetchpriority="high" style="max-width:100%;height:auto">
```
**Trap:** chasing a Lighthouse score of 100 while field p75 fails. Or adding `fetchpriority="high"` to many images: the hint is relative, so it stops helping. Prioritize the one LCP element.

## 10. Load testing
**Definition:** run the system under realistic, then above-realistic, concurrent traffic to find where latency or the error rate breaks.
**Why:** single-request benchmarks hide pool exhaustion, lock contention, GC churn and cache stampedes. Without a load test, the first one is your launch.
**How to check:** does a new or changed high-traffic endpoint have a checked-in script with **thresholds that fail the run**? Does it run against a staging environment with production-like data volume? Is a known-good baseline recorded? Run it with `k6 run load.js`, which works the same in PowerShell and POSIX shells.

```js
// load.js — k6 (verified on the 2.x line; the JS script API is unchanged from 1.x)
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [{ duration: '1m', target: 50 }, { duration: '3m', target: 50 }, { duration: '30s', target: 0 }],
  thresholds: { http_req_duration: ['p(95)<300'], http_req_failed: ['rate<0.01'] }, // non-zero exit on breach
};

export default function () {
  const res = http.get(`${__ENV.BASE_URL}/api/orders`);
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
```
Pass `BASE_URL` with `k6 run -e BASE_URL=https://staging.example.com load.js`. Use `--once` (k6 2.3+) for a smoke run.
**Trap:** load-testing production without agreement (you cause the outage you wanted to prevent), or a staging so unlike production (empty DB, no latency) that numbers mean nothing. State where it diverges.

## 11. Regression guards
**Definition:** automated checks that fail CI when a number crosses its budget: bundle size, query count, benchmark delta, or a load-test threshold.
**Why:** performance decays one reasonable commit at a time. By the time someone says "it feels slower", the cause is 40 commits back with no data to bisect.
**How to check:** does the repo have any of these, and does your change keep them green?
- Query-count tests on endpoints that are prone to N+1 (§4). They are the cheapest and most deterministic guard.
- A bundle-size limit (`size-limit`, or the framework's build-output report compared in CI).
- Benchmarks compared against a baseline: Go `go test -bench . -count 10` saved per branch plus `benchstat old.txt new.txt`; Rust `criterion` baselines (`--save-baseline` / `--baseline`); `pytest-benchmark --benchmark-compare`. In Windows PowerShell 5.1, `>` writes UTF-16. Use PowerShell 7+ or `| Out-File -Encoding utf8` for files that other tools read.
- k6 thresholds (§10) in a scheduled or pre-release job.

If none exists and you touched a hot or previously regressed path, add the cheapest guard (usually a query-count assertion) or record the before/after number in the Completion Report.
**Trap:** gating every PR on wall-clock benchmarks from noisy shared CI runners with no tolerance band. The gate flakes, the team disables it, and the protection is gone. Gate on deterministic counts (queries, allocations, bytes). Gate on time only on a dedicated runner, with a tolerance band.

## Anti-patterns → fixes
| Anti-pattern | Fix |
|---|---|
| `await` per item in a loop | `Promise.all` / `TaskGroup`, bounded (§7) |
| `x in list` inside a loop | build a `set` / `Map` once (§3) |
| lazy relation access in a loop | eager load or `WHERE id IN (...)` (§4) |
| `loading="lazy"` on the LCP image | no lazy, `fetchpriority="high"`, dimensions (§9) |
| unbounded bulk insert | `array_chunk` / chunks of 500–1,000 (§6) |
| wall-clock gate on shared CI | query / alloc / byte count gate (§11) |

## Checklist (copy into your review)
- [ ] A before/after number and the command that produced it back every "performance" change, or the change is justified on readability alone
- [ ] Budget stated for the touched hot path (`<metric>: <baseline> -> <target> on <workload>`)
- [ ] No new nested scan or linear lookup that grows with production N; sets or maps are used for membership
- [ ] No query, ORM lazy load or HTTP call per item in a loop or resolver; query count is constant in N
- [ ] Every cache has a TTL, an invalidation path, a fully scoped key, a fallback, and stampede protection on hot keys
- [ ] Bulk operations are chunked and bounded, with failure semantics decided per chunk
- [ ] Independent I/O runs concurrently, with fan-out bounded
- [ ] Large data is streamed or paginated; every listener, timer or subscription is removed; no unbounded module-level growth
- [ ] Frontend: the LCP element is not lazy-loaded; handlers yield or offload long work; media reserves space; field data checked
- [ ] Load test with failing thresholds exists or is proposed for new high-traffic endpoints
- [ ] A deterministic regression guard (query count, bundle size, allocs) protects the path, or the gap is named as a risk

## References
- Core Web Vitals: https://web.dev/articles/vitals · https://web.dev/articles/inp · https://web.dev/articles/optimize-lcp
- `scheduler.yield()`: https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield
- k6: https://grafana.com/docs/k6/latest/ · releases: https://github.com/grafana/k6/releases
- Node profiling: https://nodejs.org/en/learn/getting-started/profiling · Go diagnostics: https://go.dev/doc/diagnostics · benchstat: https://pkg.go.dev/golang.org/x/perf/cmd/benchstat
- Postgres EXPLAIN: https://www.postgresql.org/docs/current/using-explain.html
- Related: `.agents/guides/principles/concurrency.md` (bounded fan-out, backpressure, timeouts), `.agents/guides/principles/database-design.md` (indexes, query plans), `.agents/rules/topic-performance.md` (protocol), `/perf-audit` skill.
