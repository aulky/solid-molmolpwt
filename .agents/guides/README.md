# Guides index

Deep reference guides, read on demand. The matching quick card in `.agents/rules/` (`lang-*`, `fw-*`, `topic-*`)
loads automatically and points here. Read the guide for your language/framework before non-trivial work in it,
and the principles guide for the concern you are checking.

## Principles (language-agnostic checks you run on your own diff)
- `principles/simplicity.md` — KISS, DRY, YAGNI, rule of three, essential vs accidental complexity, deletion.
- `principles/design-principles.md` — SOLID (pragmatic), coupling/cohesion, composition, Law of Demeter, CQS, ports & adapters.
- `principles/clean-code.md` — naming, function shape, parameters, comments, magic values, dead code, consistency.
- `principles/error-handling.md` — failure taxonomy, fail fast, exceptions vs result types, wrapping, retries, boundaries.
- `principles/testing-strategy.md` — what to test, TDD, test doubles, property/contract tests, e2e scope, flakiness.
- `principles/code-review.md` — review order, severity labels, actionable comments, reviewing AI-generated code.
- `principles/security.md` — threat modeling, OWASP Top 10 (app + API), authn/authz, secrets, crypto, SSRF, uploads, supply chain.
- `principles/dependency-management.md` — choosing, pinning, updating and auditing dependencies across ecosystems.
- `principles/performance.md` — measure first, budgets, complexity, N+1, caching, batching, Web Vitals, load tests.
- `principles/concurrency.md` — async models, races, locks/channels/actors, cancellation, backpressure, idempotency.
- `principles/api-design.md` — REST/GraphQL/gRPC/webhook contracts, errors, pagination, idempotency, versioning.
- `principles/database-design.md` — modeling, keys, constraints, indexes, query plans, transactions, migrations, ORMs.
- `principles/architecture.md` — layering, modular monolith, bounded contexts, hexagonal, events, ADRs, fitness functions.
- `principles/refactoring.md` — refactor vs rewrite, Chesterton's fence, characterization tests, small safe steps.
- `principles/git-workflow.md` — atomic commits, Conventional Commits, trunk-based flow, shared-history safety, archaeology.
- `principles/documentation.md` — Diataxis, READMEs, writing for scanners, runnable examples, doc comments, ADRs, changelogs.
- `principles/observability.md` — structured logs, correlation IDs, RED/USE metrics, OpenTelemetry, SLOs, what never to log.
- `principles/accessibility.md` — WCAG 2.2 AA, semantic HTML, ARIA, keyboard/focus, contrast, forms, accessibility testing.

## Languages (quick card: `rules/lang-<id>.md`)
- `languages/typescript.md` — TypeScript apps, servers and libraries.
- `languages/javascript.md` — plain JavaScript across Node, Bun and Deno.
- `languages/python.md` — application, service and library code on CPython.
- `languages/rust.md` — writing, reviewing and testing Rust.
- `languages/go.md` — Go modules: services, CLIs, libraries.
- `languages/php.md` — modern PHP (8.3-8.5), framework-agnostic.
- `languages/sql.md` — PostgreSQL, MySQL/MariaDB, SQLite, SQL Server: writing, testing, tuning.
- `languages/shell.md` — POSIX sh, bash and GNU Make for scripts, CI glue and tooling.
- `languages/powershell.md` — Windows PowerShell 5.1 and PowerShell 7 scripts and modules.
- `languages/html.md` — HTML documents and SSR/templated markup.
- `languages/css.md` — plain CSS, Sass/SCSS, Less, PostCSS in any framework.

## Frameworks (quick card: `rules/fw-<id>.md`, activated per repo by `node .agents/scripts/activate-stack.mjs`)
- `frameworks/solidjs.md` — Solid reactivity and components: signals, stores, control flow, testing.
- `frameworks/solid-start.md` — SolidStart routing, `query`/`action`/`createAsync`, server functions, SSR.
- `frameworks/react.md` — plain React (any bundler/router).
- `frameworks/nextjs.md` — Next.js App Router: rendering, caching, Server Actions, deployment.
- `frameworks/astro.md` — islands, routing, content, rendering modes, actions.
- `frameworks/tailwind.md` — Tailwind CSS v4 CSS-first config, utilities, dark mode, class-name safety.
- `frameworks/node-server.md` — Express, Fastify, Hono, H3/Nitro, Koa, NestJS, Elysia backends.
- `frameworks/fastapi.md` — FastAPI (Pydantic v2, dependencies, async, SQLAlchemy 2.0) plus Flask.
- `frameworks/laravel.md` — Laravel structure, Eloquent, authorization, queues, testing.
- `frameworks/rust-web.md` — axum/actix-web/rocket services on tokio and sqlx.
- `frameworks/go-web.md` — `net/http` (Go 1.22+ ServeMux), chi, gin, echo services.
