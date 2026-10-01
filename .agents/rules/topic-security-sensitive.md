---
trigger: glob
globs: "**/*auth*,**/*session*,**/*password*,**/*crypto*,**/*token*,**/*secret*,**/*jwt*,**/*oauth*,**/*login*,**/*permission*,**/middleware.*,**/.env*"
description: "Security card for auth, sessions, passwords, tokens, crypto, permissions, middleware and .env files: invariants, pitfalls, bad->good example. Loaded when editing security-sensitive files."
---
# Security-sensitive code - topic card
Principles guide: `.agents/guides/principles/security.md` - read it before changing authentication, authorization, session or crypto logic. Audit procedure: `/security-audit`; independent review: the `security-auditor` worker in REVIEW (dispatched by the orchestrator). Use the project's existing auth library; never write your own.

## Toolchain
- Find every entry point that needs the check: `node .agents/scripts/search.mjs "<route|handler|resolver pattern>"`, then verify each one.
- Secrets scan before finishing: `node .agents/scripts/search.mjs "(api[_-]?key|secret|password|token).{0,3}[:=]|BEGIN [A-Z ]*PRIVATE KEY" -i`, then review each hit.
- Dependency audit per ecosystem (see the dependencies card): `npm audit` / `bun audit`, `cargo audit`, `govulncheck ./...`, `pip-audit`, `composer audit`.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER print, log, echo or paste secret values (from `.env*`, keys, tokens, cookies, `Authorization` headers) into chat, logs, tests or commits - they leak through transcripts and history. Refer to them by name; `.env.example` holds placeholders only. Keep `.env*` (except the example) in `.gitignore`.
2. Authorize on the server at every entry point (route, action, resolver, RPC), deny by default, and check object ownership (`WHERE id = ? AND owner_id = ?`) - hiding a button or checking only in middleware is not authorization. Middleware can be bypassed (Next.js CVE-2025-29927 skipped middleware via a spoofed header); re-check next to the data access.
3. Passwords: hash with the project's library using Argon2id (or bcrypt/scrypt where already used) - never plain text, never fast hashes (MD5, SHA-*), never reversible encryption.
4. Tokens and IDs that grant access come from a CSPRNG (`crypto.randomBytes`/`crypto.randomUUID`, `secrets.token_urlsafe`, `crypto/rand`, `OsRng`), never `Math.random`, timestamps or counters. Compare secrets in constant time (`crypto.timingSafeEqual`, `hmac.compare_digest`, `subtle.ConstantTimeCompare`).
5. JWT: verify the signature with an explicit algorithm allow-list and check `exp`, `iss` and `aud`; reject `alg: none`. The payload is only base64 - never put secrets or PII in it.
6. Sessions: regenerate the session ID on login and privilege change, invalidate it on logout, cookies `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict`). Cookie-authenticated state changes need CSRF protection.
7. NEVER roll your own crypto or disable TLS verification (`rejectUnauthorized: false`, `verify=False`, `InsecureSkipVerify: true`) to make an error go away. Use vetted primitives (AES-GCM with unique nonces, libsodium, WebCrypto) and fix the certificate problem.

## Pitfalls Flash models get wrong
- Login errors that differ for "unknown user" and "wrong password" allow account enumeration. Return one generic message and add rate limiting or lockout.
- OAuth: always send and check `state`, use PKCE, and match `redirect_uri` exactly. Never pass tokens in URLs.
- CORS `Access-Control-Allow-Origin: *` with credentials, or an origin echoed back unvalidated. Use an allow-list.
- Logging `req.headers`, `req.body` or whole user objects leaks tokens and password fields. Log IDs and outcomes only.
- bcrypt ignores input past 72 bytes. Enforce a maximum length or pre-hash as the library documents.
- Returning stack traces or SQL errors to clients. Log them server-side; return a generic error with a request ID.
- Test fixtures with real-looking keys get flagged or reused. Use obvious fakes (`test-secret-not-real`).
- Editing `.env*`: the tracking hook warns. Change only the keys you were asked to change and never read values back into chat.

## Example - bad -> good
```ts
// BAD: guessable token, timing-unsafe compare, secret in the log
const token = Math.random().toString(36).slice(2);
if (req.query.token == user.resetToken) { log(`reset ok ${req.query.token}`); }
```
```ts
// GOOD: CSPRNG, stored as a hash, constant-time compare, no secret logged
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
const token = randomBytes(32).toString("base64url"); // send once, store only its hash
// (a fast hash is fine for 256-bit random tokens; passwords need Argon2id/bcrypt)
const hash = (t: string) => createHash("sha256").update(t).digest();
const ok = timingSafeEqual(hash(String(req.query.token ?? "")), user.resetTokenHash);
if (ok) log(`password reset for user ${user.id}`);
```

## Before finishing
- [ ] Every changed entry point checks authentication AND authorization on the server
- [ ] No secret values in code, logs, tests, output or chat; secrets scan shows nothing new
- [ ] Standard library primitives only; TLS verification untouched
- [ ] Tests cover the denied path (wrong user, expired token), not only the happy path; `node .agents/scripts/verify.mjs` passes
