# Common performance wins (catalogue - confirm with a profile, don't apply blind)

Recognize these once the profile points at the category. None of these is a reason to change code without
a measured baseline first - the whole point of this skill is not guessing.

## Any language
- **N+1 queries/calls**: a loop issuing one DB/HTTP call per item instead of one batched call. Profile
  signature: many short, identical-shaped calls instead of one call at the top. Fix: batch (`WHERE id IN
  (...)`, a join, `Promise.all`/bulk endpoint) - but check the batch itself doesn't blow a payload/row limit.
- **Unbounded result sets**: no `LIMIT`/pagination, loading a whole table/collection to use the first page.
- **Serial I/O that could be parallel**: independent `await`s in sequence instead of `Promise.all`/`asyncio.gather`
  /`tokio::join!`/goroutines+`WaitGroup`. Only when the calls are truly independent - serializing
  dependent calls is correct, not a bug.
- **Missing/wrong cache**: recomputing or refetching the same value every request with no TTL/memoization;
  the opposite footgun - a cache with no invalidation path or the wrong key (leaks data across users/tenants).
- **Wrong algorithmic complexity**: an O(n^2) nested loop/`indexOf` in a loop where a Set/Map/index lookup
  gives O(n). Profile signature: time grows much faster than input size in a before/after with different N.
- **Synchronous work blocking a hot path**: sync file/crypto/compression calls on a request-handling thread
  in an event-loop runtime (Node, single-threaded Python framework); logging or telemetry that blocks on I/O.

## Node / JS / TS
- Large dependency pulled in for one function (moment.js for one date format, lodash for one helper) -
  bundle-size hit even if runtime cost is small; check the bundle analyzer, not just import lines.
- Re-creating a regex, a `new Date()` formatter, or a compiled schema/validator inside a hot function
  instead of hoisting it to module scope.
- Over-fetching in a data layer (selecting `*`/all fields, all relations) when the response only uses a few.
- For Solid/React-family UI: unnecessary re-renders/re-computation - see the installed
  `vercel-react-best-practices` skill for the detailed, verified rule set (memoization, derived-state,
  server/client boundaries) instead of duplicating it here.

## Python
- Using a `list` where membership tests dominate (`in` on a list is O(n)) instead of a `set`/`dict`.
- Row-by-row ORM access in a loop (`.objects.get()` per id) instead of `select_related`/`prefetch_related`
  (Django) or a bulk query.
- GIL-bound CPU work on threads expecting parallelism - needs `multiprocessing`/a native extension, not
  more threads, for CPU-bound work (I/O-bound work is fine on threads/asyncio).

## Go
- Unnecessary allocation in a hot loop (profile shows heavy `runtime.mallocgc`) - reuse buffers
  (`sync.Pool`), pre-size slices/maps with `make(..., n)` when the size is known.
- String concatenation with `+` in a loop instead of `strings.Builder`.
- A mutex held longer than needed serializing what could be concurrent; or the opposite - a data race from
  removing a needed lock (never "fix" contention by deleting the lock without proving it's safe).

## Rust
- `.clone()` where a borrow would do - check if the profile blames allocation, not just "clippy suggested
  it"; `clippy::needless_clone` catches the obvious cases for free (part of `cargo clippy`, already run by
  `verify.mjs`).
- Blocking calls inside an async runtime (Tokio) executor thread - use `spawn_blocking` for CPU-bound or
  blocking-I/O work instead of stalling the reactor.

## Database (any stack)
- Missing index for the query's `WHERE`/`JOIN`/`ORDER BY` columns - confirm with `EXPLAIN`/`EXPLAIN ANALYZE`
  showing a sequential/table scan, not by assuming an index is missing.
- `SELECT *` fetching unused columns/relations (bandwidth + deserialization cost), especially large
  text/blob/JSON columns pulled along for the ride.
- A transaction held open across an external call (HTTP, email, queue publish) - holds locks far longer
  than the actual DB work needs.

## Web front end
- Render-blocking synchronous scripts/styles above the fold; unoptimized/oversized images (no responsive
  `srcset`, wrong format); a third-party script loaded eagerly that could be deferred/lazy-loaded.
- Layout thrash: reading a layout property (`offsetHeight`, `getBoundingClientRect`) right after writing a
  style, repeated in a loop - batch reads then writes.
- Hydration cost on a mostly-static page - candidate for static generation/partial hydration if the
  framework supports it; verify the framework's current API before recommending a specific one (frameworks
  change this often - check the installed version's docs via `research-docs`).
