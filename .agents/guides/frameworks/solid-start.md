# SolidStart — engineering guide
> Scope: routing, data flow (`query`/`action`/`createAsync`), server functions, middleware, sessions, SSR, and
> deployment for `@solidjs/start` v2. Reactivity/component basics: `.agents/guides/frameworks/solidjs.md` (not
> repeated here). Quick card: `.agents/rules/fw-solid-start.md`.
> Last verified: 2026-09 against a SolidStart 2 + Tailwind 4 project (installed packages, their `dist/` and
> CHANGELOGs) and live `docs.solidjs.com`; disagreements between the two are flagged below.

## 1. Mental model / philosophy
- SolidStart v2 is not a separate framework runtime bolted onto Vite — it *is* Vite plugins (`solidStart()` +
  `nitro()`) plus a thin file-router and an h3-based server layer: no `app.config.ts`, and `vinxi` appears nowhere
  in `package.json` or `@solidjs/start`'s own dependencies (CHANGELOG: v2 "replaces Vinxi with direct use of Vite's
  Environment API").
- Two runtimes, one source tree: route files, and everything reachable from `entry-server.tsx`, execute in Node
  (SSR, `"use server"` functions) **and** ship to the browser (hydration). The compiler splits what runs where via
  `"use server"` and `clientOnly()` — never hand-split files by runtime yourself.
- Data flows through the router, not ad-hoc `fetch` + `createSignal`: `query()` gives every read a stable cache key,
  `action()` gives every write an observable submission, `createAsync` bridges a query into `<Suspense>`. A
  hand-rolled `createResource` + manual invalidation reinvents this and desyncs from other routes reading the data.
- KISS: keep `route` config, `GET`/`POST` handlers, and the default page component in one file until unwieldy — the
  file router does not require splitting them.

## 2. Project structure & tooling
### Reference setup (verified 2026-09)
`@solidjs/start ^2.0.0` (installed: `2.0.0` stable), `@solidjs/router ^1.0.0`, `vite ^8.0.0`,
`nitro ^3.0.260610-beta` (`nitro()` from `nitro/vite`), Node >= 24, `@solidjs/meta@0.29.4` (transitive, hoisted to
the project root). The reference `vite.config.ts`:
```ts
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [solidStart(), tailwindcss(), nitro()],
});
```
`solidStart(options?)` (verified `config/index.d.ts`) accepts: `appRoot` (default `"./src"`), `routeDir` (default
`"./routes"`), `extensions` (default `["js","jsx","ts","tsx"]`), `ssr` (default `true`; `false` = SPA-only),
`middleware` (§3), `serialization.mode` (`"json"` default | `"js"`), `serverFunctions.filter`/`.onError`, `env`
(below), `solid` (forwarded to `vite-plugin-solid`), `devOverlay`. `experimental.islands` is typed but fixed to
`false` — not usable yet.

### Project shape
```
src/
  app.tsx           # <Router root={...}><FileRoutes /></Router> — add <MetaProvider> before using <Title>/<Meta>
  entry-client.tsx  # mount(() => <StartClient />, document.getElementById("app")!)
  entry-server.tsx  # createHandler(() => <StartServer document={...} />) — the full HTML document
  routes/           # file routes — §3
  components/       # plain, routing-agnostic components
  middleware.ts     # optional — solidStart({ middleware: "src/middleware.ts" })
```
`entry-server.tsx`/`entry-client.tsx` both carry `// @refresh reload` — HMR full-reloads there, since they bootstrap
the whole app. Neither, nor anything they import transitively, may touch `window`/`document` at module scope.

### Environment variables
Standard Vite convention: a var prefixed `VITE_` (or whatever `env.client.prefix` is set to) is inlined into the
client bundle, readable via `import.meta.env.VITE_FOO` — treat it as public. Everything else is server-only, read
via `process.env.FOO` inside `"use server"` functions, API routes, middleware, or `entry-server.tsx` — never in a
component body that also runs on the client. Never put a secret (DB URL, session secret, API key) behind the
client prefix.

### Deployment (Nitro presets)
The deployable output shape is Nitro's, not SolidStart's: `nitro()`'s `preset` option (env var `NITRO_PRESET`, or
Nitro config) selects the target. Verified in installed `nitro@3.0.260610-beta`'s `dist/types/index.d.mts`: dozens
of presets exist (`"node-server"` — the reference setup's effective default, `"static"`, `"cloudflare-module"`, `"vercel"`,
`"netlify"`, `"deno-deploy"`, `"aws-lambda"`, ...) — match your host from that file's `PresetName` union rather
than guessing. The project's build script writes `.output/`; its start script runs `node .output/server/index.mjs`
for Node presets (exact commands: root `AGENTS.md`). Treat `.output/` like `dist/` — never hand-edit it.

## 3. Core idioms
### File routing: only three bracket shapes are special
Verified against the installed `@solidjs/start@2.0.0` file-router (`dist/config/fs-router.js`): the path converter
runs exactly one regex over the cleaned file path:
```ts
// dist/config/fs-router.js, abbreviated
.replace(/\[([^/]+)\]/g, (_, m) => {
  if (m.startsWith("...")) return `*${m.slice(3)}`;               // [...rest] -> *rest   (catch-all)
  if (m.startsWith("[") && m.endsWith("]")) return `:${m.slice(1, -1)}?`; // [[id]] -> :id? (optional)
  return `:${m}`;                                                  // [id]      -> :id    (required)
});
```
| File | Route path | Kind |
|---|---|---|
| `routes/users/[id].tsx` | `/users/:id` | required — `useParams().id` |
| `routes/users/[[id]].tsx` | `/users/:id?` | optional — matches `/users` and `/users/42` |
| `routes/[...404].tsx` | `/*404` | catch-all — anything unmatched |
| `routes/index.tsx` | `/` | index (`index` stripped) |
| `routes/about.tsx` | `/about` | static |

**Verified gap vs. some SolidStart documentation and Next.js-style expectations:** a parenthesized folder such as
`routes/(marketing)/about.tsx` — used elsewhere to group routes without adding a URL segment — is **not**
special-cased anywhere in the installed `dist/config/fs-router.js` or `dist/config/fs-routes/router.js`: the only
regex is the bracket one above, and it does not match `(...)`. The path matcher (`path-to-regexp@8.4.2`, installed)
has no bare-parenthesis "custom regex group" syntax either — that existed in v6 and was removed by v7+ in favor of
`{...}` optional groups. So here, `(marketing)/about.tsx` ships as the literal path `/(marketing)/about`, not
`/about`. **Before writing a `(group)` folder, build the route and check the generated path**; if it does not
strip, nest under a real path segment instead, or share UI through a plain component both routes import.

A layout wraps its child routes' output via `props.children` — like the root `<Router root={...}>` wraps every page
(e.g. `<Nav />` + `<Suspense>` in the starter app). For a layout scoped to part of the tree, define the parent explicitly (nested
`<Route>` children, or a `route` export building the same `RouteDefinition` tree) rather than assuming a same-named
sibling file (`blog.tsx` next to `blog/`) auto-layouts — check the built route tree first, same as `(group)` above.

### Data reads: `query` + `createAsync`
```tsx
// src/lib/posts.ts
import { query } from "@solidjs/router";
export const getPost = query(async (id: string) => {
  "use server";
  const post = await db.post.findUnique({ where: { id } });
  if (!post) throw new Error("not found");
  return post;
}, "post"); // cache key — must be unique across the whole app

// src/routes/posts/[id].tsx
import { createAsync, useParams } from "@solidjs/router";
import { getPost } from "~/lib/posts";
export default function Post() {
  const params = useParams();
  const post = createAsync(() => getPost(params.id));
  return <h1>{post()?.title}</h1>; // needs a <Suspense> above it (app.tsx already has one)
}
```
- `query(fn, name)` (verified `query.d.ts`) returns a cached, deduped function plus `.keyFor(...args)`/`.key`;
  `query.get`/`.set`/`.delete`/`.clear` inspect or seed the cache imperatively. **`cache` is a deprecated alias for
  `query`** — use `query` in new code.
- `createAsync(fn, options?)` wraps `createResource` for router-driven data; pass `initialValue` to avoid an
  `undefined` flash. `createAsyncStore` also takes a store `reconcile` option for large/streamed payloads.
- `revalidate(key?, force?)` re-runs cached queries — use it after an external event a `query()` key doesn't already
  track (a websocket push); not after an `action()` (actions revalidate automatically).

### Data writes: `action` + `useSubmission`/`useAction`
```tsx
import { action, redirect, useSubmission } from "@solidjs/router";

export const createPost = action(async (formData: FormData) => {
  "use server";
  const title = formData.get("title");
  if (!title) throw new Error("title required");
  await db.post.create({ data: { title: String(title) } });
  throw redirect("/posts");
}, "createPost");

function NewPost() {
  const submission = useSubmission(createPost);
  return (
    <form action={createPost} method="post">
      <input name="title" />
      <button disabled={submission.pending}>Save</button>
      {submission.error && <p>{String(submission.error)}</p>}
    </form>
  );
}
```
- `action(fn, name?|options)` (verified `action.d.ts`) — `options.onComplete` observes every submission; the
  returned `Action` also has `.with(...boundArgs)` to partially apply leading arguments.
- `useSubmission(action, filter?)` reads the latest matching submission (`.pending`, `.result`, `.error`, `.input`,
  `.clear()`); `useSubmissions` (plural) returns every concurrent one with its own `.pending`; `useAction(action)`
  gets a plain callable for firing it from code (not a `<form>`) while still tracked as a submission — prefer it
  over calling the exported `action` function directly for exactly that reason.
- `redirect(url, init?)`, `reload(init?)`, `json(data, init?)` (verified `response.d.ts`) are the only response
  helpers the single-flight mutation flow recognizes — return or `throw` them, never a hand-built `Response`.

### Route preload
A route's exported `route` config can declare a `preload` function (`RouteDefinition.preload`, `RoutePreloadFunc`)
that runs on link hover/navigation intent, ahead of mounting, so a `createAsync` read inside the component often
resolves instantly from cache. The same field's old name, `load`, still type-checks but is `@deprecated` — write
`preload`. Keep it side-effect-free and call the same `query()` the component calls, so both hit one entry.

### API routes
Any route file exporting `GET`/`POST`/`PUT`/`DELETE`/`PATCH`/`HEAD`/`OPTIONS` (verified `HTTP_METHODS`,
`fs-router.js`) becomes (also) an API endpoint at that path — a file can carry both a page default export and HTTP
method exports.
```ts
// src/routes/api/health.ts
import { json } from "@solidjs/router";
export function GET() {
  return json({ ok: true });
}
```
Each handler gets an `APIEvent` (`request`, `response`, `params`, `locals`, `nativeEvent`). Read the body with
`@solidjs/start/http`'s helpers (`readBody`, `readFormData`, `getRouterParams`), not `request.json()` directly, so
behavior matches across dev and every Nitro preset.

### Middleware
```ts
// src/middleware.ts — referenced by solidStart({ middleware: "src/middleware.ts" }) in vite.config.ts
import { createMiddleware } from "@solidjs/start/middleware";

export default createMiddleware([
  async (event, next) => {
    const start = Date.now();
    const res = await next();
    console.log(event.req.url, Date.now() - start, "ms"); // h3 v2: event.req, not event.request
    return res;
  },
]);
```
`createMiddleware` (verified `middleware/index.d.ts`) takes an array of h3 v2 `Middleware` functions, each
`(event: H3Event, next) => ...` — the request lives on `event.req` (verified `h3@2.0.1-rc.26`'s `dist/h3.d.mts`),
not `event.request`. Call and `await next()` to run logic before the response is built, or inspect/replace what it
returns after. The older `{ onRequest, onBeforeResponse }` object form still type-checks but is `@deprecated`.

### Sessions and cookies
All verified exports of `@solidjs/start/http` (wrapped h3 utilities): `getCookie`, `setCookie`, `deleteCookie`,
`parseCookies`, and — for signed/sealed sessions — `useSession`, `getSession`, `updateSession`, `sealSession`,
`unsealSession`, `clearSession`. This is v2's replacement for v1's `vinxi/http`; nothing under `vinxi/*` exists here.
```ts
// inside a "use server" function or an API route handler
import { useSession } from "@solidjs/start/http";
const session = await useSession<{ userId?: string }>({ password: process.env.SESSION_SECRET! });
await session.update({ userId: user.id });
```
For the raw platform `Request` (not the h3-specific helpers above), use `getRequestEvent()` from `solid-js/web` — it
returns the current `FetchEvent` (`request`, `response`, `locals`, `clientAddress`) on the server, `undefined` on
the client outside hydration.

### Head and meta tags
`@solidjs/meta@0.29.4` (verified installed, hoisted to the root as a dependency of `@solidjs/start`): wrap the app
once in `<MetaProvider>` (the starter `app.tsx` has none —
`<MetaProvider><Router root={...}><FileRoutes /></Router></MetaProvider>`), then use `<Title>`/`<Meta>`/`<Link>` per
route:
```tsx
// src/routes/about.tsx
import { Title, Meta } from "@solidjs/meta";
export default function About() {
  return (<><Title>About</Title><Meta name="description" content="..." /></>);
}
```

## 4. Error handling
- A `"use server"` function that throws serializes the error to the client — `serverFunctions.onError` (verified
  `SolidStartOptions`) lets you redact internal detail before it's sent, since the thrown value's own properties get
  serialized. `.stack` is only included in development; production strips it (verified CHANGELOG `2.0.0-rc.4`).
- A thrown `redirect()` inside a query/action is not an error to swallow — SolidStart recognizes and performs it. A
  wrapping `try/catch` that converts every caught value to a generic 500 breaks this; re-throw anything already a
  `Response`.
- Wrap page-level rendering errors in an `<ErrorBoundary>` exactly as in plain Solid (`fw-solidjs.md` §4); a
  `createAsync` rejection surfaces the same way a `createResource` rejection does.
- Never send a server function's raw internal error message to the client in production — log server-side, send a
  sanitized message (`serverFunctions.onError`, or a `try/catch` that throws a clean `Error`).

## 5. Testing
### Unit (reference setup: Vitest + `@solidjs/testing-library`, jsdom)
Test plain components and route-agnostic logic as in `fw-solidjs.md` §5. For code reading
`getRequestEvent()`/session/cookies, extract the pure logic into a function taking plain arguments instead of
calling request-scoped helpers directly — unit-testable with no h3 event; leave that wiring to e2e coverage.
### E2E (Playwright; the project's e2e script, per root `AGENTS.md`)
- Test routing, data, and mutations against a real built server — mocking `query`/`action` in a unit test loses
  exactly the cache/revalidation behavior that is SolidStart-specific.
- Locate by role/label/text; assert on mutated state after a submit (`useSubmission`'s pending settling, or the
  redirected URL), not a fixed wait.
- If the Playwright `webServer` builds and starts the app with `reuseExistingServer`, a server already listening on
  its port (dev port: root `AGENTS.md`) is reused — stop a running dev server first if you changed server-side
  code; a reused server serves the old build.
- Cover: a full page load (SSR HTML has real data, not a loading skeleton), a client-side navigation (no full
  reload), a mutation's success/validation-error paths, and the catch-all/`[...404]` route.

## 6. Performance
- Every `query()` is deduped/cached client- and server-side by its arguments — don't layer a second cache on top;
  call `revalidate`/`query.set` instead of a parallel cache-busting scheme.
- Use route preload (§3) for data a user is very likely to need next — it overlaps the fetch with the navigation
  transition instead of waiting for the component to mount.
- `deferStream: true` on `createAsync`/`createAsyncStore` flushes the initial HTML shell before that data resolves
  (verified `data/createAsync.d.ts`), trading a later `<Suspense>` resolve for a faster first byte — use it for
  below-the-fold data, not a page's primary content.
- The default `serialization` mode is already `"json"` (CSP-friendly) — opt into `serialization: { mode: "js" }`
  (Seroval) only after measuring a real payload-size problem, and only if your CSP allows `eval()` (§7).
- Inspect `.output/` bundle size after adding a heavy dependency to a route; lazy-load rarely-visited routes' heavy
  components as in plain Solid (`lazy(() => import(...))`, `fw-solidjs.md` §6).

## 7. Security
- Never trust `params`/search params/`formData` inside a `"use server"` function without validating shape and
  authorization first — it's a public network endpoint, reachable without going through your UI at all.
- Keep auth/session state behind `@solidjs/start/http`'s sealed session (`useSession`, an encrypted, signed cookie)
  — never a plain unsigned cookie for anything that grants access.
- The default `serialization` mode (`"json"`) is already CSP-friendly (§6, verified `config/index.d.ts` `@default
  "json"`) — only opting into `serialization: { mode: "js" }` (Seroval) needs `'unsafe-eval'` in your CSP.
- Client-exposed env vars (`import.meta.env.VITE_*`) ship in the browser bundle — keep secrets unprefixed, read only
  inside `"use server"` functions, API routes, or middleware, never a component body that also runs client-side.
- Middleware is the right layer for cross-cutting authorization/rate-limiting that must run before every matching
  request — don't rely on every route remembering its own check.
- Solid's escaping rules still apply in SSR HTML (`fw-solidjs.md` §7) — never string-concatenate request data into
  the document shell (`entry-server.tsx`) or a hand-built `Response`.

## 8. Concurrency / async
- SSR streams by default (`HandlerOptions.mode: "sync"|"async"|"stream"`, verified `server/types.d.ts`) — a slower
  read (especially with `deferStream: true`) can resolve after the initial HTML shell was sent; it's only guaranteed
  by the time its `<Suspense>` resolves, not by response start.
- `useSubmissions` (plural) exists because a user can fire the same action multiple times concurrently before any
  settle — read `.pending` on the array, not just the last call, for "anything in flight".
- A `"use server"` function runs once per network call with no implicit request-scoped memoization across separate
  functions in the same render — share an expensive lookup explicitly (a cache keyed off `getRequestEvent()`, or
  one combined `query()`).
- Nitro's runtime under the `node-server` preset is Node/h3-based, but the same code can target edge presets with fewer
  Node APIs (§2) — avoid Node-only globals (`Buffer`); prefer Web-standard `Request`/`Response`/`crypto.subtle`.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `app.config.ts` / `vinxi/*` import | v2 has neither — stale or a build error | config via `solidStart()`+`nitro()` in `vite.config.ts`; `vinxi/http` -> `@solidjs/start/http` |
| `routes/(group)/page.tsx` to hide a segment | not stripped by the file-router (verified) | check the real built path; nest under a real segment |
| Calling the exported `action` directly from a click handler | skips single-flight revalidation — other screens go stale | `useAction(myAction)` or `<form action={myAction}>` |
| Two `query()`/`action()` calls sharing one name string | silently share (and clobber) one cache entry | unique name string per loader |
| Hand-built `Response`/`Location` header for an action redirect | mutation flow doesn't special-case it | `redirect(url)` / `throw redirect(url)` |
| Cookies/session via raw Node `req`/`vinxi/http` | doesn't exist / breaks other deploy targets | `@solidjs/start/http`'s `getCookie`/`useSession` |
| Hand-rolled `createResource` + manual refetch for router data | reinvents router caching; desyncs from action revalidation | `query()` + `createAsync()` |
| Secrets read in a component body with no server guard | ships to the client bundle | read only in server-only functions/routes/middleware |
| Editing `.output/` | regenerated by every build | change source, rebuild |

## 10. Review checklist
- [ ] no `app.config.ts`/`vinxi` import; config is `solidStart()`+`nitro()` in `vite.config.ts`
- [ ] route folders use only `[id]`/`[[id]]`/`[...rest]`; a `(group)` folder's built path was checked, not assumed
- [ ] every server-only function starts with `"use server"`, validates inputs, never leaks internal error detail
- [ ] mutations via `action()` + `<form>`/`useAction()` (never the bare function); reads via `query()`+`createAsync()`
      with a unique cache-key name
- [ ] every query/action that redirects or forces a refetch returns/throws `redirect()`/`reload()`/`json()`
- [ ] cookies/session use `@solidjs/start/http`; nothing grants access based on an unsigned cookie
- [ ] secrets are unprefixed and read only server-side; client env vars use the configured prefix
- [ ] every `createAsync`/`createResource` read sits under a `<Suspense>`
- [ ] unit tests cover extracted pure logic; e2e covers a real SSR load, a navigation, and a mutation's
      success/error paths against a freshly built server
- [ ] the project's typecheck, lint, and test commands (root `AGENTS.md`; or `node .agents/scripts/verify.mjs --only node`) pass

## 11. References
- Docs: routing https://docs.solidjs.com/solid-start/building-your-application/routing · migrating from v1
  https://docs.solidjs.com/solid-start/v2/migrating-from-v1 · reference index https://docs.solidjs.com/solid-start
- `@solidjs/router` data APIs: https://github.com/solidjs/solid-router — verified vs installed
  `@solidjs/router@1.0.0`'s `dist/data/*.d.ts`.
- `@solidjs/start` source/changelog: https://github.com/solidjs/solid-start — verified vs installed
  `@solidjs/start@2.0.0`'s `dist/`/`CHANGELOG.md`.
- Nitro: https://nitro.build — verified vs installed `nitro@3.0.260610-beta`'s `dist/types/index.d.mts`.
- `path-to-regexp` syntax: https://github.com/pillarjs/path-to-regexp — verified vs installed
  `path-to-regexp@8.4.2`'s `Readme.md`.
- `h3` v2 (`H3Event`/`Middleware`): https://h3.dev — verified vs installed `h3@2.0.1-rc.26`'s `dist/h3.d.mts`.
- `@solidjs/meta`: https://github.com/solidjs/solid-meta — verified installed `@solidjs/meta@0.29.4`.
- SolidJS core (signals/stores/control flow): `.agents/guides/frameworks/solidjs.md`.
