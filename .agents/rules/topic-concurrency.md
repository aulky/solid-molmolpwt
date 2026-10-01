---
trigger: model_decision
description: "Apply when writing async/await, promises, threads, goroutines, workers, locks, channels, queues, timeouts, cancellation or shared mutable state, or when a bug or test is intermittent."
---
# Concurrency - topic rule
Principles guide: `.agents/guides/principles/concurrency.md` - read it before designing workers, pools, locks or lock-free code. Intermittent bug or flaky test: the bugfix pipeline (section `bugfix` of `.agents/skills/orchestrate/references/task-types.md`; the `debugger` worker reproduces it first).

## Protocol
1. Write the concurrency picture in 3 lines (plan, or your Worker Report): what runs at the same time, what state it shares, what ordering is required.
2. Prefer not sharing: immutable data, message passing (channels, queues), or one owner per piece of state. Only then locks or atomics.
3. Give every concurrent operation a timeout, a cancellation path, a concurrency limit, and an error policy (fail fast or collect all).
4. Give every background task an owner that awaits it and handles its errors (structured concurrency). No fire-and-forget.
5. Test deterministically: fake clocks, injected schedulers, barriers instead of sleeps. Run the race detector where one exists (`go test -race ./...`, `-fsanitize=thread` for C/C++). Reproduce a flaky test by looping it (e.g. `go test -run TestX -count=100`) before and after the fix.

## Idioms per stack (defaults)
- JS/TS: `Promise.all` for independent work, `Promise.allSettled` when partial failure is acceptable. Cap fan-out with a small pool. No floating promises: `await`, `return`, or `void p.catch(...)`. Cancel with `AbortController` / `AbortSignal.timeout(ms)` and pass `signal` down. Never pass an `async` callback to `forEach`.
- Python asyncio: `asyncio.TaskGroup` (3.11+) or `gather`; `asyncio.timeout()` (3.11+); keep a reference to every `create_task` result (the loop holds only weak references); no blocking calls in `async def` (use `asyncio.to_thread`). The GIL does not make `x += 1` or check-then-set atomic.
- Go: every goroutine has an exit path (`<-ctx.Done()`); `errgroup.WithContext` + `SetLimit(n)`; `ctx context.Context` as first parameter; only the sender closes a channel; never copy a `sync.Mutex`.
- Rust (tokio): `JoinSet` or `tokio::select!`; do not hold a `std::sync::MutexGuard` across `.await` (scope it, or use `tokio::sync::Mutex` when the lock must span an await); `spawn_blocking` for blocking or CPU-heavy work; bounded `mpsc` channels.
- JVM: executors with bounded queues; virtual threads (Java 21+) for blocking I/O; `ConcurrentHashMap.compute`/`merge` for atomic updates.
- .NET: async all the way; never `.Result` or `.Wait()` on tasks (deadlocks, thread-pool starvation); pass `CancellationToken`; `async void` only for event handlers; `SemaphoreSlim` to throttle.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER check-then-act on shared state without atomicity (`if (!cache.has(k)) cache.set(k, await load(k))` loads twice; SELECT-then-INSERT duplicates rows). Instead: atomic operations, a lock, a DB constraint, or a shared in-flight promise per key (single-flight).
2. NEVER "fix" a race with sleeps or delays - it only moves the window. Instead: wait for the actual event or condition.
3. NEVER start unbounded fan-out (one task per row for a million rows). Instead: worker pool, semaphore or bounded channel (backpressure).
4. NEVER take multiple locks in different orders in different places - deadlock. Instead: one global lock order, or a single lock.
5. NEVER hold a lock while doing network or disk I/O unless the I/O is what the lock protects - throughput collapses. Instead: copy the data out, release, then do I/O.

## Pitfalls Flash models get wrong
- `await` in a loop where parallel work was intended - or the reverse, parallelizing writes that must stay ordered.
- Timeouts that stop waiting but do not cancel the underlying work.
- Shared mutable module-level state in servers (one request's data leaking into another).
- Tests that pass with `sleep(100)` locally and flake in CI.

## Example - bad -> good
```ts
// BAD: serial awaits, no timeout, floating promise, unowned errors
for (const url of urls) results.push(await fetch(url));
sendAnalytics(); // rejection becomes an unhandled error

// GOOD: bounded parallelism (batches of 8), per-request timeout, owned background work
const results: Response[] = [];
for (let i = 0; i < urls.length; i += 8) {
  const batch = urls.slice(i, i + 8).map((u) => fetch(u, { signal: AbortSignal.timeout(5_000) }));
  results.push(...(await Promise.all(batch)));
}
void sendAnalytics().catch((err) => logger.warn({ err }, "analytics failed"));
```

## Before finishing
- [ ] Every concurrent path has a timeout, cancellation, a limit and an error policy
- [ ] No sleeps used as synchronization; race detector or looped test run (or SKIP with reason)
- [ ] Shared state is atomic, locked in one order, or removed
