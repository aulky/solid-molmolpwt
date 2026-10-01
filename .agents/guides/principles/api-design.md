# API design — engineering guide for AI agents
> Scope: designing and evolving HTTP/REST, GraphQL, gRPC and webhook contracts — resources, errors, pagination, idempotency, versioning, backward compatibility; language-agnostic. Quick card: `.agents/rules/01-engineering-standards.md`; topic rules: `.agents/rules/topic-api-design.md`, `.agents/rules/topic-api-schemas.md`.
> Last verified: 2026-09 — against rfc-editor.org, datatracker.ietf.org, spec.openapis.org, protobuf.dev, buf.build and oasdiff docs. RFC 9457 (Problem Details, Jul 2023) obsoletes RFC 7807, same media type. `Deprecation` header = RFC 9745 (Mar 2025); `Sunset` = RFC 8594. `Idempotency-Key` is NOT an RFC: draft-ietf-httpapi-idempotency-key-header-07 (Oct 2025) expired; the pattern (Stripe, Adyen) is still the norm. `RateLimit`/`RateLimit-Policy` = active draft (-11, May 2026); spellings changed across revisions. OpenAPI 3.2.1 is the latest spec; 3.1.x is the safer codegen baseline. Protobuf: latest released edition is 2024; proto3 stays valid.

## 0. How this guide works
Each section = definition → why it breaks clients (later, which makes API mistakes expensive) → a **check** to run on your diff or schema → bad→good code → the over-application trap. A contract is published the moment a client you do not control can call it; after that, every change goes through §7.

## 1. Resource modeling
**Definition:** model the contract around nouns (resources) with a stable id and one owning service. `POST /orders/{id}/cancel` is a resource-scoped action; `POST /cancelOrder` is RPC hiding in HTTP.
**Why:** verb endpoints multiply (`getUser`, `getUserOrders`) and hide which state changed; a resource tree gives uniform authz boundaries, cache keys and a copyable pattern.
**How to check:**
- Can you write the endpoint as `<METHOD> /<plural-noun>/{id}[/<action>]`? If the noun is a verb (`/calculate`, `/sendEmail`), make it an action (`POST /invoices/{id}/send`) or a resource (`POST /calculations`).
- Nesting ≤ 2 levels, and only when the parent exclusively owns the child. A task shared by two projects lives at `/tasks?project_id=`.
- Exactly one service writes this resource.
- Ids are opaque strings to clients; never expose an auto-increment id where enumeration leaks business volume or enables IDOR probing.
**Trap:** squeezing a real state transition into CRUD because "resources are nouns". `PATCH /orders/{id} {"status":"cancelled"}` skips preconditions and side effects (refund, stock release) that `POST /orders/{id}/cancel` makes explicit and separately authorizable.

## 2. REST conventions: methods, status codes, URLs
| Method | Meaning | Safe | Idempotent |
|---|---|---|---|
| GET | read | yes | yes |
| POST | create / non-idempotent action | no | no (unless §6) |
| PUT | full replace | no | yes |
| PATCH | partial update | no | not guaranteed |
| DELETE | remove | no | yes |

| Status | Use for |
|---|---|
| 200 / 201 / 202 / 204 | read ok; created (+ `Location`); accepted for async work (+ status URL); ok, no body |
| 400 / 422 | malformed syntax; well-formed but fails validation |
| 401 / 403 / 404 | not authenticated; authenticated but forbidden; not found (also use 404 instead of 403 when existence itself is secret) |
| 409 / 412 | conflicts with current state; `If-Match` precondition failed (optimistic concurrency) |
| 429 / 500 / 503 | rate limited (§8); server bug; temporarily unavailable (+ `Retry-After`) |
**Why:** generic clients, caches, proxies and retry libraries act on the method and status alone; a GET that mutates gets prefetched or retried, a 200 error body gets cached and never retried.
**How to check:** search the changed handlers for GET routes that mutate, POST used for plain reads, and a flat 200 from every branch: `node .agents/scripts/search.mjs "status\(200\)|StatusOK|return 200" src` (adapt the pattern to the framework). Confirm create returns 201 + `Location`, and field names follow the existing casing (`snake_case` or `camelCase`, never both in one API).
**Trap:** inventing codes (280, 599) for nuance clients cannot act on. Put nuance in the Problem Details body (§3).

## 3. Errors: Problem Details (RFC 9457)
**Definition:** every non-2xx response uses one envelope served as `application/problem+json`: `type` (URI naming the error kind; `about:blank` when none), `title` (short, stable per type), `status` (same as the HTTP status), `detail` (this occurrence, human-readable), `instance` (URI for this occurrence), plus your own extension members (e.g. `errors` for field validation, `trace_id`).
**Why:** without one envelope each endpoint invents `{error}`, `{message}`, `{errors:[]}` and clients special-case each; a stable `type` lets clients branch without string-matching prose.
**How to check:** every error path in the diff goes through ONE mapper; `type` is a stable identifier, not `err.message`; body `status` equals the response status; with `about:blank`, `title` is the HTTP status phrase; 5xx `detail` never contains stack traces, SQL or internal hostnames.
```ts
// TypeScript / Express (import { STATUS_CODES } from "node:http") — bad: ad hoc shape, leaks internals, no stable type
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ message: err.message });
});

// good: one mapper, RFC 9457 envelope, safe detail
app.use((err: AppError, req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  res.status(status).type("application/problem+json").json({
    type: err.problemType ?? "about:blank",      // e.g. "https://api.example.com/problems/insufficient-funds"
    title: err.title ?? STATUS_CODES[status] ?? "Error", // about:blank → HTTP status phrase
    status,
    detail: status < 500 ? err.message : "An unexpected error occurred.",
    instance: `/requests/${res.locals.requestId}`, // set by request-id middleware
  });
});
```
**Trap:** replacing the shape instead of adding extension members; or forcing this HTTP envelope onto GraphQL (errors array + `extensions.code`) or gRPC (status codes + `google.rpc` error details), which have their own models.

## 4. Pagination: cursor for unbounded lists
**Definition:** a cursor is an opaque token encoding a position in a stable, unique sort order (`WHERE (created_at, id) > ($1, $2) ORDER BY created_at, id LIMIT n`). Offset pagination (`LIMIT n OFFSET m`) makes the DB read and discard `m` rows every call.
**Why:** offset cost grows with depth and is unstable under writes (an insert shifts every later row: duplicates or skips). Keyset on an indexed column pair stays fast and correct at any depth.
**How to check:** `node .agents/scripts/search.mjs "OFFSET|\.offset\(|\.skip\(" src` on list endpoints over growing tables. The sort includes a unique tiebreaker (`id`); an index matches filter + sort columns; the response returns an opaque `next_cursor` (base64 of the last row's sort key) and a server-capped `limit`.
```go
// Go — bad: OFFSET cost grows with page number; unstable under concurrent inserts
rows, err := db.QueryContext(ctx,
    "SELECT id, total, created_at FROM orders ORDER BY created_at LIMIT $1 OFFSET $2", limit, page*limit)

// good: keyset pagination, served by an index on (created_at, id); flip to < for DESC
rows, err := db.QueryContext(ctx,
    `SELECT id, total, created_at FROM orders WHERE (created_at, id) > ($1, $2)
     ORDER BY created_at, id LIMIT $3`, cur.CreatedAt, cur.ID, min(limit, 100))
```
**Trap:** cursor machinery for an admin table of a few hundred rows, or where users need "jump to page 7": offset is fine there. A `COUNT(*)` on every page of a huge table is its own scan; make it optional.

## 5. Filtering & sorting
**Definition:** clients request subsets through an allowlisted convention (`?status=active&sort=-created_at`), never a raw expression or column name passed through to the query builder.
**Why:** passthrough lets any client trigger a full scan on an unindexed column, sort by internal columns, or inject SQL through an `ORDER BY` identifier (placeholders do not cover identifiers).
**How to check:** every filterable/sortable field is on an explicit map `{public_name: indexed_column}`; unknown keys return 400, not silently ignored; there is a cap on combined filters and on `limit`.
**Trap:** a generic filter DSL (nested AND/OR, arbitrary operators) for a tool with three known filters. Start flat.

## 6. Idempotency keys
**Definition:** the client generates a key (a UUID) per logical operation and sends it on an unsafe request (`Idempotency-Key: "<uuid>"`). The server atomically claims `(client, key)`, stores the request fingerprint and the final response, and replays that response for retries instead of re-running the side effect.
**Why:** after a timeout the client cannot know whether the charge happened. Without keys a retry double-charges; without retries the user gets no confirmation.
**How to check:** every costly-to-duplicate unsafe endpoint (payment, order, outbound message) honors a key; the claim is atomic (unique constraint or `SET NX`), not get-then-set; keys are scoped per client with a TTL (hours to days); missing key → 400, same key + different body → 422, same key while the first is in flight → 409 (the draft's codes); a failed attempt releases its claim (or stores the error response).
```python
# Python / FastAPI — bad: get-then-set races; two concurrent retries both charge
@app.post("/charges")
def create_charge(req: ChargeRequest, idempotency_key: str = Header()):
    if cached := store.get(idempotency_key):
        return cached.response
    result = gateway.charge(req.amount, req.card_token)
    store.set(idempotency_key, result)
    return result

# good: atomic claim (INSERT ... ON CONFLICT DO NOTHING on (client_id, key)), fingerprint, replay
@app.post("/charges")
def create_charge(req: ChargeRequest, client: Client = Depends(auth),
                  idempotency_key: str | None = Header(default=None)):
    if idempotency_key is None:  # optional in the signature, else FastAPI auto-returns 422
        raise Problem(400, "Idempotency-Key header is required")
    fp = hashlib.sha256(req.model_dump_json().encode()).hexdigest()
    if not store.try_claim(client.id, idempotency_key, fp, ttl=timedelta(hours=24)):
        prior = store.get(client.id, idempotency_key)
        if prior.fingerprint != fp:
            raise Problem(422, "Idempotency-Key reused with a different body")
        if prior.response is None:
            raise Problem(409, "Original request still in progress")
        return prior.response
    try:
        result = gateway.charge(req.amount, req.card_token, idempotency_key=idempotency_key)
    except Exception:
        store.release(client.id, idempotency_key)  # else every retry gets 409 until the TTL
        raise
    store.complete(client.id, idempotency_key, result)
    return result
```
`Problem` = your app exception, rendered by the §3 mapper as `application/problem+json` (FastAPI's `HTTPException` returns `{"detail": ...}` instead).
**Trap:** keys on endpoints already idempotent by construction (PUT, DELETE, upsert by natural key); a store without TTL. Pass the key downstream too (payment providers accept one).

## 7. Versioning & backward compatibility
**Definition:** additive changes ship in place; anything an existing, spec-following client cannot safely ignore is breaking and needs a new version or a deprecation period.
| Safe (no new version) | Breaking |
|---|---|
| add optional request field / query param | remove or rename a field |
| add a response field | change a field's type, format, unit or meaning |
| add an endpoint | make an optional input required; tighten validation |
| add an enum value clients are documented to tolerate | add an output enum value to a client that switches exhaustively |
| relax validation | change a status code, default, or sort order clients rely on |
**How to check:** diff the schema, not your memory: `oasdiff breaking base.yaml openapi.yaml --fail-on ERR` (`base.yaml` = last released spec; install with `go install github.com/oasdiff/oasdiff@latest` — NOT `npx oasdiff`, that npm name is an empty placeholder), `buf breaking --against ".git#branch=main"` for protobuf. Pick ONE version scheme per API (URI `/v2`, header, or media type). A deprecated endpoint sends `Deprecation: @<unix-seconds>` (RFC 9745), `Sunset: <HTTP-date>` (RFC 8594) and a `Link: <doc>; rel="deprecation"`.
**Trap:** a major version for every additive field churns every client for nothing. Equally bad: "just fix the typo in the field name" on a published API.

## 8. Rate limits & throttling
**Definition:** bound the rate a client can sustain (token bucket, sliding window) and tell it its budget.
**Why:** one client, retry loop or bug can exhaust shared capacity for every tenant; a stated budget lets well-behaved clients slow down instead of failing.
**How to check:** 429 responses carry `Retry-After`; the counter lives in shared storage (Redis, gateway), keyed by the trust/billing boundary (API key, user, tenant), not per process (N replicas silently multiply the limit); expensive endpoints (search, export, login) get their own lower limit; ONE header convention per API (`RateLimit`/`RateLimit-Policy` per the current draft, or the `X-RateLimit-*` trio you already emit), never both.
**Trap:** per-key abuse quotas on internal calls inside one trust boundary; those need backpressure (concurrency limits, bulkheads).

## 9. OpenAPI-first (schema-first)
**Definition:** the OpenAPI document (or `.proto`, or GraphQL SDL) is the source of truth, reviewed before the handler; server stubs, clients, and contract tests are generated or validated from it.
**Why:** a contract reviewed as code is reviewed after clients already depend on its accidents; one machine-readable source keeps docs, SDKs and server from drifting apart.
**How to check:** a changed endpoint appears in the spec in the same diff; CI lints it (`npx @redocly/cli lint openapi.yaml` or `npx @stoplight/spectral-cli lint openapi.yaml --ruleset .spectral.yaml`, where `.spectral.yaml` contains `extends: ["spectral:oas"]`; without a ruleset file Spectral refuses to lint) and fails on drift (contract test, or generated types that stop compiling); the `openapi:` version declared is one your codegen supports (3.2-only keywords in a document tools read as 3.1 fail silently); every response, including errors, has a schema.
**Trap:** hand-written Markdown "API docs" next to the spec: two sources of truth, guaranteed drift. For code-first frameworks (FastAPI, NestJS) that emit the spec, checking in the emitted file and diffing it in CI is schema-first enough.

## 10. GraphQL: N+1, depth and cost limits
**Definition:** one GraphQL request can ask for arbitrarily nested, wide data. Without batching each parent fans out one query per child (N+1); without limits nothing bounds depth or cost.
**How to check:** every resolver that loads a relation goes through a per-request loader (batch + dedupe keys within one tick); max depth and a cost/complexity limit reject operations before execution; list fields take `first`/`after` with a server cap; production introspection and arbitrary operations are off when clients are first-party (trusted documents / persisted queries).
```ts
// TypeScript / GraphQL — bad: one query per post author (N+1)
const resolvers = { Post: { author: (post) => db.users.findOne({ id: post.authorId }) } };

// good: DataLoader created PER REQUEST (in context) so the cache never crosses users
export const makeContext = () => ({
  userLoader: new DataLoader(async (ids: readonly string[]) => {
    const users = await db.users.findMany({ id: { in: [...ids] } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return ids.map((id) => byId.get(id) ?? null); // same order and length as ids
  }),
});
const resolvers = { Post: { author: (post, _args, ctx) => ctx.userLoader.load(post.authorId) } };
```
**Trap:** a module-level DataLoader: its cache leaks data between users and never invalidates. Loaders around scalar fields already on the parent add only overhead.

## 11. gRPC / protobuf evolution rules
**Definition:** binary wire compatibility depends on field numbers and wire types, not names. Old and new binaries must decode each other's messages.
**Why:** clients and servers deploy independently and old binaries live for months (mobile apps, partner services); a reused number silently corrupts data instead of failing.
| Safe | Breaking |
|---|---|
| add a field with a never-used number | reuse a deleted field's number |
| add an enum value (handle unknown values in code) | change a field's number |
| delete a field AND `reserved` its number and name | change wire type or encoding (`int32` → `string`; `sint32` ↔ `int32`: zigzag vs plain varint) |
| rename a field (binary only) | rename when clients use JSON/text format (names are serialized there) |
```proto
syntax = "proto3";
// bad: field 3 deleted and its number reused — old clients decode email bytes as phone
message User { string id = 1; string name = 2; string email = 3; }

// good: removed field reserved forever; new field takes a fresh number
message User {
  reserved 3; reserved "phone";
  string id = 1; string name = 2; string email = 4;
}
// edition 2023/2024 files: names are unquoted — reserved phone;
```
**How to check:** run `buf breaking --against ".git#branch=main"` (or against the last published module) in CI; removed fields are `reserved` by number and name; enum zero value is `*_UNSPECIFIED`; request/response messages are unique per RPC (`GetUserRequest`), never shared, so each can evolve alone; clients set deadlines on every call.
**Trap:** a new RPC or service version for every added field. Additive fields are free; version only real breaks (§7).

## 12. Webhooks: delivery, signing, retries
**Definition:** at-least-once, asynchronous delivery of events to a URL the consumer owns. Receivers must expect duplicates, out-of-order delivery, and forged requests.
**Why:** the network guarantees neither single delivery, order, nor sender identity; a public URL that acts on unsigned JSON is an open door.
**How to check (sender):** sign the raw body with a per-endpoint secret over `id.timestamp.body` (the Standard Webhooks scheme: `webhook-id`, `webhook-timestamp`, `webhook-signature` headers); retry with exponential backoff for hours to days, then disable the endpoint and surface it (dashboard, email); block private-network targets (SSRF); payloads carry an event `id`, `type`, and either a full snapshot or a resource id to re-fetch.
**How to check (receiver):** verify the signature on the raw bytes with a constant-time compare BEFORE parsing JSON; reject stale timestamps (replay); dedupe on event id; return 2xx fast and process from a queue; never assume events arrive in order (compare versions/timestamps before applying).
**Trap:** doing the slow work before responding: the sender times out and retries a delivery that actually succeeded, producing duplicate side effects.

## Checklist (copyable)
- [ ] New endpoints are nouns with one owning service; state transitions are explicit actions
- [ ] Methods and status codes match semantics (201 + `Location` on create; 409/412 for conflicts; no flat 200)
- [ ] Every error goes through one mapper to an RFC 9457 body; 5xx detail leaks nothing internal
- [ ] Unbounded lists use cursor pagination with a unique tiebreaker, a matching index, and a capped `limit`
- [ ] Filter/sort fields come from an allowlist mapped to indexed columns; unknown keys → 400
- [ ] Costly unsafe operations claim an idempotency key atomically; 400 missing, 422 body mismatch, 409 in flight; failures release; TTL set
- [ ] `oasdiff breaking` / `buf breaking` ran; breaking changes got a version or a `Deprecation` + `Sunset` period
- [ ] Rate limits live in shared storage keyed by client/tenant; 429 carries `Retry-After`
- [ ] Spec/`.proto`/SDL changed in the same diff as the code, and CI lints and checks drift
- [ ] GraphQL relations use per-request loaders; depth and cost limits reject before execution
- [ ] Protobuf: no field number reused; removed fields `reserved` by number and name
- [ ] Webhooks: signed over id + timestamp + raw body, verified before parse, deduped by id, acked fast

## References
- RFC 9457 Problem Details: https://www.rfc-editor.org/rfc/rfc9457.html
- RFC 9110 HTTP Semantics (methods, status codes): https://www.rfc-editor.org/rfc/rfc9110.html
- RFC 9745 Deprecation header: https://www.rfc-editor.org/rfc/rfc9745.html · RFC 8594 Sunset: https://www.rfc-editor.org/rfc/rfc8594.html
- Idempotency-Key draft (expired, still the reference): https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
- RateLimit headers draft: https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/
- OpenAPI specs: https://spec.openapis.org/oas/ · oasdiff: https://github.com/oasdiff/oasdiff
- Protobuf updating rules: https://protobuf.dev/programming-guides/proto3/#updating · buf breaking: https://buf.build/docs/breaking/
- GraphQL security (depth, cost, trusted documents): https://graphql.org/learn/security/ · DataLoader: https://github.com/graphql/dataloader
- Standard Webhooks spec: https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md
- Google AIP resource-oriented design: https://google.aip.dev/121
- Related: `.agents/guides/principles/database-design.md`, `security.md` (IDOR, SSRF)
