# Error handling — engineering guide for AI agents
> Scope: classifying failures, fail-fast, exceptions vs result types, wrapping, retries, and the user/log boundary — language-agnostic. Quick card: `.agents/rules/01-engineering-standards.md`; adjacent topic rule: `.agents/rules/topic-error-handling-observability.md` (logging/metrics/tracing once an error reaches a boundary).
> Last verified: 2026-09 — this guide names no time-sensitive library versions; per-language exception/result mechanics (Rust `Result`/`thiserror`/`anyhow`, Go error wrapping, TS/Python exception chaining) match `.agents/guides/languages/rust.md`, `go.md`, `typescript.md`, `python.md` — re-verify a specific crate/package version there or in the lockfile before citing one.

## 0. How this guide works
Each section is one property of correct error handling: what it means, why getting it wrong causes real incidents, a concrete **check** to run against your own diff, a bad→good pair, and where the check gets over-applied. Apply these to every new `catch`/`except`/`if err != nil`/`Result` you write, not only when reviewing someone else's.

## 1. Error taxonomy: expected outcomes vs bugs vs environment
**Definition:** not every failure is the same kind of thing, and the kind determines the handling.

| Kind | Example | Handle by |
|---|---|---|
| Invalid input | bad field, wrong type, missing required value | reject at the boundary (4xx / typed error); no retry; log at debug/info |
| Expected business outcome | not found, card declined, duplicate email | typed result or domain error; caller decides what to show |
| Transient | timeout, 503, connection reset, deadlock | bounded retry with backoff, only if the operation is idempotent (§6) |
| Bug / broken invariant | "impossible" null, failed assertion, index out of range | fail fast (§2); log at error with full context; do not retry |
| Bad configuration | missing env var, unreachable required dependency at startup | fail at startup, not at first use (§2) |

**Why it matters:** treating a bug like a transient failure (retrying it) turns a fast, loud crash into a slow, quiet one that burns through retry budgets without ever succeeding; treating an expected outcome like a bug (logging every "not found" at error level) buries real incidents in noise.
**How to check:** for every new error site, classify it with the table above before writing the `catch`. `node .agents/scripts/search.mjs "catch\s*\(.*\)\s*\{" <changed files>` (or the language equivalent) to list every catch site you added, then confirm each one names which row it is.
**Example (Python) — bad → good:**
```python
# bad: one bucket for every failure, same handling regardless of kind
try:
    charge(order)
except Exception:
    logger.error("failed")
    return None

# good: kind determines handling
try:
    charge(order)
except CardDeclinedError as e:            # expected outcome
    return ChargeResult(ok=False, reason=e.reason)
except TimeoutError:                       # transient
    return retry_with_backoff(lambda: charge(order), max_attempts=3)
except InvariantError:                     # bug: do not retry, surface loudly
    logger.error("charge invariant broken", extra={"order_id": order.id})
    raise
```
**Misapplication / over-engineering trap:** building a five-level custom exception hierarchy for a script that has three call sites — classify only as finely as the handling actually differs; a bug-class error does not need a retry policy, and an invalid-input error does not need a stack trace shipped to the user.

## 2. Fail fast
**Definition:** detect a broken invariant or missing precondition as early and as close to its source as possible, and stop there — do not let bad state travel further where it becomes harder to trace.
**Why it matters:** a `nil`/`null`/`undefined` that is allowed to propagate through three more function calls before crashing produces a stack trace that points at an innocent line, not the cause; a missing required config that is only discovered on the first request that needs it fails in production instead of at deploy time.
**How to check:**
- Does every function validate its stated preconditions on entry (non-nil required args, required config present) rather than assuming a caller already checked?
- Does required configuration get read and validated once at process startup (`env.Parse()`, a startup schema check), rather than read lazily wherever it is used?
- Ask: "if this assumption is wrong, where does the program currently notice — at this line, or three calls later in an unrelated function?"
**Example (Go) — bad → good:**
```go
// bad: nil config discovered deep inside, far from where it went wrong
func Handler(cfg *Config) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, cfg.APIKey) // panics here if cfg is nil — unclear why
    }
}

// good: fail at construction, with a message that names what's missing
func NewHandler(cfg *Config) (http.HandlerFunc, error) {
    if cfg == nil || cfg.APIKey == "" {
        return nil, fmt.Errorf("NewHandler: APIKey is required in Config")
    }
    return func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, cfg.APIKey)
    }, nil
}
```
**Misapplication / over-engineering trap:** validating the same precondition redundantly at every layer of a call stack that all run in the same trusted process (validate once, at the boundary — see §8, not on every internal call); adding defensive checks for conditions the type system already makes impossible (e.g. re-checking a value the compiler proved non-null).

## 3. Exceptions vs result types, per language
**Definition:** two shapes for "this can fail": an exception (out-of-band control flow that unwinds the stack) or a result/outcome value the caller must handle in-band (`Result<T, E>`, `{ok, error}`, a checked/sentinel return). Neither is universally correct; the right default follows the language's own idiom and the failure's kind (§1: expected outcomes lean result-shaped, bugs lean exception-shaped).

| Language | Idiomatic default | Expected outcome | Bug / invariant |
|---|---|---|---|
| TS / JS | exceptions for bugs, `Result`/union for outcomes callers must branch on | `{ ok: true, value } \| { ok: false, error }` | `throw new Error(...)`; unhandled rejection crashes the process |
| Python | exceptions (native control flow) | a specific exception subclass, or a `Result`-style dataclass in typed code | broad exception or `assert` |
| Go | error values are the *only* mechanism; no exceptions in normal flow | `(T, error)`, checked immediately | `panic` only for corrupted invariants, never expected failure |
| Rust | `Result<T, E>` for anything fallible; `panic!` only for bugs | `Result<T, E>` with a specific `E`; `?` to propagate | `panic!`/`.unwrap()` only where failure is provably impossible or in tests |
| PHP | exceptions (native control flow) | a specific `Exception` subclass caught by type | uncaught `Error`/`TypeError` |

**Why it matters:** using exceptions for a routine, expected outcome (e.g. "not found" on 30% of requests) turns a normal branch into an expensive stack-unwind with implicit control flow; using a plain error/result for a broken invariant means every caller up the chain must remember to check it, and one that forgets silently continues with corrupt state.
**How to check:** for each new fallible call, ask "does this fail as part of normal, expected operation (routing to a branch), or does it mean something is broken?" Route the first into the language's result/typed-error mechanism; let the second propagate as an exception/panic. Confirm the language's own idiom is followed — do not import a `Result<T,E>` pattern into idiomatic Go/Rust code (already the default) or bolt Go-style multi-return errors onto idiomatic Python.
**Misapplication / over-engineering trap:** wrapping every Python function in a hand-rolled `Result` class "to be explicit", fighting the language's native exception mechanism and its ecosystem (which raises); using exceptions for control flow in Go, which has no first-class exception mechanism and where every framework, linter and reviewer expects `if err != nil`.

## 4. Wrapping with context
**Definition:** when an error crosses a function boundary and you cannot fully handle it there, add what the caller doesn't already know (which operation, which id, which input) and propagate — the underlying cause is preserved, not discarded.
**Why it matters:** a bare rethrow ("failed to load") gives no way to tell *which* load failed when ten call sites call the same function; discarding the original error (returning `errors.New("failed")` instead of wrapping) destroys the information needed to diagnose it, especially once it reaches a log.
**How to check:**
- Does every wrap add new information (an id, an operation name, an input) rather than repeat the message the wrapped error already has?
- Is the original error reachable from the wrapper (`{ cause }`, `%w`, `.context()`, `from err`), so a debugger or `errors.Is/As`/`err.Unwrap()`-style check still works?
- Are you wrapping at *every* layer of a call stack ("log-and-rethrow" at each level, producing five log lines for one failure)? Wrap while propagating; log once, at the boundary (§7).
**Example (Rust) — bad → good:**
```rust
// bad: swallows the original error entirely; caller cannot tell what failed
fn load_invoice(id: u64) -> Result<Invoice, String> {
    fs::read_to_string(path_for(id)).map_err(|_| "failed".to_string())?;
    // ...
    Ok(Invoice::default())
}

// good: anyhow::Context keeps the source error and adds what's missing
use anyhow::{Context, Result};

fn load_invoice(id: u64) -> Result<Invoice> {
    let raw = fs::read_to_string(path_for(id))
        .with_context(|| format!("reading invoice {id} from disk"))?;
    parse_invoice(&raw).with_context(|| format!("parsing invoice {id}"))
}
```
Go equivalent: `fmt.Errorf("load invoice %d: %w", id, err)`. TS: `` new Error(`load invoice ${id}`, { cause: err }) ``. Python: `raise LoadError(f"load invoice {id}") from err`.
**Misapplication / over-engineering trap:** re-wrapping the same error at every intermediate function on its way up ("load invoice: read file: open: permission denied" repeated five times with no new fact each time) — wrap only where you add information; a thin pass-through function should just propagate, not wrap for its own sake.

## 5. Never swallow
**Definition:** every caught error is handled (recovered from), retried, translated for a caller/boundary, or rethrown with context. It is never caught and silently discarded.
**Why it matters:** a swallowed error is a failure with no trace: the operation didn't happen, nothing logged it, and the caller believes it succeeded. This is how "the button does nothing" and "data is quietly missing" bugs are born — by the time a user reports it, the evidence is gone.
**How to check:**
- `node .agents/scripts/search.mjs "catch\s*\{\s*\}|catch\s*\([^)]*\)\s*\{\s*\}" <changed files>` for empty catch blocks; `except:\s*pass` / `except Exception:\s*pass` for Python; `_ = err` or a discarded `if err != nil {}` in Go; `.catch(() => {})` / `.catch(() => undefined)` in JS/TS.
- Every `catch`/`except` you add: does it call something (log, recover, retry, translate, rethrow)? If it truly is safe to ignore (a best-effort cleanup, a cache-write failure), is there a comment saying so and at least a debug-level log?
**Example (PHP) — bad → good:**
```php
// bad: the delete silently fails; the caller thinks the record is gone
try {
    $storage->deleteFile($path);
} catch (\Throwable $e) {
    // ignore
}

// good: recognised as best-effort, but visible if it happens
try {
    $storage->deleteFile($path);
} catch (\Throwable $e) {
    // Best-effort cleanup: an orphaned file costs storage, not correctness.
    // Logged so it's visible in aggregate if the storage backend degrades.
    $logger->debug('cleanup: failed to delete {path}', ['path' => $path, 'exception' => $e]);
}
```
**Misapplication / over-engineering trap:** the opposite failure — catching broad exceptions just to log-and-rethrow with no added context (§4) — is not "safety", it multiplies noise without adding a real handling path; do not add a catch block at all if you have nothing to do with the error (let it propagate to a caller that does).

## 6. Retries, backoff, and idempotency
**Definition:** retrying is only correct for transient failures (§1) on operations that are safe to run more than once with the same effect (idempotent), bounded by an attempt cap and an overall deadline, with backoff that spaces attempts out (typically exponential with jitter).
**Why it matters:** retrying a non-idempotent operation (charge a card, send an email, insert without a uniqueness key) on a transient blip can duplicate the effect even though the first attempt succeeded and only its *response* was lost; retrying without a cap or backoff turns one struggling downstream service into a retry storm.
**How to check:**
- Before adding a retry: is this operation idempotent (same input, run twice, same end state)? If not, make it idempotent first (idempotency key, upsert, dedup check) or do not retry — surface the failure instead.
- Does the retry have a hard cap (e.g. ≤ 3 attempts), an overall deadline, and backoff with jitter between attempts — not a tight unbounded loop?
- `node .agents/scripts/search.mjs "while\s*\(true\)|for\s*\(;;\)" <changed files>` (C-style; for Python use `while\s*True\s*:`, for Go use `for\s*\{` with no other loop condition) around any retry loop — confirm a break tied to an attempt count or deadline, not just the success case.
**Example (TypeScript) — bad → good:**
```ts
// bad: unbounded, no backoff, and retries a non-idempotent charge blindly
async function chargeUnsafe(orderId: string) {
  while (true) {
    try { return await charge(orderId); } catch { /* try again */ }
  }
}

// good: capped, backed off, jittered, and the operation is made idempotent
// via an idempotency key so a duplicate attempt is a no-op server-side
async function chargeSafely(orderId: string, idempotencyKey: string) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await charge(orderId, { idempotencyKey });
    } catch (err) {
      if (!isTransient(err) || attempt === maxAttempts) throw err;
      const backoffMs = 200 * 2 ** (attempt - 1) + Math.random() * 100;
      await sleep(backoffMs);
    }
  }
}
```
**Misapplication / over-engineering trap:** adding a generic retry wrapper around every I/O call regardless of whether the operation is idempotent or the failure is transient — this is how duplicate charges and duplicate emails happen; a well-meaning "just retry 3 times" on a bug-class error (§1) only delays the same guaranteed failure three times instead of surfacing it once, quickly.

## 7. User-facing messages vs logs
**Definition:** what a caller/end-user sees on failure (a status code, a short message, a correlation id) is a different artifact from what an operator sees in logs (the full error chain, stack trace, internal identifiers) — and they must never leak into each other.
**Why it matters:** returning a raw stack trace or an internal exception message to a client exposes implementation details (file paths, table names, library versions) that help an attacker and confuse a legitimate user who can't act on "NullPointerException at line 42"; conversely, a log that only says "error" with no request id, entity id, or cause gives an operator nothing to search on when investigating an incident.
**How to check:**
- Does the boundary handler (HTTP endpoint, CLI `main`, job entry point) map every error to *both* an operator-facing log line (full detail, once) *and* a caller-facing message (safe, short, generic unless the error is a validated business outcome you intend to expose, like "email already registered")?
- Does the caller-facing message ever interpolate `err.message`/`str(e)`/`e.getMessage()` directly? If so, is that error guaranteed to be a safe, intentionally-user-facing type (§1's "expected outcome"), not an arbitrary caught exception?
- Is there a correlation/request id in both the log line and the response, so a user's bug report can be traced back to the exact log entry?
**Example (Python) — bad → good:**
```python
# bad: internal detail leaks to the client; nothing useful reaches the logs
@app.exception_handler(Exception)
def handle(request, exc):
    return JSONResponse({"error": str(exc)}, status_code=500)

# good: full detail logged once, generic + correlation id returned
@app.exception_handler(Exception)
def handle(request, exc):
    request_id = request.state.request_id
    logger.error("unhandled error", extra={"request_id": request_id}, exc_info=exc)
    return JSONResponse(
        {"title": "Internal error", "request_id": request_id}, status_code=500
    )
```
**Misapplication / over-engineering trap:** building a translation layer so generic that even validated, safe-to-show business outcomes ("that coupon expired") get flattened to "an error occurred", forcing users to guess; conversely, a "friendly error" middleware that quietly downgrades a genuine 500 to a 200 with an empty body, hiding the failure from both the user and monitoring.

## 8. Boundaries and validation
**Definition:** every point where data enters the process from outside its control (HTTP body/params/headers, CLI args, env vars, file reads, a queue message, a third-party API response, `JSON.parse`) is validated once, there, before the value is treated as trustworthy anywhere else in the code.
**Why it matters:** validating "wherever it's convenient" means some paths trust unchecked data and others don't, and an attacker or a malformed upstream response only needs the one path that skipped the check; validating redundantly at every internal layer wastes effort and still misses the edge if the boundary itself was never covered.
**How to check:**
- For each new external input, is there exactly one point that parses/validates it (a schema, a typed parse function) before it is used, rather than ad hoc `if` checks scattered across the functions that consume it?
- Does internal code past that point receive the *validated, typed* value (not the raw `unknown`/`any`/string), so the type system enforces "already checked" for you?
- New route, RPC method, webhook, or queue consumer: does it validate → authenticate → authorize, in that order, inside the entry point itself, rather than assuming a caller already did?
**Example (Go) — bad → good:**
```go
// bad: validation scattered across handlers; some paths trust raw input
func Handler(w http.ResponseWriter, r *http.Request) {
    var req CreateOrderRequest
    json.NewDecoder(r.Body).Decode(&req) // no error check, no validation
    createOrder(req.Items)               // items could be empty, negative qty, etc.
}

// good: one parse-and-validate function; everything past it is trusted
func ParseCreateOrder(r *http.Request) (CreateOrderRequest, error) {
    var req CreateOrderRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        return req, fmt.Errorf("invalid request body: %w", err)
    }
    if len(req.Items) == 0 {
        return req, errors.New("items must not be empty")
    }
    for _, it := range req.Items {
        if it.Qty <= 0 {
            return req, fmt.Errorf("item %s: qty must be positive", it.SKU)
        }
    }
    return req, nil
}
```
**Misapplication / over-engineering trap:** re-validating the same already-typed, already-checked value at every internal function it passes through "just in case" — that is redundant work, not defense; the fix for a missing boundary check is to add it *at the boundary*, not to sprinkle checks deeper in the call graph where the type system should already guarantee the value is safe.

## Checklist (copyable)
- [ ] Every new failure site is classified (invalid input / expected outcome / transient / bug / config) and handled per its row
- [ ] Broken invariants and missing required config fail immediately, at their source, with a message naming what's missing
- [ ] The exception-vs-result choice follows the language's own idiom, not an imported pattern from another language
- [ ] Every wrap adds new information and keeps the original error reachable (`cause`/`%w`/`.context()`/`from err`)
- [ ] No empty `catch`/`except`; every handled error recovers, retries, translates, or rethrows with context
- [ ] Every retry is on a confirmed-idempotent operation, capped, backed off, and deadline-bounded
- [ ] Clients get a safe, short message plus a correlation id; the full error and id are logged once, at the boundary
- [ ] Every external input (HTTP, CLI, env, file, queue, third-party response) is validated once at its entry point
- [ ] A test exists for at least one failure path per kind you touched (timeout retried then surfaced; invalid input rejected)

## References
- Go: https://go.dev/blog/error-handling-and-go · wrapping https://go.dev/blog/go1.13-errors
- Rust: https://doc.rust-lang.org/book/ch09-00-error-handling.html · https://docs.rs/anyhow · https://docs.rs/thiserror
- MDN `Error.cause`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause
- Python chaining: https://docs.python.org/3/tutorial/errors.html#exception-chaining
- Google SRE Book ch. 21-22: https://sre.google/sre-book/table-of-contents/ · AWS "Timeouts, retries and backoff with jitter": https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter
- Related: `.agents/guides/principles/observability.md`, `api-design.md` (client error shapes), `concurrency.md` (idempotency) — siblings not yet written
