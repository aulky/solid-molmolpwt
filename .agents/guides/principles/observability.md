# Observability — engineering guide for AI agents
> Scope: logs, levels, correlation IDs, metrics (RED/USE), OpenTelemetry tracing, SLOs/alerts, error tracking, what never to log, health checks. Examples in TypeScript, Python, Go, PHP. Quick card: `.agents/rules/topic-error-handling-observability.md`. Sibling: `.agents/guides/principles/error-handling.md` (what to do with a failure before it reaches the boundary).
> Last verified: 2026-09 — OpenTelemetry signal and per-language SDK status (opentelemetry.io/status, /docs/specs/status), HTTP semantic conventions (`http.server.request.duration`, span naming, `deployment.environment.name`), Google SRE Workbook burn-rate table, Laravel 11+ `Context` docs, pino 10 redaction (run locally: `*.x` matches one level only). Re-check the SDK status table before choosing an OTel logs SDK: it moves.

## 0. How to use this guide
Every section is one property: definition, why it matters, a **check** you run on your own diff, a bad → good example, and the trap of over-applying it. Default: use the project's existing logger, metrics library and tracer (`node .agents/scripts/search.mjs "getLogger|logger\.|slog\.|structlog|pino|winston|Log::|opentelemetry|prometheus" src`). Only if nothing exists, propose one in the plan; never add a vendor SDK (Datadog, Sentry, New Relic) the user did not ask for.

The single test for all of it: **can the on-call engineer answer "what happened to request X?" and "are users OK right now?" without shipping new code?** If your change adds a code path where the answer is "no", add the missing signal.

## 1. Structured logging
**Definition:** each log line is one event with a constant message and machine-readable key-value fields (JSON in production), not an interpolated sentence.
**Why:** you query logs by field (`order_id=42 AND level=error`); interpolated strings cannot be filtered or grouped.
**Check:** in the diff, every new log call has a constant message (no template literal / f-string / `%s` building the message) and puts variables in fields. `node .agents/scripts/search.mjs "console\.(log|info|warn|error|debug)|print\(|fmt\.Print|var_dump|error_log" src --glob "!*.test.*"` finds unstructured output in server code; replace it when a logger exists.
**Standard fields:** `ts`, `level`, `msg`, `service`, `request_id` and/or `trace_id`, entity ids (`order_id`), `duration_ms`, `error.type`, `error.message` (+ stack for errors). Use one naming style per service (the OTel attribute names are a good default).

```ts
// TypeScript (pino) — bad: message changes per call, no fields to query
logger.info(`Charged order ${order.id} for ${amount} in ${ms}ms`);
// good: constant message, typed fields
logger.info({ orderId: order.id, amountCents: amount, durationMs: ms }, "order charged");
```
```python
# Python (structlog) — good; stdlib logging: logger.info("order charged", extra={...}) + a JSON formatter
log = structlog.get_logger()
log.info("order_charged", order_id=order.id, amount_cents=amount, duration_ms=ms)
```
```go
// Go (log/slog, stdlib since Go 1.21)
logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
logger.InfoContext(ctx, "order charged", "order_id", o.ID, "amount_cents", amt, "duration_ms", ms)
// in request scope use L(ctx).InfoContext(...) from §3 so request_id is attached
```
```php
// PHP (Laravel / Monolog): context array, not string concatenation
Log::info('order charged', ['order_id' => $order->id, 'amount_cents' => $amount]);
```
**Trap:** logging every function entry and exit "for traceability" — that is what spans are for (§5). Log decisions, state changes and failures; more than ~5 info lines per happy-path request is usually noise.

## 2. Log levels
**Definition:** the level says who must act. Use this table and nothing finer:

| Level | Meaning | Example |
|---|---|---|
| `error` | a request/job failed and someone may need to act | unhandled exception at the boundary, payment provider 5xx after retries |
| `warn` | degraded but handled; worth a look if it trends | retry succeeded on attempt 3, fallback cache used, deprecated API called |
| `info` | business-relevant state change, one per important event | order placed, user signed up, job finished (with duration) |
| `debug` | developer detail, off in production by default | parsed payload shape, branch taken |

**Why:** if `error` fires for expected outcomes (404, validation failure, declined card), the real incident drowns.
**Check:** for every new `error`/`warn` call, ask "would I want to be told about this at scale?" 4xx caused by the client → `info` or `debug`. Every failure is logged **once**, at the boundary that handles it, not at each layer it passes (search the diff for `log` directly followed by `throw`/`raise`/`return err`).
**Trap:** inventing extra levels per module or per-call-site level config. One service-wide `LOG_LEVEL` is enough.

## 3. Correlation IDs and context propagation
**Definition:** one identifier follows a unit of work across every log line, span, queue message and downstream call. With OpenTelemetry it is the W3C Trace Context `traceparent` header (`trace_id` + `span_id`); without it, a `request_id` generated at the edge (or taken from a trusted upstream header) and forwarded.
**Why:** without it, a failing checkout is 40 unrelated lines across 3 services; with it, one query.
**Check:**
1. Is the id set once, at ingress (HTTP middleware, queue consumer, cron entry), not generated again deeper down?
2. Is it attached to the logger context so every line carries it automatically (not passed by hand to each call)?
3. Is it forwarded on outbound HTTP calls and put into queue message metadata?
4. Is it returned to the client (response header or error body) so a support ticket can quote it?

```go
// Go — middleware binds a request-scoped logger into the context once
func WithRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if !validID.MatchString(id) { id = uuid.NewString() } // validID = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)
		w.Header().Set("X-Request-Id", id)
		l := slog.Default().With("request_id", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), loggerKey{}, l)))
	})
}
// slog handlers do NOT read ctx values: InfoContext(ctx, ...) alone adds no request_id. Fetch the logger:
func L(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(loggerKey{}).(*slog.Logger); ok { return l }
	return slog.Default()
}
```
```php
// PHP (Laravel 11+ `Context` facade): values are appended to every log line and carried into queued jobs
$rid = $request->header('X-Request-Id');
if (!is_string($rid) || !preg_match('/^[A-Za-z0-9._-]{1,64}$/', $rid)) { $rid = (string) Str::uuid(); }
Context::add('request_id', $rid);
```
Python: `structlog.contextvars.bind_contextvars(request_id=rid)` in middleware (clear first; contextvars survive `await`).
**Trap:** a home-made propagation format when OpenTelemetry is installed. Then log `trace_id`/`span_id` from the active span and let the SDK propagate `traceparent`; keep `X-Request-Id` only for clients that cannot send `traceparent`.

## 4. Metrics: RED for services, USE for resources
**Definition:** numeric time series aggregated at the source. **RED** per endpoint/consumer: Rate (requests/s), Errors (failed requests/s), Duration (histogram). **USE** per resource (pool, queue, CPU, disk): Utilization, Saturation (queue length, wait time), Errors.
**Why:** metrics are cheap to keep for months and are what alerts should read; logs answer "why".
**Check:**
- Duration is a **histogram**, never an average gauge (averages hide the p99 that users feel). OTel stable name for HTTP servers: `http.server.request.duration`, unit seconds.
- Base units (seconds, bytes) in name or metadata; counters only go up (`_total` in Prometheus).
- Every label has a small, bounded set of values: route template (`/orders/{id}`), method, status class, `error.type`. **Never** user id, email, raw URL, full SQL, request id, or exception message. Rule of thumb: < ~1,000 label combinations per metric.
- New queue/pool/cache in the diff → does it expose depth or wait time (saturation)?

```ts
// TypeScript (OpenTelemetry API) — bad: unbounded label explodes storage
histogram.record(secs, { url: req.url, userId: user.id });
// good: route template + low-cardinality status
const duration = meter.createHistogram("http.server.request.duration", { unit: "s" });
duration.record(secs, { "http.request.method": req.method, "http.route": "/orders/{id}", "http.response.status_code": res.statusCode });
```
Only create `http.server.request.duration` yourself when no HTTP instrumentation is installed; otherwise you double-count.
**Trap:** a custom metric per function. Frameworks and OTel auto-instrumentation already emit RED for HTTP/DB/queue; add custom metrics only for business events (orders placed) and resources the library cannot see.

## 5. Tracing with OpenTelemetry
**Definition:** a trace is a tree of timed spans sharing a `trace_id` across processes. OpenTelemetry (OTel) is the vendor-neutral standard (API, SDK, OTLP protocol, semantic conventions); the backend is swappable.

**Status (verified 2026-09, opentelemetry.io/status):** specification — tracing stable, logs (bridge API, SDK, OTLP) stable, metrics API/OTLP stable with SDK "mixed", profiles protocol in development. Per-language SDKs differ:

| Language | Traces | Metrics | Logs |
|---|---|---|---|
| JavaScript, Python | stable | stable | development |
| Go | stable | stable | release candidate |
| Java, .NET, PHP | stable | stable | stable |
| Rust | beta | beta | beta |

Consequence: in JS/Python/Go keep your existing logger and correlate by injecting `trace_id`/`span_id` into log fields (or use a log-bridge appender); do not rip out the logger for the OTel logs SDK.

**Why:** only traces show where the time went and which hop failed.
**Check:**
- Instrumentation libraries first (HTTP server/client, DB driver, queue); manual spans only around business operations or external calls the libraries miss.
- Span names are low-cardinality: `GET /orders/{id}`, `charge_card`, never `GET /orders/42`.
- On failure: record the exception and set status to error, then rethrow (do not swallow).
- Context crosses async boundaries: queue messages carry `traceparent` in metadata; background tasks start with the parent context, not a fresh one.
- Config via standard env vars, not code: `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` (e.g. `deployment.environment.name=prod,service.version=1.4.2`), `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_TRACES_SAMPLER=parentbased_traceidratio` + `OTEL_TRACES_SAMPLER_ARG=0.1`.

```ts
// TypeScript (@opentelemetry/api)
const tracer = trace.getTracer("checkout");
await tracer.startActiveSpan("charge_card", async (span) => {
  try {
    span.setAttribute("order.id", order.id);
    return await psp.charge(order);
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end(); // a span never ended is never exported
  }
});
```
```python
# Python — the context manager records the exception and sets error status by default
tracer = trace.get_tracer(__name__)
with tracer.start_as_current_span("charge_card") as span:
    span.set_attribute("order.id", order.id)
    return psp.charge(order)
```
```go
// Go — pass ctx everywhere; a span started from context.Background() breaks the trace
ctx, span := otel.Tracer("checkout").Start(ctx, "charge_card")
defer span.End()
if err := psp.Charge(ctx, o); err != nil {
	span.RecordError(err)
	span.SetStatus(codes.Error, "charge failed")
	return fmt.Errorf("charge order %s: %w", o.ID, err)
}
```
**Trap:** 100% sampling in production for high-traffic services (cost), or sampling decided per service independently (broken traces: use parent-based sampling). Also: attaching request/response bodies as span attributes; they are logs with PII, not attributes.

## 6. SLOs and alerts
**Definition:** an SLI is a ratio of good events to valid events measured where users feel it (e.g. requests served < 300 ms and not 5xx / all requests). An SLO is a target over a window (99.9% over 30 days). The error budget is `1 - SLO` (43 minutes of full outage per 30 days at 99.9%).
**Why:** cause-based alerts (CPU 80%, a pod restarted) page for things users never notice; SLO-burn alerts page only when users are hurt and the budget is at risk.
**Check (for alert or dashboard changes):**
- Every paging alert is tied to user impact (an SLO) and has a runbook link. Cause-based signals (CPU, disk) → tickets or dashboards, not pages — except hard-capacity limits (disk full in < 4 h).
- Use multiwindow, multi-burn-rate alerts. Google SRE Workbook starting point for 99.9% / 30 days:

| Severity | Long window | Short window | Burn rate | Budget consumed |
|---|---|---|---|---|
| Page | 1 h | 5 min | 14.4 | 2% |
| Page | 6 h | 30 min | 6 | 5% |
| Ticket | 3 days | 6 h | 1 | 10% |

- The alert fires only when both windows exceed the rate (short window = fast reset, fewer false pages).
**Trap:** 99.99% SLOs over dependencies that promise 99.9%, or SLOs nobody reviews. Start with one availability and one latency SLO per user journey.

## 7. Error tracking
**Definition:** an error tracker (Sentry, Rollbar, OTel exceptions in your backend) groups exceptions by fingerprint and links them to release and trace.
**Why:** logs say an error happened; grouping says it is new since release 1.4.2 and hits 3% of checkouts.
**Check:**
- Unhandled exceptions are captured once, at the boundary (framework handler, `main`, job runner), not by `try/catch` around every call.
- Events carry `release`/`service.version`, environment and `trace_id`, so a group links to the deploy and the trace.
- Expected outcomes (validation errors, 404, declined card) are **not** sent; they are not bugs.
- The SDK's PII scrubbing stays on; user identity is an opaque id, not an email.
**Trap:** sending every handled exception "just in case" (nobody reads the inbox), or capturing, logging at `error` and rethrowing to a handler that captures again (triple count).

## 8. What never to log
**Definition:** logs, traces and error events are copied to many systems, retained for months and read by far more people than the database. Treat them as public inside the company.
**Never log:** passwords, API keys, tokens, session ids, cookies, `Authorization` headers, private keys, full card numbers or CVV, government ids, health data, full request/response bodies, raw query strings with tokens, whole user or config objects. Treat email, phone, name, precise location and IP as PII: log only if a documented need exists, else hash or use the user id.
**Check:**
- `node .agents/scripts/search.mjs -i "(log|logger|print|span\.set).*(password|passwd|secret|token|api_?key|authorization|cookie|session|card|ssn)" src` → each hit must be a redacted or boolean field (`has_token=true`).
- No `log(req)`, `log(user)`, `logger.info(body)`, `repr(obj)` of whole objects in the diff: log chosen fields.
- Redaction is enforced in the logger config, not by remembering at every call site:

```ts
// TypeScript (pino): redaction paths are fixed at startup. `*.x` matches ONE level only:
// list top-level keys explicitly and prove it with a test log call.
const logger = pino({ redact: { paths: ["password", "token", "*.password", "*.token",
  "req.headers.authorization", "req.headers.cookie"], remove: true } });
```
```go
// Go (slog): a type that can never print its secret
type Secret string
func (Secret) LogValue() slog.Value { return slog.StringValue("[REDACTED]") }
```
```python
# Python: a structlog processor that drops sensitive keys everywhere
SENSITIVE = {"password", "token", "authorization", "cookie", "api_key"}
def drop_secrets(_, __, event):
    return {k: ("[REDACTED]" if k.lower() in SENSITIVE else v) for k, v in event.items()}
```
**Trap:** "debug is off in prod, so logging the token at debug is fine." Debug gets turned on during incidents. No secret at any level.

## 9. Health checks
**Definition:** endpoints the platform polls. **Liveness** = "the process is not stuck; restart me if this fails". **Readiness** = "I can serve traffic now; stop routing to me if this fails". **Startup** (Kubernetes `startupProbe`) = "still booting; do not judge liveness yet".
**Why:** a liveness check that pings the database turns a DB blip into every pod restarting at once.
**Check:**
- Liveness does no I/O to dependencies: return 200 if the event loop / server responds.
- Readiness checks only what this instance needs to serve (its DB pool, required config, warm cache), with a short timeout (< 1 s) and cached result, and returns 503 while draining on shutdown.
- Health endpoints are cheap, excluded from access logs and SLO traffic, and expose no versions, hostnames or dependency error strings publicly.
```ts
// TypeScript — separate endpoints; readiness has a timeout and no stack traces in the body
app.get("/livez", (_req, res) => res.status(200).send("ok"));
app.get("/readyz", async (_req, res) => {
  const ok = !shuttingDown && (await pingDb({ timeoutMs: 500 }).catch(() => false));
  res.status(ok ? 200 : 503).send(ok ? "ready" : "not ready");
});
```
**Trap:** a "deep health" endpoint that checks every downstream service and is wired to liveness. Downstream health belongs in metrics and alerts, not in whether this process gets killed.

## 10. Anti-patterns → fixes
| Anti-pattern | Fix |
|---|---|
| `console.log`/`print`, interpolated messages | project logger, constant message + fields |
| log-and-rethrow at every layer | wrap with context; log once at the boundary |
| `error` level for 4xx/expected outcomes | `info`/`debug`; `error` = someone may need to act |
| new request id generated per layer | set once at ingress, bind to logger context, forward |
| average latency gauge | histogram with p50/p95/p99 |
| user id / raw URL as metric label | route template, status class; ids go in logs/traces |
| span per function | instrumentation libraries + spans around business/external ops |
| page on CPU > 80% | page on SLO burn; CPU on a dashboard |
| liveness pings the DB | liveness = process alive; DB goes in readiness |
| secrets redacted "at call sites" | redaction in logger config / secret wrapper type |

## Checklist (copy into your review)
- [ ] Used the project's existing logger/tracer/metrics lib; no new vendor SDK unless asked
- [ ] New log calls: constant message, key-value fields, correct level per §2 table, one log per failure at the boundary
- [ ] Every log line in request/job scope carries `request_id` or `trace_id` automatically; the id is forwarded downstream and returned to the client
- [ ] New endpoints/consumers are covered by RED metrics (framework/OTel auto-instrumentation counts); new pools/queues expose saturation
- [ ] Metric labels and span names are low-cardinality (route template, never ids or raw URLs)
- [ ] Manual spans end in `finally`/`defer`, record exceptions, set error status, and rethrow
- [ ] No secrets or unneeded PII in logs, span attributes or error events (search command in §8 run, hits reviewed)
- [ ] Alerts changed? Each page ties to an SLO burn rate and links a runbook
- [ ] Liveness has no dependency I/O; readiness has a timeout and returns 503 while draining
- [ ] Failure path tested for status/log/metric where the project tests telemetry (else say "not verified")

## References
- OpenTelemetry status: https://opentelemetry.io/status/ · spec status: https://opentelemetry.io/docs/specs/status/
- OTel HTTP semantic conventions: https://opentelemetry.io/docs/specs/semconv/http/ · env vars: https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/
- W3C Trace Context: https://www.w3.org/TR/trace-context/
- Google SRE Workbook, Alerting on SLOs: https://sre.google/workbook/alerting-on-slos/ · Monitoring distributed systems: https://sre.google/sre-book/monitoring-distributed-systems/
- USE method: https://www.brendangregg.com/usemethod.html · RED method: https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/
- Prometheus naming: https://prometheus.io/docs/practices/naming/ · Kubernetes probes: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- Go `log/slog`: https://pkg.go.dev/log/slog · pino redaction: https://github.com/pinojs/pino/blob/main/docs/redaction.md · Laravel Context: https://laravel.com/docs/context
