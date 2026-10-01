# TypeScript — engineering guide
> Scope: TypeScript apps, servers, libraries; for agents and reviewers. Quick card: `.agents/rules/lang-typescript.md`.
> Last verified: 2026-09 — npm registry (typescript 7.0.2, @typescript/typescript6 6.0.2, typescript-eslint 8.70.1 peer `typescript <6.1.0`, vitest 5.0.1, biome 2.5.14, zod 4.6.5, valibot 1.5.0), TS 6.0/7.0 + Vitest 5 release posts, Node.js docs; every `ts` sample compiled with tsc 7.0.2 under §2.

## 1. Mental model / philosophy
- Types are erased: they never prove what the outside world sends. Boundary data (HTTP, `JSON.parse`, env, storage, files) is `unknown` until a schema parsed it.
- Make illegal states unrepresentable: model alternatives as discriminated unions.
- Annotate boundaries, infer interiors: explicit parameter and return types on exports; locals infer.
- The checker is your fastest test. Every silencer (`any`, `as`, `!`, `@ts-ignore`) turns a compile error into a production bug.
- KISS: a type nobody understands in ten seconds needs a name or a simpler design.

## 2. Project structure & tooling
### Release status (verified 2026-09; the lockfile wins)
- **TypeScript 7.0** (2026-07-08) is the native Go port (previewed in 2025 as `tsgo`, package `@typescript/native-preview`). The `typescript` package's `tsc` is now native: about 8-12x faster builds, parallel checking (`--checkers`, default 4; `--builders` for `-b`; `--singleThreaded`).
- 7.0 has **no stable programmatic API** (planned for 7.1): typescript-eslint, Volar-based Vue/Svelte/Astro tooling and Angular still need TS 6. Side by side (`tsc` = 7, `tsc6` = 6):
  ```json
  { "devDependencies": { "@typescript/native": "npm:typescript@^7.0.2", "typescript": "npm:@typescript/typescript6@^6.0.2" } }
  ```
- **TypeScript 6.0** (2026-03-23) changed defaults that 7 keeps: `strict: true`, `module: esnext`, `types: []`, `rootDir: "."`, `noUncheckedSideEffectImports: true`. Removed in 7: `moduleResolution` `node`/`node10`/`classic`, `baseUrl`, `outFile`, `target: es5`, `downlevelIteration`, `module` `amd`/`umd`/`system`/`none`.
- `types: []` means ambient globals exist only when listed: `["node"]` for `process`, `["vite/client"]` for `import.meta.env`.
- Never change the TypeScript major as a side effect (check: `npx tsc --version`).

### Strict baseline (bundled app; Node-run code and npm libraries use `nodenext` for both module keys)
```json
{
  "compilerOptions": {
    "strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true, "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true, "isolatedModules": true, "moduleDetection": "force",
    "noUncheckedSideEffectImports": true,
    "target": "esnext", "module": "esnext", "moduleResolution": "bundler",
    "types": [], "noEmit": true, "skipLibCheck": true
  }
}
```
| Flag | Catches | Usual fix |
|---|---|---|
| `strict` | implicit `any`, null misuse; `catch` var is `unknown` | narrow; annotate params |
| `noUncheckedIndexedAccess` | `arr[i]`, `rec[key]` assumed present | check `!== undefined`, `for…of`, `Map` |
| `exactOptionalPropertyTypes` | `{ a?: T }` given an explicit `undefined` | omit the key, or declare `a?: T \| undefined` |
| `verbatimModuleSyntax` | type imports emitted as runtime imports | `import type { T }` |
| `isolatedModules` | code per-file transpilers (esbuild, swc) cannot compile | `export type { T }` |
| `noImplicitOverride` | subclass members silently shadowing the base | `override` keyword |

Existing code: enable one flag per change, fix, verify. Never relax a flag to get green.

### Commands (project scripts first; swap `npx` for `bunx` / `pnpm exec` per lockfile)
| Task | Command |
|---|---|
| Type-check | `npx tsc --noEmit` · references: `npx tsc -b` · one config: `npx tsc -p tsconfig.app.json --noEmit` |
| Test | `npx vitest run` · one file: `npx vitest run src/cart.test.ts` · one test: `-t "totals"` |
| Biome | `npx biome check .` · fix: `npx biome check --write .` |
| ESLint | `npx eslint .` · fix: `npx eslint . --fix` |
| Diagnose | `npx tsc --noEmit --explainFiles` · `--extendedDiagnostics` · `--generateTrace trace` |
| Everything | `node .agents/scripts/verify.mjs --only node` |

- Bare `vitest` may watch and never exit: always `vitest run`.
- Linter: keep the configured one. New project: Biome (format + lint). Typed rules (`no-floating-promises`, `switch-exhaustiveness-check`) need ESLint flat config + `tseslint.configs.strictTypeChecked` + `parserOptions.projectService: true`; Biome's equivalents are still nursery in 2.5.

### Module resolution
- `bundler` (`module: esnext`/`preserve`): code a bundler or Bun consumes (Vite, Next). Extensionless imports are fine.
- `nodenext`: code Node runs and published libraries. Nearest `package.json` `"type"` plus extension decide the format (`.mts` ESM, `.cts` CJS). Relative imports carry the runtime extension: `import { a } from "./a.js"` inside `b.ts`.
- `paths` is type-only: the bundler/runtime must resolve the alias too (or `package.json` `"imports"`; the `#/` prefix needs TS 6+). Without `baseUrl`, targets are tsconfig-relative: `"~/*": ["./src/*"]`.
- Node ≥ 22.18 runs `.ts` by stripping types (stable since 24.12/25.2): no type-check, tsconfig ignored (`paths` fail), `.ts` import extensions required, enums/namespaces/parameter properties rejected. Config: `nodenext`, `erasableSyntaxOnly` (catches those same rejected constructs at typecheck time instead of at runtime — pair with `verbatimModuleSyntax`), `rewriteRelativeImportExtensions` (or `allowImportingTsExtensions` + `noEmit`). Still run `tsc --noEmit`.

## 3. Core idioms
### unknown vs any
```ts
// bad: any switches the checker off and spreads; lengthOfBad(42) compiles and returns undefined
export function lengthOfBad(x: any) { return x.length; }

// good: unknown forces a check before use
export function lengthOf(x: unknown): number {
  if (typeof x === "string" || Array.isArray(x)) return x.length;
  throw new TypeError(`expected string or array, got ${typeof x}`);
}
```
`JSON.parse` and (with the DOM lib) `res.json()` return `any`: assign to `unknown` at once (`const data: unknown = JSON.parse(text)`). "Any function" constraint: `T extends (...args: never[]) => unknown`.

### Narrowing and type guards
```ts
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
export function assertDefined<T>(v: T, what: string): asserts v is NonNullable<T> {
  if (v === undefined || v === null) throw new Error(`${what} is missing`);
}
export const present = ["a", undefined, "b"].filter((x) => x !== undefined); // string[] (inferred predicate, TS 5.5+)
```
Narrow with `typeof`, `instanceof`, `in`, `Array.isArray`, `===` on a discriminant, then `v is T` / `asserts` functions. A predicate is an unchecked promise: its body must test exactly what it claims; beyond a few fields use a schema.

### Discriminated unions + exhaustive `never`
```ts
export type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; error: Error };

export function assertNever(x: never): never {
  throw new Error(`unhandled variant: ${JSON.stringify(x)}`);
}

export function label(s: LoadState<string>): string {
  switch (s.status) {
    case "idle": return "Idle";
    case "loading": return "Loading";
    case "ok": return s.data;
    case "error": return s.error.message;
    default: return assertNever(s); // a new variant now fails to compile here
  }
}
```
The bad shape `{ loading: boolean; data?: T; error?: Error }` allows 8 combinations, 4 of them illegal.

### `satisfies`, annotations, `as const`
```ts
type Route = { path: string; auth: boolean };
export const routes = {
  home: { path: "/", auth: false },
  admin: { path: "/admin", auth: true },
} satisfies Record<string, Route>; // checked, and keys stay known: routes.admn is an error

export const ROLES = ["admin", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number]; // "admin" | "editor" | "viewer"
export const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v);
```
`: T` widens (keys lost); `satisfies T` checks and keeps the precise type; `as const` freezes literals; `as T` only for a fact the compiler cannot see, with a comment why.

### Generics with constraints
```ts
// bad: T appears once, so it only hides `unknown`
export function logBad<T>(x: T): void { console.log(x); }

// good: T links input to output; the constraint states the requirement
export function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((it) => [it.id, it]));
}

export function createMachine<S extends string>(states: readonly S[], initial: NoInfer<S>) {
  return { states, current: initial };
}
// createMachine(["idle", "busy"], "idel"); // error: NoInfer stops "idel" widening S (TS 5.4+)
```
Every type parameter appears at least twice; constrain with `extends`; about three parameters at most; accept `readonly T[]`.

### Utility types: derive, do not duplicate
```ts
import type { LoadState } from "./load-state.js";

interface Account { id: string; email: string; name: string; createdAt: Date }
export type NewAccount = Omit<Account, "id" | "createdAt">;
export type AccountPatch = Partial<Pick<Account, "email" | "name">>;
export type StateHandlers = Record<LoadState<unknown>["status"], () => void>;
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
```
`Omit` does not check its keys (a typo keeps the field) and collapses unions (use `DistributiveOmit`); `Partial` / `Readonly` are shallow.

### Branded types
```ts
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };
export type UserId = Brand<string, "UserId">;
export type OrderId = Brand<string, "OrderId">;

export function toUserId(raw: string): UserId {
  if (!/^usr_[a-z0-9]{12}$/.test(raw)) throw new TypeError(`invalid UserId: ${raw}`);
  return raw as UserId; // the one cast, guarded by the check above
}
declare function loadOrder(id: OrderId): Promise<void>;
// loadOrder(toUserId("usr_abc123def456")); // error: UserId is not OrderId
```
Brand IDs, money in minor units and validated strings. Zod: `z.string().brand<"UserId">()`.

### Runtime validation at boundaries
```ts
import * as z from "zod";

const Env = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]),
});
export const env = Env.parse(process.env); // fail fast at startup; typed everywhere after

const CreateUser = z.strictObject({ email: z.email(), name: z.string().min(1).max(100) });
export type CreateUser = z.infer<typeof CreateUser>;

export function parseCreateUser(body: unknown):
  { ok: true; value: CreateUser } | { ok: false; error: string } {
  const r = CreateUser.safeParse(body);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: z.prettifyError(r.error) };
}
```
Valibot: `v.strictObject({ email: v.pipe(v.string(), v.email()) })`, `v.safeParse(S, body)` → `{ success, output, issues }`, `v.InferOutput<typeof S>`.
- Default: the schema library already in `package.json`; none yet → zod (valibot when client bundle size matters).
- The schema is the single source of truth: derive the type (`z.infer`), never hand-write a parallel interface.
- Validate once at the edge, pass typed values inward.

### Modules, `import type`, enums
```ts
import type { Snapshot } from "./account.js";  // erased entirely
export const Status = { Active: "active", Disabled: "disabled" } as const;
export type Status = (typeof Status)[keyof typeof Status]; // "active" | "disabled"
export const summary = (s: Snapshot, st: Status): string => `${s.name}: ${st}`;
```
- Prefer literal unions (or an `as const` object) over `enum`: enums emit runtime code, numeric enums accept any number, `erasableSyntaxOnly` rejects them. If the codebase already uses enums consistently, follow it. Never add `const enum`.
- `import { type A, b }` still emits `import { b }`; when everything is a type, write `import type`.
- `interface` for object shapes, `type` for unions/mapped types; follow the file.
- `Object.keys(o)` is `string[]` by design (extra keys may exist): iterate a `Map` or a `const` key list, do not cast.
- With `exactOptionalPropertyTypes`: `...(name === undefined ? {} : { name })`, not `name: undefined`.
- `??` not `||` when `0`, `""` or `false` are valid.

## 4. Error handling
```ts
export class HttpError extends Error {
  override readonly name = "HttpError";
  readonly status: number;
  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }
}
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export async function save(id: string, put: (id: string) => Promise<void>): Promise<Result<void>> {
  try {
    await put(id);
    return { ok: true, value: undefined };
  } catch (err: unknown) {
    if (err instanceof HttpError && err.status === 409) return { ok: false, error: "conflict" };
    throw new Error(`save ${id} failed`, { cause: err }); // keep the chain
  }
}
```
- Exceptions for bugs and unexpected failures; `Result` unions for outcomes the caller must handle (invalid, not found, conflict).
- `catch` variables are `unknown`: narrow before reading; rethrow with `{ cause }`. Throw `Error` subclasses, never strings.
- NEVER `catch {}` or log-and-continue: handle, translate, or rethrow.

## 5. Testing
Use Vitest. Only if the package already uses Jest, `node:test` or `bun test`, use that. Put `*.test.ts` next to the source.
```ts
import { describe, expect, it } from "vitest";
import { label } from "./load-state.js";

describe("label", () => {
  it("returns the error message for the error state", () => {
    expect(label({ status: "error", error: new Error("boom") })).toBe("boom");
  });
});
```
- Type tests: `*.test-d.ts` with `expectTypeOf<Role>().toEqualTypeOf<"admin" | "editor" | "viewer">()`, run by `npx vitest run --typecheck`. `// @ts-expect-error` asserts code must not compile.
- Inject dependencies and pass fakes; `vi.mock` only where injection is impossible.
- Typed fixture factories (`makeAccount(o: Partial<Account> = {}): Account`), never `as any`. Time: `vi.useFakeTimers()`, no sleeps.
- Vitest 5+ (check `npx vitest --version` and the project's `package.json`; many projects still pin v4, e.g. `^4.1.11`): `clearMocks` defaults to `true` and an un-awaited `expect(p).rejects`/`.resolves` fails the test. On v4, set `clearMocks: true` yourself (else mock history persists across tests) and un-awaited async assertions only warn, so they still silently pass — always `await` them regardless of version.

## 6. Performance
- Measure the checker first: `--extendedDiagnostics` (time, instantiations, memory), then `--generateTrace trace`.
- `skipLibCheck`, `incremental`, project references + `tsc -b` in monorepos; TS 7 `--checkers <n>` on big CI machines.
- Explicit return types on exports cut inference work and stabilise `.d.ts`.
- Prefer `interface C extends A, B` over wide intersections; avoid huge template-literal unions and deep recursive conditional types.
- Runtime: `Map` / `Set` instead of `find` / `includes` in loops (O(n²) → O(n)); no `{ ...acc, [k]: v }` in `reduce` (copies every step); independent I/O via `Promise.all`.

## 7. Security
- Types are not validation: parse every entry point (body, params, headers, env, files, third-party responses). `z.strictObject` rejects unknown keys (mass assignment); `z.object` strips them.
- Prototype pollution: never deep-merge untrusted objects into plain objects; use `Map` or a schema.
- Injection: parameterized queries or the driver's tagged templates; `encodeURIComponent` for URL segments; no `eval` / `new Function`; no `innerHTML` with untrusted strings.
- `VITE_*` / `NEXT_PUBLIC_*` variables ship to the browser: never put secrets there.
- Regexes on untrusted input: no nested quantifiers (`(a+)+`); cap input length first.

## 8. Concurrency / async
```ts
// bad: ids.forEach(async (id) => { await syncOne(id); }); — promises dropped, errors vanish

async function syncOne(id: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`https://api.example.com/items/${encodeURIComponent(id)}`, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`sync ${id}: HTTP ${res.status}`);
}

// good: bounded parallelism, timeouts, errors propagate to the caller
export async function syncAll(ids: readonly string[], signal?: AbortSignal): Promise<void> {
  const batch = 8;
  for (let i = 0; i < ids.length; i += batch) {
    await Promise.all(ids.slice(i, i + batch).map((id) => syncOne(id, signal)));
  }
}
```
- Await, return, or handle every promise (`void p.catch(report)`): unhandled rejections crash Node.
- `Promise.all` for independent work, `allSettled` when partial failure is fine; sequential `await` only for dependent steps.
- Thread an `AbortSignal` through I/O; time out external calls.
- Check-then-act across an `await` is a race: re-read state after it, or use a queue/transaction.
- Cleanup: `using` / `await using` (TS 5.2+; runs on Node 25 — check your targets) or `try/finally`.
- CPU-heavy loops block the event loop: use `worker_threads`.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `any` in params, returns, `catch` | disables checking, spreads | `unknown` + narrowing, generics |
| `JSON.parse(x) as User` | unchecked lie at the boundary | schema `.parse` / `.safeParse` |
| `value!` | crashes when the assumption breaks | narrow or `assertDefined` |
| `as unknown as T`, `@ts-ignore` | silences a real error | fix types; last resort `@ts-expect-error <reason>` |
| boolean flag soup (`isLoading`, `data?`) | illegal states representable | discriminated union |
| `switch` without `assertNever` | new variants silently unhandled | exhaustive `default` |
| `enum` / `const enum` | runtime code, not erasable | literal union / `as const` object |
| interface duplicated next to a schema | type and validation drift | `z.infer<typeof Schema>` |
| `forEach(async …)` / serial independent awaits | dropped promises / added latency | `for…of` + `await`, `Promise.all` |
| extensionless relative import under `nodenext` | fails at runtime | `./x.js` |

## 10. Review checklist
- [ ] `npx tsc --noEmit` (or `typecheck` script) passes; no new `any`, `as`, `!`, `@ts-ignore`, `eslint-disable`
- [ ] tsconfig not weakened; TypeScript/tool versions unchanged unless that was the task
- [ ] boundary inputs parsed by a schema; types derived from it
- [ ] unions handled exhaustively; no boolean-flag state
- [ ] exported functions have explicit parameter and return types
- [ ] `import type` for types; import extensions match the resolution mode
- [ ] no floating promises; independent I/O parallel; external calls time out
- [ ] errors are `Error` subclasses with `cause`, never swallowed
- [ ] new behaviour has tests that failed first; `node .agents/scripts/verify.mjs --only node` passes

## 11. References
- Handbook https://www.typescriptlang.org/docs/handbook/ · tsconfig https://www.typescriptlang.org/tsconfig/ · modules https://www.typescriptlang.org/docs/handbook/modules/theory.html
- TS 7.0 https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ · TS 6.0 https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/ · native port https://github.com/microsoft/typescript-go
- Checker performance https://github.com/microsoft/TypeScript/wiki/Performance · Node.js https://nodejs.org/api/typescript.html
- typescript-eslint https://typescript-eslint.io/getting-started/typed-linting · Biome https://biomejs.dev/
- Vitest https://vitest.dev/guide/ · type tests https://vitest.dev/guide/testing-types
- Zod https://zod.dev/ · Valibot https://valibot.dev/
- Principles: `.agents/guides/principles/` — `simplicity.md`, `error-handling.md`, `testing-strategy.md`, `security.md`, `concurrency.md`
