# Security — engineering guide for AI agents
> Scope: threat modeling, OWASP Top 10 (app + API), input/output handling, authn/authz, sessions/JWT, secrets, crypto, SSRF, deserialization, file uploads, supply chain, safe logging — as checks you run on your own diff. Quick pointer: `.agents/rules/01-engineering-standards.md`; situational rules: `.agents/rules/topic-security.md`, `.agents/rules/topic-security-sensitive.md`. Companion: `dependency-management.md` (supply-chain depth).
> Last verified: 2026-09 — OWASP Top 10:2025 (announced 2025-11 at Global AppSec DC, final published early 2026; current edition as of 2026-09, categories per https://top10.owasp.org/2025) supersedes 2021. Rust `argon2` example checked against docs.rs (0.6.0, 2026-08). OWASP API Security Top 10 is still the 2023 edition (no newer release found). Argon2id parameters in §8 confirmed current at the OWASP Password Storage Cheat Sheet. STRIDE, input-validation and SSRF/deserialization mechanics are stable, version-independent.

## 0. How this guide works
Each section: definition, why, a **check**, bad→good code, the trap. Re-run on every diff touching a trust boundary (external input, auth, money, PII, file/network I/O).

## 1. Threat-model first (STRIDE-lite)
**Definition:** before an auth flow, an input-accepting endpoint, or anything touching money/PII, name what could go wrong via STRIDE: **S**poofing, **T**ampering, **R**epudiation, **I**nfo disclosure, **D**enial of service, **E**levation of privilege.
**Why:** most real vulnerabilities are missing design decisions (no ownership check, no rate limit), not typos — only a threat model finds those.
**Check:** can you answer all six letters in one line each for a new mutating route? `node .agents/scripts/search.mjs "router\.(post|put|delete)|@app\.(post|put|delete)"` to list new ones first.
**Example — "delete account", six lines:**
```text
S: session token signed + short-lived (§6); no delete via GET/CSRF-unsafe verb.
T: id comes from the session, never a client-supplied field (§5 IDOR).
R: a "deleted" audit row written before hard-delete, with actor id + time.
I: errors are generic; no other user's data echoed (§4).
D: rate-limited per account, not just per IP.
E: only the owner or admin role can call this, checked server-side.
```
**Trap:** a full workshop for a read-only internal report with no PII — match depth to blast radius.

## 2. OWASP Top 10:2025 — what each row means for your diff
| # | Category | Check |
|---|---|---|
| A01 | Broken Access Control (now folds in SSRF, §9) | Every fetch/mutation checks the caller owns this id (§5); no security decision lives only in client UI |
| A02 | Security Misconfiguration | Default creds, verbose prod stack traces, permissive CORS, open storage/admin panels |
| A03 | Software Supply Chain Failures | Lockfile used verbatim, no unreviewed postinstall scripts, typosquat check — depth in `dependency-management.md` |
| A04 | Cryptographic Failures | Sensitive data unencrypted at rest/transit, weak algorithms, hardcoded keys (§8) |
| A05 | Injection (SQL/NoSQL/OS/LDAP/template, XSS) | Every query/command parameterized or ORM-built, never string-concatenated (§4) |
| A06 | Insecure Design | Missing rate limits / abuse-case for a sensitive flow — this is §1 |
| A07 | Authentication Failures | Weak password policy, no lockout, session fixation, no MFA for sensitive actions (§5, §6) |
| A08 | Software/Data Integrity Failures | Unsigned CI artifacts/auto-updates, unsafe deserialization (§10) |
| A09 | Security Logging/Alerting Failures | Auth failures & privilege changes logged with context and alerted, without leaking PII (§13) |
| A10 | Mishandling of Exceptional Conditions | Errors fail closed, no verbose leak to client (`error-handling.md` §7) |

## 3. OWASP API Security Top 10:2023 — for any API/route work
| # | Category | Check |
|---|---|---|
| API1 | Broken Object Level Authorization | Handler verifies caller owns the path/body id, not just "authenticated" (§5) |
| API2 | Broken Authentication | Token checks apply to every route, including "internal"/admin ones |
| API3 | Broken Object Property Level Authorization | Mass assignment: can a caller write `role`/`isAdmin`/`balance`? Allowlist writable fields |
| API4 | Unrestricted Resource Consumption | Size limit, pagination cap, rate limit on every list/search/bulk endpoint |
| API5 | Broken Function Level Authorization | Admin *actions*, not just admin *pages*, re-check role server-side per call |
| API6 | Unrestricted Access to Sensitive Business Flows | Can a script hammer order/coupon/signup faster than a human, with no friction? |
| API7 | Server Side Request Forgery | See §9 |
| API8 | Security Misconfiguration | Same as A02, applied to gateways/CORS/verbose error schemas |
| API9 | Improper Inventory Management | Old API versions (`/v1` after `/v2` ships) still documented and patched, not forgotten |
| API10 | Unsafe Consumption of APIs | Third-party responses (redirects, error bodies, webhooks) validated like client input |

## 4. Input validation & output encoding
**Definition:** validate untrusted input against an allowlist (type, range, enum) at its entry point — reject, don't "clean". Encode output for its context (HTML/SQL/shell/URL) at the point of use.
**Why:** blocklists are bypassed by encoding tricks; a query/template engine can't tell code from data unless told structurally — the root cause of injection (A05) and stored XSS.
**Check:** does every new input have an explicit schema, not bare `string`/`any`? Is every dynamic SQL value parameterized, never concatenated? Does HTML rendering use the templating engine's auto-escaping, never `innerHTML =`/`dangerouslySetInnerHTML` on untrusted data? `node .agents/scripts/search.mjs "innerHTML\s*=|dangerouslySetInnerHTML|autoescape\s+false"`.
**Example — bad → good (TypeScript):**
```ts
// bad
const rows = await db.query(`SELECT * FROM users WHERE email = '${email}'`);
el.innerHTML = `<span>${comment}</span>`;

// good
const Email = z.email(); // Zod 4; Zod 3: z.string().email()
const rows = await db.query("SELECT * FROM users WHERE email = $1", [Email.parse(email)]);
el.textContent = comment; // engine's default auto-escaping interpolation is equally fine
```
**Trap:** hand-rolled regex "sanitizers" instead of parameterization/escaping — they miss an encoding you didn't think of; re-validating the same value at every internal layer instead of once at the boundary.

## 5. AuthN & authZ (including IDOR/BOLA)
**Definition:** authentication proves *who*; authorization proves *what this identity may do to this object* — checked server-side, every request, against server-held ownership state, never inferred from the UI or a client-supplied flag.
**Why:** the most common real API bug is BOLA (API1): checks "logged in?" but not "owns order #4821?" — swap the id, read anyone's data.
**Check:** does every id-taking handler load the object and compare its owner/tenant to the authenticated caller before acting? Are role checks centralized (middleware/decorator), not copy-pasted per handler?
**Example — bad → good (Go, IDOR):**
```go
// bad: any authenticated user can fetch any invoice by guessing the id
func GetInvoice(w http.ResponseWriter, r *http.Request) {
    inv, _ := db.FindInvoice(r.PathValue("id"))
    json.NewEncoder(w).Encode(inv)
}

// good: ownership checked against the authenticated caller
func GetInvoice(w http.ResponseWriter, r *http.Request) {
    caller := auth.FromContext(r.Context())
    inv, err := db.FindInvoice(r.PathValue("id"))
    if err != nil || inv.OwnerID != caller.UserID {
        http.Error(w, "not found", http.StatusNotFound) // 404, don't confirm existence
        return
    }
    json.NewEncoder(w).Encode(inv)
}
```
**Trap:** a generic policy-engine/ABAC framework for two roles and three resources — a per-handler ownership check plus a shared `requireRole()` covers it until a real third dimension appears.

## 6. Sessions & JWT pitfalls
**Definition:** a session proves "same actor as login" over time. Whether a server session id or a signed JWT, it must be unforgeable, short-lived or revocable, and unreadable by injected scripts.
**Why:** JWTs are trusted by verifying the signature, not the claims — flipping `alg` to `none`, or substituting the server's RSA public key as an HMAC secret ("alg confusion"), forges a token if the verifier doesn't pin the algorithm; a JWT in `localStorage` is readable by any XSS; JWTs have no built-in revocation.
**Check:** does the verifier pin the exact algorithm (e.g. `["RS256"]`) instead of trusting the token's own header? Is there a short `exp` (minutes–hours) plus refresh, not weeks? Is the token in an `HttpOnly`+`Secure`+`SameSite` cookie, not `localStorage`? Is there a revocation path (session table, deny-list, or rotated refresh tokens)?
**Example — bad → good (Python):**
```python
# bad: trusts the token's own alg header; no signature/expiry verification
payload = jwt.decode(token, options={"verify_signature": False})

# good: algorithm pinned, signature + expiry verified
payload = jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"], options={"require": ["exp"]})
# access token TTL: 15 min; refresh token: opaque, stored server-side, rotated on use
```
**Trap:** reaching for JWTs in a simple server-rendered single-backend app — an opaque server session id in an `HttpOnly` cookie is simpler and trivially revocable; adopt JWTs when multiple independent services need to verify identity without a shared session store.

## 7. Secrets management
**Definition:** credentials, keys, and connection strings are never literals in source, never in a client bundle, never logged — injected at runtime from env/a secrets manager, distinct per environment, with a documented rotation path.
**Why:** a committed secret lives in history after the line is deleted (rotate it); a secret in a client bundle is trivially extracted; one in a log spreads to every log sink.
**Check:** `node .agents/scripts/search.mjs "(api[_-]?key|secret|password|token)\s*[:=]\s*[\x27\x22][A-Za-z0-9_-]{12,}" -i` for literals (`\x27\x22` = the two quote chars, safe in PowerShell); does every credential come from `process.env`/`os.environ`/a secrets SDK, never a checked-in `.env` (only `.env.example` belongs in the repo)? Is `.env*` git-ignored? Is a rotation owner named per secret class?
**Example — bad → good (any language):**
```text
# bad
DATABASE_URL = "postgres://admin:Sup3rSecret!@prod-db:5432/app"   # committed to source

# good
DATABASE_URL = os.environ["DATABASE_URL"]
# .env holds the real value locally and is git-ignored; CI/prod inject it from a secrets store
```
**Trap:** a full Vault cluster for a single-developer side project — the platform's own secret store (CI/Docker secrets) is enough until multiple services and at-scale rotation are real.

## 8. Crypto do-nots
| Do not | Instead |
|---|---|
| MD5/SHA-1 for passwords, or any fast hash | Argon2id (OWASP baseline `m=19456 KiB, t=2, p=1`); bcrypt/scrypt as fallback |
| AES-ECB mode | AES-GCM or the library's high-level authenticated-encryption API |
| `Math.random()`/`rand()` for tokens/keys | A CSPRNG: `crypto.randomBytes`, `secrets`, `OsRng` |
| Home-grown cipher, base64-as-encryption, fixed IV/salt | A maintained authenticated-encryption primitive, fresh random IV/nonce each time |
| `==` to compare secrets/tokens/HMACs | Constant-time compare (`timingSafeEqual`, `hmac.compare_digest`, Go `subtle.ConstantTimeCompare`, Rust `subtle` `ct_eq`) |
**Why:** a naive `==` leaks a secret one byte at a time via timing; a reused GCM nonce breaks its authentication guarantee entirely; MD5/SHA-1 hashes crack at billions of guesses/sec on commodity GPUs.
**Check:** `node .agents/scripts/search.mjs "md5\(|sha1\(|Math\.random\(\)|new Random\(\)|ECB"` around passwords/tokens/encryption; confirm new crypto calls use the language's authenticated/password-hashing API, not an assembled-by-hand primitive.
**Example — bad → good (Rust, password hashing):**
```rust
// bad
let stored = format!("{:x}", md5::compute(password));

// good: argon2 0.6 (default `getrandom` feature makes a random salt); Argon2id, OWASP-default params
use argon2::{Argon2, password_hash::{PasswordHasher, PasswordVerifier, phc::PasswordHash}};
let hash = Argon2::default().hash_password(password.as_bytes())?.to_string();
// login: constant-time verify against the stored PHC string
let ok = Argon2::default().verify_password(attempt.as_bytes(), &PasswordHash::new(&hash)?).is_ok();
```
API differs by version: read `Cargo.lock` first. 0.5 takes an explicit salt: `SaltString::generate(&mut password_hash::rand_core::OsRng)` then `hash_password(pw, &salt)`.
**Trap:** a custom key-rotation/multi-algorithm scheme in-house instead of a cloud KMS or a maintained envelope-encryption library — "our own AES wrapper" is the classic crypto bug source.

## 9. SSRF (Server-Side Request Forgery)
**Definition:** server code fetches a URL partly controlled by the caller (webhook target, "import from URL", image proxy) and the attacker points it at internal infra (cloud metadata, internal APIs, `localhost`). OWASP 2025 folds SSRF into Broken Access Control (A01) — it's an access-control failure enforced at the network layer.
**Why:** cloud metadata endpoints (`169.254.169.254`) often serve unauthenticated short-lived credentials — SSRF reaching them can escalate to full account compromise.
**Check:** does every URL-fetch feature validate scheme (`https` only) and the **resolved IP** (block RFC1918/loopback/link-local + the metadata IP) before the request and again after any redirect (DNS-rebinding)? Does the client disable auto-following redirects to a different host?
**Example — bad → good (PHP):**
```php
// bad
$image = file_get_contents($_POST['image_url']);

// good: resolve once, validate the IP, pin the connection to that IP (no re-resolve)
function fetchAllowedUrl(string $url): string {
    $p = parse_url($url);
    if (($p['scheme'] ?? '') !== 'https' || empty($p['host'])) throw new InvalidArgumentException('https only');
    $ip = gethostbyname($p['host']); // IPv4 only; returns the host unchanged on failure
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE))
        throw new InvalidArgumentException('target not allowed'); // also blocks 127/8, 169.254/16
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RESOLVE => ["{$p['host']}:443:$ip"], CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 3, CURLOPT_RETURNTRANSFER => true]);
    $body = curl_exec($ch);
    if ($body === false) throw new RuntimeException(curl_error($ch));
    return $body;
}
```
IPv6/AAAA hosts: reject them, or validate every record from `dns_get_record()`. Non-443 ports need the real port in `CURLOPT_RESOLVE`.
**Trap:** blocking by string-matching `localhost` in the URL text — misses IP-literal encodings (`0x7f000001`), redirects, DNS rebinding; validate the resolved IP against a real CIDR blocklist.

## 10. Deserialization
**Definition:** deserializing untrusted bytes with a format that can construct arbitrary types or run code as a side effect (native pickling/serialization) is unsafe; deserializing into a fixed, validated schema (JSON/protobuf/DTO) is a different risk class.
**Why:** Python `pickle`, Java native serialization, PHP `unserialize()`, Ruby `Marshal.load` on untrusted input can instantiate arbitrary objects and invoke constructor/wakeup hooks — "load data" becomes remote code execution (A08).
**Check:** `node .agents/scripts/search.mjs "pickle\.loads|yaml\.load\(|unserialize\(|Marshal\.load|readObject\("` — any hit on untrusted input is a candidate for a safe-by-construction parser.
**Example — bad → good (Python):**
```python
# bad: pickle can execute arbitrary code during deserialization
data = pickle.loads(request.body)

# good: JSON into a validated schema; nothing but data comes out
data = OrderSchema.model_validate_json(request.body)
```
**Trap:** banning all serialization reflexively, including safe ones (`json`, `protobuf`, `yaml.safe_load`) that never execute code on load — the risk is specific to formats reconstructing arbitrary object graphs.

## 11. File uploads
**Definition:** validate the file's actual content (not filename or client-supplied MIME type — both attacker-controlled), cap size, store outside the webroot under a generated name, serve with a locked-down content-type.
**Why:** a filename check doesn't stop `photo.jpg.php` on a misconfigured server or an SVG carrying script; the original name in the webroot lets an attacker overwrite or execute a file.
**Check:** is the type verified by content-sniffing (magic bytes), not header/extension? Is there an enforced max size checked before full read? Is the stored name a generated id (never client-supplied, which can contain `../` traversal), stored outside the served webroot?
**Example — bad → good (Node/TypeScript):**
```ts
// bad: trusts client mimetype/name, serves from webroot
app.post("/upload", upload.single("file"), (req, res) => {
  fs.renameSync(req.file.path, `./public/uploads/${req.file.originalname}`);
});

// good: size cap enforced while streaming, content-sniffed type, generated name, object storage
const upload = multer({ dest: TMP_DIR, limits: { fileSize: MAX_BYTES } }); // LIMIT_FILE_SIZE -> map to 413
app.post("/upload", upload.single("file"), async (req, res) => {
  const type = await fileTypeFromFile(req.file.path);
  if (!type || !ALLOWED_TYPES.has(type.mime)) {
    await fs.promises.unlink(req.file.path); // don't leave rejected temp files behind
    return res.status(415).end();
  }
  await storage.put(`uploads/${crypto.randomUUID()}`, req.file.path);
  res.json({ ok: true });
});
```
**Trap:** a full antivirus/sandboxed-detonation pipeline for an internal tool where only trusted employees upload CSVs — match validation depth to who uploads and what happens to the file next.

## 12. Supply chain (summary — full depth in dependency-management.md)
**Definition:** a dependency is code you didn't write but ship with your authority. Full pin/audit/update workflow lives in `dependency-management.md`; this is the security-specific slice.
**Why:** A03:2025 — malicious/compromised packages, typosquats, tampered builds are now their own top-10 category; a lockfile is what stands between "the version I reviewed" and whatever the registry serves next install.
**Check:** is the lockfile installed verbatim (`npm ci`, `bun install --frozen-lockfile`, `pip install --require-hashes`, `cargo build --locked`), never a bare install that can re-resolve? Does a newly added package's name match the well-known one exactly (no typosquat)? Run the ecosystem's audit command (table in `dependency-management.md` §6) before adding a dependency.
**Trap:** vendoring every dependency "for safety" — you then own every patch forever; a verified lockfile plus routine audits covers the common case (`dependency-management.md` §7).

## 13. Logging without leaking PII or secrets
**Definition:** logs carry enough context to investigate (who, what, when, correlation id) while never carrying raw secrets, full card numbers, passwords, tokens, or more personal data than needed — redact the sensitive field, keep the rest.
**Why:** logs replicate to aggregators and vendors, readable by more people than the source store — a "debug" token leaks everywhere; over-logged PII is a compliance liability (A09).
**Check:** does a new log statement interpolate a whole request/response object or a sensitive header/field (`Authorization`, `password`, `ssn`, full card number) unredacted? `node .agents/scripts/search.mjs "log\.(info|debug|warn|error)\(.*req(uest)?\b|logger\..*\bheaders\b"`. Is there a shared redaction helper rather than trusting every call site?
**Example — bad → good (Go):**
```go
// bad: logs the entire request, including Authorization header and body
log.Printf("request: %+v", r)

// good: explicit field list, sensitive values redacted
logger.Info("payment_attempt", "user_id", userID, "amount_cents", amountCents,
    "card_last4", card.Last4, "request_id", requestID)
```
**Trap:** redacting so aggressively (stripping every id) that logs become useless for the next incident — remove secrets/raw-PII, keep enough shape to correlate.

## Full review checklist (copy into your Completion Report or PR description)
```text
- [ ] New/changed flow threat-modeled with STRIDE-lite, six one-line answers (§1)
- [ ] OWASP Top 10:2025 / API Top 10:2023 rows relevant to this diff checked (§2, §3)
- [ ] External input has a schema; queries parameterized; output encoded for its context (§4)
- [ ] Id-taking handlers check ownership server-side; role checks centralized (§5)
- [ ] JWT/session verifier pins algorithm; tokens short-lived, HttpOnly+Secure (§6)
- [ ] No literal secret in source/logs/bundle; rotation path named (§7)
- [ ] Argon2id for passwords; CSPRNG for tokens; constant-time comparisons (§8)
- [ ] Server-side URL fetches validate resolved IP; metadata range blocked (§9)
- [ ] No unsafe deserialization of untrusted data (§10)
- [ ] Uploads validated by content, size-capped, generated filename, outside webroot (§11)
- [ ] Lockfile installed frozen; new dependency checked for typosquatting (§12)
- [ ] No secret/full-PII/auth header in logs (§13)
```

## References
- OWASP Top 10:2025 — https://top10.owasp.org/2025 · repo — https://github.com/owasp/top10
- OWASP API Security Top 10:2023 — https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- OWASP Password Storage Cheat Sheet (Argon2id) — https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Cheat Sheet Series (SSRF, deserialization, file upload, logging) — https://cheatsheetseries.owasp.org/
- STRIDE — Microsoft Threat Modeling Tool threats — https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats
- JWT alg-confusion — Auth0 — https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/
- Related: `.agents/guides/principles/dependency-management.md`, `.agents/guides/principles/error-handling.md` §7-8, `.agents/rules/topic-security.md`, `.agents/rules/topic-security-sensitive.md`
