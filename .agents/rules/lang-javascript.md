---
trigger: glob
globs: "**/*.js,**/*.jsx,**/*.mjs,**/*.cjs"
description: "JavaScript quick card: toolchain, invariants, idioms, pitfalls. Loaded when editing .js/.jsx/.mjs/.cjs files."
---
# JavaScript — quick card
Deep guide: `.agents/guides/languages/javascript.md` — read it before non-trivial JS work (new module, async/concurrency, public API, perf, choosing between Node/Bun/Deno). Principles: `.agents/guides/principles/simplicity.md`, `.agents/guides/principles/error-handling.md`, `.agents/guides/principles/testing-strategy.md`, `.agents/guides/principles/security.md`, `.agents/guides/principles/concurrency.md`.

## Toolchain (use the project's own config first)
- Format + lint: the `lint`/`format` script, else `npx biome check .` (biome.json) or `npx eslint .` + `npx prettier --check .` · Syntax-only: `node --check <file>` · Test: the `test` script, else `npx vitest run` or `node --test` · All: `node .agents/scripts/verify.mjs --only node`
- Runner from the lockfile: `bun.lock` → `bunx`/`bun run`, `pnpm-lock.yaml` → `pnpm exec`, `yarn.lock` → `yarn`, else `npx`.
- Runtime is whatever the project already uses (Node, Bun, Deno) — read `package.json`/lockfile/`engines`; never switch runtime unasked.

## Invariants (MUST / NEVER — with reason → alternative)
1. MUST use `===`/`!==`, never `==`/`!=` — coercion hides bugs (`"" == 0` is `true`). Exception: `x == null` for "null or undefined".
2. NEVER pass an `async` callback to `Array.prototype.forEach` — it ignores the returned promises, so rejections vanish. Instead use `for…of` + `await`, or `Promise.all(items.map(fn))` for independent work.
3. NEVER leave a promise unawaited, unreturned, and unhandled — an unhandled rejection crashes Node (default since v15). Instead `await`/`return` it, or `void promise.catch(onError)`.
4. NEVER mutate a shared array/object the caller may still hold (`sort`, `reverse`, `splice`, index assignment) — use the copying methods `toSorted`/`toReversed`/`toSpliced`/`with` (ES2023) or spread a new value.
5. NEVER deep-clone/merge with `JSON.parse(JSON.stringify(x))` — drops `undefined`, functions, `Date`/`Map`/`Set`, throws on cycles. Use built-in `structuredClone(x)`.
6. MUST use `??` not `||` for defaults when `0`, `""`, or `false` are valid values — `||` replaces those too.
7. NEVER declare with `var` — function scoping captures the wrong value in loop closures. Always `const`, or `let` when reassigned.
8. NEVER compare floats with `===`/`<`/`>` for equality — `0.1 + 0.2 !== 0.3`. Compare `Math.abs(a - b) < Number.EPSILON` (or a domain tolerance); use `BigInt`/integer cents for money.
9. NEVER use a plain (non-arrow) function as a callback needing the enclosing `this` — plain functions get their own `this` (`undefined` in strict/ESM code). Use an arrow function, or `.bind(this)`.

## Idioms & pitfalls Flash models get wrong
- ESM vs CJS: nearest `package.json` `"type"` decides plain `.js`; `.mjs` is always ESM, `.cjs` always CJS. `require()` loads a synchronous ESM module (no top-level `await`) unflagged since Node 20.19+/22.12+; never mix `require`/`import` syntax in one file.
- `Promise.all` rejects (and stops) as soon as one input rejects; `Promise.allSettled` always resolves, with `{status, value|reason}` per item — pick deliberately.
- Thread `AbortController`/`AbortSignal` through fetches/timers you must cancel: `fetch(url, { signal: AbortSignal.timeout(5000) })`.
- `Object.groupBy(items, fn)` / `Map.groupBy(items, fn)` (ES2024) replace a hand-rolled `reduce` grouping.
- `Date` is legacy and mutable (`setMonth` mutates in place); prefer immutable `Temporal` (Stage 4 / ES2026) where the runtime has it — Node 26+ ships it unflagged, Node 24/25 need `--harmony-temporal` or `temporal-polyfill`. Check `node -v` first against the project's minimum (`package.json` `engines`, root `AGENTS.md`).
- `Set` has `union`/`intersection`/`difference`/`symmetricDifference`/`isSubsetOf`/`isSupersetOf`/`isDisjointFrom` (ES2025) — don't hand-roll set math on arrays.
- Iterator helpers (`.map`/`.filter`/`.take`/`.drop`/`.flatMap`/`.reduce`/`.toArray`, ES2025) work lazily on generators/iterators — don't materialize an array first for one chained op.
- Typing a plain `.js` file: add `// @ts-check` (or `checkJs: true` in `tsconfig.json`) plus JSDoc `@param`/`@returns`/`@type`; don't convert to `.ts` unasked.
- `node --check <file>` is a syntax-only sanity check (no execution/types) — the edit hook already runs it; don't trust it beyond a parse error.
- `catch (err)` is not necessarily an `Error` — check `err instanceof Error` before `.message`; re-throw with `new Error(msg, { cause: err })`.

## Example — bad → good
```js
// bad: dropped promises, wrong error handling, mutates the caller's array
function syncAll(ids, list) {
  ids.forEach(async (id) => {
    await syncOne(id);
  });
  return list.sort();
}
```
```js
// good: errors propagate, independent work runs in parallel, no shared mutation
async function syncAll(ids) {
  await Promise.all(ids.map((id) => syncOne(id)));
}
function sortedCopy(list) {
  return list.toSorted();
}
```

## Before finishing
- [ ] formatted · [ ] lint clean (`node --check` on touched files) · [ ] tests for new behaviour pass · [ ] no `==`, floating promises, `forEach(async …)`, in-place mutation of a shared value, or hand-rolled deep clone · [ ] `node .agents/scripts/verify.mjs --only node` passes
