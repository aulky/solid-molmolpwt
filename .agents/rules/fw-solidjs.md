---
trigger: model_decision
globs: "**/*.tsx,**/*.jsx"
description: "Apply when working in a SolidJS codebase (package.json dependency solid-js): signals, reactivity, control flow, props, stores, testing pitfalls."
---
# SolidJS — quick card
Applies only if package.json dependency solid-js. Otherwise ignore this rule.
Deep guide: `.agents/guides/frameworks/solidjs.md` — read before non-trivial Solid work (stores, resources, context, routing data, perf).

## Project shape
- A component is a plain function `(props) => JSX.Element`, called **once** to build the DOM — no re-render, no virtual DOM diff.
- Reactivity is fine-grained: only the exact expression that reads a changed signal re-runs, wherever it sits in the returned JSX.

## Invariants (MUST / NEVER — with reason → alternative)
1. NEVER read a signal without calling it (`count`, not `count()`) — it's a getter function; without `()` nothing updates. Invoke it where you need the value.
2. NEVER destructure props (`const { name } = props`) — props are reactive accessors; destructuring reads once and detaches from updates. Read `props.name` directly, or use `splitProps`/`mergeProps` for subsets/defaults.
3. NEVER use `createEffect` to compute a value another signal depends on — effects are for side effects (DOM, subscriptions, refs), not derivation. Use a plain function (`() => count() * 2`) or `createMemo` when expensive/shared.
4. NEVER branch or list-render with `{cond && <X/>}` or `{list.map(fn)}` in JSX — components run once, so that JS runs once and never reacts again. Use `<Show when>`, `<For each>` (keyed by reference), or `<Index each>` (keyed by position).
5. NEVER import from `react` or write `useState`/`useEffect`/`useMemo` — no hook/render model exists here. Use `createSignal`/`createEffect`/`createMemo`.
6. MUST use `class` (not `className`) and `for` (not `htmlFor`) — Solid compiles straight to real DOM attributes.
7. MUST import `Portal`/`Dynamic` from `solid-js/web` — unlike `Show`/`For`/`Suspense` (core `solid-js`), they are DOM-renderer-specific.
8. NEVER mutate a store field in place (`store.items.push(x)`) — the proxy only tracks writes through its setter. Use `setStore("items", (i) => [...i, x])` or `setStore("items", produce((i) => i.push(x)))`.
9. MUST wrap several signal writes meant as one update in `batch(() => {...})` outside an event handler/effect (those auto-batch) — otherwise the UI can glitch mid-sequence.

## Patterns
- Refs: `let el!: HTMLDivElement;` `<div ref={el}>`. DOM-ready work in `onMount(() => {...})`; teardown in `onCleanup(() => {...})`.
- Context carries reactive values, not snapshots: provide a signal accessor, read with `useContext(Ctx)` and still call it.
- `const [data] = createResource(source, fetcher)` + `<Suspense fallback>`. In `@solidjs/start` route code, prefer the router's `createAsync` (see `fw-solid-start`) over hand-rolled `createResource` + loading state.
- `untrack(() => peek())` reads a signal without subscribing — for an effect that must not rerun on that value.
- `<Switch>`/`<Match>` beats nested `<Show>` for 3+ mutually exclusive branches.

## Pitfalls
- Passing `count()` into a prop hands a frozen value, not a reactive accessor — pass the signal itself (`<Child count={count} />`).
- Every `createSignal`/`createMemo`/`createStore` must be created during synchronous component/`createRoot` setup, never inside a later callback/`if`/loop, or it has no owner.
- `arr().push(x); setArr(arr())` keeps the same identity, so nothing updates — always set a new array/object.
- Tests use `@solidjs/testing-library`'s `render()` + `screen`, never `@testing-library/react`.

## Example — bad → good
```tsx
function Counter(props) {
  const { start } = props; // detached
  const [count, setCount] = createSignal(start);
  const [doubled, setDoubled] = createSignal(start * 2);
  createEffect(() => setDoubled(count() * 2)); // derivation via effect
  return (
    <div className="box">
      {count() > 5 && <span>High!</span>}
      <button onClick={() => setCount(count() + 1)}>{count}</button>
    </div>
  );
}
```
```tsx
function Counter(props: { start: number }) {
  const [count, setCount] = createSignal(props.start);
  const doubled = () => count() * 2; // plain derivation
  return (
    <div class="box">
      <Show when={count() > 5}><span>High!</span></Show>
      <button onClick={() => setCount((c) => c + 1)}>{count()}</button>
    </div>
  );
}
```

## Before finishing
- [ ] no destructured props, no `useState`/`useEffect`/React imports · [ ] all conditional/list JSX uses `<Show>`/`<For>`/`<Index>`/`<Switch>`, never `&&`/`.map()` inline · [ ] every signal read is called; no `createEffect` sets another signal · [ ] `class`/`for` not `className`/`htmlFor`; `Portal`/`Dynamic` from `solid-js/web` · [ ] the project's typecheck and lint commands (root `AGENTS.md`) clean, new behaviour has a `@solidjs/testing-library` test, `node .agents/scripts/verify.mjs --only node` passes
