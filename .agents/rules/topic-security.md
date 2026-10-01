---
trigger: model_decision
description: "Apply when code touches authn/authz, sessions, secrets, crypto, input parsing, file upload, outbound URL fetch (SSRF), deserialization, or SQL/shell/HTML built from input."
---
# Security - topic rule
Principles guide: `.agents/guides/principles/security.md` (OWASP Top 10:2025, API Security Top 10:2023) - read it before designing auth, sessions or crypto. Procedure: `/security-audit`; pipeline: section `security` of `.agents/skills/orchestrate/references/task-types.md`. Fresh-context review: the `security-auditor` worker in REVIEW. Files named `*auth*`, `*session*`, `*token*`, `.env*` also load `topic-security-sensitive.md`.

## Skip when
The change is styling, docs or test fixtures and adds no input path, no new data exposure and no dependency.

## Protocol
1. Threat model in 5 lines BEFORE editing (copy the brief's, from the EXPLORE security-auditor; none -> write it and put it in your Worker Report):
   - Asset: what could leak or be changed (PII, money, tokens, admin actions).
   - Entry points: every place untrusted data enters (params, body, headers, cookies, files, env, queue messages, webhooks, LLM output).
   - Trust boundary: where untrusted data becomes trusted.
   - Actors: anonymous, user, other tenant, admin.
   - Abuse: top 3 misuse cases (IDOR, injection, replay, enumeration).
2. At every entry point, in this order: validate (schema, type, length, allowlist) -> authorize (may THIS actor do this to THIS object?) -> act -> encode output for its sink (HTML, SQL, shell, log).
3. Reuse the project's auth and validation layer. Search before writing one: `node .agents/scripts/search.mjs 'authorize|requireUser|csrf|sanitize|escape' src`.
4. Add one negative test per rule: unauthenticated -> 401, another user's id -> 403/404, malformed or oversized input -> 400.
5. Verify with the brief's check. Auth, crypto or upload changes: list the threat model and every changed entry point in your Worker Report - the orchestrator sends them to a `security-auditor` in REVIEW (a worker never dispatches it).

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER build SQL, shell commands, HTML or file paths by concatenating input - injection (A05). Instead: bound parameters, argv arrays (`execFile`, `subprocess.run([...])`), auto-escaping templates, `path.resolve` plus a base-directory prefix check.
2. MUST authorize on the server for every request AND every object id - a hidden button is not access control (A01, API1:2023 BOLA). Instead: load object -> assert owner/tenant/role -> act; deny by default.
3. NEVER commit, log or return secrets, tokens, passwords or PII - logs and git history are copied everywhere. Instead: env vars or a secret manager, `.env.example` with placeholders, redaction in logs.
4. NEVER invent crypto or hash passwords with fast hashes (MD5, SHA-*). Instead: Argon2id (OWASP minimum m=19 MiB, t=2, p=1), else scrypt, bcrypt (cost >= 10, 72-byte input limit) or PBKDF2-HMAC-SHA256 with 600,000 iterations. Tokens from the platform CSPRNG; compare secrets in constant time.
5. NEVER fetch a user-supplied URL without an allowlist - SSRF reaches cloud metadata (`169.254.169.254`) and internal hosts (listed under A01:2025). Instead: allowlist scheme and host, reject private/loopback/link-local IPs after DNS resolution, re-check every redirect hop, set timeouts.
6. NEVER deserialize untrusted data with native object formats (pickle, Java serialization, PHP `unserialize`, unsafe YAML loaders, .NET BinaryFormatter) - remote code execution. Instead: JSON plus schema validation, `yaml.safe_load`.
7. Uploads MUST have a size limit, a type check by content (magic bytes, not extension), storage outside the web root under a generated name, and are never executed.
8. Fail closed (A10:2025 Mishandling of Exceptional Conditions): an error in auth or validation denies, returns a generic message, and logs details server-side only.

## Pitfalls Flash models get wrong
- Checking the role but not the object owner (`isAdmin || isLoggedIn` then any id works).
- Validating on the client only; trusting client-sent `price`, `role`, `userId`, `tenantId`.
- Session cookies without `HttpOnly; Secure; SameSite`; cookie-auth state changes without CSRF protection.
- JWT: accepting `alg: none` or any algorithm, not checking `exp`/`aud`/`iss`, storing long-lived tokens in `localStorage`.
- New dependency with a near-miss name (typosquat) or unmaintained (A03 Software Supply Chain Failures). The package manager updates the lockfile, never you.

## Example - bad -> good
```ts
// BAD: SQL injection + IDOR (any user reads any invoice)
app.get("/invoices/:id", async (req, res) => {
  const r = await db.query(`SELECT * FROM invoices WHERE id = ${req.params.id}`);
  res.json(r.rows[0]);
});
// GOOD: validated, parameterized, owner-scoped
app.get("/invoices/:id", requireUser, async (req, res) => {
  const id = parsePositiveInt(req.params.id); // throws -> 400
  const r = await db.query(
    "SELECT id, total_cents, status FROM invoices WHERE id = $1 AND owner_id = $2",
    [id, req.user.id],
  );
  if (!r.rows[0]) return res.status(404).end(); // 404, not 403: do not reveal existence
  res.json(r.rows[0]);
});
```

## Before finishing
- [ ] Threat model is in the brief or Worker Report; every new entry point validates and authorizes
- [ ] Negative tests (401/403/404/400) pass; verify passes
- [ ] No secrets in changed folders: `node .agents/scripts/search.mjs '(api[_-]?key|secret|password|token)\s*[:=]' <changed-dir> -i`
- [ ] Residual risks listed in the Worker Report (the orchestrator copies them to "Not done / risks")
