# JavaScript — engineering guide
> Scope: plain JavaScript (`.js`/`.jsx`/`.mjs`/`.cjs`) across Node, Bun and Deno; for agents and reviewers. Quick card: `.agents/rules/lang-javascript.md`.
> Last verified: 2026-09 — installed `node -v` (v25.6.0)/`bun -v` (1.3.8) and confirmed empirically via `node -e` that this session's Node has `RegExp.escape`, iterator helpers, and `Set.prototype.union` but not `Temporal`; nodejs.org release notes (v22.12.0, v26.0.0, 2026-05-05); web search re-confirming TC39 Temporal reached Stage 4 in March 2026 (Igalia, socket.dev) and Node 26 ships it unflagged (nodejs.org blog, InfoQ); web search confirming Node 24/25 still need `--harmony-temporal` (V8 behind a flag pre-26); MDN Baseline dates re-verified via WebFetch: iterator helpers Newly available since 2025-03-31 (Safari 18.4 last), Set methods since 2024-06 (~27 months old), `RegExp.escape` since 2025-05 (~16 months old) — none "just shipped"; only the latter two are new enough to need a per-target check outside Node ≥24; endoflife.date Node/Deno tables. Where a fact is project-specific, this guide says "check the manifest/lockfile" instead of guessing.

## 1. Mental model / philosophy
- JavaScript is dynamically typed and permissive: it coerces, stringifies, or silently produces `undefined` rather than failing. Treat every implicit coercion as a bug until proven otherwise — prefer code that fails loudly (`===`, explicit parsing, thrown errors).
- Immutability by default: prefer values that cannot change after creation (`const`, copying array/object methods, `structuredClone`) so a function's output depends only on its inputs, not on who else holds a reference.
- Async is cooperative, single-threaded: `await` yields control, but a long synchronous loop blocks everything else (timers, I/O, other requests) until it returns. CPU-heavy work belongs in `worker_threads` (Node) or a separate process, not the main event loop.
- KISS/YAGNI: JavaScript's flexibility invites over-abstraction (config-driven factories, deep prototype chains, `Proxy`/`Reflect` meta-programming). Prefer plain functions and objects; reach for a class only for encapsulated mutable state with identity.
- This guide is JavaScript without a type checker. If the project has (or should have) static types, prefer `.agents/guides/languages/typescript.md` — JSDoc + `checkJs` (§2) gets most of the safety without a build step.

## 2. Project structure & tooling
### Module system: ESM vs CJS (verify per project — do not assume)
- The nearest enclosing `package.json` `"type"` decides a plain `.js` file: `"module"` → ESM (`import`/`export`), `"commonjs"` or absent → CJS (`require`/`module.exports`). `.mjs` is **always** ESM and `.cjs` is **always** CJS regardless of `"type"` — use the explicit extension when a file must be unambiguous.
- Interop: `require()` can load a synchronous ESM module (no top-level `await`) unflagged since Node 20.19+/22.12+ (`require(esm)`); an ESM module with a top-level `await` still needs `await import(...)`. From ESM, `import` a CJS module normally — only its `module.exports` default is reliable, named-export detection is best-effort.
- Never mix `require(...)` and `import`/`export` in the same file — follow the file's extension/`"type"` and neighbouring files.

### Runtimes — Node, Bun, Deno (verified 2026-09; check `package.json`/lockfile/CI config, never assume)
| | Node | Bun | Deno |
|---|---|---|---|
| Version this session | v25.6.0 (check `engines.node` in the project's `package.json`) | 1.3.8 | 2.9.x (verify: `deno --version`) |
| Package manager | npm/pnpm/yarn/bun via lockfile | built-in (`bun install`, `bun.lock`) | URL/JSR imports, `deno.json` import map |
| Test runner | `node:test` (stable; watch/coverage experimental) | `bun:test` (built-in, Jest-like) | `Deno.test` (built-in) |
| Security | OS permissions only | OS permissions only | denies by default (`--allow-net`, …) |
- Never switch runtimes as a side effect of a task. Package manager: detect from the lockfile present (`bun.lock`→bun, `pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, else npm). Never hand-edit a lockfile, or run a second package manager against a repo with one already committed.

### Baseline language features — verify before relying on one you're unsure of
Roughly by ship date (re-verified 2026-09 against MDN's Baseline badges and Node release notes — this is the one part of this guide most likely to go stale first):
- ES2022 / ES2023 — Baseline **widely available** (2.5+ years of cross-engine support): top-level `await` (ESM only), private fields (`#x`), `.at(-1)`, `Object.hasOwn`, array copy methods `toSorted`/`toReversed`/`toSpliced`/`with` (return a new array, no mutation), `findLast`/`findLastIndex`.
- ES2024, plus `Set` math — Baseline widely/newly available: `Object.groupBy`/`Map.groupBy`, `Promise.withResolvers()`, `Array.fromAsync`, RegExp `v` flag (set notation); `Set.prototype.union`/`intersection`/`difference`/`symmetricDifference`/`isSubsetOf`/`isSupersetOf`/`isDisjointFrom` (spec text formally landed in ES2025, but Baseline **Newly available since 2024-06** — ~27 months ago, nearly as safe as the row above).
- ES2025, still genuinely new — verify before relying on it outside Node: iterator helpers (`.map`/`.filter`/`.take`/`.drop`/`.flatMap`/`.reduce`/`.toArray` on iterators/generators), Baseline Newly available since **2025-03-31** (Safari 18.4 shipped last); `RegExp.escape`, Newly available since **2025-05**. Both are safe unflagged on Node ≥24 (iterator helpers since Node 22, `RegExp.escape` since Node 24/V8 13.6) — a browser-facing use of either still needs a caniuse/MDN check per target.
- ES2026 / Stage 4 as of March 2026: `Temporal` (see below) — needs an explicit runtime check, same caution as iterator helpers above, not a "just use it" feature yet.
- `structuredClone` (global since Node 17) predates all of the above and is safe to assume everywhere this guide applies.
- Unsure whether a feature shipped in the project's actual runtime? Check `node -v`/the lockfile's engine range, or MDN's "Baseline" badge — don't guess from training data (features ship continuously; this list goes stale).

### `Temporal` vs `Date` (verify Node version before use)
- `Date` is mutable (`setMonth` etc. mutate the receiver), has no built-in timezone-aware arithmetic, and parses non-ISO strings inconsistently across engines. `Temporal` (`Temporal.PlainDate`, `Temporal.ZonedDateTime`, `Temporal.Duration`, …) is immutable and timezone/calendar-aware.
- Verified 2026-09: Temporal reached **TC39 Stage 4** (locked into ES2026) in March 2026. **Node 26** (May 2026) ships it unflagged; **Node 24/25** need `--harmony-temporal` or `temporal-polyfill`/`@js-temporal/polyfill` — don't assume `globalThis.Temporal` exists on an older LTS. The `v25.6.0` checked for this guide does **not** guarantee it.
- Bun and Deno shipped `Temporal` ahead of this date; check `bun -v`/`deno -v` docs, don't assume parity with Node.

### Commands (project scripts first; swap `npx` for `bunx`/`pnpm exec`/`deno run` per the lockfile/runtime)
| Task | Command |
|---|---|
| Syntax check (no deps) | `node --check file.js` (POSIX and PowerShell) |
| Format + lint | `format`/`lint` script, else `npx biome check .` (`--write` to fix), or `npx eslint .` + `npx prettier --check .` |
| Type-check JS via JSDoc | `npx tsc --noEmit --allowJs --checkJs` (or `checkJs: true` in `tsconfig.json`, scoped with `// @ts-check`) |
| Test | `test` script, else `npx vitest run` (never bare `vitest`: it watches forever) or `node --test` |
| One test file | `npx vitest run path/file.test.js` · `node --test path/file.test.js` |
| Everything | `node .agents/scripts/verify.mjs --only node` |
- Biome (2.x, 2.5.14 when verified 2026-09) lints/formats JS/JSX/CJS/MJS directly. ESLint needs a flat `eslint.config.js` (9+) plus `eslint-plugin-react`/`react-hooks` for JSX. Keep whichever the project has; never add a second linter.

## 3. Core idioms
### Strict equality, nullish coalescing, optional chaining
```js
// bad: == coerces ("" == 0 is true, "0" == false is true); || replaces valid falsy values
function price(p) {
  return p.discount == 0 ? p.base : p.base - p.discount || p.base;
}
```
```js
// good: === is unambiguous; ?? only replaces null/undefined
function price(p) {
  return p.discount === 0 ? p.base : p.base - (p.discount ?? 0);
}
```
- `?.` short-circuits the *entire* chain: `a?.b.c` still throws if `a.b` is `null` and `.c` is read — chain every hop: `a?.b?.c`.
- Combine `?.`/`??`: `user?.profile?.name ?? "anonymous"`. `x == null` is the one accepted `==` use — matches `null` and `undefined`.

### Immutability: copy instead of mutate
```js
// bad: mutates the array a caller may still be iterating or holding a reference to
function topThree(scores) {
  return scores.sort((a, b) => b - a).slice(0, 3);
}
```
```js
// good: toSorted (ES2023) returns a new array; the original is untouched
function topThree(scores) {
  return scores.toSorted((a, b) => b - a).slice(0, 3);
}
```
- Mutating→replacements: `sort`→`toSorted`, `reverse`→`toReversed`, `splice`→`toSpliced`, `arr[i]=x`→`arr.with(i, x)`.
- `structuredClone(value)` deep-clones plain data (objects, arrays, `Map`, `Set`, `Date`, cycles) without `JSON.parse(JSON.stringify(...))`'s failures (drops `undefined`/functions, stringifies `Date`, throws on cycles). It cannot clone functions or private-field class instances.
- `Object.freeze(obj)` is shallow and only blocks top-level key reassignment. For real invariants, freeze recursively or avoid the mutable shape entirely.

### Closures, `this`, and loop variables
```js
// bad: `var` closes over one shared binding; every timeout logs 3
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}

// good: `let` creates a fresh binding per iteration
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
```
- Arrow functions capture `this` lexically; regular `function`s get their own `this` decided by how they're *called* (a plain callback gives `undefined` in strict/ESM code). Use arrows for callbacks needing the outer `this`; `.bind(this)` only when an API needs a plain function reference.
- A closure keeps its entire enclosing scope alive, not just the variables it reads — a long-lived closure over a large object is a memory leak; capture only what you need.

### Numbers, BigInt, and structural equality
```js
// bad: === on floats fails for the values it looks like it should catch
if (0.1 + 0.2 === 0.3) { /* never runs */ }

// good: compare with an explicit tolerance
function nearlyEqual(a, b, eps = Number.EPSILON * 8) {
  return Math.abs(a - b) < eps;
}
```
- All JS numbers are IEEE-754 doubles except `BigInt` (`123n`). Mixing `BigInt`/`Number` in an operator throws `TypeError`; convert explicitly. Use `BigInt` for values beyond `Number.MAX_SAFE_INTEGER` (2^53−1) — IDs, ledgers, crypto.
- `Number.isInteger`/`isSafeInteger` check without coercion; the global `isNaN`/`isFinite` coerce first — prefer `Number.isNaN`/`Number.isFinite`.
- No built-in deep-equality operator: `{a:1} === {a:1}` is `false`. Compare fields explicitly, or use the test framework's `toEqual`/`assert.deepStrictEqual` — never an ad hoc recursive comparator.

### Grouping, Set math, and iterator helpers (ES2024/ES2025 — verify runtime support first)
```js
const byStatus = Object.groupBy(orders, (o) => o.status); // { pending: [...], paid: [...] }

const activeIds = new Set(active.map((u) => u.id));
const staffIds = new Set(staff.map((u) => u.id));
const activeStaff = activeIds.intersection(staffIds); // Set — no manual filter+includes

function* pages(fetchPage) {
  for (let n = 1; ; n++) {
    const page = fetchPage(n);
    if (page.length === 0) return;
    yield* page;
  }
}
const firstTenActive = pages(fetchPage)
  .filter((item) => item.active)
  .take(10)
  .toArray(); // lazy: stops fetching pages once 10 matches are found
```
- Iterator helpers are lazy: `.filter().take(10)` on an infinite/expensive generator pulls only as many upstream items as needed — a plain `Array.prototype.filter().slice(0, 10)` materializes everything first.

## 4. Error handling
```js
export class HttpError extends Error {
  constructor(status, message, options) {
    super(message, options);
    this.name = "HttpError";
    this.status = status;
  }
}

export async function loadUser(id) {
  const res = await fetch(`/api/users/${encodeURIComponent(id)}`);
  if (!res.ok) throw new HttpError(res.status, `GET user ${id}: HTTP ${res.status}`);
  return res.json();
}

// caller: narrow before reading fields on a caught value
async function getUserOrNull(id) {
  try {
    return await loadUser(id);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw new Error(`loadUser(${id}) failed`, { cause: err }); // keep the chain
  }
}
```
- Always `throw new Error(...)` (or a subclass), never a string/plain object — only `Error` instances get a stack trace and `instanceof` narrowing.
- `catch (err)` is a value of unknown shape — check `err instanceof Error` before `.message`/`.stack`.
- Use `Error(message, { cause })` (ES2022) to preserve the original error when rethrowing; log/report both.
- NEVER `catch { }` and continue silently — handle, translate to a domain error, or rethrow. A caught-and-ignored error is a bug in disguise.
- `unhandledRejection` crashes the Node process by default (since v15) — intentional; fix the rejection, don't add a blanket swallower.

## 5. Testing
Use whatever the project already has (`vitest`, `jest`, `node:test`, `bun:test`). New Node project with no test framework yet: `node:test` (zero dependencies, built into Node, stable) for libraries/CLIs; `vitest` when the project is already Vite-based or wants jsdom/browser-like APIs.
```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { price } from "./price.js";

describe("price", () => {
  it("subtracts a positive discount", () => {
    assert.equal(price({ base: 100, discount: 10 }), 90);
  });
  it("treats a missing discount as zero", () => {
    assert.equal(price({ base: 100 }), 100);
  });
});
```
- `assert/strict` uses `===`/deep-strict-equal semantics — prefer it over the legacy loose `assert` module.
- Inject collaborators (a `fetch` implementation, a clock) as parameters instead of a module-level mock; mock only at a boundary you don't own (network, filesystem, time).
- Fake timers: `node:test`'s `MockTimers` (`t.mock.timers.enable(...)`) or the framework's equivalent — never a real `setTimeout` wait in a test.
- One behavior per `it`, named as a behavior ("subtracts a positive discount"), not an implementation detail ("calls Math.max").
- New behavior needs a test that fails before the fix and passes after; never edit a test to make it green without understanding why it failed.

## 6. Performance
- Measure before optimizing: `node --prof` + `node --prof-process`, `node --cpu-prof`; for a suspected leak, `--heap-prof` or compare `process.memoryUsage().heapUsed` snapshots. Don't guess.
- Algorithmic wins dominate micro-optimizations: `array.includes(x)` in a loop is O(n·m); a `Set`/`Map` lookup is O(1) — usually the highest-leverage fix.
- Independent I/O in parallel: `await Promise.all(items.map(fetchOne))`, not a sequential `for` loop of awaited calls, unless each depends on the previous result.
- Avoid `{ ...acc, [k]: v }` inside a `reduce` over a large array — each iteration copies the whole accumulator (O(n²) total). Build a `Map`/object with direct assignment, or use `Object.groupBy` for grouping.
- String concatenation in a loop: build an array and `.join("")` instead of repeated `+=` over thousands of iterations.
- CPU-bound synchronous work (parsing, image processing, crypto) blocks the event loop for everyone; move it to `worker_threads` or a subprocess — measure the blocking first.

## 7. Security
- Never `eval(...)`, `new Function(...)`, or a `vm` sandbox on untrusted input — all are effectively arbitrary code execution.
- Never assign untrusted strings to `.innerHTML`/`outerHTML`/`insertAdjacentHTML` — that's XSS; use `.textContent` or a templating layer that escapes by default.
- Prototype pollution: never deep-merge an untrusted object into a plain object with a naive recursive merge (`__proto__`/`constructor.prototype` keys can escalate); use `Object.create(null)`, a `Map`, or a schema library that rejects unknown keys.
- Validate and parse every external input (HTTP body, query/params, headers, env vars, files, third-party responses) at the boundary — a JSDoc `@type` comment checks nothing at runtime.
- Regexes on untrusted input: avoid nested/overlapping quantifiers (`(a+)+`) that cause catastrophic backtracking (ReDoS); cap input length before matching.
- Secrets: never commit them, log them, or send them to an unapproved external service. `VITE_*`/`NEXT_PUBLIC_*`/`PUBLIC_*` env vars ship to the browser — never put a secret behind one.
- SQL/NoSQL/shell: parameterized queries or the driver's tagged-template helper, and `execFile(cmd, [args])` — never string-concatenate user input into a query or shell command.

## 8. Concurrency / async
```js
// bad: forEach ignores the promises; errors are unhandled, order/completion is unknown
ids.forEach(async (id) => {
  await syncOne(id);
});

// good: bounded parallelism, propagated errors, cancellation
async function syncAll(ids, { signal, batchSize = 8 } = {}) {
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    await Promise.all(batch.map((id) => syncOne(id, signal)));
  }
}

async function syncOne(id, signal) {
  const res = await fetch(`https://api.example.com/items/${encodeURIComponent(id)}`, {
    signal: signal ?? AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`sync ${id}: HTTP ${res.status}`);
}
```
- Await, return, or explicitly handle (`void p.catch(...)`) every promise — a "floating" promise drops its rejection silently until it crashes the process later, far from where it was created.
- `Promise.all` — fail-fast, all-or-nothing (independent work where any failure should abort the rest). `Promise.allSettled` — always resolves with per-item outcomes (partial success acceptable). `Promise.race`/`Promise.any` are for "first to settle"/"first to fulfill" — rare; document why.
- `AbortController`/`AbortSignal` cancel `fetch` and any signal-aware API; `AbortSignal.timeout(ms)` and `AbortSignal.any([a, b])` compose without manual `clearTimeout` bookkeeping.
- A "check-then-act" split across an `await` (`if (!(await exists(id))) await create(id)`) is a race if another call runs the same check concurrently — re-check after the await, or push the logic into an atomic operation (a DB upsert, a lock).
- `try { ... } finally { cleanup(); }` around awaited resources runs cleanup on both success and rejection — safer than remembering it on every exit path.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `==`/`!=` | silent coercion bugs | `===`/`!==` (`x == null` is the sanctioned exception) |
| `forEach(async …)` | promises dropped, errors vanish | `for…of` + `await`, or `Promise.all(items.map(fn))` |
| Unawaited/unreturned promise | unhandled rejection crashes Node | `await`, `return`, or `void p.catch(handler)` |
| `JSON.parse(JSON.stringify(x))` clone | drops `undefined`/functions, mangles `Date`, throws on cycles | `structuredClone(x)` |
| `arr.sort()`/`.splice()` on a shared array | mutates a value the caller still holds | `arr.toSorted()`/`.toSpliced()`/`.with(i, v)` |
| `var` in a loop with an async callback | closure captures one shared binding | `let`/`const` |
| `\|\|` default when `0`/`""`/`false` is valid | replaces legitimate falsy values | `??` |
| Naive recursive deep-merge of user JSON | prototype pollution via `__proto__` | `Object.create(null)`/`Map`, or a validating schema |
| String-built SQL/shell command | injection | parameterized query / `execFile(cmd, [args])` |
| `eval`/`new Function` on external input | arbitrary code execution | parse data, never execute it |
| Sequential `await` over independent items | needless latency | `Promise.all` (bounded batches for large N) |

## 10. Review checklist
- [ ] no `==`/`!=` except `x == null`; no floating promises; no `forEach(async …)`
- [ ] shared arrays/objects copied (`toSorted`/`toSpliced`/`with`/spread/`structuredClone`), not mutated, when the caller may hold a reference
- [ ] independent I/O via `Promise.all`; external calls carry a timeout/`AbortSignal`
- [ ] errors are `Error` subclasses with `cause` preserved when rethrown; no empty `catch {}`
- [ ] version-sensitive claims (a "new" API, `Temporal`, an ES2024/2025 method) checked against the runtime/lockfile, not assumed
- [ ] boundary input validated before use; no untrusted string reaches `eval`, `innerHTML`, a shell command, or a query string
- [ ] module system consistent (`require` vs `import` matches `.mjs`/`.cjs`/`"type"`), no mixed syntax in one file
- [ ] new behavior has a test that failed first; `node .agents/scripts/verify.mjs --only node` passes

## 11. References
- MDN JS reference https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference · Baseline https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility
- Node docs https://nodejs.org/api/ · `require(esm)` https://nodejs.org/en/blog/release/v22.12.0 · Node 26 (Temporal default) https://nodejs.org/en/blog/release/v26.0.0 · test runner https://nodejs.org/api/test.html
- TC39 proposals https://github.com/tc39/proposals · Temporal https://tc39.es/proposal-temporal/docs/ · Set methods https://github.com/tc39/proposal-set-methods · Iterator helpers https://github.com/tc39/proposal-iterator-helpers
- Bun https://bun.sh/docs · Bun test https://bun.sh/docs/cli/test · Deno https://docs.deno.com/runtime/ · Deno permissions https://docs.deno.com/runtime/fundamentals/security/
- Biome https://biomejs.dev/ · ESLint flat config https://eslint.org/docs/latest/use/configure/configuration-files · Vitest https://vitest.dev/guide/
- OWASP prototype pollution https://owasp.org/www-community/vulnerabilities/ · ReDoS https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS
- Principles: `.agents/guides/principles/` — `simplicity.md`, `error-handling.md`, `testing-strategy.md`, `security.md`, `concurrency.md`, `performance.md`
