# Next.js — engineering guide
> Scope: the Next.js App Router framework layer (routing, rendering, caching, Server Actions, deployment). React
> itself: `.agents/guides/frameworks/react.md`. Quick card: `.agents/rules/fw-nextjs.md`.
> Last verified: 2026-09-30 — `nextjs.org/blog/next-16`, the live `cacheComponents` config doc (opt-in, not
> default), and the npm registry (confirmed-shipped patch **16.3.7**, published 2026-09-29 on the 16.3 Active
> LTS line — backports bug fixes only, no new features over 16.3.6), plus the docs pages cited inline below.
> Not cross-checked against an installed `node_modules/next` — verify versions against the target project's manifest.

## 1. Mental model / philosophy
- Next.js is a full-stack React **framework**, not a bundler-with-routing: the file system defines routes, and the
  framework decides, per route segment, what runs on the server, what ships to the browser, and what gets cached —
  not you, unless a directive says otherwise (`"use client"`, `"use cache"`, `"use server"`).
- **Cache Components is opt-in, not v16's default**: set `cacheComponents: true` in `next.config.ts` first — once
  enabled, posture flips to explicit dynamic (nothing cached unless a segment/function opts into `"use cache"`).
  Without the flag, a v16 app still behaves like the old implicit static-first model. **Check `next.config.ts`
  before assuming either behavior.**
- Every component is a Server Component unless marked otherwise. The server/client split is a *build-time module
  graph* boundary, not a runtime `if (isServer)` check — a file with `"use client"`, and everything it imports,
  is bundled for the browser; nothing else is, by construction.
- KISS/YAGNI default: reach for a Server Action or Route Handler as needed; don't build a separate REST/GraphQL
  layer or a client-side data-fetching library "just in case" until cross-origin or an external API contract is
  actually required.

## 2. Project structure & tooling
### Release status (verified 2026-09 via `nextjs.org/blog`)
- Current major: **Next.js 16** (GA October 21, 2025); newest confirmed-shipped patch **16.3.7** (Active LTS,
  published 2026-09-29 — re-check `nextjs.org/blog` for anything newer). Maintenance LTS: **15.5.26**.
  **Always check the lockfile / `node_modules/next/package.json`** — a project can still be pinned to 15.x, with
  different defaults (delta table below).
- Version floors in 16: **Node.js ≥ 20.9 (LTS)**, Node 18 unsupported; **TypeScript ≥ 5.1**.
- 16.3 (Aug 2026) added "Instant Navigations" (per-route shell reuse, new prefetch modes) — check the installed
  minor before assuming a 16.0 app has it.

### Next.js 15 → 16 deltas that change how you write code (verify the installed major first)
| Area | 15.x | 16 |
|---|---|---|
| Bundler | Webpack default, Turbopack opt-in | **Turbopack default**; `--webpack` opts back out |
| Edge interception file | `middleware.ts` | **`proxy.ts`** (export `proxy`, Node.js runtime only); `middleware.ts` still works but is deprecated, Edge-only |
| Caching flag | `experimental.dynamicIO` | renamed **`cacheComponents`** (top-level `next.config.ts`) |
| `params`/`searchParams` | sync access deprecated in 15 | **must be `await`ed** — sync access throws |
| `revalidateTag(tag)` | single argument | needs a second `cacheLife` **profile** arg for SWR (`revalidateTag(tag, "max")`); `updateTag`/`refresh` are new |
| `next lint` | ran ESLint | **removed** — run Biome/ESLint directly |

### Commands (swap the package manager for whatever the project's lockfile names)
| Task | Command |
|---|---|
| New project | `npx create-next-app@latest` (TS + App Router + Tailwind + ESLint by default in 16) |
| Dev / build / start | `next dev` (Turbopack default, `--webpack` to opt out) / `next build` / `next start` |
| Lint / type-check | project's own ESLint/Biome config (`next lint` was removed in 16) / `tsc --noEmit` |
| Upgrade | `npx @next/codemod@canary upgrade latest` (codemods the breaking changes above) |

### Project shape (App Router)
```
app/
  layout.tsx           # root layout: <html>/<body>, shared across every route
  page.tsx              # "/" route UI (Server Component by default)
  loading.tsx           # automatic <Suspense fallback> for this segment
  error.tsx              # automatic error boundary ("use client" required)
  actions.ts             # "use server" — Server Actions for this segment
  api/health/route.ts     # "/api/health" — a plain endpoint (Route Handler)
  blog/[slug]/page.tsx     # dynamic segment; params is Promise<{slug: string}>
proxy.ts                 # (16+) network-boundary interception; was middleware.ts
next.config.ts
```
- A segment's `page`/`layout`/`route`/`default` files are independent entry points; each can carry its own
  `"use cache"` (file-level) without affecting the others (see §3).
- Parallel routes (`@slot` folders) each need their own `default.js` in 16 — a missing one now **fails the build**
  instead of rendering nothing.

### Deployment (verified: `nextjs.org/docs/app/getting-started/deploying`, `.../guides/self-hosting`, `.../guides/static-exports`)
Three `output` modes in `next.config.ts`:
- default (unset): full `.next/` + `next start` — Node.js server (self-hosted, Vercel, or an adapter); every
  feature works.
- `'standalone'`: traced `.next/standalone/server.js` + minimal `node_modules` — the shape Docker images use;
  copy `public/` and `.next/static/` in manually, then `server.js` serves them.
- `'export'`: static `out/` (HTML/CSS/JS, no server) — drops Server Actions, `cookies()`, Draft Mode,
  ISR/`"use cache"`, and `proxy.ts` (needs the live request); a Route Handler survives only as
  `export const dynamic = 'force-static'`, GET-only.
`proxy.ts` runs on **Node.js only** (the old `middleware.ts` could run on Edge) — zero-config under
`next start`/standalone, absent from a static export. A non-`NEXT_PUBLIC_` var can be read at request time
(behind a dynamic API like `connection()`), so one image is promoted unchanged across environments;
`NEXT_PUBLIC_*` values are inlined into the client bundle **at build time** — changing one needs a rebuild.

## 3. Core idioms
### Server vs Client Components: default to server, mark the leaf
```tsx
// app/[id]/page.tsx — Server Component (no directive needed): fetches data, no bundle cost
import LikeButton from '@/app/ui/like-button'
import { getPost } from '@/lib/data'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params            // params is a Promise — must await (16: enforced)
  const post = await getPost(id)         // runs on the server; DB/API keys never reach the client
  return (
    <article>
      <h1>{post.title}</h1>
      <LikeButton likes={post.likes} />  {/* only this leaf needs interactivity */}
    </article>
  )
}
```
```tsx
// app/ui/like-button.tsx — Client Component: state + event handler need the browser
'use client'
import { useState } from 'react'

export default function LikeButton({ likes }: { likes: number }) {
  const [count, setCount] = useState(likes)
  return <button onClick={() => setCount((c) => c + 1)}>{count} likes</button>
}
```
`"use client"` marks a **module-graph boundary**: everything that file imports and directly renders joins the
client bundle. A Server Component passed to a Client Component as `children`/props is *not* pulled in — it still
renders server-side; only its rendered output crosses the boundary. Never import a DB client, secret, or
server-only utility into a file that has, or is imported by, a `"use client"` file — add `import "server-only"` to
server-only modules so the mistake fails the build instead of leaking at runtime.

### Server Actions: a public endpoint, not a private RPC
```ts
// app/lib/actions.ts
'use server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')          // 1. authenticate

  const title = z.string().min(1).max(200).parse(formData.get('title')) // 2. validate

  const post = await db.post.create({                          // 3. authorize inside the write
    data: { title, authorId: session.user.id },
  })
  revalidatePath('/posts')                                      // 4. tell the cache
  return post
}
```
A Server Action is reachable by any `POST` to its (hashed) action ID — from your `<form action={createPost}>`,
equally from `curl`. It gets same-site `Origin`/`Host` CSRF protection for free (Next.js 14+), but **never**
authorization for free: check the session and resource ownership inside the action itself, every time, on
arguments re-validated at runtime (`z.string().uuid().parse(...)`), never trusted as typed. A closure over a
variable (not `.bind()`-passed) is encrypted before it reaches the client and decrypted back — useful for a
`publishVersion` snapshot check — but that's argument integrity, not authorization.

### Route Handlers: a plain endpoint using Web `Request`/`Response`
```ts
// app/api/items/[slug]/route.ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const item = await getItem(slug)
  if (!item) return new Response('Not found', { status: 404 })
  return Response.json(item)
}

export const revalidate = 60 // opt into caching explicitly — GET is dynamic by default since v15
```
Supported exports: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` (auto-implemented if omitted). Prefer
a Route Handler over a Server Action when the caller isn't your own form/client code — a webhook, a public API for
another service, a non-`POST` verb, or a streamed non-HTML response.

### Caching: explicit, directive-driven ("Cache Components", 16+)
```ts
// lib/data.ts — enable once in next.config.ts: cacheComponents: true
import { cacheLife, cacheTag } from 'next/cache'

export async function getProduct(id: string) {
  'use cache'
  cacheLife('hours')     // time-based: stale/revalidate/expire profile ('default'|'seconds'|'minutes'|'hours'|'days'|'weeks'|'max' or a custom one)
  cacheTag(`product-${id}`) // on-demand: pairs with revalidateTag/updateTag
  return db.product.findUnique({ where: { id } })
}
```
- Cache key = build ID + a hash of the function's location/signature + its serializable args (and any outer
  variables closed over). Same inputs share one entry; different `id`s don't.
- `"use cache"` functions **cannot** call `cookies()`/`headers()`/read `searchParams` directly (or via a helper
  that does) — read those in an uncached caller and pass the value in as an argument.
- Invalidate: `revalidateTag(tag, profile)` for stale-while-revalidate (`profile` e.g. `'max'`, `'hours'`, or
  `{ expire: 3600 }`); `updateTag(tag)` in a Server Action for read-your-writes; `refresh()` (Server Action only)
  refreshes **uncached** data on the page without touching the cache — e.g. a live count.
- Static export and this feature don't mix (see Deployment, §2) — `"use cache"` needs a live Node.js server.

### Streaming with Suspense
```tsx
import { Suspense } from 'react'

export default function Page() {
  return (
    <>
      <Header /> {/* fast, renders immediately */}
      <Suspense fallback={<Skeleton />}>
        <SlowRecommendations /> {/* streams in once its await resolves */}
      </Suspense>
    </>
  )
}
```
A segment's `loading.tsx` wraps the whole segment in an equivalent boundary automatically; add an inline
`<Suspense>` when only *part* of a page — not the whole route — should be allowed to arrive late.

### `next/image` and `next/font`
```tsx
import Image from 'next/image'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function Page() {
  return (
    <main className={inter.className}>
      <Image src="/hero.png" alt="Product hero" width={1200} height={630} priority />
    </main>
  )
}
```
`alt` and (`width`+`height`, or `fill`) are required — Next.js can't otherwise reserve layout space, and omitting
either is a type/a11y error, not just a lint warning. Use `priority` only on the largest above-the-fold image; the
rest lazy-load by default. Remote images need `images.remotePatterns` in `next.config.ts` (`images.domains` is
deprecated); a **local** image referenced with a query string needs `images.localPatterns` (16: blocks enumeration
by default). `next/font` self-hosts and inlines `@font-face` at build time — never add a Google Fonts
`<link>`/`@import` alongside it.

### Metadata API: static `metadata` vs. async `generateMetadata()`
```tsx
// app/blog/[slug]/page.tsx — Server Component only (both exports are)
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)               // wrap in React `cache()` if the page fetches it too
  return { title: post.title, description: post.description }
}
```
Prefer the plain `export const metadata = {...}` object when nothing needs fetching; reach for `generateMetadata`
(async, `params`/`searchParams` as Promises) only when a field depends on data. File conventions (`icon.tsx`,
`opengraph-image.tsx`, `robots.ts`, `sitemap.ts`) generate the same tags/files from a file instead of code.
Everything returned renders into the `<head>`/response sent to **every** visitor and crawler — never put a secret
or unpublished value in metadata.

### Environment variables
Only `NEXT_PUBLIC_`-prefixed vars reach the client bundle — see Deployment (§2) for the build-vs-runtime timing
and §7 for the `server-only` guard. Never let a secret get serialized into a value passed as a Client Component
prop, even indirectly (string-concatenated into an otherwise-safe field).

## 4. Error handling
- `error.tsx` (must be `"use client"`) catches render errors for its segment and receives `(error, reset)`;
  `global-error.tsx` at the app root catches errors the root layout itself throws.
- In production, a server-thrown error is replaced with a generic message plus a correlation hash before it
  reaches the client — check server logs by that hash rather than the client-visible message. Development sends
  the full message/stack — never ship a `next dev` build to a real environment.
- Route Handlers and Server Actions: throw or return an explicit error `Response`/status; don't swallow a
  `catch {}` — surface it (log + rethrow, or a typed result via `useActionState`) so a bug isn't silently treated
  as success by the caller.

## 5. Testing
- **Unit / component**: React Testing Library + Vitest or Jest for Client Components and pure functions. A Server
  Component that's `async` and touches the DB/network is better covered by an integration or e2e test — RTL can't
  run the server data-fetching + streaming pipeline faithfully.
- **Server Actions**: test the exported function directly (constructed `FormData`/args, a mocked session/DB)
  rather than only through form-submission simulation — that also makes the unauthenticated and wrong-owner paths
  cheap to assert.
- **E2E**: Playwright against `next build && next start` (or `next dev` for faster iteration, accepting dev-mode
  differences). Cover: the happy path per route, an unauthenticated redirect, and one caching/revalidation
  round-trip (mutate → refetch → assert new value) if the route uses `"use cache"`/tags.
- See the `vercel-react-best-practices` skill for React-level render/measurement guidance, and
  `.agents/guides/principles/testing-strategy.md` for the pyramid/flakiness checklist.

## 6. Performance
- Turbopack is the default bundler in 16 (dev and build); a webpack-only plugin/loader config needs `--webpack` —
  check that before debugging "my config does nothing".
- Default to Server Components; every `"use client"` is JS the browser downloads, parses, and hydrates. Move the
  directive as far down the tree as the interactivity actually requires.
- Don't cache reflexively: an already-fast, uncached read (an indexed query) doesn't need `"use cache"` — adding
  it without a `cacheTag`/short profile risks serving stale data past a mutation. Reach for it once you've measured
  a slow, shareable, safely-stale read.
- `next/image`'s default `images.qualities` is `[75]` in 16 (not the old 1–100 range); `minimumCacheTTL` defaults
  to 4 hours — a `quality` prop is coerced to the nearest configured value.
- Prefetching (`<Link>`) is layout-deduplicated in 16: a shared layout across many links downloads once.

## 7. Security
Baseline shape:
1. **Pick one data-access model and stick to it** — a Data Access Layer (`import "server-only"` modules, each
   function taking "the current user" and checking authorization before returning data) is the recommended
   default for a new project; an HTTP API layer suits teams migrating an existing backend.
2. **Never trust `params`/`searchParams`/a cookie as authorization** — they're client-suppliable. Re-check "can
   this user see/modify this row" on every read and write, inside the data layer, not the page.
3. **Server Actions and Route Handlers are public endpoints.** Validate every argument's shape (`zod` or
   equivalent — TS types are erased at runtime) and re-authenticate/re-authorize inside the function body, every
   call, regardless of the calling UI.
4. **Never pass a whole DB row/`User` object to a Client Component** — pass the minimal DTO the UI needs. A class
   instance can't cross the RSC serialization boundary (by design); a plain object silently can, so the
   type-narrowing must be deliberate.
5. **`GET` must stay side-effect-free.** The App Router model never uses `GET` for mutations (Server Actions are
   always `POST`); a custom `route.ts` `GET` that mutates state is an intentional escape hatch needing its own
   CSRF review — it doesn't get the framework's built-in Origin/Host check.
6. Secrets: unprefixed env vars stay server-only automatically, but only if no `"use client"` file imports the
   module that reads them — `server-only` makes that a build error instead of a runtime leak.

## 8. Concurrency / async
- Server Actions dispatch **sequentially** from the client (implementation detail, not a guarantee) — for real
  parallelism, do it *inside* one Server Action/Route Handler (`Promise.all`), or fetch in parallel from a Server
  Component.
- `"use cache"` functions run in an isolated `React.cache()` scope: a value stashed in an outer `React.cache()`
  during a dynamic render is **not** visible inside a nested cached function — pass it in as an argument instead.
- A cache entry built during prerender that waits on a request-time value (params, `cookies()`) hangs the build
  for ~50s then times out — await the runtime value *before* entering the `"use cache"` scope, then pass it in.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| Trusting `formData`/`params` types without re-validating | types are erased at runtime | `zod` (or similar) `.parse()` on every Server Action/Route Handler input |
| No auth check inside a Server Action | it's a public endpoint either way | check session + resource ownership as the first lines |
| `middleware.ts` on a fresh Next.js 16 project | deprecated, Edge-only, being removed | `proxy.ts` exporting `proxy` |
| Sync `params`/`searchParams`/`cookies()` access | 16 requires async access | `await params`, `await cookies()`, etc. |
| Assuming a Route Handler `GET` is cached | default changed to dynamic in v15+ | explicit `revalidate`/`fetch` options/`"use cache"` |
| Whole `User`/DB row passed as a Client Component prop | over-exposes fields to the client | a minimal DTO with only the fields the UI renders |
| Marking a whole page/layout `"use client"` | ships needless JS, loses server data-fetching | `"use client"` only the interactive leaf |
| Hand-written Google Fonts `<link>` | extra request, layout shift, no self-hosting | `next/font/google` |
| `<Image>` without `alt`/sizing | CLS, a11y failure, type error | `alt` + `width`/`height` or `fill` |
| A `webpack()` config tweak with no effect | Turbopack is now the default bundler | verify support, or run with `--webpack` |

## 10. Review checklist
- [ ] every Server Action / Route Handler validates its input's shape and re-checks auth + resource ownership
- [ ] no `"use client"` file imports a server-only module (DB client, secret, `server-only`-marked file)
- [ ] `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` are all `await`ed
- [ ] `"use client"` is only on the components that actually need state/effects/browser APIs
- [ ] `<Image>` has `alt` and sizing (`width`+`height` or `fill`); fonts load via `next/font`
- [ ] a route relying on caching states its intent explicitly (`"use cache"` + `cacheLife`/`cacheTag`, or a plain
      `revalidate`) rather than assuming a default
- [ ] `middleware.ts` vs `proxy.ts` matches the installed major; an `output: 'export'` target has no Server
      Actions, `proxy.ts`, or dynamic Route Handler on its routes
- [ ] new/changed behavior has a test (Server Action unit test and/or Playwright e2e); typecheck and lint are clean

## 11. References
- Release notes: https://nextjs.org/blog/next-16 · patches: https://nextjs.org/blog
- App Router docs home: https://nextjs.org/docs/app
- Server/Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components
- Mutating data / Server Actions: https://nextjs.org/docs/app/getting-started/mutating-data ·
  https://nextjs.org/docs/app/guides/server-actions
- Route Handlers: https://nextjs.org/docs/app/api-reference/file-conventions/route
- Caching / `"use cache"`: https://nextjs.org/docs/app/api-reference/directives/use-cache ·
  https://nextjs.org/docs/app/getting-started/caching
- Metadata & OG images: https://nextjs.org/docs/app/getting-started/metadata-and-og-images
- `next/image`: https://nextjs.org/docs/app/api-reference/components/image · `next/font`:
  https://nextjs.org/docs/app/api-reference/components/font
- Deploying: https://nextjs.org/docs/app/getting-started/deploying (self-hosting and static-export guides linked
  from there; also cited inline in §2)
- Security model (data handling, taint APIs): https://nextjs.org/blog/security-nextjs-server-components-actions
- Upgrade guide: https://nextjs.org/docs/app/guides/upgrading/version-16
- React itself: `.agents/guides/frameworks/react.md` · skill: `vercel-react-best-practices`
- Principles: `.agents/guides/principles/` — `security.md`, `performance.md`, `testing-strategy.md`, `api-design.md`
