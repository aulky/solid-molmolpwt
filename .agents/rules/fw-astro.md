---
trigger: model_decision
globs: "**/*.astro,**/astro.config.*"
description: "Apply when working in an Astro codebase (package.json dependency astro): islands, client:* directives, content collections, server islands, actions, rendering."
---
# Astro — quick card
Applies only if package.json dependency astro. Otherwise ignore this rule.
Deep guide: `.agents/guides/frameworks/astro.md` — read before non-trivial Astro work (collections, server islands, actions, rendering-mode changes, adapters).

## Project shape
- `.astro` files render to static HTML with **zero client JS by default**; only framework components (React/Solid/Vue/Svelte) tagged `client:*` ship JS to the browser.
- `src/pages/` = file routes, `src/content/` (wherever `content.config.ts` points) = collections, `src/layouts/`, `src/components/`, `astro.config.mjs` = build/rendering config.

## Invariants (MUST / NEVER — with reason → alternative)
1. NEVER put a `client:*` directive on a plain `.astro` component — only framework UI components (`.tsx`/`.jsx`/`.vue`/`.svelte`/Solid) can hydrate; an `.astro` file has no client runtime to attach to. Instead, extract the interactive part into a framework component and hydrate it.
2. MUST default to no directive (static HTML) and add the **cheapest** `client:*` that satisfies the UX — `client:visible`/`client:idle` over `client:load` — because every hydrated island ships and re-executes its framework's runtime JS. Reserve `client:load` for above-the-fold UI that must work immediately.
3. NEVER define a new collection with the legacy `type: 'content'`/`type: 'data'` shape in `src/content/config.ts` — check the installed `astro` version; current major versions require the Content Layer API (`defineCollection({ loader, schema })` in `content.config.ts`, loaders from `astro/loaders`).
4. MUST add an adapter (`@astrojs/node`, `@astrojs/vercel`, …) and mark the route `export const prerender = false` (or `output: "server"`) before using an on-demand-only feature: `server:defer`, Actions, request-scoped middleware, `Astro.cookies`. These no-op or throw in fully static output.
5. NEVER call `server:defer` without a `slot="fallback"` — the fallback is what paints before the deferred fetch resolves; omitting it leaves a layout gap and can cause CLS.
6. MUST validate every Action and API-route input with a `zod` schema at the boundary — never trust `context.request`/action `input` as pre-validated, even though Actions look like plain function calls.
7. NEVER assume an env var reaches the client — only `PUBLIC_`-prefixed vars are exposed to browser code; unprefixed ones are server-only and read `undefined` in a hydrated island. Don't "fix" this by renaming a secret to `PUBLIC_`.
8. NEVER write `<img src={localImage.src}>` for a local image needing optimization — it bypasses transforms/`alt` enforcement. Use `<Image />`/`<Picture />` from `astro:assets` (`getImage()` outside templates); `alt` is mandatory on both.
9. MUST run `astro check` (or the project's typecheck script) before calling work done — `.astro` template type errors (props, slots) aren't caught by `tsc` alone.

## Patterns
- Data fetching in a page/layout: top-of-file frontmatter `---` block runs server-side (build or request time) — `const posts = await getCollection("blog")`; no client fetch needed for content that doesn't change per-visit.
- Passing data into a hydrated island: pass plain serializable props from frontmatter (`<Counter client:visible count={initial} />`); the framework component owns its own state after that — Astro does not re-render it.
- Mutations: prefer Actions (`defineAction` + `astro:actions`) over hand-rolled API routes for typed, validated server calls from client code or `<form>`.
- Chain cross-cutting request logic (auth, redirects) with `sequence()` in `src/middleware.ts`, not by repeating checks in every page/route.

## Pitfalls
- `client:only="react"` (etc.) skips server rendering entirely — needed when a component touches `window` at import time, but there's no HTML fallback while JS loads.
- A framework component rendered with **no** `client:*` still renders server HTML, just unhydrated — correct for static/display-only usage, not a bug.
- A stale `src/content/config.ts` alongside the new `content.config.ts` can redefine the same collection name — delete the legacy file when migrating.
- `<ClientRouter />` (formerly `<ViewTransitions />`) makes navigation a client-side swap — listeners attached outside `astro:page-load` may not rebind after it.

## Example — bad → good
```astro
---
// bad: client:* on an .astro file — no client runtime exists to hydrate it
import Counter from "../components/Counter.astro";
---
<Counter client:load />
```
```astro
---
// good: interactivity lives in a framework component; cheapest directive that fits
import Counter from "../components/Counter.tsx";
---
<Counter client:visible initialCount={0} />
```

## Before finishing
- [ ] no `client:*` on an `.astro` file · [ ] every hydrated island uses the cheapest directive for the UX · [ ] new collections use the Content Layer API (`content.config.ts` + loader) · [ ] SSR-only features (`server:defer`, Actions, middleware) have an adapter + `prerender=false`/`output:"server"` · [ ] Action/route input validated with `zod` · [ ] local images go through `astro:assets`; `alt` set · [ ] `astro check` (or project typecheck) and the project's test command pass
