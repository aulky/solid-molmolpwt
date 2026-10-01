# React — engineering guide
> Scope: plain React (any bundler/router, not a meta-framework). A Next.js project also has its own guide,
> `.agents/guides/frameworks/nextjs.md` (`fw-nextjs.md`) — read that one too; it changes data fetching, routing,
> and deployment. Quick card: `.agents/rules/fw-react.md`.
> Last verified: 2026-09 — `react.dev/blog` ("React 19.3", 2026-09-09; "React v19", 2024-12-05); `registry.npmjs.org`
> dist-tags for `react` (`19.3.0`), `babel-plugin-react-compiler` (`1.0.0`), `eslint-plugin-react-hooks` (`7.1.1`),
> `@testing-library/react` (`16.3.3`). Verify exact versions against the target
> project's `package.json`/lockfile before citing a number; this file only establishes "current" as of 2026-09.

## 1. Mental model / philosophy
- A component is a plain function of its props/state returning a UI description (JSX → `React.createElement`
  calls). Unlike Solid's fine-grained signals, **the whole function body re-runs on every re-render** — nothing
  persists between renders except what you explicitly keep in `useState`/`useRef`/a store.
- React reconciles: it diffs the newly returned tree against the previous one (by type and `key`) and patches only
  the real DOM nodes that changed. Identity (`key`, object/array references) drives correctness and performance,
  not just aesthetics.
- State flows one way, down through props; behavior flows up through callbacks. When two siblings need the same
  state, lift it to their nearest common ancestor — never synchronize two copies with an effect.
- KISS default: derive what you can from existing props/state as a plain expression during render. Reach for
  `useEffect` only to synchronize with something *outside* React (the DOM, a subscription, a timer) — not to
  compute a value. Reach for `useMemo`/`useCallback`/`React.memo` only once profiling shows a specific re-render is
  expensive, or let the React Compiler do it (§6).

## 2. Project structure & tooling
### Release status (verified 2026-09 — re-check the target project's lockfile before trusting this)
- **React 19.x is current**; `react.dev`'s latest dated release post is "React 19.3" (2026-09-09), and npm's
  `latest` dist-tag for `react`/`react-dom` was `19.3.0` at verification time. React 19 (Dec 2024) introduced
  `use()`, Actions (`useActionState`, `useOptimistic`, `<form action>`), `useFormStatus`, `ref` as a plain prop (no
  `forwardRef` needed), and ref cleanup functions; 19.3 stabilized `<ViewTransition>` and Fragment refs. Never
  assume a 19.3-only API exists in an older 19.x install — read `node_modules/react/package.json`'s `version` first.
- **React Compiler is stable** (`babel-plugin-react-compiler` npm `latest` = `1.0.0`). It auto-memoizes components
  and values that need it, targeting React 17/18/19 (19 recommended). Its ESLint rules are bundled into
  `eslint-plugin-react-hooks`'s `recommended-latest` config (verified `latest` = `7.1.1`) — worth adding even
  without the compiler enabled, for the Rules-of-Hooks checks alone.
- React itself is unopinionated about routing, data fetching, and bundling — that's the bundler's job (commonly
  Vite + `@vitejs/plugin-react`) and the libraries chosen (React Router/TanStack Router; TanStack Query/SWR). A
  project on Next.js, Remix, or Astro follows that framework's own guide instead.

### Commands (defaults — use the project's own `package.json` scripts and lockfile-detected package manager first)
Prefer the project's own scripts (`<pm> run dev/build/test/lint`). Fallbacks if a script is missing: type-check
`npx tsc --noEmit`, lint `npx eslint .`, unit tests `npx vitest run`, e2e `npx playwright test`. All four work
unchanged on PowerShell and POSIX (no shell-specific operators). This kit: `node .agents/scripts/verify.mjs --only
node`. Detect the package manager from the lockfile (`package-lock.json`→npm, `pnpm-lock.yaml`→pnpm, `yarn.lock`→
yarn, `bun.lock`→bun) — never invent one.

### Project shape (typical, non-meta-framework)
- `src/main.tsx` — the one place that calls `createRoot(document.getElementById("root")!).render(<App />)`;
  nothing else touches the DOM root directly.
- `src/routes/` or `src/pages/` (if a router is used) holds route components; `src/components/` holds reusable,
  routing-agnostic ones; co-locate `Thing.test.tsx` next to `Thing.tsx`.
- `src/lib/` or `src/api/` for framework-agnostic data access (fetch wrappers, query hooks) — separate from
  components so both are independently testable.
- Client-exposed env vars are bundler-specific and **public** (Vite: only `import.meta.env.VITE_*`) — never put a
  secret behind that prefix. Server-only secrets belong in a real backend (`fw-node-server.md`, `fw-fastapi.md`,
  `fw-laravel.md`) — plain React has no server half by itself.

### Deployment
- Plain React ships no server of its own: the bundler produces a static build (commonly `vite build` → `dist/`)
  deployable to any static host/CDN — there is no Node process to run for the client bundle itself.
- Env vars are baked into that build **at build time**, not read at request time — a multi-environment deploy needs
  either a separate build per environment or a small runtime-config file/`<meta>` tag fetched after load.
- A server API, SSR, or file-based routing needs a meta-framework (`fw-nextjs.md`, `fw-astro.md`) or a separate
  backend (`fw-node-server.md`, `fw-fastapi.md`, `fw-laravel.md`) — each owns its own deployment specifics.

## 3. Core idioms
### Hooks run in a fixed order — never call one conditionally
```tsx
// bad: the second useState is skipped whenever `skip` is true, shifting every hook after it
function Bad({ skip }: { skip: boolean }) {
  const [a, setA] = useState(0);
  if (!skip) { const [b, setB] = useState(0); } // conditional hook call
  const [c, setC] = useState(0);
  return <span>{a + c}</span>;
}

// good: call every hook unconditionally; put the condition on how the value is used
function Good({ skip }: { skip: boolean }) {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const effectiveB = skip ? null : b;
  const [c, setC] = useState(0);
  return <span>{a + (effectiveB ?? 0) + c}</span>;
}
```
Hooks are matched to their state by the order they're called in, every render, with no exceptions for early
returns, loops, or conditionals. `eslint-plugin-react-hooks` catches this statically — treat a violation as a bug,
not a lint nit to suppress.

### Derive state during render — "you might not need an effect"
```tsx
// bad: an effect that exists only to keep `fullName` in sync with `first`/`last`
function BadName({ first, last }: { first: string; last: string }) {
  const [fullName, setFullName] = useState("");
  useEffect(() => { setFullName(`${first} ${last}`); }, [first, last]);
  return <p>{fullName}</p>;
}
// good: a plain expression, computed fresh every render — no effect, no extra state, no stale-frame bug
function GoodName({ first, last }: { first: string; last: string }) {
  return <p>{`${first} ${last}`}</p>;
}
```
Reach for `useMemo` only once the computation is measured expensive (a large sort/filter). An effect is for
synchronizing with something outside React's render — the DOM, a subscription, `document.title` — never for
computing a value another piece of state depends on.

### Actions: submit and track an async mutation without hand-rolled loading state
```tsx
import { useActionState } from "react";

function ProfileForm({ updateName }: { updateName: (name: string) => Promise<string | null> }) {
  const [error, submitAction, isPending] = useActionState(async (_prev: string | null, formData: FormData) => {
    return updateName(formData.get("name") as string); // returns an error string, or null on success
  }, null);

  return (
    <form action={submitAction}>
      <input name="name" disabled={isPending} />
      <button type="submit" disabled={isPending}>Save</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```
`useActionState(action, initialState)` wraps an async function, returning `[state, dispatch, isPending]` — it
manages pending/error/form-reset for you. `useOptimistic(value)` shows a provisional value immediately and reverts
if the action throws — use it when the UI should update before the action settles. `useFormStatus()` reads the
nearest parent `<form>`'s pending status from a child component without prop drilling — put it in a reusable
`<SubmitButton>`, not the form's own top-level component (which cannot see its own form's status).

### `use()`: read a promise or context conditionally
```tsx
import { use } from "react";
function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  const comments = use(commentsPromise); // suspends until the promise resolves
  return <ul>{comments.map((c) => <li key={c.id}>{c.text}</li>)}</ul>;
}
// wrap the caller: <Suspense fallback={<Spinner />}><Comments commentsPromise={fetchComments()} /></Suspense>
```
`use()` is not a hook in the Rules-of-Hooks sense — it may be called inside a conditional or after an early
`return`. It reads a promise (suspending the nearest `<Suspense>`) or a context value. Never create the promise
during render on every call (`use(fetch(...))` inline) — pass one created once (a cache, a loader, `useMemo`), or
the fetch refires every render.

### Keys: identity for the reconciler, not a rendering label
```tsx
// bad: index key — inserting/removing a row reuses the wrong slot's mounted state
{items.map((item, i) => <Row key={i} item={item} />)}
// good: a stable id from the data survives reorder/insert/delete correctly
{items.map((item) => <Row key={item.id} item={item} />)}
```
Index keys are acceptable only for a list that is static and never reorders, filters, or has rows inserted/removed
— anything else risks state (an open `<details>`, an input's cursor) sticking to the wrong row.

### Lifting state up, and context for values many components read
```tsx
// two siblings need the same value: lift it to the parent instead of syncing two useState calls
function Parent() {
  const [query, setQuery] = useState("");
  return (<><SearchBox query={query} onChange={setQuery} /><ResultsList query={query} /></>);
}
```
Reach for `createContext`/`useContext` once a value is needed at several nesting depths — not as a default for two
adjacent siblings, where a prop is simpler to trace. Split a context by what changes together: one
`{ user, theme, cart }` context re-renders every consumer on any field change; narrower contexts (or a memoized
`value`) let each consumer subscribe to only what it reads.

### Suspense and ErrorBoundary: the two boundaries around async/failing work
```tsx
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary"; // React ships no hook/function API for this — class-only

<ErrorBoundary fallback={<ErrorScreen />}>
  <Suspense fallback={<Spinner />}><Comments commentsPromise={commentsPromise} /></Suspense>
</ErrorBoundary>
```
`<Suspense>` shows `fallback` while any descendant reading a pending resource (`use()`, `lazy()`, a
Suspense-integrated data library) isn't ready. `<ErrorBoundary>` catches a thrown render error (including a
rejected `use()` promise) in its subtree; React still requires a class component for this — no hook equivalent
exists — so use `react-error-boundary`'s component rather than writing one from scratch.

### Controlled vs. uncontrolled forms
```tsx
// controlled: React state is the source of truth every keystroke — for live validation/masking/mirroring
const [value, setValue] = useState("");
<input value={value} onChange={(e) => setValue(e.target.value)} />
// uncontrolled: the DOM owns the value; read it at submit via FormData — fewer re-renders, less code
<form action={action}><input name="value" /><button type="submit">Go</button></form>
```
Default to uncontrolled + `<form action>`/`FormData` for a plain submit-and-validate-on-submit form; reach for
controlled inputs only for live validation, masking, or mirroring the value elsewhere on every keystroke.

## 4. Error handling
- Render/child errors: `<ErrorBoundary>` (§3). It does not catch errors in event handlers, async code, or its own
  render — wrap those in a `try/catch` and set error state, or surface them through the Action's error slot.
- An Action's thrown error becomes the state `useActionState` returns — check it, don't let it propagate silently.
- Never swallow a fetch/mutation rejection with an empty `catch {}`; render it or rethrow with added context.
- Effect and ref cleanup functions run on unmount/re-run — an effect that subscribes without a matching cleanup
  leaks the subscription on every re-run.

## 5. Testing
Default: Vitest + `@testing-library/react` (verified `latest` = `16.3.3`, supports React 19) + jsdom. Escape hatch:
Jest if the project already uses it — same testing-library API either way.
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Counter } from "./Counter";

describe("Counter", () => {
  it("increments on click", () => {
    render(<Counter start={0} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("1");
  });
});
```
- Query by role/label/text (`getByRole`, `getByLabelText`) — never by CSS class; it mirrors what a user/assistive
  tech perceives and survives markup refactors.
- `renderHook` tests a hook in isolation without a host component.
- Use manual `act(() => ...)` only on a "not wrapped in act" warning — it usually means an assertion ran before a
  pending state update flushed, not that every update needs wrapping.
- E2E: Playwright (or Cypress). Locate by role/label/text, not utility classes; no hard sleeps — use auto-retrying
  assertions.

## 6. Performance
- **Profile before memoizing.** React DevTools' Profiler shows which component actually re-rendered and why; add
  `useMemo`/`useCallback`/`React.memo` there, not preemptively everywhere.
- **The React Compiler removes most manual memoization work** once enabled (stable) — it inserts the equivalent
  automatically for components following the Rules of Hooks without escape-hatch mutation. Verify it's actually
  configured (babel/Vite config, not just installed) before relying on it.
- **Deep, broad rules — defer to the installed skill**, `vercel-react-best-practices`
  (`.agents/skills/vercel-react-best-practices/`): 70 rules across waterfalls, bundle size, server-side, client
  fetching, re-renders, rendering, JS micro-perf. Load it rather than re-deriving those rules here.
- List virtualization: render only visible rows for a long list (`@tanstack/react-virtual`, `react-window`) — a
  full render of thousands of nodes is the most common "why is this slow" report that isn't a missing memo.
- `useTransition`/`startTransition` marks an update as low-priority so the UI stays responsive while it (and any
  `<Suspense>` it triggers) resolves in the background; `useDeferredValue` does the same for a value whose setter
  you don't control.

## 7. Security
- JSX text interpolation (`{value}`) is escaped by default — the injection surface is `dangerouslySetInnerHTML`.
  Never pass unsanitized input to it; sanitize with a library (DOMPurify) first if HTML rendering is required.
- Resolving a component/tag from a variable (a "dynamic component" pattern) is a code-execution surface if that
  variable can come from user input — only allow developer-controlled references or an explicit allowlist.
- Client-exposed env vars (`import.meta.env.VITE_*`, or any bundler's public-prefix convention) ship inside the
  bundle — treat them as public, never a secret.
- An Action still runs client-side in plain React — it is not a trust boundary by itself. Real
  authorization/validation must happen on whatever server it calls; never rely on a disabled button as the only
  gate (see the relevant backend framework pack).
- React 19.3 stopped coercing DOM-bound values to strings before passing them to DOM injection sinks, so a
  `TrustedHTML`/`TrustedScript` object your sanitization policy creates is now passed through and validated by the
  browser correctly under a `require-trusted-types-for 'script'` CSP, instead of being silently turned into a
  plain string the browser then rejects.

## 8. Concurrency / async
- Since React 18, state updates are **automatically batched** everywhere — multiple `setState` calls in one tick
  produce one re-render, not one per call.
- Concurrent rendering means React can start, pause, and discard a render before committing it — an in-progress
  render must stay pure (no side effects, no ref mutation) since it might never commit.
- `<StrictMode>` double-invokes component bodies and effects in development (mount → cleanup → mount) to surface
  non-idempotent code — don't remove it to silence the double log; fix the effect's cleanup instead.
- A resource whose input can change mid-flight (a search box driving a fetch) needs its own race handling: thread
  an `AbortSignal` through and ignore a stale response — React does not do this for a hand-rolled effect-fetch.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| Hook in `if`/loop/after `return` | breaks hook-to-state matching | call every hook unconditionally at the top |
| Effect mirroring a derivable value | extra render, stale frame | plain `const`, or `useMemo` if expensive |
| `key={index}` on a reorderable list | stale state on the wrong row | `key` = a stable id from the data |
| Memo added without profiling | dependency array upkeep, no gain | profile first, or enable React Compiler |
| `state.items.push(x)` / `obj.field = v` | ref unchanged → update dropped | `setState(prev => [...prev, x])` |
| Effect-fetch + manual loading/error | no dedup/cancel/cache | data library or loader under `<Suspense>` |
| Literal as a prop/context value | new identity every render | hoist it, or `useMemo` |
| `dangerouslySetInnerHTML={{__html:userInput}}` | HTML/script injection | sanitize (DOMPurify) or plain interpolation |
| Removing `<StrictMode>` to silence logs | hides a real non-idempotent effect | fix the effect's cleanup |
| Disabled button as the only validation gate | trivially bypassed client-side | authorize on the server the Action calls |

## 10. Review checklist
- [ ] no hook called conditionally, in a loop, or after an early `return`
- [ ] no `useEffect` exists only to derive/mirror a value computable during render
- [ ] every list `key` is a stable id, not the array index, for any reorderable/filterable list
- [ ] memoization present only where profiling justified it, or the React Compiler is enabled for this project
- [ ] no direct mutation of state/props; every update produces a new object/array
- [ ] async work goes through Actions or a Suspense-integrated data library, not a bare effect + loading boolean,
      unless the diff notes a specific reason
- [ ] every thrown/rejected error is handled (`<ErrorBoundary>`, Action error state) — nothing swallowed
- [ ] no `dangerouslySetInnerHTML` fed with unsanitized input; no user-controlled dynamic component resolution
- [ ] no secret in a client-exposed env var; server-side authorization exists for every mutation
- [ ] new/changed behavior has a `@testing-library/react` test querying by role/label/text; typecheck, lint, test
      (or `node .agents/scripts/verify.mjs --only node`) pass

## 11. References
- Docs home https://react.dev/ · Rules of Hooks https://react.dev/reference/rules/rules-of-hooks · "You Might Not
  Need an Effect" https://react.dev/learn/you-might-not-need-an-effect · rendering/keys
  https://react.dev/learn/rendering-lists · thinking in React https://react.dev/learn/thinking-in-react
- React 19 https://react.dev/blog/2024/12/05/react-19 · React 19.3 https://react.dev/blog/2026/09/09/react-19-3 ·
  React Compiler https://react.dev/learn/react-compiler (install: https://react.dev/learn/react-compiler/installation)
- `useActionState` https://react.dev/reference/react/useActionState · `useOptimistic`
  https://react.dev/reference/react/useOptimistic · `useFormStatus`
  https://react.dev/reference/react-dom/hooks/useFormStatus · `use` https://react.dev/reference/react/use
- Testing https://testing-library.com/docs/react-testing-library/intro/ · Playwright https://playwright.dev/
- Performance (deep, load on demand): `.agents/skills/vercel-react-best-practices/SKILL.md` (70 rules, Vercel
  Engineering) · Compiler working group https://github.com/reactwg/react-compiler
- Principles: `.agents/guides/principles/simplicity.md`, `error-handling.md`, `testing-strategy.md`, `security.md`,
  `performance.md`
