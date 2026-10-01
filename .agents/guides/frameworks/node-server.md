# Node/Bun/Deno HTTP servers — engineering guide
> Scope: framework-agnostic backend engineering for Express, Fastify, Hono, H3/Nitro, Koa, NestJS, Elysia — plus
> Nitro v3 + h3 v2 (SolidStart 2's server layer) in depth. Quick card: `.agents/rules/fw-node-server.md`.
> Last verified: 2026-09 — npm registry `dist-tags`/`latest` (live, 2026-09-30) for every package version below;
> official docs for h3/Nitro (installed source in a SolidStart 2 project's `node_modules/h3`, `node_modules/nitro`), Fastify, Hono, NestJS via
> context7 MCP. Re-check the project's lockfile before trusting an exact version claim.

## 1. Mental model / philosophy
- **A server is: validate → do the thing → respond, with one place to convert failures to status codes.** Every
  framework here is a thin dispatch layer (URL + method → a function) around that shape; don't let framework choice
  change the shape of your business logic.
- **The boundary is the trust line.** Anything from `req`/`event` (body, query, params, headers, cookies) is
  untyped bytes until a schema says otherwise — a TypeScript type on `req.body` enforces nothing at runtime.
- **One process, one set of shared resources.** A DB pool, HTTP client, logger, config object: created once at
  boot, held for the process lifetime, closed once at shutdown. Recreating any per-request is the most common
  Node correctness/performance bug in this space.
- **Errors are values with a status, not strings.** Business/validation code throws a typed error; exactly one
  place turns it into an HTTP response. Two code paths producing two different error shapes is a defect.
- Node/Bun/Deno are single-event-loop runtimes: one slow synchronous call blocks every other in-flight request on
  that process, regardless of framework — see §8.

## 2. Project structure & tooling
### Versions (verified live against npm 2026-09-30 — re-check the lockfile, this drifts fast)
| Package | Verified current | Notes |
|---|---|---|
| express | 5.2.1 | v5 is the default install target; v4 still common, behaves differently (§3) |
| fastify | 5.12.5 | schema validation is Ajv-based and built in (§3) |
| hono | 4.13.11 | Web-standard `Request`/`Response`; runs on Node, Bun, Deno, Workers |
| koa | 3.2.1 | promise-based middleware; smaller ecosystem than Express |
| @nestjs/core | 12.1.1 | Angular-style DI/modules over Express or Fastify |
| elysia | 1.4.30 | Bun-first, end-to-end type inference |
| h3 | 2.0.1 (rc; reference project pinned `2.0.1-rc.26`) | Web-standard rewrite; runs on Node ≥ 20.11, Bun, Deno |
| nitro | 3.0 (beta; reference project pinned `3.0.260610-beta`) | SolidStart 2's server layer — Vite-integrated (`nitro/vite`) |
| zod | 4.6.5 | Standard Schema — works directly with h3's `getValidatedQuery`/`readValidatedBody` |
| valibot | 1.5.0 | smaller bundle than zod; also Standard Schema |
| pino | 10.3.1 | structured JSON logging, near-zero overhead vs `console.log` |
| @hono/zod-validator | 0.9.1 | replaces Hono's deprecated built-in Validator Middleware (§3) |

### Reference setup: Nitro v3 + h3 v2 shape (verified 2026-09 against `node_modules/nitro/dist/docs`)
```
server.ts                # optional catch-all entry (defineHandler; runs if no other route matches)
server/
  routes/                # file → route: routes/api/users.get.ts -> GET /api/users
    api/
      users.get.ts
      users.post.ts
      users/[id].get.ts  # -> GET /api/users/:id, param in event.context.params
  middleware/             # every file here runs for EVERY request, in filename order
    1.request-id.ts
    2.auth.ts
  plugins/                # definePlugin(app) — register hooks: "request", "response", "error", "close"
nitro.config.ts           # defineConfig({ routeRules, handlers, routes, ignore, ... })
```
Filename suffixes matter: `.get.ts`/`.post.ts`/etc. scope the HTTP method; `[id].ts` is a dynamic param;
`[...rest].ts` is catch-all; a leading `1.`/`2.` on a `middleware/` file controls execution order (they otherwise
run in directory-listing/string order — `10.x.ts` sorts before `2.x.ts` unless you zero-pad).

### Commands (swap the package manager for the project's own lockfile)
| Task | POSIX / Windows (same command — Node scripts) |
|---|---|
| Dev server | `nitro dev` (or the framework's own, e.g. `node --watch server.js`) |
| Build | `nitro build` / SolidStart 2: the project's `build` script (Vite + Nitro) |
| Typecheck | `tsc --noEmit` |
| Test | `vitest run` (unit) · framework test client for integration (§5) |
| Everything (this kit) | `node .agents/scripts/verify.mjs --only node` |

## 3. Core idioms
### Input validation at the edge
H3/Nitro validates directly against any **Standard Schema** library (zod, valibot, ArkType — verified,
`node_modules/h3` docs) with no adapter needed:
```ts
// server/routes/api/users.post.ts
import { defineHandler } from "nitro"; // nitro re-exports defineHandler/HTTPError/defineMiddleware/html/HTTPResponse from h3
import { readValidatedBody } from "h3"; // NOT re-exported by "nitro" — add h3 as an explicit dep: `bun add h3`
import { z } from "zod";

const CreateUser = z.object({ email: z.string().email(), name: z.string().min(1) });

export default defineHandler(async (event) => {
  const input = await readValidatedBody(event, CreateUser); // throws HTTPError 400 on mismatch
  return db.user.create(input); // typed, validated — never event.req.json() used directly
});
```
`getValidatedQuery`/`getValidatedRouterParams` are the equivalents for query strings and route params — also
h3-only, so they need the same explicit `h3` dependency, not a bare import riding on nitro's hoisted copy.

Fastify validates via a plain JSON Schema (or a `zod`/`typebox` schema through `@fastify/type-provider-*`) on the
route definition — a route with a `schema` **already returns 400 with per-field detail on failure** (verified,
Ajv-backed); a hand-written `if (!body.email) ...` inside the handler after that is dead code:
```ts
app.post("/users", {
  schema: { body: { type: "object", required: ["email"], properties: { email: { type: "string" } } } },
}, async (req) => db.user.create(req.body));
```
Hono's own bundled Validator Middleware is **deprecated** (verified, `hono/docs/MIGRATION.md`: "please use 3rd-party
Validator libraries such as Zod or TypeBox") — use `@hono/zod-validator`, not `hono/validator`, in new code:
```ts
import { zValidator } from "@hono/zod-validator";
app.post("/users", zValidator("json", CreateUser), (c) => db.user.create(c.req.valid("json")));
```
NestJS: a DTO class with `class-validator` decorators plus the global `ValidationPipe` — never a hand-checked `if`
chain in the controller method body.

### Central error handling, per framework
One place converts "known" errors (validation, not-found, unauthorized) to their status code and everything else to
a logged, generic 500 — never let two different error shapes reach clients.
```ts
// h3 (standalone, no Nitro) — global hook, catches every route + middleware in that app
import { H3, HTTPError } from "h3";
const app = new H3({
  onError(error) {
    if (!HTTPError.isError(error)) logger.error({ err: error }, "unhandled error");
  },
});
```
**Nitro does not use the `new H3({ onError })` pattern above.** Nitro constructs and owns its own internal `H3`
instance at startup; the only documented handle to it is `nitroApp.h3` inside a `plugins/*.ts` file (verified,
`node_modules/nitro/dist/docs/0.docs/12.plugins.md`). Building a second `new H3({ onError })` in a Nitro project
creates an orphaned app that Nitro's real request pipeline never invokes — it silently catches nothing. Nitro's
actual central-error path is two pieces (verified, `0.docs/10.lifecycle.md`):
```ts
// error.ts (project root) — shapes the HTTP response Nitro sends for every uncaught error
import { defineErrorHandler, HTTPError } from "nitro";
export default defineErrorHandler((error, _event) => {
  const status = HTTPError.isError(error) ? error.status : 500;
  return new Response(JSON.stringify({ error: error.message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
});
```
```ts
// nitro.config.ts — wires the handler in
import { defineConfig } from "nitro";
export default defineConfig({ errorHandler: "~/error" });
```
```ts
// plugins/errors.ts — observes/logs every captured error from any lifecycle stage (does not shape the response)
import { definePlugin } from "nitro";
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("error", (error, { event, tags }) => {
    logger.error({ err: error, path: event?.path, tags }, "captured error");
  });
});
```
Set both: `errorHandler` decides the response, the `error` hook is where you log/report. Fastify:
`app.setErrorHandler(...)` (verified — send `error.validation`/known 4xx as-is, log and generalize anything else).
Hono: `app.onError((err, c) => ...)`. Express: one `(err, req, res, next)` middleware registered **after** every
route (arity 4 marks it as an error handler — verified, Express docs). NestJS: an `@Catch()` exception filter,
applied globally with `app.useGlobalFilters(...)`.

### Async error propagation — verify the major version first
**Express 5** (verified, official docs): the router propagates a thrown error or a **rejected promise** returned by
a handler/middleware straight to error-handling middleware, as if you'd called `next(err)` — no `try/catch` needed.
**Express 4** does not: a rejection in an `async (req,res) => {}` handler is silently lost unless wrapped
(`.catch(next)`, or `express-async-handler`). Check the installed major before assuming v5 behavior. Fastify, Hono,
h3, Koa, and NestJS all natively `await` the handler and forward a rejection — this pitfall is Express-specific.

### Config from env, validated once at startup
```ts
import { z } from "zod";
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});
export const env = EnvSchema.parse(process.env); // throws -> process exits non-zero before listening
```
Read `process.env` in exactly this one module; every other file imports `env` — a typo in a scattered
`process.env.DATBASE_URL` silently becomes `undefined` instead of failing at boot.

### Structured logging (pino)
```ts
import pino from "pino";
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token"],
});
```
Log JSON objects (`logger.info({ userId, orderId }, "order created")`), not interpolated strings — a log aggregator
can filter/query fields but not a sentence. Always redact auth headers/tokens; never log a full body by default.

### Graceful shutdown on SIGTERM
```ts
async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  await new Promise<void>((resolve) => server.close(() => resolve())); // stop accepting new conns, drain in-flight
  await dbPool.end();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```
Nitro: register a `plugins/` file with `nitroApp.hooks.hook("close", async () => { await dbPool.end(); })` (verified
— runs on Nitro server shutdown). **NestJS: `onModuleDestroy`/`onApplicationShutdown` do NOT run on SIGTERM unless
you call `app.enableShutdownHooks()`** in `main.ts` before `listen()` (verified, official docs) — omit it and the
process exits with pooled connections never closed. Never `process.exit()` in a signal handler without draining
first — it drops in-flight requests mid-response.

### Timeouts, rate limiting, CORS, security headers
- **Timeouts**: set `server.requestTimeout`/`server.headersTimeout` (Node's own `http.Server`, which every framework
  here sits on) and an `AbortController`-bounded timeout on every outbound `fetch`/DB call — one stuck upstream call
  must not hang the connection, or eventually the worker, forever.
- **Rate limiting**: on by default in none of these. Put it at the edge (reverse proxy/gateway) when you control
  one; otherwise an in-process token-bucket library (`rate-limiter-flexible`) keyed by IP/user, applied first to
  auth endpoints (`/login`, `/token`) — the highest-value target.
- **CORS**: an explicit origin allowlist, never `origin: "*"` with `credentials: true` (invalid per the Fetch spec,
  a real bypass risk if a client honors it anyway). h3 ships `handleCors(event, { origin, methods })` (verified
  util); Nitro's `routeRules: { "/api/**": { cors: true } }` shortcut sets a **wildcard** origin — override `headers`
  explicitly for anything that also sends credentials (verified, Nitro routing docs).
- **Security headers**: `helmet` (`@fastify/helmet` for Fastify) or Hono's `secureHeaders()` sets
  `X-Content-Type-Options`, a baseline CSP, `X-Frame-Options`, etc. — don't hand-roll these one header at a time.

### Auth: sessions/JWT pitfalls
- Pin the algorithm on every `verify()`/`decode()` call (`algorithms: ["HS256"]`) — never accept `alg: "none"`.
- Set and check `exp`; keep claims minimal — a JWT is signed, not encrypted, anyone holding it reads the payload.
- Session cookies: `HttpOnly` + `Secure` + `SameSite=Lax`/`Strict` always; rotate the session ID on login/role
  change to prevent session fixation.
- Compare against a dummy password hash even for a nonexistent user, so login timing can't leak which usernames
  exist. h3 ships `useSession`/`sealSession` (signed, encrypted cookies, verified util) for this stack —
  h3-only like `handleCors` above; not re-exported by `"nitro"` (§3 note on adding `h3` as an explicit dep).

### DB pooling
One pool per process, created at boot (`server/plugins/db.ts` in Nitro; a module-level singleton elsewhere),
disposed on shutdown — never `new Pool()`/`new Client()` inside a request handler, which exhausts the database's
connection limit under load. Size `max` against the DB's own connection limit ÷ number of running instances, and
set `idleTimeoutMillis`/`connectionTimeoutMillis` so a leaked/hung connection is reclaimed, not silently starved.

## 4. Error handling
- Validate at the boundary and fail fast — don't let a malformed/missing field travel past the first line of the
  handler "just in case it's fine".
- One small error taxonomy (`HttpError { status, message, data? }`, or the framework's own `HTTPError`/
  `HttpException`) thrown from anywhere in the call stack; the central handler is the only place that turns it into
  a response.
- For an unhandled (non-taxonomy) error: log the full error server-side, return a generic message to the client —
  never leak a stack trace, a file path, or a raw DB error in the response body.
- Re-throw with `new HTTPError("...", { cause: err })`, never `new Error(String(err))` — the latter throws away the
  original stack/`cause` chain you need mid-incident.

## 5. Testing
- **Unit**: vitest (or the project's runner) for pure functions/services — no HTTP layer, no network, no real DB.
- **Integration (route-level), by framework**:
  - Fastify: `app.inject({ method, url, payload })` — fake HTTP on `light-my-request`, no socket bound (verified).
  - Hono: `await app.request("/path", init)` — dispatches in-memory via the app's own `fetch` (verified).
  - h3/Nitro: the `H3` instance implements `.fetch(request)` directly, or `toNodeHandler(app)` + `supertest`.
  - Express/Koa/NestJS: `supertest` against the `http.Server` (Nest: from `Test.createTestingModule(...)`, not the
    production bootstrap file).
- **E2E**: Playwright (or `fetch`/`supertest`) against a running instance for flows crossing processes (frontend
  calling the API, a webhook) — keep this thin; push most coverage to route-level integration above.
- Mock at a boundary you own (a repository/DB-client interface), not inside an ORM's query builder — use a real
  test database/testcontainer for anything beyond a pure unit test.
- New behavior needs a new test; a bug fix needs a regression test that fails before the fix.

## 6. Performance
- Reuse one connection pool/HTTP client per process (§3) — never per request.
- Paginate every list endpoint (offset/limit or keyset); never return an unbounded `SELECT *` as JSON.
- Check for N+1 queries on any endpoint looping over a relation — eager-load instead of one query per row.
- Nitro code-splits every route file into its own chunk, loaded on demand (verified) — avoid importing a heavy
  module at the top of `server.ts`/a `plugins/` file if only one route needs it.
- Stream large responses (`ReadableStream`) instead of buffering a big payload in memory first.
- `Promise.all(...)` for independent awaited calls — sequential `await`s on independent I/O is an easy-to-miss
  regression.

## 7. Security
- Every external input goes through a schema before touching business logic — the highest-leverage fix here (§3).
- Parameterize all SQL — never string-concatenate/template user input into a query.
- Secrets (DB URLs, signing keys, API keys) come from validated env vars, never hardcoded or logged.
- Rate-limit auth endpoints specifically — the highest-value target, and often unprotected by a generic limiter
  scoped only to "expensive" routes.
- Keep dependencies current; run the ecosystem's audit command periodically (owned by `topic-dependencies.md` and
  the `upgrade-deps` skill, not this guide).
- CORS and security headers are not optional — see §3; both have concrete, low-effort defaults.

## 8. Concurrency / async
- One event loop per process runs everything: a synchronous CPU-bound call blocks **every other in-flight request**
  on that process — offload real CPU work to `worker_threads`, a child process, or a queue, not more `async`.
- `AsyncLocalStorage` (Node built-in) carries per-request context (request ID, current user) across async
  boundaries — prefer it over a module-level mutable variable, which leaks between concurrent requests.
- `Promise.all([...])` for independent work; `Promise.allSettled([...])` when one failure shouldn't cancel the
  others; a shared `AbortController` to cancel siblings on timeout or client disconnect.
- A handler that starts an async call without `await`/`return`ing it creates a rejection that surfaces far from its
  cause (or, pre-Express-5, never surfaces) — always propagate the promise you produce.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `req.body as SomeType`, no runtime check | cast is compile-time only; bad input reaches logic | schema-validate at the boundary |
| New DB `Pool`/`Client` per request | exhausts the DB's connection limit under load | one pool per process, opened at boot, closed at shutdown |
| Two error response shapes in one app | clients can't handle errors uniformly | one central handler/hook for every route |
| `async` Express-4 handler, no `.catch(next)` | rejection silently swallowed — hangs or 500s with no log | wrap it, or use Express 5+/any other framework (auto-await) |
| `process.exit()` in SIGTERM, no drain | in-flight requests dropped, connections orphaned | `server.close()` + pool `.end()`/`.hook("close")` first |
| NestJS, no `app.enableShutdownHooks()` | `onModuleDestroy` never fires on SIGTERM | call it in `main.ts` before `listen()` |
| Hono's built-in `hono/validator` in new code | deprecated; breaking change planned next major | `@hono/zod-validator` or another Standard Schema validator |
| `CORS origin: "*"` + `credentials: true` | invalid per spec; credential leak if accepted anyway | explicit origin allowlist, drop credentials |
| JWT `verify()` with no `algorithms` pin | accepts `alg: "none"`/attacker-chosen algorithm | pin `algorithms: [...]` on every call |
| Hand-written `if (!body.field)` after schema | dead code; two sources of truth | delete it — trust the schema's output type |
| Sync/CPU-heavy work in an `async` handler | blocks the event loop for every concurrent request | `worker_threads`/a queue, or genuine async I/O |

## 10. Review checklist
- [ ] every route validates body/query/params/headers with a schema — no untyped input reaches business logic
- [ ] exactly one central error handler/hook exists; no route hand-rolls its own error shape
- [ ] async rejections propagate correctly for the installed framework/version (Express 4 needs an explicit catch)
- [ ] config is read from `process.env` in one validated module only
- [ ] logging is structured (pino or equivalent), auth/secret fields redacted
- [ ] `SIGTERM`/`SIGINT` drain the DB pool before exit; NestJS calls `enableShutdownHooks()`
- [ ] outbound calls have a timeout; auth endpoints are rate-limited
- [ ] CORS is an explicit allowlist (never `"*"` with credentials); security headers are set
- [ ] JWTs pin `algorithms`, check `exp`, carry no sensitive claims; session cookies are `HttpOnly`+`Secure`+`SameSite`
- [ ] one DB pool per process, sized and timed out, never created per request
- [ ] new behavior has a route-level test via the framework's own test client (`inject`/`app.request`/`supertest`)
- [ ] `node .agents/scripts/verify.mjs --only node` passes

## 11. References
- h3 (`node_modules/h3/dist/docs`): Error Handling, Routing, Middleware, Security, Migration v1→v2 — https://h3.dev
- Nitro (`node_modules/nitro/dist/docs`): `3.routing.md`, `10.lifecycle.md` — https://nitro.build
- Express 5 migration (async errors): https://expressjs.com/en/guide/migrating-5.html
- Fastify: Errors, Validation-and-Serialization, Testing (`.inject()`) — https://fastify.dev
- Hono: `MIGRATION.md`, API reference (`app.request`, `secureHeaders`) — https://hono.dev
- NestJS: `fundamentals/lifecycle-events` (`enableShutdownHooks`) — https://docs.nestjs.com
- Zod: https://zod.dev · Valibot: https://valibot.dev · Pino: https://getpino.io
- Principles: `.agents/guides/principles/security.md`, `testing-strategy.md`, `performance.md`, `concurrency.md`,
  `api-design.md`, `database-design.md`
