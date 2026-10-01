---
trigger: model_decision
globs: "**/page.tsx,**/page.jsx,**/layout.tsx,**/layout.jsx,**/route.ts,**/route.js,**/actions.ts,**/loading.tsx,**/error.tsx,**/middleware.ts,**/next.config.*"
description: "Apply when working in a Next.js codebase (package.json dependency next): App Router, Server/Client Components, Server Actions, caching, proxy, routing, images/fonts."
---
# Next.js — quick card
Applies only if package.json dependency next. Otherwise ignore this rule.
Deep guide: `.agents/guides/frameworks/nextjs.md` — read before non-trivial work (Server Actions, caching, routing, proxy/middleware, deployment).

## Project shape
- App Router (`app/`): `page.tsx` = route UI, `layout.tsx` = shared shell, `route.ts` = a plain HTTP endpoint, `loading.tsx`/`error.tsx` = automatic per-segment Suspense/error boundaries.
- Every component is a **Server Component** by default — its code never ships to the browser. Add `"use client"` only on the leaf needing state/effects/browser APIs (core React idioms: `.agents/rules/fw-react.md`, not repeated here).
- Mutations go through **Server Actions** (`"use server"`) or a `route.ts` handler, not a hand-rolled client fetch unless one already exists.

## Invariants (MUST / NEVER — with reason → alternative)
1. MUST authenticate, authorize, AND validate input inside every Server Action and route handler — it's a public HTTP endpoint reachable directly (curl), not gated by your UI. Check the session, then re-check this user owns *this* resource before mutating.
2. NEVER treat `params`/`searchParams`/a cookie as access control by itself (`?team=other-team` is attacker-controlled) — re-verify access to that resource on every read, inside the data layer, not by trusting the URL.
3. MUST `await params`, `await searchParams`, `await cookies()`, `await headers()`, `await draftMode()` — all are Promises now; sync access throws or silently returns nothing.
4. NEVER let a secret or unprefixed env var live in a module a Client Component imports — only `NEXT_PUBLIC_`-prefixed vars reach the browser; others become `""`. Add `import "server-only"` to data-access modules so a client import fails the build, not the runtime.
5. NEVER assume a route handler's `GET` is cached — default is dynamic (request-time) since v15. Set `export const revalidate = <seconds>`, `fetch(url, { next: { revalidate } })`, or `"use cache"` explicitly.
6. MUST use `proxy.ts` (export `proxy`) on Next.js 16 — `middleware.ts` still runs but is deprecated (Edge-only); check the installed `next` version first.
7. NEVER ship `<Image>` without `alt` and without `width`+`height` or `fill` — missing sizing causes layout shift; missing `alt` fails a11y and the type check.
8. NEVER hand-write a Google-Fonts `<link>` — use `next/font/google`/`next/font/local` so the font is self-hosted, preloaded, and shift-free.

## Patterns
- Data fetching: `await fetch(...)`/DB call inside an `async` Server Component; wrap the slow part in `<Suspense fallback>` (or `loading.tsx`) so the rest streams first.
- Explicit caching ("Cache Components", opt-in `cacheComponents: true` in `next.config.ts`): mark a function/component `"use cache"`, set a lifetime with `cacheLife(...)`, tag with `cacheTag(...)`; invalidate with `revalidateTag(tag, profile)` (SWR) or `updateTag(tag)` in a Server Action (read-your-writes).
- Security shape: one data-access layer (`import "server-only"`) re-checks the caller per call; pass only minimal, filtered fields to Client Components — never a whole `User`/DB row. Deep guide §7; `vercel-react-best-practices` skill for render/bundle patterns.

## Pitfalls
- Client Component importing a server-only module (DB client, secret) fails the build at the `"use client"` boundary — call it from a Server Action/data layer, pass only the result as a prop.
- `revalidateTag("x")` (one arg) still runs but is deprecated — SWR needs a profile: `revalidateTag("x", "max")`.
- A parallel-route slot with no `default.js` fails the **build**, not a silent 404 — add one per slot, even if it just calls `notFound()`.
- Turbopack is the default bundler; a `webpack(config) {...}` customization is inert unless you run `next dev --webpack` / `next build --webpack`.

## Example — bad → good
```ts
// bad: no auth/authz check, trusts the client-supplied id outright
export async function deletePost(formData: FormData) {
  "use server";
  await db.post.delete({ where: { id: formData.get("id") } });
}
```
```ts
// good: input validated, session verified, ownership re-checked
"use server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function deletePost(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const post = await db.post.findUniqueOrThrow({ where: { id } });
  if (post.authorId !== session.user.id) throw new Error("Forbidden");
  await db.post.delete({ where: { id } });
  revalidatePath("/posts");
}
```

## Before finishing
- [ ] every Server Action/route handler re-checks auth + ownership + validates input · [ ] no secret/unprefixed env var reachable from a `"use client"` file · [ ] `params`/`searchParams`/`cookies()`/`headers()` are `await`ed · [ ] `<Image>` has `alt`+sizing; fonts via `next/font` · [ ] typecheck/lint clean, new behavior tested, `node .agents/scripts/verify.mjs --only node` passes
