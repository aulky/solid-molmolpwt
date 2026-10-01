# Architecture — engineering guide
> Scope: layering, modular monolith, bounded contexts, hexagonal, events, microservices, CQRS, configuration, feature flags, ADRs, fitness functions — each as a check you run on your own diff or plan. Decision protocol: `.agents/rules/topic-architecture-decisions.md`. Companions: `.agents/guides/principles/design-principles.md` (ports and adapters in detail), `simplicity.md`.
> Last verified: 2026-09 — official docs: dependency-cruiser rules and `options.tsConfig`, import-linter, golangci-lint v2 depguard, Pest 5.x `arch()`, Deptrac, OpenFeature `getBooleanValue` (js-sdk README) and CNCF status, Laravel 12 config caching, MADR 4.0.0; patterns are version-independent.

## 0. How to use this guide

Architecture = the decisions that are expensive to change (boundaries, dependency direction, data ownership, communication, configuration). Goal: keep the next change cheap. Each section: **definition**, **why**, **check** (run it on your diff or plan), **example** (bad → good), **trap**. If your task adds a new service, database, queue, framework or cross-module dependency, stop and follow `topic-architecture-decisions.md` before writing code. Search with `node .agents/scripts/search.mjs <regex> [path]`.

## 1. Layering

**Definition.** Split code by reason of change: *delivery* (HTTP handlers, CLI, routes) → *application* (use cases, one user intent each) → *domain* (business rules, no I/O) ← *infrastructure* (DB, queues, external APIs; implements interfaces the inner layers declare). Dependencies point inward only.

**Why.** Business rules need the most tests and outlive frameworks. A handler holding SQL plus pricing rules makes pricing untestable without a database and lets a framework upgrade touch business logic.

**Check.**
- Does any file in the domain or use-case layer import a framework, ORM, HTTP client or SDK? One search per language (adapt the package list to your stack; the §2 tools are the authoritative check):
  - TS: `node .agents/scripts/search.mjs "^import .*(express|hono|prisma|axios|@aws-sdk)" src/domain`
  - Python: `node .agents/scripts/search.mjs "^(from|import) (sqlalchemy|requests|httpx|boto3|fastapi|django)" shop/billing/domain`
  - Go (also matches lines inside `import ( ... )` blocks): `node .agents/scripts/search.mjs "database/sql|net/http" internal/billing/domain`
  - PHP: `node .agents/scripts/search.mjs "^use (Illuminate|Doctrine)\W" app/Billing/Domain`
- Does a handler contain a business rule (price, threshold, state transition)? Handlers parse input, call one use case, map the result.
- Can you unit-test the rule you just wrote with zero I/O? If not, it is in the wrong layer.

**Example (TypeScript).**
```ts
// bad: route handler mixes transport, SQL and a business rule
app.post("/orders/:id/cancel", async (c) => {
  const o = await db.query("select * from orders where id = $1", [c.req.param("id")]);
  if (o.status === "shipped") return c.json({ error: "too late" }, 409); // rule hidden in HTTP code
  await db.query("update orders set status = 'cancelled' where id = $1", [o.id]);
  return c.body(null, 204);
});

// good: the rule lives in the domain; the handler only translates
export function cancel(order: Order): Order {            // domain/order.ts — pure
  if (order.status === "shipped") throw new CannotCancel(order.id);
  return { ...order, status: "cancelled" };
}
app.post("/orders/:id/cancel", async (c) => {             // routes/orders.ts
  await cancelOrder(orders, c.req.param("id"));           // use case: load → cancel() → save
  return c.body(null, 204);
});
```

**Trap.** Four layers with a DTO and mapper each for a CRUD screen with no rules. If the "domain" would copy the table, call the data layer from the handler; add layers when a real rule appears.

## 2. Modular monolith first

**Definition.** One deployable unit split into business-capability modules (`billing`, `catalog`, `shipping`), each with a small public API and private internals. Modules talk only through that API, never via each other's tables or internal files.

**Why.** Most of what people want from microservices (independent reasoning, ownership, parallel work) without network failures, distributed transactions and N pipelines. Boundaries are cheap to move inside one codebase, expensive across a network. Fowler ("MonolithFirst"): successful microservice systems usually started as a monolith split once boundaries were understood.

**Check.**
- Top-level folders are capabilities (`src/modules/billing/`), not only technical kinds (`controllers/`, `models/`).
- Every cross-module import goes through the target module's entry file (`index.ts`, `__init__.py`, Go package API, PHP `Contracts` namespace).
- No module touches another module's tables: `node .agents/scripts/search.mjs "\b(invoices|invoice_lines)\b" src/modules/shipping`
- A tool enforces the boundary in CI (§11), not convention.

**Enforcement per language (pick the one your stack has).**
```js
// TypeScript — .dependency-cruiser.cjs ; install: npm i -D dependency-cruiser ; run: npx depcruise src (runner per lockfile)
module.exports = {
  forbidden: [
    { name: "module-public-api-only", severity: "error",
      from: { path: "^src/modules/([^/]+)/" },
      to:   { path: "^src/modules/", pathNot: "^src/modules/($1/|[^/]+/index\\.ts$)" } },
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
  ],
  // without tsConfig, alias imports (`~/modules/x/...`) are not resolved and slip past the rule
  options: { tsConfig: { fileName: "tsconfig.json" }, doNotFollow: { path: "node_modules" } },
};
```
```toml
# Python — pyproject.toml ; run: lint-imports
[tool.importlinter]
root_package = "shop"
[[tool.importlinter.contracts]]
name = "Modules are independent"
type = "independence"
modules = ["shop.billing", "shop.catalog", "shop.shipping"]
```
```yaml
# Go — the compiler already forbids importing another tree's internal/ packages:
#   shop/billing/internal/... is importable only from shop/billing/...
# For layer bans, golangci-lint v2 depguard (.golangci.yml):
version: "2"
linters:
  enable: [depguard]
  settings:
    depguard:
      rules:
        domain-is-pure:
          files: ["**/domain/**"]
          deny:
            - pkg: "database/sql"
              desc: "domain must not do I/O; declare a port"
```
```php
// PHP — Pest arch test (tests/ArchTest.php) ; run: vendor/bin/pest
arch('billing internals stay private')
    ->expect('App\Billing\Internal')
    ->toOnlyBeUsedIn('App\Billing');
arch('domain is framework-free')
    ->expect('App\Billing\Domain')
    ->not->toUse('Illuminate');
```
Rust: make each module a crate in a Cargo workspace; Cargo rejects cycles among normal dependencies (dev-dependencies may cycle), and `pub(crate)` keeps internals private.

**Trap.** Twelve modules on day one from guessed capabilities. Start with the two or three that real requirements name; split when changes keep colliding.

## 3. Bounded contexts (DDD-lite)

**Definition.** A bounded context is the area in which one model and one vocabulary are consistent. "Customer" in billing (tax ID, payment method) is not "customer" in shipping (address, delivery window). DDD-lite keeps the language, contexts, aggregates (consistency boundaries) and anti-corruption layers; it skips the ceremony.

**Why.** One shared model for every use becomes a god-object every team edits; every change risks every feature.

**Check.**
- A field added to a shared entity for one context only? Put it in that context's own model.
- Two modules sharing an ORM model class? Each module owns its model and refers to the other by ID.
- Does code use the business's words? `Account` in code but "workspace" in the product is a translation bug waiting to happen.
- Does each aggregate enforce its invariants in one transaction and reference other aggregates only by ID?

**Example (Python).**
```python
# bad: one shared Customer model grows every context's fields
class Customer(Base):
    id: int; email: str; vat_id: str; card_token: str      # billing
    street: str; delivery_window: str                       # shipping
    loyalty_points: int                                     # marketing

# good: each context owns its model; the link is an ID
@dataclass(frozen=True)
class BillingAccount:            # shop/billing/model.py
    customer_id: int; vat_id: str; card_token: str

@dataclass(frozen=True)
class Recipient:                 # shop/shipping/model.py
    customer_id: int; street: str; delivery_window: str
```

**Trap.** Full tactical DDD (factories, domain services, a value object per primitive, domain events) in a small CRUD app. Use the strategic part (contexts, language, ownership) everywhere; tactical patterns only where rules are complex.

## 4. Hexagonal (ports and adapters)

**Definition.** The core declares the interfaces it needs (ports); infrastructure implements them (adapters). Same dependency direction as §1, applied at the boundary with the outside world. Full treatment with a Go example: `.agents/guides/principles/design-principles.md` §6.

**Check.** For each new interface: name its second implementation (a production adapter plus a test fake counts). If none exists, delete the interface and call the concrete code.

**Trap.** Ports for things that never vary and are never faked (a logger wrapper, a `Clock` in code with no time rules).

## 5. Event-driven: trade-offs

**Definition.** A component announces a fact (`OrderPlaced`) and others react, instead of the producer calling each consumer.

**Gains:** temporal decoupling, fan-out to consumers the producer should not know, audit trails. **Costs:** eventual consistency, no single call stack to debug, at-least-once delivery (duplicates), ordering, event schema evolution, flow invisible from any one file.

**Check.**
- Would an in-process call do? If the consumer must succeed for the operation to be correct, it is a call, not an event.
- Dual write (DB write, then broker publish) loses events on a crash in between. Use a transactional outbox.
- Is every consumer idempotent (safe to receive the same event twice)?
- Events are versioned past-tense facts, not disguised commands (`SendEmail`).

**Example (TypeScript, outbox).**
```ts
// bad: dual write — a crash between the two lines loses the event
await db.insert(orders).values(order);
await broker.publish("order.placed", { id: order.id });

// good: outbox row in the same transaction; a relay publishes it later
await db.transaction(async (tx) => {
  await tx.insert(orders).values(order);
  await tx.insert(outbox).values({ type: "order.placed.v1", payload: { id: order.id } });
});
```
**Example (Go, idempotent consumer).**
```go
func (h *Handler) OnOrderPlaced(ctx context.Context, e OrderPlaced) error {
	return h.db.InTx(ctx, func(tx Tx) error {
		first, err := tx.MarkProcessed(ctx, e.EventID) // INSERT ... ON CONFLICT DO NOTHING
		if err != nil || !first {
			return err // duplicate delivery: already handled, do nothing
		}
		return tx.ReserveStock(ctx, e.OrderID)
	})
}
```

**Trap.** An in-process event bus between two functions of one module: all the debugging cost, no benefit. Event sourcing where an append-only audit table would do.

## 6. When microservices

**Definition.** Independently deployable services that own their data and communicate over the network.

**Split only when one is true and measured:** teams blocked by one deploy pipeline; a part with very different scaling, availability or compliance needs; a part that needs another runtime. Prerequisites (Fowler): rapid provisioning, monitoring, rapid deployment, plus tracing and an on-call owner per service.

**Check** (answer in an ADR, §10):
- Which module boundary, already enforced in the monolith (§2), becomes the service boundary?
- Does the service own its data? A shared database means a distributed monolith.
- Which calls go over the network, and what happens on timeout, retry, partial failure?
- Must any user operation commit in two services? Then the boundary is wrong.

**Trap.** Splitting by technical layer ("DB service", "validation service"): chatty calls on every request. Split by business capability, after the monolith proves the boundary.

## 7. CQRS restraint

**Definition.** Separate models for writes (commands enforcing rules) and reads (queries shaped for screens), sometimes with separate, asynchronously synced stores.

**Why restraint.** Fowler warns that for most systems CQRS adds risky complexity; separate stores make every screen eventually consistent.

**Check.** The cheap form is almost always enough: domain model for writes, plus read queries that select exactly what a screen needs (SQL view, projection, DTO) without loading aggregates. Separate read stores only for a measured load the write store cannot serve after indexes and materialized views.

**Trap.** Command buses, handler classes and a second database for a form that saves a row and a list that shows it.

## 8. Configuration

**Definition.** Configuration is everything that varies between deploys (URLs, credentials, limits, feature defaults). Keep it out of code, read it at one place at startup, validate it, and pass typed values inward (Twelve-Factor App, factor III).

**Check.**
- Is `process.env`, `os.environ`, `os.Getenv` or `env()` read outside the one config module? `node .agents/scripts/search.mjs "process\.env|os\.environ|os\.Getenv|env\(" src`
- Does startup fail clearly on a missing or malformed value, instead of on first use?
- Are secrets absent from the repository, defaults, logs and error messages?
- Laravel: call `env()` only inside `config/*.php`; after `php artisan config:cache` the `.env` file is not loaded, so `env()` outside `config/` returns only real OS environment variables (values that exist only in `.env` become `null`). Use `config('services.x.key')`.

**Example (Go).**
```go
// bad: read and parsed deep inside business code, error discovered at 3 a.m.
func chargeTimeout() time.Duration { d, _ := time.ParseDuration(os.Getenv("CHARGE_TIMEOUT")); return d }

// good: load once, validate, fail fast, pass a typed struct
type Config struct{ ChargeTimeout time.Duration; DBURL string }
func Load() (Config, error) {
	d, err := time.ParseDuration(os.Getenv("CHARGE_TIMEOUT"))
	if err != nil { return Config{}, fmt.Errorf("CHARGE_TIMEOUT: %w", err) }
	url := os.Getenv("DATABASE_URL")
	if url == "" { return Config{}, errors.New("DATABASE_URL is required") }
	return Config{ChargeTimeout: d, DBURL: url}, nil
}
```

**Trap.** Configurable "just in case": a value that never differs between environments is a constant; every knob is an untested path.

## 9. Feature flags

**Definition.** A runtime switch that decouples deploying code from releasing behaviour. Kinds (Pete Hodgson, "Feature Toggles"): release (short-lived, hide unfinished work), experiment (A/B), ops (kill switch, long-lived), permission (entitlement, permanent). Vendor-neutral SDK API: OpenFeature (CNCF incubating).

**Check.**
- Each new flag has owner, kind and removal date next to its definition.
- Evaluated once at the edge (request, job start) and passed down, not re-read in ten places.
- Both states tested; the default when the flag service is unreachable is the safe one.
- Release flags past their removal date: delete flag and dead branch (`simplicity.md` §7).

**Example (TypeScript).**
```ts
// bad: flag string read deep in several functions; no owner, no end date
if (flags.isOn("new-pricing")) price = newPrice(cart); else price = oldPrice(cart);

// good: one decision point; the rest receives a strategy
/** release flag · owner: billing · remove after 2026-12-01 (100% rollout + 2 weeks) */
const flagClient = OpenFeature.getClient();          // @openfeature/server-sdk
const pricing: Pricing = (await flagClient.getBooleanValue("new-pricing", false, ctx)) ? newPricing : legacyPricing;
const total = checkout(cart, pricing);
```

**Trap.** Long-lived flags as an uninventoried config or permission system; nested flags whose combinations nobody tested.

## 10. Architecture Decision Records

**Definition.** A short markdown file per significant decision: context, decision, status, consequences (Michael Nygard's format; MADR 4.0.0 is a richer template). Stored with the code, numbered, never rewritten once Accepted — superseded by a new ADR instead.

**Check.** An ADR is needed when a diff adds a framework, database, queue, service, protocol or data-ownership change, or takes more than a day to undo. Location `docs/adr/` (index `README.md`), format `.agents/rules/topic-architecture-decisions.md`, template via the installed `architecture-decision-records` skill. Draft it as **Proposed**; a human accepts it.

**Trap.** ADRs for trivia, or written after the fact listing only the chosen option. An ADR without a rejected alternative is a press release.

## 11. Evolutionary architecture and fitness functions

**Definition.** Keep decisions reversible, defer irreversible ones to the last responsible moment, and protect chosen qualities with **fitness functions**: automated checks that fail when the architecture drifts (Ford, Parsons, Kua, Sadalage, *Building Evolutionary Architectures*).

**Why.** A boundary that lives only in a diagram erodes within months; a CI check does not.

**Check / fitness functions** (wire them into the lint or test step so `node .agents/scripts/verify.mjs` runs them):

| Quality | Fitness function |
|---|---|
| Layer direction | dependency-cruiser, import-linter `layers`, depguard, Deptrac or Pest `arch()` (§2) |
| No cycles | dependency-cruiser `circular: true`; Cargo workspace crates |
| Module privacy | Go `internal/`, Pest `toOnlyBeUsedIn`, import-linter `forbidden` |
| Performance | a test that fails when p95 of a benchmark or bundle size exceeds a budget |
| Security | dependency audit and secret scan in CI (`.agents/guides/principles/security.md`) |

**Reversibility.** Ask "what would undoing this cost in six months?" Cheap: decide quickly. Expensive (data model, public API, datastore, service split): ADR plus an `advisor` critique.

**Trap.** Updating a diagram instead of adding a check; or a check so noisy that ignores pile up until it checks nothing. Start with one rule the code passes today, then tighten.

## 12. Anti-patterns → fixes

| Anti-pattern | Symptom in a diff | Fix |
|---|---|---|
| Big ball of mud | any file imports any other; cycles | capability modules + one enforced rule (§2) |
| Shared god-model | one entity with fields from 3 contexts | per-context models linked by ID (§3) |
| Distributed monolith | services sharing a DB or deployed together | merge back, or split data ownership first (§6) |
| Dual write | `save()` then `publish()` | transactional outbox (§5) |
| Flag graveyard | flags past removal date | inventory, owner, delete dead branch (§9) |
| Resume-driven architecture | Kafka/K8s/CQRS without a measured driver | ADR with drivers and a simpler option (§10) |

## 13. Review checklist (copy into the Completion Report or PR)

- [ ] No inner-layer file imports a framework, ORM, SDK or HTTP client (search run, output quoted)
- [ ] Business rules live in domain/use-case code with I/O-free tests; handlers only translate
- [ ] Cross-module access only through the module's public entry; no foreign tables touched
- [ ] Boundary tool (§2) passes, or the reason there is none is stated
- [ ] No new service, queue, database or framework without an ADR in Proposed status and user approval
- [ ] Events: outbox, idempotent consumers, versioned past-tense names
- [ ] Config read in one place, validated at startup, no secrets in code or logs
- [ ] Each new flag has owner, kind, removal date; both branches tested
- [ ] Every new interface or layer has a named second implementation or a real rule behind it

## 14. References

- Martin Fowler — MonolithFirst: https://martinfowler.com/bliki/MonolithFirst.html ; MicroservicePrerequisites: https://martinfowler.com/bliki/MicroservicePrerequisites.html ; CQRS: https://martinfowler.com/bliki/CQRS.html ; BoundedContext: https://martinfowler.com/bliki/BoundedContext.html
- Pete Hodgson — Feature Toggles: https://martinfowler.com/articles/feature-toggles.html ; OpenFeature: https://openfeature.dev/
- Alistair Cockburn — Hexagonal architecture: https://alistair.cockburn.us/hexagonal-architecture/
- Outbox: https://microservices.io/patterns/data/transactional-outbox.html ; Twelve-Factor config: https://12factor.net/config
- Nygard ADRs: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions ; MADR: https://adr.github.io/madr/
- Ford, Parsons, Kua, Sadalage — Building Evolutionary Architectures (2nd ed., O'Reilly)
- dependency-cruiser rules reference: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- import-linter: https://import-linter.readthedocs.io/ ; golangci-lint depguard: https://golangci-lint.run/docs/linters/configuration/ ; Pest arch testing: https://pestphp.com/docs/arch-testing ; Deptrac: https://deptrac.github.io/deptrac/
