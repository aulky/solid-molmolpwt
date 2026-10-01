# Concurrency — engineering guide for AI agents
> Scope: concurrency vs parallelism, async models per language, races, locks/channels/actors, deadlocks, cancellation and timeouts, backpressure, idempotency, structured concurrency, and testing concurrent code. Situational rule with per-stack idioms: `.agents/rules/topic-concurrency.md`.
> Last verified: 2026-09 — Java Structured Concurrency still **preview** (JEP 533, 7th preview, JDK 27; openjdk.org). CPython free-threading supported but **not default** (PEP 779). Go `testing/synctest` GA since 1.25; `goroutineleak` profile GA in 1.27 (released 2026-08-19) (go.dev release notes). Re-verify before relying on these.

## 0. How to use this guide
Each section: definition, why, **how to check** on your own diff, bad → good, and the over-engineering trap. First write the 3-line picture from the topic rule: what runs at the same time, what it shares, what ordering is required. If nothing runs at the same time, say so and stop.

## 1. Concurrency vs parallelism
**Definition:** *concurrency* structures work as tasks whose steps can interleave. *Parallelism* runs computations at the same instant on multiple cores. A Node event loop has concurrency without parallelism. A multi-threaded matrix multiply has both.
**Why:** mixing them up picks the wrong tool: `async` does not speed up CPU-bound work, and threads do not help an already-concurrent I/O-bound loop.
**How to check:** profile first (`.agents/guides/principles/performance.md` §1). If the time is spent **waiting** (network, disk, DB), you need concurrency: non-blocking I/O with bounded fan-out. If the time is spent **computing**, you need parallelism: processes, a worker pool, `worker_threads`, `rayon`, or goroutines on multiple cores.
**Trap:** `multiprocessing` for an I/O-bound Python script; IPC overhead eats the gain, and `asyncio` or threads were the fix.

## 2. Async models per language
| Language | Unit / model | What blocks it, and the escape hatch |
|---|---|---|
| TS/JS (Node, browser) | one event loop per thread; Promises | any sync CPU work or sync I/O stalls **every** request → `worker_threads` / Web Workers; find sync I/O with `node --trace-sync-io` |
| Python | `asyncio` (cooperative, one thread); `threading`; `multiprocessing` | a blocking call in `async def` freezes the loop → `asyncio.to_thread`; find them with `asyncio.run(main(), debug=True)` (logs callbacks > 100 ms). GIL on by default: check `sys._is_gil_enabled()` rather than assuming no-GIL |
| Go | goroutines scheduled onto OS threads; channels | cheap, but a goroutine with no exit path leaks forever → pass `ctx`, select on `ctx.Done()` |
| Rust | futures polled by an executor (tokio is the de facto default); OS threads | blocking or CPU-heavy work in async stalls a worker thread → `tokio::task::spawn_blocking`; `std::thread::scope` for scoped threads |
| Java | platform threads; virtual threads (final since JDK 21) | `synchronized` pinning of virtual threads was removed in JDK 24 (JEP 491); `StructuredTaskScope` is preview only |
| C#/.NET | `async`/`await` over `Task`; thread pool | `.Result` / `.Wait()` on a Task risks deadlock and thread-pool starvation → async all the way |
| PHP | one request per worker process (PHP-FPM); no shared memory | Fibers (8.1+) are a primitive; async needs an opt-in runtime (Swoole, ReactPHP, AMPHP). Races happen **across requests**, in the DB or cache |

**How to check:** does the diff call anything blocking (sync file I/O, `time.sleep`, `requests.get`, a CPU loop over big data, `.Result`) on the scheduler's own thread? Is every async function actually awaited or returned, with no floating promises?
**Trap:** shipping on a preview API (`StructuredTaskScope` needs `--enable-preview` and has changed shape between previews) without a tracked migration plan.

## 3. Races and data races
**Definition:** a **data race** is an unsynchronized concurrent access to the same memory where at least one access is a write. In C/C++ and `unsafe` Rust it is undefined behavior. In Java it gives torn or stale values; in Go, races on multi-word values (maps, slices, strings, interfaces) can crash or corrupt memory. A **race condition** is broader: the result depends on timing, as with check-then-act or read-modify-write. It needs no threads. It happens across an `await`, or across two server replicas.
**Why:** races pass every single-threaded test, then fail under load as double-spends, lost updates and corrupted maps that are hard to reproduce.
**How to check:**
- List the shared mutable state in the diff: module-level variables, singletons, shared struct fields, caches, DB rows, files. For each one, name the thing that serializes access: a lock, a channel owner, an atomic, or a DB constraint or transaction.
- For every read → decide → write, is it **one** atomic step? Look for an `await` between the read and the write. Look for "SELECT then UPDATE" without `FOR UPDATE` or a conditional `UPDATE ... WHERE`.
- With more than one instance or process (replicas, PHP-FPM, serverless), an in-process mutex protects nothing. Use the database (atomic conditional update, unique constraint, row lock) or a distributed lock with fencing.
- Run the detector: `go test -race ./...`, `-fsanitize=thread` for C/C++. Rust safe code cannot data-race, but logic races still exist.

```ts
// bad: check-then-act across an await — two requests both see stock = 1 and both sell it
const item = await repo.get(id);
if (item.stock > 0) await repo.save({ ...item, stock: item.stock - 1 });

// good: one atomic conditional update; correct across requests AND replicas
const res = await db.query("UPDATE items SET stock = stock - 1 WHERE id = $1 AND stock > 0", [id]);
if (res.rowCount === 0) throw new OutOfStockError(id);
```
```go
// bad: map written from many goroutines — data race, can crash with "concurrent map writes"
go func() { counts[key]++ }()

// good: guard it (or give the map one owner goroutine, §4)
mu.Lock(); counts[key]++; mu.Unlock()
```
**Trap:** a mutex around request-local state nothing else can reach (cost, and it hides the real shared state). And the GIL does not make `x += 1` or check-then-set atomic.

## 4. Locks vs channels vs actors
**Definition:** **locks** let many threads share memory with one accessor at a time. **Channels** pass ownership of data, so only one side touches it at a time ("share memory by communicating"). **Actors** own private state and process messages one at a time (Erlang/Elixir `GenServer`, Akka, a single-goroutine owner).
**Why:** locks are cheapest for a small hot critical section, and the easiest to get wrong: a forgotten unlock, I/O under the lock, or inconsistent ordering (§5). Channels and actors remove data races by construction, at the cost of messaging overhead and queue sizing (§7).
**How to check:**
- Choose in this order: no sharing (immutable data, copies), then one owner via a channel or actor, then a lock or atomic. Choose a lock only for a small, CPU-only critical section.
- Is a lock held across I/O, an `await`, a callback, or another lock? Shrink it to the mutation only.
- Rust: never hold a `std::sync::MutexGuard` across `.await`. Go: never copy a `sync.Mutex`, and only the sender closes a channel.

```rust
// bad: async lock held across a network call — every other caller waits on the network
let mut guard = state.lock().await;
let resp = client.get(&guard.url).send().await?;
guard.last_status = resp.status();

// good: copy what you need, release, do I/O, re-lock briefly to write back
let url = state.lock().await.url.clone();
let resp = client.get(&url).send().await?;
state.lock().await.last_status = resp.status();
```
If `url` may change meanwhile, compare a version before writing back.
**Trap:** an actor system or channel pipeline for state only one task touches; a local variable needs no coordination.

## 5. Deadlocks
**Definition:** tasks wait on each other in a cycle. A holds lock 1 and wants lock 2, while B holds 2 and wants 1. Async variants: awaiting a task that awaits you, a full bounded channel whose consumer is blocked on the producer, or sync-over-async (`.Result`) on a single-threaded context.
**Why:** nothing crashes or logs; requests hang, usually only under load. Go's runtime reports only a **global** deadlock ("all goroutines are asleep"); a partial one looks like slowness.
**How to check:**
- Does every code path that takes more than one lock take them in the same global order (for example, by id)? Is any lock held while calling unknown code (callbacks, virtual methods, I/O)?
- Could any producer block on a full channel while its consumer waits on that producer?
- Diagnose a live hang with a thread dump (`jstack <pid>`, `jcmd <pid> Thread.print`), Go `/debug/pprof/goroutine?debug=2`, or the Go 1.27+ `goroutineleak` profile. In Python, `py-spy dump --pid <pid>`.

```java
// bad: opposite lock order across two call sites → deadlock under load
void transfer(Account from, Account to, long amt) {
    synchronized (from) { synchronized (to) { move(from, to, amt); } }
}

// good: global order by id, whatever the direction
void transfer(Account from, Account to, long amt) {
    Account first = from.id() < to.id() ? from : to, second = first == from ? to : from;
    synchronized (first) { synchronized (second) { move(from, to, amt); } }
}
```
**Trap:** "fixing" a deadlock with lock timeouts and retries. The hang becomes a random failure plus livelock. Fix the ordering, or remove the second lock.

## 6. Cancellation and timeouts
**Definition:** every wait has a bound (a timeout or deadline). When the caller gives up, the cancellation propagates **into** the downstream work, which then actually stops.
**Why:** one stalled dependency with no timeout holds a connection or thread forever and drains the pool. Abandoned work keeps consuming capacity exactly when it is scarce.
**How to check:**
- Does every network, DB or queue call have an explicit timeout? Do not trust library defaults. Some are infinite, including Python `requests`, which has no default timeout.
- Is **one deadline** passed down the chain (Go `ctx`, JS `AbortSignal`, C# `CancellationToken`, Python `asyncio.timeout`) instead of each hop getting a fresh 30 s? Five 30 s timeouts in series can take 150 s.
- Does a timeout cancel the losing work? `Promise.race` with a timer does **not** cancel the fetch. Python code that catches `CancelledError` must re-raise it.

```go
// bad: no deadline; a stalled server holds this goroutine and connection forever
resp, err := http.Get(url)

// good: deadline derived from the caller's ctx; cancellation reaches the socket
ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
defer cancel()
req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
if err != nil { return err }
resp, err := http.DefaultClient.Do(req)
if err != nil { return err }
defer resp.Body.Close() // an unclosed body leaks the connection
```
```python
async with asyncio.timeout(3):          # 3.11+; cancels the inner await on expiry
    data = await client.get(url)
```
```ts
// req = Fetch API Request (Hono, SolidStart, h3). Express has no req.signal: create an
// AbortController and abort it on res.on("close")
const res = await fetch(url, { signal: AbortSignal.any([req.signal, AbortSignal.timeout(3000)]) });
```
**Trap:** a timeout below normal p99, which turns slowness into constant errors. Derive timeouts from measured latency. Retrying on timeout without idempotency (§8) duplicates effects. Retries need backoff with jitter and a cap (`.agents/guides/principles/error-handling.md` §6).

## 7. Backpressure
**Definition:** when a consumer is slower than its producer, the producer is slowed down (it blocks), or load is shed (drop, `429`/`503`), instead of a queue growing without limit.
**Why:** an unbounded queue, goroutine spawn or `Promise.all` is a delayed out-of-memory crash: latency climbs for everything queued, then the process dies.
**How to check:** does every queue, channel, buffer, or fan-out have a numeric bound? At the bound, is there an explicit policy (block, drop oldest, or reject with retry-after)? Are pool sizes (DB connections, HTTP agents) consistent with the concurrency limit?

```ts
// bad: 10,000 items → 10,000 in-flight requests
await Promise.all(items.map((it) => processItem(it)));

// good: at most 16 in flight (p-limit, or a small worker pool)
import pLimit from "p-limit";
const limit = pLimit(16);
await Promise.all(items.map((it) => limit(() => processItem(it))));
```
```python
sem = asyncio.Semaphore(16)
async def bounded(it):
    async with sem:
        return await process_item(it)
```
Go: `g.SetLimit(16)` on an `errgroup.Group`, or a buffered channel used as a semaphore. Rust: `tokio::sync::Semaphore` or `buffer_unordered(16)`. Bounded `mpsc::channel(n)` everywhere.
**Trap:** a bound from thin air that throttles normal traffic. Size it from a load test (performance.md §10); shed low-priority work before blocking everything.

## 8. Idempotency
**Definition:** doing an operation twice with the same input leaves the same state, and the same observable effects, as doing it once. It is the precondition for safe retries and at-least-once delivery.
**Why:** networks lose responses to successful requests, queues redeliver, users double-click, proxies retry. Exactly-once delivery does not exist; without idempotency you charge twice.
**How to check:** for every create, charge, send or enqueue that can be retried by a client, a queue or a proxy, is there an idempotency key (client-generated, stored under a **unique constraint**) that is **reserved before** the side effect, so a duplicate gets the first result or "in progress"? Are queue consumers deduplicated by message id? Is every side effect covered (email, counters, webhooks), not only the main row?

```python
# bad: a retry or a double-click charges twice
def charge(order_id: str, amount: int) -> Charge:
    return gateway.charge(order_id, amount)

# good: reserve the key FIRST (UNIQUE constraint), then do the side effect once
def charge(order_id: str, amount: int, key: str) -> Charge:
    reserved = db.execute(
        "INSERT INTO idem (key, status) VALUES (:k, 'pending') "
        "ON CONFLICT (key) DO NOTHING RETURNING key", {"k": key}).first()
    if reserved is None:                       # duplicate: someone already owns this key
        row = db.execute("SELECT status, result FROM idem WHERE key = :k", {"k": key}).one()
        if row.status == "pending":
            raise InProgress(key)              # map to 409 / retry-after
        return Charge.from_json(row.result)
    result = gateway.charge(order_id, amount, idempotency_key=key)  # provider dedupe = 2nd layer
    db.execute("UPDATE idem SET status = 'done', result = :r WHERE key = :k",
               {"k": key, "r": result.to_json()})
    return result
```
Commit the reservation before the external call; never hold a transaction open across it. If the side effect fails, delete the `pending` row (or mark it `failed`) so the client can retry; decide what a crash mid-effect means (a sweeper for stale `pending` rows plus a provider-side key, or manual review).
**Trap:** check-then-act (`find_by_key` → side effect → insert) is still a race even **with** the unique constraint: two duplicates both miss the lookup and both perform the effect. The constraint only helps if the key is reserved **before** the side effect. Also: calling `PUT` idempotent while it also increments a counter or sends a notification.

## 9. Structured concurrency
**Definition:** every spawned task has an owner scope that outlives it. The scope waits for its children, sees their errors, and cancels the siblings when one fails. Fire-and-forget is the opposite: a task nobody awaits, cancels or observes.
**Why:** orphan tasks outlive their request, swallow errors, and leak. Python may even garbage-collect an unreferenced `create_task` result (the loop keeps only weak references).
**How to check:** for every `go`, `create_task`, `tokio::spawn`, `new Thread`, or un-awaited promise, who waits for it? Who sees its error? Is it cancelled when the parent fails or the request ends? JS has no built-in scope: `Promise.all` rejects on the first error but does **not** stop the siblings, so pass them a shared `AbortController.signal`.

```go
// bad: fire-and-forget — no owner, error lost, keeps running after shutdown
go sendWelcomeEmail(user)

// good: owned by a group; ctx cancels siblings on first error; bounded
g, ctx := errgroup.WithContext(ctx)
g.SetLimit(8)
g.Go(func() error { return sendWelcomeEmail(ctx, user) })
g.Go(func() error { return indexUser(ctx, user) })
if err := g.Wait(); err != nil { return fmt.Errorf("post-signup: %w", err) }
```
```python
async with asyncio.TaskGroup() as tg:     # 3.11+: waits for all; cancels the rest on first error
    tg.create_task(send_welcome_email(user))
    tg.create_task(index_user(user))
```
Also: Kotlin `coroutineScope {}`, Swift `withThrowingTaskGroup`, Rust `JoinSet` / `std::thread::scope`, Java `StructuredTaskScope` (preview).
**Trap:** blocking a request on best-effort work (analytics pings) just to be "structured". Detached work belongs in a durable job queue, or a commented detached task with error logging and a shutdown hook.

## 10. Testing concurrent code
**Definition:** show that the code is correct under the interleavings that can actually happen, not just the one your machine produced once.
**Why:** a race can pass 1,000 runs and fail in production; "green once" is not evidence, and `sleep()` in tests breeds flakes.
**How to check:**
- Is there a race detector in CI where the language has one? Go `go test -race ./...`, C/C++ `-fsanitize=thread`, Rust `loom` for lock-free code, Java `jcstress` for memory-model questions.
- Windows: Go `-race` needs cgo (`CGO_ENABLED=1`) and a gcc with mingw-w64 runtime v8+ on PATH. Check with `gcc --print-file-name libsynchronization.a` (a full path = OK; an echo of the name = too old). Without one, run it in CI or WSL and say so in the report. A cgo/compiler error is not a test failure.
- Do tests control time and ordering instead of sleeping? Use fake clocks, barriers, latches, channels, Go `testing/synctest` (1.25+), `vi.useFakeTimers()`, or injected schedulers.
- Is a flaky test reproduced by looping it before and after the fix? `go test -run TestX -race -count=200`, `pytest --count=200` (pytest-repeat), Vitest `test("name", { repeats: 50 }, fn)`.
- For a fixed race, does the regression test **force** the bad interleaving (a hook or barrier between read and write)?

```go
// bad: shared int, no sync, sleep-based "waiting" — racy and flaky
func TestCount(t *testing.T) {
    n := 0
    for i := 0; i < 100; i++ { go func() { n++ }() }
    time.Sleep(100 * time.Millisecond)
    if n != 100 { t.Fatal(n) }
}

// good: atomic counter, deterministic wait; passes under -race
func TestCount(t *testing.T) {
    var n atomic.Int64
    var wg sync.WaitGroup
    for i := 0; i < 100; i++ { wg.Go(func() { n.Add(1) }) } // WaitGroup.Go: Go 1.25+
    wg.Wait()
    if got := n.Load(); got != 100 { t.Fatalf("got %d", got) }
}
```
**Trap:** raising the sleep until CI is green; the race remains, only rarer. Put the detector and the loop in CI, not just on your machine.

## Anti-patterns → fixes
| Anti-pattern | Fix |
|---|---|
| `sleep()` in a test to "wait" | barrier, `WaitGroup`, fake clock, `synctest` (§10) |
| `Promise.race` with a timer as a timeout | `AbortSignal.timeout` / `ctx` deadline that cancels the work (§6) |
| in-process lock across replicas or PHP-FPM | conditional `UPDATE ... WHERE`, unique constraint, row lock (§3) |
| fire-and-forget `go` / `create_task` | `errgroup` / `TaskGroup` owner, or a durable job queue (§9) |
| unbounded `Promise.all` / goroutine per item | `p-limit`, `Semaphore`, `errgroup.SetLimit` (§7) |
| lookup → side effect → insert key | reserve the key first, then the effect (§8) |

## Checklist (copy into your review)
- [ ] 3-line concurrency picture written: what runs at once, what it shares, what order is required
- [ ] Bottleneck classified as I/O-bound (concurrency) or CPU-bound (parallelism) before choosing a tool
- [ ] No blocking call on an event loop or async executor; the escape hatch is used (`to_thread`, `spawn_blocking`, workers)
- [ ] Every piece of shared mutable state names its guard; read-decide-write is one atomic step (lock, CAS, conditional UPDATE, unique constraint)
- [ ] Multi-instance safety: no in-process lock is relied on across replicas or processes
- [ ] Locks are small, never held across I/O, `await` or callbacks, and always taken in one global order
- [ ] Every wait has a timeout; one deadline propagates; cancellation reaches downstream work; `CancelledError` is not swallowed
- [ ] Every queue, channel and fan-out is bounded, with an explicit policy at the bound
- [ ] Retryable or redelivered operations are idempotent: key reserved under a unique constraint BEFORE the side effect, covering every side effect
- [ ] Every spawned task has an owner that awaits it, sees its error, and cancels it; detached work is deliberate and commented
- [ ] Race detector in CI where available; tests use barriers or fake clocks, never sleeps; flaky tests looped before and after the fix

## References
- Go: memory model https://go.dev/ref/mem · race detector https://go.dev/doc/articles/race_detector · synctest https://pkg.go.dev/testing/synctest · release notes https://go.dev/doc/go1.27
- Python: asyncio tasks, TaskGroup, timeout https://docs.python.org/3/library/asyncio-task.html · free-threading https://peps.python.org/pep-0779/
- Rust: tokio https://tokio.rs/tokio/tutorial · loom https://github.com/tokio-rs/loom
- Java: structured concurrency (preview) https://openjdk.org/jeps/533 · virtual threads https://openjdk.org/jeps/444
- Related: `.agents/guides/principles/performance.md` (§7 I/O parallelism, §10 load testing), `.agents/guides/principles/error-handling.md` (§6 retries and idempotency), `.agents/rules/topic-concurrency.md`.
