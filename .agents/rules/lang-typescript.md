---
trigger: glob
globs: "**/*.ts,**/*.tsx,**/*.mts,**/*.cts"
description: "TypeScript quick card: toolchain, invariants, idioms, pitfalls. Loaded when editing .ts/.tsx/.mts/.cts files."
---
# TypeScript — quick card
Deep guide: `.agents/guides/languages/typescript.md` — read it before non-trivial work (new module, concurrency, public API, perf, config changes). Principles: `.agents/guides/principles/simplicity.md`, `.agents/guides/principles/error-handling.md`, `.agents/guides/principles/testing-strategy.md`, `.agents/guides/principles/security.md`.

## Toolchain (use the project's own config first)
- Format + lint: the `lint` script, else `npx biome check .` (biome.json) or `npx eslint .` + `npx prettier --check .` · Types: the `typecheck` script, else `npx tsc --noEmit` · Test: `npx vitest run` (never bare `vitest`: it can watch forever) · All: `node .agents/scripts/verify.mjs --only node`
- Runner from the lockfile: `bun.lock` → `bunx`/`bun run`, `pnpm-lock.yaml` → `pnpm exec`, `yarn.lock` → `yarn`, else `npx`.
- Versions come from `package.json` + lockfile, not memory. TypeScript 7 (native Go `tsc`, 2026-07) has no stable API yet, so typescript-eslint and Vue/Svelte/Astro/Angular tooling still need TS 6 (`@typescript/typescript6`, binary `tsc6`). Never change the TS major unasked.

## Invariants (MUST / NEVER — with reason → alternative)
1. NEVER type anything `any` — it switches checking off and spreads. Instead use `unknown` and narrow, or a constrained generic.
2. NEVER cast outside data (`JSON.parse`, `res.json()`, request body, env, storage) with `as T` — types are erased; a cast is an unchecked lie. Instead parse it once at the boundary with the project's schema library (zod / valibot) and derive the type from the schema.
3. NEVER silence the checker (`@ts-ignore`, `as unknown as T`, `value!`, `eslint-disable`) — it hides the bug and the quality gate flags it. Instead fix the types; last resort `// @ts-expect-error <reason>`.
4. NEVER weaken tsconfig (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, …) to get green — it hides whole bug classes. Instead fix the code.
5. MUST end every `switch` over a union with `default: assertNever(x)` (reuse the project's helper; else `function assertNever(x: never): never { throw … }`) — a new variant then fails to compile instead of failing in production.
6. MUST write `import type { T }` for type-only imports — per-file transpilers keep plain imports, so they fail or run side effects at runtime (tsc TS1484 under `verbatimModuleSyntax`).
7. MUST give exported functions explicit parameter and return types — stable API, clearer errors, faster checking. Locals may infer.
8. NEVER leave a promise floating (`forEach(async …)`, a call without `await`) — rejections go unhandled and crash Node. Instead `await`, return, `Promise.all`, or `void p.catch(handle)`.

## Idioms & pitfalls Flash models get wrong
- Model states as discriminated unions (`{ status: "ok"; data } | { status: "error"; error }`), not boolean flags plus optional fields.
- `satisfies T` checks a literal and keeps its precise type; `: T` widens it; `as T` checks nothing.
- Closed sets: `const ROLES = ["admin", "user"] as const; type Role = (typeof ROLES)[number]`. Prefer literal unions over `enum`; never add `const enum`. Follow the file if it already uses enums.
- `noUncheckedIndexedAccess`: `arr[i]` and `rec[key]` are `T | undefined`. Check, use `for…of`, or use a `Map` — do not add `!`.
- `exactOptionalPropertyTypes`: omit an optional key instead of assigning `undefined`: `...(x === undefined ? {} : { x })`.
- `catch (err)` is `unknown`: narrow with `instanceof Error`; rethrow with `new Error(msg, { cause: err })`.
- Relative imports follow the resolution mode: `nodenext` needs `./file.js` (even from `.ts`); `bundler` allows extensionless. Copy what neighbouring files do. `node`/`node10`/`classic` and `baseUrl` are removed in TS 7.
- TS 6+ defaults `types` to `[]`: a missing `process` or `import.meta.env` type means adding `"node"` / `"vite/client"` to `types`, not `declare`-ing globals.
- A type parameter used once is noise: `<T>(x: T): void` → `(x: unknown): void`. Constrain generics: `<T extends { id: string }>`.
- Brand IDs that must not mix: `type UserId = string & { readonly __brand: "UserId" }`, created only by a validating function.
- `Object.keys(o)` returns `string[]` on purpose; do not cast it to `(keyof T)[]`.
- Vitest 5+ fails the test on an un-awaited `expect(p).rejects`/`.resolves`; v4 (repo pins `^4.1.11`) only warns — always `await` it.

## Example — bad → good
```ts
async function getUser(id: any) {
  const res = await fetch(`/api/users/${id}`);
  const user = (await res.json()) as { name: string }; // unchecked
  return user.name!;
}
```
```ts
import * as z from "zod";

const User = z.object({ id: z.string(), name: z.string() });
export type User = z.infer<typeof User>;
export async function getUser(id: string): Promise<User> {
  const res = await fetch(`/api/users/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`GET user ${id}: HTTP ${res.status}`);
  return User.parse(await res.json());
}
```

## Before finishing
- [ ] formatted · [ ] lint + `tsc --noEmit` clean · [ ] tests for new behaviour pass (`npx vitest run`) · [ ] no new `any`, `as`, `!`, `@ts-ignore`, floating promises, or tsconfig relaxations · [ ] `node .agents/scripts/verify.mjs --only node` passes
