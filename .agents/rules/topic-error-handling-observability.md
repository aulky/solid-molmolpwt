---
trigger: model_decision
description: "Apply when adding or changing error handling, exceptions, retries, fallbacks, logging, metrics, tracing or health checks, or when diagnosing a failure from logs or monitoring."
---
# Error handling and observability - topic rule
Principles guides: `.agents/guides/principles/error-handling.md` and `.agents/guides/principles/observability.md` - read them before introducing an error hierarchy, logger or telemetry setup. Bug root-cause work: the bugfix pipeline (section `bugfix` of `.agents/skills/orchestrate/references/task-types.md`; the `debugger` worker).

## Classify every failure first
| Kind | Example | Handle by |
|---|---|---|
| Invalid input | bad field, wrong type | reject at the boundary (4xx / typed error), no retry, log at debug/info |
| Expected outcome | not found, card declined | typed result or domain error; the caller decides |
| Transient | timeout, 503, deadlock, connection reset | bounded retry (<= 3) with exponential backoff + jitter, only if idempotent |
| Bug / broken invariant | "impossible" null, failed assertion | fail fast, fail the request, log at error with context |
| Bad config | missing env var | fail at startup, not at first use |

## Protocol
1. Classify each failure with the table. Catch only where you can do something useful: recover, retry, translate for a boundary, or add context and rethrow.
2. Keep the cause when wrapping: JS `new Error("load invoice 42", { cause: err })` - Python `raise LoadError(...) from err` - Go `fmt.Errorf("load invoice %d: %w", id, err)` - Rust `thiserror` enums or `anyhow` `.context(...)` - Java/C# pass the inner exception.
3. Translate once at the boundary (HTTP handler, CLI `main`, job runner): map to status or exit code plus a user-safe message, and log the full error there, once.
4. Instrument new code paths with the project's existing logger/telemetry (search: `node .agents/scripts/search.mjs 'logger\.|getLogger|slog\.|tracing::|opentelemetry' src`):
   - Logs: structured key-values, one event per line: `level`, `msg`, `request_id`/`trace_id`, entity ids, `duration_ms`, `error.type`. No `print`/`console.log` in server code when a logger exists.
   - Metrics: RED for services (rate, errors, duration histogram); USE for resources (utilization, saturation, errors). Low-cardinality labels only (route template, never raw URL or user id).
   - Traces: propagate context across HTTP and queue hops (W3C `traceparent`); one span per external call. Prefer OpenTelemetry when the project has it.
   - Health: liveness (process alive) separate from readiness (dependencies reachable).
5. Test the failure paths you handle: one test per kind (timeout -> retried then surfaced; invalid input -> 400; declined -> typed result).

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER swallow errors (`catch {}`, `except: pass`, `_ = err`, `.catch(() => {})`) - failures turn into silent data loss. Instead: handle, or rethrow with context. If ignoring is intended, comment why and log at debug.
2. NEVER log secrets, tokens, passwords, full request bodies or PII - logs are widely readable and retained. Instead: log ids and redact fields.
3. NEVER log-and-rethrow at every layer - one failure becomes five log lines with no extra information. Instead: add context while propagating, log once at the boundary.
4. NEVER retry non-idempotent operations blindly or without a cap - duplicates and retry storms. Instead: idempotency key + capped exponential backoff with jitter + overall deadline.
5. NEVER return stack traces or internal messages to clients. Instead: generic message + correlation id that appears in the logs.
6. NEVER catch broad exceptions (`Exception`, `Throwable`, `catch (e)`) to return a default value. Instead: catch the specific type you can handle.

## Pitfalls Flash models get wrong
- `try` around a whole function "to be safe", hiding which call failed.
- `finally`/`defer` that overwrites the original error (`return` inside `finally`, ignored `Close()` error on writes).
- Unhandled promise rejections from un-awaited calls (see `topic-concurrency.md`).
- High-cardinality metric labels (user id, full URL) that explode storage.
- Logging `err.message` only and losing the stack and cause chain.

## Example - bad -> good
```ts
// BAD: swallowed, context lost, unstructured
try { await chargeCard(order); } catch (e) { console.log("error"); }

// GOOD: expected outcome typed, unexpected error wrapped and propagated
try {
  await chargeCard(order);
} catch (err) {
  if (err instanceof CardDeclinedError) return { ok: false, reason: "declined" } as const;
  throw new Error(`charge order ${order.id}`, { cause: err });
}
// at the HTTP boundary, once:
// logger.error({ err, orderId: order.id, requestId }, "checkout failed");
// res.status(500).json({ title: "Internal error", requestId });
```

## Before finishing
- [ ] Every catch recovers, retries (bounded), translates, or rethrows with context
- [ ] Logs are structured, one per failure, no secrets or PII
- [ ] Failure-path tests pass; new metrics use low-cardinality labels
