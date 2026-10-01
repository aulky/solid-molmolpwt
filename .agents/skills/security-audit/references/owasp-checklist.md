# OWASP checklists + per-stack "where to look"

Verified 2026-09-27 against the official pages: `https://top10.owasp.org/2025/` (redirect target of
`owasp.org/Top10`, confirmed current) and `https://owasp.org/API-Security/` (2023 edition; no newer edition
found). The 2025 web list replaced 2021 - if anything you recall says "A01 Broken Access Control, A02
Cryptographic Failures, A03 Injection ..." that is the OLD 2021 order; use the table below instead.

## OWASP Top 10:2025 (web applications)

| # | Category | Check for | Where to look |
|---|---|---|---|
| A01 | Broken Access Control (now includes SSRF) | missing/short-circuited authorization on a specific object, not just "is logged in"; server-side requests built from a user-supplied URL/host | route/controller/middleware guards; any `fetch`/`http.Get`/`WebClient` call whose target includes request input |
| A02 | Security Misconfiguration | debug mode or verbose errors in prod, default credentials, permissive CORS (`*` with credentials), open admin panels, missing security headers, directory listing on | env/config files, `DEBUG`, CORS middleware, `helmet`/`secure_headers` config, cloud storage bucket policies |
| A03 | Software Supply Chain Failures | unpinned/typosquat-risk dependency sources, unsigned/unverified build artifacts, a CI step that installs from a non-lockfile source, known-vulnerable transitive deps | lockfile presence and integrity, CI install steps, `curl \| sh` in Dockerfiles/CI, the dependency audit (step 7) |
| A04 | Cryptographic Failures | weak/broken algorithms (MD5/SHA1 for passwords, DES/ECB), hardcoded keys/IVs, secrets or PII sent or stored unencrypted, `Math.random`/`rand()` used for tokens or password reset codes | password hashing calls, crypto imports, TLS config, "reset token"/"session id" generation |
| A05 | Injection | untrusted input concatenated into SQL/NoSQL/LDAP/OS-command/template strings; missing output encoding for HTML/XML | query builders vs raw string SQL, `exec`/`system`/`Runtime.exec`, template engines with autoescape disabled |
| A06 | Insecure Design | no threat model for a sensitive flow, missing rate limiting on auth/payment endpoints, business logic that trusts the client (price, quantity, role from a hidden field) | password reset, checkout, and admin-elevation flows; anything computed client-side and trusted server-side |
| A07 | Authentication Failures | weak password/lockout policy, session fixation, missing MFA on high-privilege accounts, predictable or non-expiring session tokens, credential stuffing with no rate limit | login/session middleware, `session.regenerate` after login, token expiry/rotation config |
| A08 | Software or Data Integrity Failures | insecure deserialization of untrusted data, auto-update/CI pipeline that does not verify signatures, unsigned/unverified plugin or artifact loading | `pickle.loads`/`yaml.load`/`unserialize`/`ObjectInputStream`/`BinaryFormatter` on network/user input; release/update flow |
| A09 | Security Logging and Alerting Failures | auth failures/privilege changes/admin actions not logged, logs contain secrets or full PII, no alerting on repeated auth failures | logging calls around login/authz/admin routes; log redaction config |
| A10 | Mishandling of Exceptional Conditions | errors fail open (deny -> allow on exception), stack traces or internals returned to the client, unhandled error paths skip an authorization or validation step | `try/catch` around auth/authz checks - confirm the failure path denies, not allows; global error handlers |

## OWASP API Security Top 10:2023

Apply this in addition to the table above whenever the scope exposes an API (REST/GraphQL/gRPC/RPC).

| # | Category | Check for |
|---|---|---|
| API1 | Broken Object Level Authorization | an endpoint returns/mutates an object by ID with no check that the caller owns/may access THAT id |
| API2 | Broken Authentication | weak token validation, tokens that never expire, credential stuffing with no rate limit, JWT `alg: none` or unverified signature accepted |
| API3 | Broken Object Property Level Authorization | mass assignment - a request body can set fields the caller should not control (`role`, `isAdmin`, `price`, `ownerId`) |
| API4 | Unrestricted Resource Consumption | no pagination limit, no request size/rate/timeout limit, expensive query with no cost limit (GraphQL depth/complexity) |
| API5 | Broken Function Level Authorization | an admin-only route reachable by a normal-role token because the check is missing or client-side only |
| API6 | Unrestricted Access to Sensitive Business Flows | no rate limiting/anti-automation on flows with real-world cost (purchase, coupon redemption, account creation) |
| API7 | Server Side Request Forgery | the API fetches a URL/host supplied by the caller (webhooks, "import from URL", image-by-URL) with no allow-list |
| API8 | Security Misconfiguration | verbose API errors, permissive CORS, missing auth on an internal-only route exposed at the edge |
| API9 | Improper Inventory Management | old/undocumented API versions still reachable and unpatched, no inventory of which routes are public vs internal |
| API10 | Unsafe Consumption of APIs | this service trusts a third-party API's response without validating it (schema, size, redirects, TLS) |

## Per-stack "where to look" (entry points + common footguns)

| Stack | Entry points | Common footguns to grep for |
|---|---|---|
| Node/Express/Fastify/Hono/Nitro | route handlers, middleware, server functions (SolidStart/Next server actions) | `req.query`/`req.body` straight into a query string; `child_process.exec` with template literals; missing `helmet`; CORS `origin: '*'` with `credentials: true` |
| SolidStart / Next.js (server functions, API routes) | `"use server"` functions, `route.ts`/`+server.ts`/API handlers | server function called with no re-check of auth (client can call it directly); response includes fields the client should not see |
| Django/Flask/FastAPI | views/routes, serializers, dependencies | `.extra()`/`.raw()`/string-built ORM queries; `render_template_string` with user input; DRF serializer missing `read_only` on privileged fields |
| Laravel | routes/controllers, form requests | `DB::raw`/string-built query builder calls; missing `$fillable`/`$guarded` (mass assignment); route missing `middleware('auth')`/policy check |
| Spring Boot | `@RestController` methods, filters | `@PreAuthorize` missing on a sensitive method; JPQL/native queries built by concatenation; Jackson polymorphic deserialization enabled without an allow-list |
| ASP.NET Core | controllers/minimal API endpoints | missing `[Authorize]`/policy; raw SQL via string interpolation instead of parameters; `BinaryFormatter`/`ObjectInputStream`-style deserialization |
| Rails | controllers, `before_action` | mass assignment via unfiltered `params` (missing strong params); `where("... #{}")` string interpolation; missing `authorize` (Pundit/CanCanCan) call |
| Go (net/http, chi/gin/echo) | handlers, middleware chain | manual SQL string building instead of parameterized/`sqlx` named params; missing auth middleware on a route group; `html/template` bypassed with raw bytes |

## Notes
- A placeholder, example, or test-fixture value (`sk_test_...`, `changeme`, `<your-key-here>`) is not a real
  secret; the `secrets-scan.mjs` script downgrades or skips these, but state it explicitly in the report too.
- A finding needs a traced path, not just "this category could apply here in theory" - untraceable concerns
  go under Needs confirmation.
