# Astro — engineering guide
> Scope: islands architecture, routing, content, rendering modes, actions, deployment. Quick card:
> `.agents/rules/fw-astro.md`. For when the kit is copied into an
> Astro repo (`/onboard-repo`).
> Last verified: 2026-09 — `docs.astro.build` (install, islands, content-collections, server-islands,
> on-demand-rendering, actions, middleware, view-transitions, images, integrations-guide, testing, upgrade-to/v7)
> and `github.com/withastro/astro/releases` (newest tag `astro@7.3.5`, 2026-09-24).
> Current major is **7** (Vite 8, a Rust compiler, Sätteri as the default Markdown processor). 5 and 6 exist as
> upgrade-guide steps behind it — re-check `node_modules/astro/package.json`'s `version` before trusting any
> version-specific claim below; where behavior differs by major, this guide says so.

## 1. Mental model / philosophy
- **Islands architecture**: a page is static HTML by default; "islands" of client JS are opt-in per component via
  `client:*` directives. No directive → the component still renders (server HTML), ships no JS.
- **Server-first, not SPA-first**: the `---` frontmatter fence atop an `.astro` file is a small server function —
  it runs at build time (`output: "static"`, the default) or per-request (`output: "server"`, or a route with
  `export const prerender = false`). It never runs in the browser.
- **Bring your own UI framework**: `.astro` components are Astro's own template language (HTML + JS expressions, no
  client reactivity). React/Preact/Solid/Vue/Svelte components go *inside* `.astro` files for the parts that need
  client-side reactivity — Astro has no hook/signal system of its own.
- KISS: the pitch is "ship less JS" — before reaching for `client:load` everywhere, ask whether the interactivity
  can be server-rendered (a `<form>` POST + Action) or deferred (`client:visible`, a server island).

## 2. Project structure & tooling
### Release status (verified 2026-09 via GitHub releases and docs.astro.build — re-check the lockfile first)
- Current major: **Astro 7** (`astro@7.3.5`, 2026-09-24; Vite 8, Rolldown bundler). Breaking vs. v6: a stricter
  Rust-based `.astro` compiler (unclosed tags now error; invalid HTML no longer auto-corrected; inter-element
  whitespace collapses under JSX rules); **Sätteri** (a Rust Markdown/MDX processor) replaces Unified/remark-rehype
  as the default — projects on remark/rehype plugins configure Unified explicitly rather than port immediately;
  `@astrojs/db` was **removed** in 7.0 (deprecated in 6.5) — it will not install or build, use Drizzle directly or
  Node's built-in SQLite module instead; `Astro.glob()`, deprecated since 5.0, was **removed entirely in 6.0** — it
  does not exist in 7, use `import.meta.glob()` (no longer returns a Promise) or a collection query instead.
- Baseline since Astro 5 (still true in 7): the **Content Layer API** is the only supported way to define new
  collections; the view-transitions component is `<ClientRouter />`, not `<ViewTransitions />`; CSRF
  origin-checking defaults on.
- Node.js **v22.12.0+** required (odd majors like v23 aren't supported). A community recipe covers Bun; it isn't
  the primary supported runtime — verify before depending on Bun-specific behavior.
- Packages: `astro` (core CLI + runtime), `astro/loaders` (Content Layer loaders), `astro:content` /
  `astro:actions` / `astro:transitions` / `astro:assets` / `astro:middleware` (virtual modules, import only inside
  an Astro project), official adapters (`@astrojs/node`, `@astrojs/vercel`, `@astrojs/netlify`, `@astrojs/cloudflare`),
  official UI integrations (`@astrojs/react`, `@astrojs/preact`, `@astrojs/solid-js`, `@astrojs/svelte`,
  `@astrojs/vue`, `@astrojs/alpinejs`).

### Commands (Astro's own CLI — swap `npm` for the project's package manager from its lockfile)
| Task | Command |
|---|---|
| Scaffold | `npm create astro@latest` |
| Dev server | `npm run dev` (`astro dev`) |
| Type-check `.astro` files | `npx astro check` |
| Build | `npm run build` (`astro build`) → `dist/` (or an adapter-specific output) |
| Preview a build | `npm run preview` (`astro preview`) |
| Add an integration/adapter | `npx astro add <name>` (e.g. `astro add react node`) |
| Everything (this kit) | `node .agents/scripts/verify.mjs --only node` |

### Project shape (Astro's default scaffold)
- `src/pages/` — file-based routing; `.astro`, `.md`/`.mdx`, or `.ts` (API routes) each become a route by path.
  `src/pages/blog/[slug].astro` is a dynamic route; `getStaticPaths()` enumerates params for static output.
- `src/content/` (or wherever `content.config.ts`'s loader `base` points) — collection source files;
  `src/content.config.ts` (Astro 5+) defines collections with the Content Layer API. A legacy `src/content/config.ts`
  is the pre-5 location — don't create new collections there.
- `src/layouts/`, `src/components/` — `.astro` templates plus framework components (`.tsx`/`.vue`/…) for the
  islands. `src/actions/index.ts` — Actions. `src/middleware.ts` — request middleware.
- `astro.config.mjs` — `output`, `adapter`, `integrations`, `image`, `site` (needed for sitemaps/canonical URLs).
- Deployment follows the adapter: `@astrojs/node` → a standalone Node server (`node ./dist/server/entry.mjs` by
  default); `@astrojs/vercel`/`@astrojs/netlify`/`@astrojs/cloudflare` → that platform's function format.

## 3. Core idioms
### Islands: `client:*` directives, cheapest first
```astro
---
import Counter from "../components/Counter.tsx";
---
<!-- no directive: server-rendered HTML only, zero JS -->
<Counter initialCount={0} />

<!-- hydrate once the browser is idle -->
<Counter client:idle initialCount={0} />

<!-- hydrate once it scrolls into view -->
<Counter client:visible initialCount={0} />

<!-- hydrate immediately: reserve for above-the-fold, must-work-now UI -->
<Counter client:load initialCount={0} />
```
`client:media="(max-width: 768px)"` hydrates only when a media query matches. `client:only="react"` (name the
framework) skips server rendering entirely — required for a component that touches `window`/browser APIs at import
time, at the cost of no HTML before JS loads. Directives only apply to framework UI components; `client:*` on a
plain `.astro` component is unsupported — verify behavior on the installed version rather than assume.

### Content Layer API: `content.config.ts`, loaders, schemas
```ts
// src/content.config.ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    draft: z.boolean().optional(),
  }),
});

export const collections = { blog };
```
```astro
---
// src/pages/blog/[slug].astro
import { getCollection, render } from "astro:content";
export async function getStaticPaths() {
  const posts = await getCollection("blog", ({ data }) => !data.draft);
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}
const { post } = Astro.props;
const { Content } = await render(post);
---
<article><h1>{post.data.title}</h1><Content /></article>
```
`glob()` reads a directory of Markdown/MDX/JSON/YAML/TOML files; `file()` loads many entries from one file; a
custom loader (an object with a `load()` method) can pull from a CMS or API. `getEntry()` fetches a single entry.
Live collections (`getLiveCollection`/`getLiveEntry`, a separate `live.config.ts`) fetch at request time instead of
build time — reach for them only for data that must be fresh per-request; prefer build-time collections otherwise.

### Rendering modes and on-demand rendering
- `output: "static"` (default): every route pre-renders to HTML at build time — fastest, no server needed.
- `output: "server"`: every route renders on demand (per request); opt individual routes back to static with
  `export const prerender = true`.
- Mixed (the common case): keep `output: "static"` and mark only the routes that need it with
  `export const prerender = false`. Either way, on-demand rendering **requires an adapter** installed and
  configured in `astro.config.mjs` (`@astrojs/node`, `@astrojs/vercel`, `@astrojs/netlify`, `@astrojs/cloudflare`,
  or a community one). On-demand routes get `Astro.cookies`, `Astro.request`, and can set `Astro.response.status`.

### Server islands: `server:defer`
```astro
---
import Avatar from "../components/Avatar.astro";
import GenericAvatar from "../components/GenericAvatar.astro";
---
<Avatar server:defer>
  <GenericAvatar slot="fallback" />
</Avatar>
```
`server:defer` extracts that component into its own on-demand route; the rest of the page stays static/fast, and a
small client script fetches the island's HTML after the initial page paints, swapping it in for the fallback slot.
Requires an adapter. Props are encrypted into the request — a `GET` when they fit in a URL (~2048 bytes, cacheable),
falling back to an uncached `POST` above that; keep server-island props small.

### Actions: typed server functions instead of hand-rolled API routes
```ts
// src/actions/index.ts
import { defineAction } from "astro:actions";
import { z } from "astro/zod";

export const server = {
  addComment: defineAction({
    input: z.object({ postId: z.string(), body: z.string().min(1) }),
    handler: async ({ postId, body }, context) => {
      // context.locals, context.cookies, etc. are available here
      return db.comments.insert({ postId, body });
    },
  }),
};
```
```tsx
// client component
import { actions } from "astro:actions";
const { data, error } = await actions.addComment({ postId, body });
if (error) {
  // error is an ActionError with a status code (e.g. "BAD_REQUEST", "UNAUTHORIZED")
}
```
Actions can also be called directly from a plain `<form>` (progressive enhancement — works without client JS) by
pointing its `action`/`method` at the action, per the official Actions guide. Actions require on-demand rendering
for the calling route, same as any other server-only feature.

### Middleware: cross-cutting request logic
```ts
// src/middleware.ts
import { defineMiddleware, sequence } from "astro:middleware";

const auth = defineMiddleware(async (context, next) => {
  context.locals.user = await getUserFromCookie(context.cookies);
  return next();
});

const logging = defineMiddleware(async (context, next) => {
  const response = await next();
  console.log(context.request.method, context.url.pathname, response.status);
  return response;
});

export const onRequest = sequence(auth, logging);
```
`context.locals` carries request-scoped data (set by middleware) into pages, layouts, and API routes — type it via
an `env.d.ts` `App.Locals` interface. `next()` can be called with a different path/`Request` to rewrite internally.
Middleware runs for on-demand routes; a fully static route never hits it at request time.

### View transitions: `<ClientRouter />`
```astro
---
import { ClientRouter } from "astro:transitions";
---
<head>
  <ClientRouter fallback="swap" />
</head>
```
Add it once, in a shared layout's `<head>`, for client-side navigation with animated transitions (native View
Transitions API in Chromium; `fallback="animate" | "swap" | "none"` covers other browsers; respects
`prefers-reduced-motion` automatically). `transition:name="hero"` pairs elements across navigations for a custom
morph; `transition:animate="fade" | "slide" | "none" | "initial"` picks a built-in one; `transition:persist` keeps a
live island's state/DOM across navigation instead of remounting it (e.g. an in-progress video player). Re-run
per-page setup from `document.addEventListener("astro:page-load", ...)`, not top-level script — it fires after
every client transition, top-level script only once.

### Images: `astro:assets`
```astro
---
import { Image } from "astro:assets";
import hero from "../assets/hero.jpg";
---
<Image src={hero} alt="Product hero shot" width={800} height={600} />
```
Local images (from `src/`) are optimized (resized/reformatted) by Astro's default image service (Sharp); remote
images need `image.domains`/`image.remotePatterns` allow-listed in `astro.config.mjs`, else they render un-optimized.
`alt` is required on `<Image />`/`<Picture />` — use `alt=""` only for a genuinely decorative image. `getImage()`
produces an optimized image outside templates (an API route, `og:image` generation). Files under `public/` bypass
optimization. Set `layout="constrained"`/`"full-width"` (plus `image.responsiveStyles: true`) for automatic
`srcset`/`sizes`. Without Sharp support (some edge runtimes), configure `passthroughImageService()` — you keep
layout-shift prevention but lose transforms.

### Integrations
`npx astro add react tailwind` installs the packages and wires `astro.config.mjs`'s `integrations: [...]` array in
one step — prefer it over hand-editing the config for a first install. Integrations are plain objects/factories
with lifecycle hooks (`astro:config:setup`, `astro:build:done`, …); only write a custom one when no existing
integration covers the need.

## 4. Error handling
- `src/pages/404.astro` and `src/pages/500.astro` cover custom error pages; the 500 page gets the error via
  `Astro.locals` or a middleware-set value, depending on the adapter.
- Wrap risky server-side work (a frontmatter fetch, an Action handler, a loader) in `try/catch`; render an explicit
  error UI or return an `ActionError` — never let a frontmatter throw produce a blank 500 with no context.
- `ActionError` status codes let the client distinguish `BAD_REQUEST` (show field errors) from `UNAUTHORIZED`
  (redirect to login) from a generic failure — branch on `error.code`, not just `!!error`.
- A Content Layer loader/schema mismatch fails at build/dev-start with the offending file and Zod path — fix the
  content or schema; don't loosen it to `z.any()` to silence it.

## 5. Testing
- Unit / component: the **Container API** (`experimental_AstroContainer` as of recent 5.x/7.x releases — check the
  installed version's docs before assuming it has stabilized) renders `.astro` components inside Vitest without a
  browser, via `vitest.config.ts`'s `getViteConfig()` helper so the project's own Astro config applies.
  ```ts
  import { experimental_AstroContainer as AstroContainer } from "astro/container";
  import { expect, test } from "vitest";
  import Card from "../src/components/Card.astro";

  test("renders the title", async () => {
    const container = await AstroContainer.create();
    const result = await container.renderToString(Card, { props: { title: "Hi" } });
    expect(result).toContain("Hi");
  });
  ```
- A framework island (`.tsx`/`.vue`/…) inside a `.astro` file is tested with that framework's own testing library
  (React Testing Library, `@solidjs/testing-library`, …) against the component directly — the Container API is for
  `.astro` templates, not islands' internal behavior.
- E2E: Playwright is Astro's documented choice — locate by role/label/text (not utility classes), no hard sleeps,
  use `webServer` in `playwright.config.ts` to build+preview (or reuse a running dev server). Test against a
  production build (`astro build && astro preview`) for adapter-specific behavior (server islands, Actions,
  middleware) — dev-server behavior for these can differ from the deployed adapter.

## 6. Performance
- Default to zero JS; add `client:*` only where interactivity is required, preferring `client:idle`/`client:visible`
  over `client:load` unless the component must be interactive at first paint.
- Islands hydrate independently and in parallel — a slow island does not block a fast one; don't bundle unrelated
  widgets into one giant island just to save a directive.
- Reach for a server island (`server:defer`) instead of client-fetching personalized/slow data from an otherwise
  static page — it keeps the rest of the page's TTFB fast and cacheable while deferring only the slow part.
- Keep server-island props small (well under the ~2048-byte URL budget) so its request stays a cacheable `GET`.
- Use `<Image />`/`<Picture />` for every local raster image needing display sizing — manual `<img>` skips
  resizing/format negotiation and risks CLS from missing dimensions.
- `output: "static"` is the fastest default (no per-request work); reach for `"server"`/`prerender = false` only
  for routes that genuinely need per-request data.

## 7. Security
- Actions and API routes are the request boundary: validate every input with a `zod` schema (Actions do this by
  construction via `input`; hand-written API routes must do it themselves) — never trust `Astro.request.json()` or
  form data as pre-validated.
- CSRF origin-checking is on by default for on-demand routes — don't disable `security.checkOrigin` without an
  equivalent replacement if the app accepts state-changing browser requests.
- Only `PUBLIC_`-prefixed environment variables reach client code; keep API keys, DB credentials, and other secrets
  in unprefixed vars, read only in server code (Actions, middleware, API routes, frontmatter) — never in a hydrated
  island's own module.
- Never pass unsanitized user input into `set:html` (Astro's raw-HTML directive), the escape hatch out of default
  escaping — sanitize (e.g. a vetted HTML-sanitizer library) or avoid it for user content.
- `context.locals` set in middleware is a good place to attach an authenticated user — check it (or re-authenticate)
  in every on-demand route/Action that needs it; middleware alone doesn't stop a route being requested directly if
  the route itself never checks `locals`.

## 8. Concurrency / async
- Frontmatter in a page/layout runs once per build (static) or once per request (on-demand) — parallelize
  independent awaited fetches with `Promise.all` instead of sequential `await`s.
- Server islands and Actions each get their own request/response cycle — a slow server island cannot block the
  initial page response; a slow Action blocks only its own client call, not navigation.
- Middleware's `sequence(...)` runs each `onRequest` in order, awaiting `next()` before the next middleware's
  "after" code runs — one that never calls (or returns) `next()` breaks the whole chain.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `client:*` on a plain `.astro` component | no client runtime to hydrate — unsupported, behavior unverified | move the interactive part into a framework component |
| `client:load` on every interactive widget | ships/executes JS for all of them immediately, even off-screen | `client:idle`/`client:visible`; reserve `client:load` for above-the-fold |
| New collection defined with `type: 'content'` in `src/content/config.ts` | legacy shape, superseded by the Content Layer API | `defineCollection({ loader, schema })` in `content.config.ts` |
| Using Actions/`server:defer`/cookies with no adapter | no-ops or throws — these need on-demand rendering | install an adapter, set `prerender = false` or `output: "server"` |
| `server:defer` with no `slot="fallback"` | layout gap / CLS while the island loads | always provide a fallback slot |
| Secret read from an unprefixed env var inside a hydrated island | reads `undefined` in the browser bundle | keep secrets server-side; only `PUBLIC_*` reaches the client |
| Raw `<img src={imported.src}>` for a sizeable local image | skips resizing/format negotiation, risks CLS | `<Image />`/`<Picture />` from `astro:assets` |
| `set:html={userInput}` | raw HTML injection (XSS) | sanitize first, or use text interpolation |
| Sequential `await`s for independent data in frontmatter | serializes otherwise-parallel work, slows TTFB/build | `Promise.all([...])` |
| Manual JS re-binding logic run only at top-level `<script>` under `<ClientRouter />` | doesn't re-run after a client-side transition | rebind inside `astro:page-load` |

## 10. Review checklist
- [ ] every hydrated island has the cheapest `client:*` directive that satisfies the UX; no directive on a plain
      `.astro` component
- [ ] new/changed collections use the Content Layer API (`content.config.ts`, a loader, a `zod` schema) — no new
      legacy `type: 'content'` collections
- [ ] any route using Actions, `server:defer`, middleware-set `locals`, or `Astro.cookies` has an adapter configured
      and is actually on-demand (`prerender = false` or `output: "server"`)
- [ ] `server:defer` islands provide a `slot="fallback"`; props stay small enough to stay a cacheable `GET`
- [ ] every Action/API-route input is validated with `zod`; no unprefixed secret is reachable from client code
- [ ] local images use `<Image />`/`<Picture />` with `alt` set; remote image domains are allow-listed if optimized
- [ ] no `set:html` on unsanitized user input
- [ ] `astro check` (or the project's typecheck script) and its test command (Container API/unit + Playwright e2e
      if present) pass — `node .agents/scripts/verify.mjs --only node` in this kit

## 11. References
- Docs home https://docs.astro.build/ · islands https://docs.astro.build/en/concepts/islands/ · content collections
  https://docs.astro.build/en/guides/content-collections/ · server islands
  https://docs.astro.build/en/guides/server-islands/ · on-demand rendering
  https://docs.astro.build/en/guides/on-demand-rendering/
- Actions https://docs.astro.build/en/guides/actions/ · middleware https://docs.astro.build/en/guides/middleware/ ·
  `<ClientRouter />` https://docs.astro.build/en/guides/view-transitions/ · images
  https://docs.astro.build/en/guides/images/ · integrations https://docs.astro.build/en/guides/integrations-guide/
- Testing https://docs.astro.build/en/guides/testing/ · install/Node version
  https://docs.astro.build/en/install-and-setup/
- Upgrade guides https://docs.astro.build/en/guides/upgrade-to/v7/ (and `/v6/`, `/v5/`) · releases
  https://github.com/withastro/astro/releases (newest tag `astro@7.3.5`, 2026-09-24)
- Principles: `.agents/guides/principles/simplicity.md`, `security.md`, `performance.md`, `testing-strategy.md`
- Framework islands (React/Solid/Vue/Svelte inside Astro): that framework's own pack in this kit, e.g.
  `.agents/guides/frameworks/solidjs.md`
