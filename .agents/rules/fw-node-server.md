---
trigger: model_decision
globs: "**/server.ts,**/server.js,**/*.server.ts,**/*.controller.ts,**/*.routes.ts,**/*.route.ts,**/*.handler.ts,**/*.middleware.ts,**/nitro.config.ts"
description: "Apply when working in a Node server codebase (package.json dependency on express, fastify, hono, h3, nitro, koa, @nestjs/core or elysia): routing, validation, errors, security, deployment."
---
# Node server (Express/Fastify/Hono/H3/Nitro/Koa/NestJS/Elysia) — quick card
Applies only if package.json dependency on express, fastify, hono, h3, nitro, koa, @nestjs/core or elysia. Otherwise ignore this rule.
Deep guide: `.agents/guides/frameworks/node-server.md` — read it before non-trivial routing/validation/error-handling/auth work.

## Project shape
- Detect the framework from `package.json` first — `(req,res,next)` vs `(c) =>` vs `(event) =>` vs a Nest
  `@Controller()` method differ completely; open an existing route file before writing a new one.
- Nitro v3 + h3 v2 (verified 2026-09): root `server.ts` (Web-fetch apps — H3/Hono/Elysia) or `server.node.ts`
  (`(req,res)` apps — Express/Fastify; Nitro auto-adapts the `.node` suffix) is the global entry. Deep guide §2.
- One process boot wires config, logger, DB pool once, then listens — never re-create a pool/logger per request.

## Invariants (MUST / NEVER — with reason → alternative)
1. MUST validate every external input (body, query, params, headers) with a schema at the boundary (zod/valibot, or
   the framework's own JSON Schema) — NEVER trust `req.body as SomeType`; a cast is compile-time only, not runtime.
2. MUST route every thrown/rejected error to one central handler deciding the client-facing status/body — NEVER let
   two error shapes coexist (some routes `{error}` JSON, others a raw 500 HTML page).
3. MUST forward every promise a handler starts to the framework's error path. Verified: Express 5's router
   auto-forwards a rejected async-handler promise to `next(err)`; Express 4 still needs explicit `.catch(next)`.
   Check the installed major first — NEVER assume Express 5 behaviour on an Express 4 project.
4. MUST read all config from `process.env` in one place at startup, validated against a schema, exiting non-zero on
   a missing/invalid var — NEVER read `process.env.X` scattered across route files (a typo silently becomes `undefined`).
5. MUST close listeners/DB pools on `SIGTERM`/`SIGINT` and let in-flight requests finish first — NEVER
   `process.exit()` immediately; that drops connections mid-write and orphans pooled clients.
6. MUST bound every request with a body-size limit and a timeout — NEVER accept an unbounded body or handler with no
   timeout (one stuck upstream call hangs that connection, and eventually the worker).
7. NEVER build a query by string-concatenating request data — MUST use a parameterized query, query builder, or ORM
   (`.agents/rules/topic-database-design.md`).
8. MUST reuse one pooled DB client across requests — NEVER open a new connection per request (exhausts the
   database's connection limit under load).
9. MUST set security headers (`helmet` or the framework's equivalent) and an explicit CORS origin allowlist — NEVER
   `Access-Control-Allow-Origin: *` with `credentials: true`.

## Patterns
- Validate-then-handle: parse the request through a schema first; pass only the typed result into business logic.
- One error taxonomy: an `HttpError`/`HTTPException`-style value carrying `status` + a safe `message`; the central
  handler sends that message for a "known" error, a generic one (logging the real error) for anything else.

## Pitfalls
- Fastify already returns 400 with detail when a route `schema` fails (verified) — a hand-written
  `if (!body.name) ...` in the handler is dead code; put every check in the schema.
- Hono's bundled Validator Middleware is deprecated (verified `MIGRATION.md`) — use `@hono/zod-validator`,
  not the built-in.
- Nitro v3 route files use h3 v2's `defineHandler`/`HTTPError`/`event.req` — import both from `nitro` (h3 isn't a
  direct dep), NOT the older `defineEventHandler`/`createError`/`event.node.req` from h3 v1 tutorials.
- NestJS: skip `app.enableShutdownHooks()` and `onModuleDestroy`/`onApplicationShutdown` never fire on `SIGTERM`
  (verified) — the process exits with nothing drained.
- Re-throwing a caught error as `new Error(String(err))` loses the original stack/cause — use `{ cause: err }`.

## Example — bad → good
```ts
// bad: unvalidated body, swallowed error, no status taxonomy
app.post("/users", async (req, res) => {
  try {
    const user = await db.user.create(req.body);
    res.json(user);
  } catch (e) {
    res.status(500).send("error");
  }
});
```
```ts
// good: Nitro v3 (reference setup, verified 2026-09) — validated input, pooled DB, error handled centrally
import { defineHandler } from "nitro"; // re-exports h3 — see Pitfalls
import { z } from "zod";
const CreateUser = z.object({ email: z.string().email(), name: z.string().min(1) });
export default defineHandler(async (event) => {
  const input = CreateUser.parse(await event.req.json()); // throws -> nitro.config.ts errorHandler
  return db.user.create(input); // pooled client, not one per request
});
```

## Before finishing
- [ ] routes validate input · [ ] one central error handler · [ ] config validated once at startup ·
      [ ] graceful SIGTERM shutdown · [ ] no string-built queries · [ ] `node .agents/scripts/verify.mjs --only node` passes
