---
trigger: model_decision
globs: "**/*.tsx,**/*.jsx"
description: "Apply when working in a React codebase (package.json dependency react (and NOT solid-js)): hooks rules, derived state, keys, Suspense, forms/Actions, memoization."
---
# React — quick card
Applies only if package.json dependency react (and NOT solid-js). Otherwise ignore this rule.
Deep guide: `.agents/guides/frameworks/react.md` — read before non-trivial work (Actions/forms, Suspense data
fetching, context design, perf, list virtualization). Plain React only; a meta-framework adds its own pack too:
`fw-nextjs.md` (Next.js), `fw-astro.md` (Astro).

## Project shape
- A component is a plain function returning JSX; unlike Solid it **re-runs on every re-render** (state/prop/context
  change), then React diffs the returned tree (virtual DOM) and patches only what changed.
- React 19.x is current (verify the exact minor in `node_modules/react/package.json` or the lockfile). `ref` is an
  ordinary prop — no `forwardRef` needed for a new component. Actions (`useActionState`, `useOptimistic`,
  `useFormStatus`, `<form action={fn}>`) are the standard way to submit and track async mutations.

## Invariants (MUST / NEVER — with reason → alternative)
1. NEVER call a hook conditionally, in a loop, or after an early `return` — React matches hooks to state by call
   *order*; skipping one call shifts every hook after it onto the wrong state slot. Put the condition inside the
   hook body, call every hook unconditionally at the top level.
2. NEVER mirror a value you can compute during render into `useEffect(() => setX(...), [deps])` — an extra render,
   a stale value until the effect runs, and (per React's "You Might Not Need an Effect") almost never necessary.
   Compute it as a plain `const`, or `useMemo` once that computation is measured expensive.
3. NEVER key a `.map()`-rendered list by array index when rows can reorder, insert, or delete — React reuses the old
   DOM node/state for that index, showing the wrong row's state. Use a stable id from the data.
4. NEVER reach for `useMemo`/`useCallback`/`React.memo` before profiling shows the re-render is expensive, or before
   the React Compiler (`babel-plugin-react-compiler`, stable) is enabled to insert them — an unmeasured memo adds a
   comparison and a dependency array to maintain for zero proven gain.
5. NEVER mutate state in place (`state.items.push(x)`, `obj.field = v`) — React re-renders by comparing references,
   so a mutated object looks unchanged and the update is silently dropped. Produce a new object/array instead:
   `setState((prev) => [...prev, x])`.
6. NEVER hand-roll `useEffect` + a loading boolean for data a Suspense-aware source could own — prefer a
   data-fetching library (TanStack Query, SWR) or the framework's loader under `<Suspense>`/`<ErrorBoundary>`; a
   manual effect-fetch loses request dedup, cancellation, and caching.
7. MUST put `key` on the outermost element `.map()` returns, not on a wrapper added around the call site.
8. MUST read a submitting `<form>`'s pending state with `useFormStatus()` from inside that form, not by threading a
   boolean prop down from whatever owns the action.

## Patterns
- Derive during render, no effect: `const fullName = \`${first} ${last}\`;`.
- Async mutation with pending/optimistic UI: `useActionState(action, null)` · `useOptimistic(currentValue)` ·
  `<form action={submit}>`.
- Read a promise or context conditionally, even after an early return: `const data = use(promise);`.
- Lift state to the nearest common ancestor that needs it, instead of syncing two copies via an effect.
- Context perf: split one large context into narrower ones by what changes together, or memoize the provider's
  `value` — every consumer re-renders on *any* value change regardless of which field it reads.
- Large/long lists: virtualize (`@tanstack/react-virtual`, `react-window`) instead of rendering every row.

## Pitfalls
- A literal (`value={{ a, b }}`) passed as a prop or context value gets a new identity every render, defeating a
  downstream `memo`/`useMemo`/`useCallback` — hoist or memoize it.
- `forwardRef` still works but is no longer needed for new components — accept `ref` as a plain prop.
- A class-component `ErrorBoundary` is still the only way to catch render errors — no hook exists for it; use
  `react-error-boundary` for a component API.
- An effect that only unsubscribes what it subscribed is fine; one that fires only to sync two pieces of state is
  invariant 2's anti-pattern.

## Example — bad → good
```tsx
function UserCard({ user }: { user: { first: string; last: string } }) {
  const [full, setFull] = useState("");
  useEffect(() => { setFull(`${user.first} ${user.last}`); }, [user]); // derived state via effect
  return <div>{full}</div>;
}
```
```tsx
function UserCard({ user }: { user: { first: string; last: string } }) {
  const full = `${user.first} ${user.last}`; // computed during render, no effect, no extra state
  return <div>{full}</div>;
}
```

## Before finishing
- [ ] no hook called conditionally/in a loop/after a `return` · [ ] no effect only mirrors a derivable value ·
      [ ] every `.map()` key is a stable id, never the index, for reorderable lists · [ ] no direct state/prop
      mutation · [ ] memoization added only where profiled or compiler-driven · [ ] typecheck/lint/test
      (or `node .agents/scripts/verify.mjs --only node`) pass; new behavior has a test
