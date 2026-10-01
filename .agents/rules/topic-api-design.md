---
trigger: model_decision
description: "Apply when designing or changing an HTTP/REST, GraphQL, gRPC or RPC endpoint, webhook, or public library API: request/response shapes, errors, pagination, idempotency, versioning."
---
# API design - topic rule
Principles guide: `.agents/guides/principles/api-design.md` - read it before adding a new API style, versioning scheme or public SDK. Schema files (`*.proto`, `*.graphql`, `openapi*`) also load `topic-api-schemas.md`. Endpoint security: `topic-security.md`.

## Protocol
1. Copy existing conventions first: read 2 endpoints of the same kind (`node .agents/scripts/search.mjs 'router\.|app\.(get|post)|@(Get|Post)Mapping|@router\.' src`) and match their naming, error shape, auth and pagination. Consistency beats your preference.
2. Write the contract BEFORE code (in the plan, or in the OpenAPI/proto/GraphQL schema if the project has one): method + path (or RPC/field), request schema, response schema, each error case with its status, auth, idempotency, pagination.
3. Classify the change. Additive (new endpoint, new optional field, new enum value clients ignore) = safe. Breaking (remove/rename a field, change a type or meaning, new required input, stricter validation, different status code) = new version or deprecation period; a published API needs the user's OK first (not in your brief -> `INPUT GAP:`).
4. Implement: validate input at the boundary; map domain errors to the error shape in ONE place.
5. Test: happy path, every error case, auth failure, pagination edges (empty, last page), and a retry with the same idempotency key.

## Defaults (the project's existing convention wins)
- REST: plural nouns (`/orders/{id}`). GET is safe; PUT and DELETE are idempotent; POST creates or runs an action; PATCH is partial. Status: 200, 201 + `Location`, 204, 400 validation, 401 unauthenticated, 403 forbidden, 404, 409 conflict, 429 + `Retry-After`, 5xx only for server faults.
- Errors: one machine-readable shape everywhere. Default RFC 9457 Problem Details (`application/problem+json`; members `type`, `title`, `status`, `detail`, `instance`) plus a stable `code` extension. No stack traces or SQL text.
- Pagination: cursor/keyset (`?limit=50&cursor=<opaque>` -> `nextCursor`) for large or changing collections; offset only for small admin lists. Always cap `limit`.
- Idempotency: POSTs that create or charge and may be retried accept an `Idempotency-Key` header (widely used convention; the IETF draft is not an RFC). Store key + request hash + response; replay the stored response on a duplicate; reject key reuse with a different body (409/422).
- Values: timestamps ISO 8601 in UTC; money as integer minor units or a decimal string plus currency; ids as opaque strings.
- GraphQL: think nullability per field, connections for lists, depth/complexity limits, errors in `errors` with `extensions.code`.
- gRPC/protobuf: never reuse or renumber field numbers; mark removed ones `reserved`; use canonical status codes (`INVALID_ARGUMENT`, `NOT_FOUND`, `ALREADY_EXISTS`).
- Versioning: evolve additively first. Breaking -> `/v2` path or new field/RPC, plus a `Deprecation` header (RFC 9745) and `Sunset` header (RFC 8594) or schema `@deprecated`.
- Webhooks: sign payloads (HMAC + timestamp), deliver at least once, include an event id so receivers can dedupe.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER make a breaking change to a published contract without the user's OK - clients break silently. Instead: additive change, or new version + deprecation.
2. NEVER return different error shapes from different endpoints - clients cannot handle errors generically. Instead: one error mapper.
3. NEVER trust client-sent ids, roles, prices or totals - recompute or look them up server-side.
4. MUST bound every list (max `limit`) and every request body size - unbounded input is a denial-of-service vector (API4:2023).
5. NEVER expose internal models directly (ORM entities with password hashes, internal flags). Instead: explicit response DTOs/serializers (API3:2023 property-level authorization).

## Pitfalls Flash models get wrong
- Verbs in paths (`/createOrder`, `/getUsers`) and `200` with `{"error": ...}` bodies.
- `404` vs `403` confusion: for objects the caller may not see, prefer `404` so existence is not revealed.
- Offset pagination on large tables (slow, skips or duplicates rows when data changes).
- Adding a required request field and calling it "non-breaking".

## Example - bad -> good
```http
# BAD
POST /createOrder              -> 200 {"error": "bad qty"}
GET  /orders?page=9000         -> unbounded offset scan

# GOOD
POST /orders   Idempotency-Key: 7f3c2a90-...          -> 201  Location: /orders/ord_123
POST /orders   {"qty": -1}                            -> 400  Content-Type: application/problem+json
     {"type": "https://example.com/problems/validation", "title": "Invalid request",
      "status": 400, "detail": "qty must be >= 1", "code": "VALIDATION"}
GET  /orders?limit=50&cursor=eyJpZCI6MTIzfQ           -> 200  {"items": [...], "nextCursor": "eyJpZCI6MTczfQ"}
```

## Before finishing
- [ ] Contract written (paths, schemas, errors, auth, pagination, idempotency)
- [ ] Change classified additive or breaking; breaking changes approved by the user
- [ ] Error-case, auth and pagination tests pass; schema files and generated clients updated
