# SolidJS — engineering guide
> Scope: the Solid reactivity/component layer (signals, stores, control flow, testing). SolidStart routing/data/SSR
> is separate: `.agents/guides/frameworks/solid-start.md`. Quick card: `.agents/rules/fw-solidjs.md`.
> Last verified: 2026-09 — installed `node_modules/solid-js@1.9.14` types and `package.json` of a SolidStart 2 project, npm
> `dist-tags` for `solid-js` (§11), `docs.solidjs.com` and `github.com/solidjs/solid` releases/discussions (2.0-rc).

## 1. Mental model / philosophy
- No virtual DOM, no re-render. A component is a function called **once**; it returns real DOM nodes wired
  directly to signals by the compiler (`vite-plugin-solid`/`babel-preset-solid`). Only reactive expressions re-run.
- Reactivity is a property of *where you read*, not the value itself: `createSignal` returns a getter/setter pair;
  calling the getter inside a tracking scope (a JSX expression, `createMemo`, `createEffect`) subscribes to it.
  Read it anywhere else and you get a value, not a subscription.
- Ownership tree, not component tree: component setup (and `createRoot`) creates an *owner* that parents every
  signal/effect/`onCleanup` created during it. Disposing the owner disposes everything under it — this is what
  makes `onCleanup`, context, and `<Show>`/`<For>` branch teardown work.
- Writes push synchronously (mark stale); effects/memos pull (recompute) once per flush, deduplicated. Writes
  inside event handlers, effects, and lifecycle callbacks are auto-batched.
- KISS: default to a plain derived function; add `createMemo` only once a derivation is expensive **and** shared —
  caching a value nobody re-reads is pure overhead.

## 2. Project structure & tooling
### Release status (verified 2026-09 via npm dist-tags for `solid-js`/`@solidjs/signals` + the official "Solid 2.0
RC: The Big Reveal" announcement, `github.com/solidjs/solid` discussion #2995 — re-check the lockfile first)
- The reference project pinned the **1.9.x stable line** (`solid-js ^1.9.14`); npm's `latest` dist-tag is `1.9.15`. **Solid 2.0
  is release-candidate only** (`next` dist-tag `2.0.0-rc.11`) — no stable 2.0 exists. Everything below documents
  the **1.9.x stable API**; do not use it as a source for 2.0 code.
- 2.0 is a ground-up rewrite, not a drop-in bump — and it removes or renames several APIs this guide documents:
  the reactive core moves to a separate `@solidjs/signals` package and stores fold from `solid-js/store` into
  `solid-js` itself; `createResource`, `batch`, `startTransition`/`useTransition`, `on`, `createComputed`,
  `produce`, and `createMutable` are **gone** (async flows through plain memos; effects split into a
  `compute`/`apply` pair; store setters hand you a mutable draft directly); `<Suspense>`/`<ErrorBoundary>`/
  `<SuspenseList>` become `<Loading>`/`<Errored>`/`<Reveal>`; `<Index>` folds into `<For>`'s keying modes (a new
  `<Repeat>` component takes over Index's count-based-render use case). None of
  this exists in the installed 1.9.14. Re-check `node_modules/solid-js/package.json`'s `version` and
  https://github.com/solidjs/solid/discussions/2995 before writing anything 2.0-shaped, and never backport a 2.0
  name (`Loading`, `Errored`, `Reveal`, a draft-mutating store setter) into 1.9.x code.
- Packages here: `solid-js` (core), `solid-js/store` (stores), `solid-js/web` (DOM renderer: `Portal`, `Dynamic`,
  `hydrate`, `isServer`), `@solidjs/router`, `@solidjs/start` (SolidStart guide).
- The compiler, not a runtime `createElement`, turns JSX into DOM calls: JSX files must be `.tsx`/`.jsx`;
  `tsconfig.json` needs `"jsxImportSource": "solid-js"`; attributes follow **DOM** conventions, not
  React's (§3, "class not className").

### Commands
Full list + package-manager notes: root `AGENTS.md`. Solid-relevant ones, typically: typecheck (`tsc --noEmit`),
unit tests (`vitest run`), e2e (`playwright test`), `node .agents/scripts/verify.mjs --only node`.

### Project shape (reference SolidStart layout — the project's root `AGENTS.md` is authoritative)
- `src/app.tsx` is the single place that mounts routing (`<Router>` + `<Nav/>` + `<Suspense>` + `<FileRoutes/>`);
  ordinary components never import router pieces directly.
- `src/entry-client.tsx` / `src/entry-server.tsx` are hydration/SSR entry points — nothing they import may touch
  `window`/`document` at module scope, since `entry-server.tsx` also runs in Node.
- `src/routes/*.tsx` is SolidStart's file-route tree (routing/loaders/actions: `guides/frameworks/solid-start.md`).
  `src/components/*.tsx` holds plain, routing-agnostic components — just functions. Co-locate `Thing.test.tsx`
  next to `Thing.tsx`.
- Deployment: SolidStart's Nitro build (build script → `.output/`, then the start script) decides the deployable
  shape (Node server, edge, static) — that configuration lives in the SolidStart guide, not here.

## 3. Core idioms
### Signals: call to read, setter to write
```tsx
import { createSignal } from "solid-js";

// bad: `count` is the function ref, not its value — never updates
function BadCounter() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}

// good: () invokes the getter in the tracked JSX expression and in the updater
function Counter() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount((c) => c + 1)}>{count()}</button>;
}
```
`createSignal(initial, options?)` returns `[Accessor<T>, Setter<T>]`. Prefer the updater form when the next value
depends on the current one — a closed-over read can be stale across a `batch`.

### Derived values: a plain function first, `createMemo` only when it earns its keep
```tsx
const fullName = () => `${first()} ${last()}`;             // recomputed on every read; fine for cheap work
const sorted = createMemo(() => [...items()].sort(cmp));   // cached; recomputes once per dependency change
```
Default to a function; reach for `createMemo` only when expensive **and** shared. A memo's function must be pure —
no writes to other signals inside it (that belongs in an effect).

### `createEffect` is for side effects only — never for deriving state
```tsx
// bad: derives one signal from another via an effect — extra tick, self-loop risk
function badDoubled(count: () => number) {
  const [doubled, setDoubled] = createSignal(0);
  createEffect(() => setDoubled(count() * 2));
  return doubled;
}

// good: derive with a function/memo; keep createEffect for its actual side effect
function goodDoubled(count: () => number) {
  const doubled = () => count() * 2;
  createEffect(() => { document.title = `Count: ${count()}`; });
  return doubled;
}
```
Effects run after the DOM commits (`useLayoutEffect` timing, not `useEffect`); use `onMount`/a ref for
first-render-only DOM reads. An effect writing the signal it reads will loop unless that read is `untrack`ed.

### Components run once — never destructure props
```tsx
// bad: reads props.name once at call time; a later change is invisible to this closure
function Greeting({ name }: { name: string }) {
  return <p>Hi {name}</p>;
}

// good: props is a reactive accessor object — read props.x where used
function Greeting(props: { name: string }) {
  return <p>Hi {props.name}</p>;
}

// defaults / renaming / forwarding without losing reactivity
import { mergeProps, splitProps } from "solid-js";
function Button(props: { label: string; variant?: "primary" | "ghost" }) {
  const merged = mergeProps({ variant: "primary" as const }, props);
  const [local, rest] = splitProps(merged, ["label", "variant"]);
  return <button class={local.variant} {...rest}>{local.label}</button>;
}
```
No re-render means a destructured `name` is frozen at the first call. `mergeProps` supplies defaults;
`splitProps` partitions props without breaking the underlying accessor.

### Control flow: JSX has no re-render, so inline `&&` / `.map()` never react again
```tsx
// bad: this JS runs once, during setup; toggling `ok()`/mutating `items()` later changes nothing on screen
{ok() && <Banner />}
{items().map((it) => <Row item={it} />)}

// good
import { Show, For, Index, Switch, Match } from "solid-js";
<Show when={ok()}><Banner /></Show>
<For each={items()}>{(it) => <Row item={it} />}</For>
```
- `<For each>` keys by **reference/identity** — best when the whole array is replaced (fresh server data).
  `<Index each>` keys by **position** — best for primitives or in-place mutation. Wrong choice either re-mounts
  every row needlessly, or shows stale content under a reused slot.
- `<Switch>`/`<Match>` reads better than nested `<Show>` for 3+ mutually exclusive branches.
- `<ErrorBoundary fallback={(err, reset) => ...}>` catches render/child errors in its subtree (§4).
- `<Portal>`/`<Dynamic>` come from **`solid-js/web`** — unlike `Show`/`For`/`Index`/`Switch`/`Match`/`Suspense`/
  `SuspenseList`/`ErrorBoundary`, which live in core `solid-js` (verified: `types/render/flow.d.ts`).

### Events: delegation and the `on:` escape hatch
Solid attaches common DOM events (`onClick`, `onInput`, …) once at the document root and dispatches by bubbling —
delegation, not one listener per element. `on:eventname={handler}` attaches a real listener directly on that
element. Reach for `on:` only for a non-delegated event name, one that doesn't bubble, or a listener needing a
specific phase relative to a non-Solid script; default to the plain `onClick`-style prop otherwise.

### Refs, `onMount`, `onCleanup`
```tsx
import { onMount, onCleanup } from "solid-js";
function Chart() {
  let el!: HTMLDivElement;
  onMount(() => {
    const ro = new ResizeObserver(() => draw(el));
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });
  return <div ref={el} />;
}
```
`ref={el}` runs synchronously during render, before `onMount` — the element exists but may not be attached to the
document yet, so do layout reads (`getBoundingClientRect`, focus) inside `onMount`. A callback-ref also works and
is required to merge more than one ref onto an element. `onCleanup` runs on owner disposal — unmount, or a
`<Show>`/`<For>` row going away.

### Stores: `createStore`, and never mutate the proxy directly
```tsx
import { createStore, produce, reconcile } from "solid-js/store";

const [state, setState] = createStore({ todos: [{ id: 1, text: "a", done: false }] });

// bad: mutates the wrapped object directly — the tracked path is never notified, DOM stays stale
state.todos.push({ id: 2, text: "b", done: false });
state.todos[0].done = true;

// good: path-based setter (a predicate matches a row), or `produce` for imperative-looking edits
setState("todos", (t) => t.id === 1, "done", true);
setState("todos", produce((t) => { t.push({ id: 2, text: "b", done: false }); }));
setState("todos", reconcile(freshArrayFromServer)); // diff-merge; keeps identity of unchanged rows
```
`createStore(initial)` returns `[Store<T>, SetStoreFunction<T>]`. Reads through the proxy are fine-grained-tracked;
every write must go through `setState` — a path (an array predicate as one segment, verified in
`store/types/store.d.ts`'s `Part`/`ArrayFilterFn` types), an updater function, or `produce`. `unwrap(state)`
returns the plain, non-reactive snapshot (`JSON.stringify`, sending to a server) — never feed it back into a
signal expecting reactivity. `reconcile` diffs a whole new payload instead of replacing it, so unrelated `<For>`
rows don't re-mount. `createMutable` gives a directly-mutable proxy — prefer `createStore` unless wrapping a
mutation-heavy external library.

### Context: provide a reactive value, not a snapshot
```tsx
import { createContext, useContext, createSignal, type ParentComponent } from "solid-js";
const CountCtx = createContext<() => number>(() => 0);
const CountProvider: ParentComponent = (props) => {
  const [count] = createSignal(0);
  return <CountCtx.Provider value={count}>{props.children}</CountCtx.Provider>;
};
const useCount = () => useContext(CountCtx); // caller still calls useCount()()
```
Provide the accessor itself (or a `[get, set]` tuple, or a store) — a value read once at Provider-render time
freezes like a destructured prop.

### Data fetching: `createResource`, and the router's `createAsync` in routed apps
```tsx
import { createResource, Suspense } from "solid-js";
const [user] = createResource(userId, (id) => fetch(`/api/users/${id}`).then((r) => r.json()));
// user() is the data (undefined while pending); user.loading; user.error; user's paired refetch()/mutate() actions
<Suspense fallback={<Spinner />}>{user()?.name}</Suspense>
```
`createResource(source, fetcher, options?)` (or `createResource(fetcher, options?)` with no source) re-runs the
fetcher whenever `source` changes; return `false`/`null`/`undefined` from `source` to skip. It integrates with
`<Suspense>` and returns `[resource, { mutate, refetch }]` (verified: `reactive/signal.d.ts`). In a SolidStart
route, prefer `@solidjs/router`'s `createAsync`/`query` over hand-rolled `createResource` — the router dedupes it
across client/server. Full pattern: `guides/frameworks/solid-start.md`.

### `batch` and `untrack`
```tsx
import { batch, untrack } from "solid-js";
function applyBoth() {
  batch(() => { setFirst("A"); setLast("B"); }); // one update cycle instead of two
}
createEffect(() => {
  console.log(count());                     // tracked: reruns when count() changes
  const snapshot = untrack(() => config());  // read without subscribing
});
```
Writes inside event handlers, effect bodies, and lifecycle callbacks are already auto-batched; explicit `batch`
matters for writes issued from *outside* those (e.g. a callback after an `await`).

### No React, ever
Never `import ... from "react"`, and never write `useState`/`useEffect`/`useMemo`/`useRef` — no hook dispatcher
exists here. Verified against `types/index.d.ts`: the only `use*` exports are `useContext`/`useTransition`, both
consuming Solid's own machinery, not a React-style hook system.

## 4. Error handling
- Render-time or child errors: wrap the subtree in `<ErrorBoundary fallback={(err, reset) => <Fallback error={err}
  retry={reset} />}>`. Calling `reset()` re-renders the children — useful after a retryable failure.
- Imperative code outside JSX: `catchError(fn, onError)` scopes catching without an `<ErrorBoundary>` (`catchError`
  is current; `onError` is deprecated but still exported).
- A `createResource` fetcher's rejection surfaces as `resource.error` and re-throws into the nearest
  `<ErrorBoundary>` when read inside `<Suspense>` — check `resource.error` first for an inline error UI instead.
- Never swallow a thrown error with an empty `catch {}`: render via `ErrorBoundary`/`resource.error`, or rethrow
  with context.

## 5. Testing
Unit: `@solidjs/testing-library` (`^0.8.10`) + Vitest (`vitest run`), jsdom — this is `docs.solidjs.com`'s own
recommended pairing, and the reference setup's choice.
```tsx
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Counter } from "./Counter";

describe("Counter", () => {
  it("increments on click", async () => {
    render(() => <Counter start={0} />);
    await fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("1");
  });
});
```
- `render()` takes a **function returning JSX** (`() => <Counter />`), not a rendered element — Solid needs to own
  the reactive root. Never re-`render` with new props to simulate an update (a React idiom) — Solid components
  don't re-render on prop change; drive the component's own signal/setter, or toggle a `<Show>`.
- Testing a signal/store module with no DOM: wrap it in `createRoot((dispose) => { ...; dispose(); })` so effects
  get an owner and are cleaned up — one with no owner logs a dev warning and leaks.
- E2E: Playwright (reference setup: `@playwright/test ^1.63.0`, Chromium only). Locate by role/label/text, not
  Tailwind classes (they churn); no hard sleeps, use `toBeVisible()`-style auto-retrying assertions. If the config
  reuses a server already listening on its port (dev port: root `AGENTS.md`), stop a running dev server first.

## 6. Performance
- Prefer `<Index>` over `<For>` for large lists of primitives or in-place-mutated objects — `<For>`'s
  reference-keying re-mounts every row when the array is rebuilt immutably, even if one field changed.
- Keep a hot signal read close to the DOM leaf that uses it; lift into `createMemo` only once measured expensive
  **and** shared by more than one reader.
- Prefer `reconcile` over wholesale array/object replacement when patching a store from a poll or websocket.
- Lazy-load route-level or rarely-shown components: `lazy(() => import("./Heavy"))` behind `<Suspense>`.
- Avoid creating a signal/memo inside a `<For>`/`<Index>` callback per item unless it genuinely needs owned
  state — it multiplies owner/cleanup cost for no benefit over reading the row's prop directly.
- No virtual-DOM diff cost to fight; a "why is this slow" report is almost always a missing memo on a real
  hotspot, or an accidental non-reactive read (destructured prop, untracked signal) — check §3 first.

## 7. Security
- Solid does not auto-escape `innerHTML`-style props: `<div innerHTML={untrustedString} />` injects raw HTML
  verbatim. Never pass user input to them; plain JSX text interpolation (`{value}`) is escaped by default.
- `<Dynamic component={Comp}>` (or any tag name resolved from a variable) is a code-execution surface if that
  variable can come from user input — only pass developer-controlled references or an explicit allowlist.
- SSR (`entry-server.tsx`, SolidStart server code): the same rule applies — never string-concatenate user input
  into a raw HTML string on the server.
- Vite's client-exposed env vars (`import.meta.env.VITE_*`) ship inside the browser bundle — never put secrets
  there; server-only secrets stay unprefixed, read only from server-only files (SolidStart guide).

## 8. Concurrency / async
- Effects/resources run on Solid's own scheduler, not `requestAnimationFrame`/microtask ordering you control —
  read `document` state inside an effect or `onMount`, never assume it reflects a write right after a setter call.
- `startTransition(fn)` / `useTransition()` mark writes as low-priority: the UI stays interactive while `<Suspense>`
  boundaries below resolve. Use it around a write that triggers a resource/route change, not ordinary updates.
- Two writes racing into the same store field are last-write-wins — no automatic merge. Sequence dependent writes
  with `await`; for a resource whose `source` can change mid-flight, thread an `AbortSignal` through the fetcher.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `{cond && <X/>}`, `list.map(fn)` in JSX | runs once, never reacts again | `<Show when>`, `<For>`/`<Index>` |
| `const { x } = props` | frozen at first call | read `props.x` directly; `splitProps`/`mergeProps` |
| `createEffect` computing another signal | extra tick, loop risk | plain function, or `createMemo` if shared |
| `store.items.push(x)` / `arr[i].field = v` | proxy bypassed, DOM stale | `setStore("items", updater, ...)`, `produce(...)` |
| `className` / `htmlFor` | not Solid's attribute names | `class` / `for` |
| passing `count()` into a prop | hands a frozen value | pass the signal itself: `<Child count={count} />` |
| `import { useState } from "react"` | no such runtime here | `createSignal`/`createEffect`/`createMemo` |
| `innerHTML={userInput}` | HTML injection | text interpolation `{value}`; sanitize if HTML needed |
| `render(<Counter />)` in a test | passes an element, not a root | `render(() => <Counter />)` |
| signal/memo in a callback/`if`/loop | no owner → leak | create only during component/`createRoot` setup |

## 10. Review checklist
- [ ] no destructured props; `props.x` read directly (or reshaped via `splitProps`/`mergeProps`)
- [ ] every signal read is invoked (`count()`), including reads passed down as props
- [ ] no `createEffect` derives a value another signal depends on — plain function or `createMemo` instead
- [ ] all conditional/list JSX uses `Show`/`For`/`Index`/`Switch`+`Match` — no inline `&&`, ternary-JSX, `.map()`
- [ ] every store write goes through `setStore` (path, predicate, updater, or `produce`) — no direct proxy mutation
- [ ] `class`/`for`, not `className`/`htmlFor`; `Portal`/`Dynamic` imported from `solid-js/web`
- [ ] no `react` import, no `use*` React hook
- [ ] fetch/render failures handled via `resource.error` or `<ErrorBoundary>` — nothing swallowed
- [ ] no `innerHTML`/`textContent` fed with untrusted input; no user-controlled `<Dynamic component>`
- [ ] new/changed behavior has a testing-library test using `render(() => <X/>)`; the project's typecheck,
      lint, and test commands (or `verify.mjs --only node`) pass

## 11. References
- Docs https://docs.solidjs.com/ · reactivity https://docs.solidjs.com/concepts/intro-to-reactivity · props
  https://docs.solidjs.com/concepts/components/basics · control flow
  https://docs.solidjs.com/concepts/control-flow/conditional-rendering (Show/Switch/Match),
  https://docs.solidjs.com/concepts/control-flow/list-rendering (For/Index) · stores https://docs.solidjs.com/concepts/stores
  · context https://docs.solidjs.com/concepts/context
- `createResource` https://docs.solidjs.com/reference/basic-reactivity/create-resource · testing guide
  https://docs.solidjs.com/guides/testing (Vitest + `@solidjs/testing-library`, the reference setup)
- Source & releases https://github.com/solidjs/solid — types verified against installed `solid-js@1.9.14`. 2.0
  status verified via npm dist-tags (`latest` `1.9.15`, `next` `2.0.0-rc.11`) and GitHub Releases/Discussions.
- `@solidjs/testing-library` https://github.com/solidjs/solid-testing-library · Playwright https://playwright.dev/
- SolidStart (routing/data/SSR/deployment): `.agents/guides/frameworks/solid-start.md`
- Principles: `.agents/guides/principles/` — `simplicity.md`, `error-handling.md`, `testing-strategy.md`,
  `security.md`, `performance.md`
