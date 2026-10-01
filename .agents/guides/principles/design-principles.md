# Design principles — engineering guide
> Scope: SOLID (pragmatic reading), coupling/cohesion, composition over inheritance, Law of Demeter, CQS, dependency direction, ports & adapters, interfaces at boundaries, immutability, pure core/imperative shell — as checks an agent runs on its own diff. Pointer: `.agents/rules/01-engineering-standards.md`. Companion: `.agents/guides/principles/simplicity.md` (KISS/DRY/YAGNI — the fights this file's abstractions can start).
> Last verified: 2026-09 — classic design literature (Martin, Fowler, Metz, Cockburn), not version-dependent. Syntax checked against current stable TypeScript, Python 3.12+ (`dataclasses(slots=True)`, 3.10+), Go (interfaces are implicit at any version), Rust 1.75+, PHP 8.3+ (constructor property promotion since 8.0).

## 1. Mental model: coupling and cohesion are the real metrics

Every principle below raises **cohesion** (things that change for the same reason live together) or lowers **coupling** (a change here should not force a change somewhere unrelated) — that is the only reason any of them exist.

**Pragmatic warning, up front:** applied dogmatically, any principle here produces the opposite of good design — interface-itis, a class per verb, a wrapper around every wrapper. Each section names its own trap. When a check and a trap conflict, prefer the rule of three (`simplicity.md#5`): apply on real, observed evidence, not preemptively.

**Check coupling/cohesion on a diff:**
- Shotgun-surgery smell: does one conceptual change touch more than 3-4 non-test files? `node .agents/scripts/search.mjs "<symbol you changed>" src` — hits spread across unrelated modules means low cohesion.
- Coupling, worst → best: **content** (reaching into another module's internals) → **common/global** (shared mutable global) → **control** (a flag telling the callee *how* to behave) → **stamp** (a whole object for 2 fields) → **data** (only the values needed). A new boolean/enum parameter that only changes the callee's internal branching is control coupling — prefer two functions or a strategy object.

## 2. SOLID (pragmatic reading)

### S — Single Responsibility
**Definition.** "One reason to change" (Robert Martin) — one axis of change, one stakeholder whose decisions drive edits here. Not "one method per class": a class with five small methods that all change for *the same* business rule has a single responsibility.
**Why / check:** a change for one stakeholder should not risk breaking another's behavior. Name the module's one reason to change; if the honest sentence has an "and" joining two stakeholders ("formats the report **and** talks to the payment gateway"), split it.
**Example (TypeScript):**
```ts
// bad: formatting and persistence change for different reasons (design vs. storage)
class Invoice {
  computeTotal(): number { return 0; }
  toHtml(): string { return ""; }
  saveToDatabase(): void {}
}

// good: pricing, presentation, and storage each have their own axis of change
class Invoice { computeTotal(): number { return 0; } }
class InvoiceHtmlView { render(invoice: Invoice): string { return ""; } }
class InvoiceRepository { save(invoice: Invoice): void {} }
```
**Trap:** splitting one cohesive concept into five one-method classes because "responsibility" was read as "method." That raises coupling (five files must now change together) while lowering nothing.

### O — Open/Closed
**Definition.** Open for extension, closed for modification: add behavior with new code (a new implementation, a new case in a place designed for it), not by editing a stable, already-tested function's internals for every new variant.
**Why / check:** every edit to a function with existing callers risks regressing them. Has this function's `if`/`switch` already been edited this way more than twice for a new variant? That is the signal to add a seam (interface, registered handler, table). For the **first** variant, adding a seam now is speculative (YAGNI) — just write the `if`.
**Example (Go), after the 3rd provider triggered the 3rd switch edit:**
```go
type PaymentProvider interface{ Charge(ctx context.Context, cents int64) error }
func Charge(ctx context.Context, p PaymentProvider, cents int64) error {
    return p.Charge(ctx, cents) // new provider = new implementation; Charge itself is untouched
}
```
**Trap:** building the plugin seam before a second real variant exists — the same failure as YAGNI (`simplicity.md#4`).

### L — Liskov Substitution
**Definition.** Code written against a base type must keep working, unsurprised, given a subtype: a subtype must not strengthen preconditions (reject inputs the base accepted), weaken postconditions (promise less than the base did), or violate the base's invariants.
**Why / check:** violating it makes `is-a` a lie enforced only by the type checker, not behavior — callers get surprised at runtime, exactly where LSP should guarantee safety. Does the subtype throw on an input the base accepts, silently no-op where the base acts, or narrow the return contract? Any yes is a violation.
**Example (Python), the classic case:**
```python
# bad: Square "is-a" Rectangle by taxonomy, but breaks the base's invariant (independent w/h)
class Rectangle:
    def __init__(self, w: int, h: int) -> None: self.w, self.h = w, h
    def set_width(self, w: int) -> None: self.w = w

class Square(Rectangle):
    def set_width(self, w: int) -> None:
        self.w = self.h = w  # silently changes height too — surprises any Rectangle caller

# good: model the real behavioral contract (area), not the geometric taxonomy
class Rectangle:
    def __init__(self, w: int, h: int) -> None: self.w, self.h = w, h
    def area(self) -> int: return self.w * self.h
class Square:
    def __init__(self, side: int) -> None: self.side = side
    def area(self) -> int: return self.side ** 2
```
**Trap:** treating taxonomy ("a square is geometrically a rectangle") as sufficient for inheritance. LSP is about behavior and invariants; when in doubt, prefer composition (§3).

### I — Interface Segregation
**Definition.** Clients should not depend on methods they do not use. Prefer several small, role-shaped interfaces (`Reader`, `Writer`) over one fat interface (`FileHandler` with 12 methods) every implementer must stub out in full.
**Why / check:** a fat interface couples every implementer to every method, forcing stub methods that throw or no-op — a silent LSP violation, and needless re-review when one rarely-used method changes. Does an implementer have a method it does not meaningfully support? Split the interface along that fault line.
**Example (Rust):**
```rust
// bad: one fat trait forces a read-only source to fake a write method
trait Storage { fn read(&self, key: &str) -> Option<String>; fn write(&mut self, key: &str, v: String); }

// good: role-shaped traits; a caller that only reads depends on only Reader
trait Reader { fn read(&self, key: &str) -> Option<String>; }
trait Writer { fn write(&mut self, key: &str, v: String); }
struct ReadOnlyCache; // impl Reader only — no fake write() to panic!() in
```
**Trap:** an interface per class "just in case" — YAGNI again. Segregate when a **real** implementer cannot honestly support the full interface, not preemptively for every type.

### D — Dependency Inversion
**Definition.** High-level policy should not depend on low-level detail (a database, an HTTP client); both depend on an abstraction, and — the part people forget — **the abstraction is owned by the high-level/caller side**, not the low-level implementation. This is the mechanism behind §6's dependency direction and ports & adapters.
**Why / check:** when the domain imports the database driver directly, swapping it, unit-testing without a real database, or reusing the logic elsewhere all require touching domain code. Does a domain/use-case module import a concrete infrastructure package directly? Invert it: define the narrow interface the domain needs in the domain's module; inject the implementation.
**Example (TypeScript):**
```ts
// bad: the use case imports the concrete database client
import { pgClient } from "./infra/postgres.js";
export async function placeOrder(orderId: string) {
  await pgClient.query("UPDATE orders SET status = 'placed' WHERE id = $1", [orderId]);
}

// good: the use case owns a narrow interface; postgres.ts implements it, not vice versa
export interface OrderStore { markPlaced(orderId: string): Promise<void>; }
export async function placeOrder(orderId: string, store: OrderStore): Promise<void> {
  await store.markPlaced(orderId);
}
```
**Trap:** wiring a full DI container/framework for a two-class script. The pattern needs no framework — a constructor parameter or function argument is dependency inversion.

## 3. Composition over inheritance

**Definition.** Assemble behavior from small, independent parts held as fields/dependencies ("has-a") rather than extending a base class ("is-a") to reuse its code. Reach for inheritance only for genuine, stable behavioral subtyping (§L); composition for everything else, including most "reuse this logic" cases.
**Why / check:** inheritance is the tightest coupling most languages offer — a subclass depends on the base's private implementation and breaks silently when it changes (fragile base class); composition depends only on the small interface it was given. Does overriding safely require knowing, not just calling, the base's internal method sequencing? If reuse is the only goal and there is no real is-a relationship (§L), inject the shared behavior as a collaborator instead.
**Example (Python):**
```python
# bad: reuse via inheritance couples Duck to every internal detail of Bird
class Bird:
    def move(self) -> str: return self.fly()
    def fly(self) -> str: return "flying"
class Penguin(Bird):
    def fly(self) -> str: raise NotImplementedError("penguins can't fly")  # LSP break again

# good: compose the movement behavior instead of inheriting a flightless bird's non-fly
class Animal:
    def __init__(self, mover) -> None: self._mover = mover
    def move(self) -> str: return self._mover.move()
class FlyingMovement:
    def move(self) -> str: return "flying"
class WalkingMovement:
    def move(self) -> str: return "walking"
penguin = Animal(WalkingMovement())
```
**Trap:** composing everything, even a genuine is-a that never varies (`HttpError` really is an `Error`) — that just adds a forwarding layer with no benefit. Inheritance for shallow, stable taxonomies; composition for behavior that varies.

## 4. Law of Demeter

**Definition.** "Talk only to your immediate friends": call methods on yourself, your own fields, your parameters, and objects you create — not reach through one object to get another and call a method on *that* ("train wrecks": `a.getB().getC().doSomething()`).
**Why / check:** the chain couples the caller to `B`'s internal structure and to `C`'s existence; if `B` changes how it stores `C`, a caller three links away breaks. Grep for chained access three-plus deep (`\.\w+\.\w+\.\w+\(` via `node .agents/scripts/search.mjs`); can the object you're calling do the work and hand back only the result?
**Example (PHP):**
```php
// bad: reaches through order -> customer -> address to format a label — 3 hops of coupling
$label = $order->getCustomer()->getAddress()->getStreet() . ', ' . $order->getCustomer()->getAddress()->getCity();

// good: ask the object that owns the data to do the work; expose only the result
final class Address {
    public function __construct(private string $street, private string $city) {}
    public function shippingLabel(): string { return "{$this->street}, {$this->city}"; }
}
final class Order {
    // ...
    public function shippingLabel(): string {
        return $this->getCustomer()->getAddress()->shippingLabel(); // fine: Order's own collaborators
    }
}
$label = $order->shippingLabel(); // one hop: only $order, the immediate friend
```
**Trap:** wrapping every accessor to "avoid a chain" turns a harmless 1-hop read of plain data/config into pass-through wrappers. LoD protects against reaching through **behavioral** objects to bypass their contract, not reading nested plain data/DTOs.

## 5. CQS — Command-Query Separation

**Definition.** Bertrand Meyer: a method either **changes** state (a command, returns nothing meaningful) or **reports** state (a query, returns a value, no observable side effect) — never both. `list.pop()` violates CQS on purpose in some standard libraries; avoid the pattern in your own APIs.
**Why / check:** a method that mutates and returns a value is unsafe to call just to inspect something, and unsafe to call twice for idempotency (a repeat should be a deliberate, visible choice). Does this method return a business value **and** cause a side effect the name doesn't scream? Split it into a command and a query.
**Example (TypeScript):**
```ts
// bad: reads as a query, silently commits a mutation — dangerous to call "just to check"
function getNextInvoiceNumber(): number {
  const n = ++counter; // mutates!
  db.saveCounter(counter);
  return n;
}

// good: the command and the query are separate, each callable and testable on its own
function advanceInvoiceCounter(): void { counter += 1; db.saveCounter(counter); }
function currentInvoiceNumber(): number { return counter; }
```
**Trap:** confusing CQS (a method-level style rule) with CQRS (a system-level architecture splitting read and write models/paths). CQS applies to almost every method you write; CQRS is a heavyweight pattern that needs a real scaling/consistency reason — do not reach for CQRS to satisfy CQS.

## 6. Dependency direction & ports and adapters

**Definition.** Separate your domain (business rules) from the outside world (HTTP, DB, filesystem, third-party APIs). Dependencies point **inward** — the domain never imports an outside-world package. The domain declares **ports** (interfaces it needs, e.g. "a place to store an order"); infrastructure provides **adapters** implementing them (Postgres, an in-memory fake for tests). This is dependency inversion (§D) at architecture scale; also called hexagonal architecture (Alistair Cockburn).
**Why / check:** it makes the domain testable without a database and swappable across infrastructure with no domain change. Does anything under domain/use-case `import` a driver, ORM, or cloud SDK directly? Can you unit-test a use case with zero I/O, using a fake adapter? If not, the dependency points the wrong way.
**Example (Go, sketch):**
```go
// domain/order.go — the port; owned by the domain, zero infrastructure imports
type OrderStore interface {
    Save(ctx context.Context, o Order) error
}
func PlaceOrder(ctx context.Context, store OrderStore, o Order) error {
    if err := o.Validate(); err != nil { return err } // real business rule, testable with a fake store
    return store.Save(ctx, o)
}

// infra/postgres_order_store.go — the adapter; depends inward on domain.OrderStore, not vice versa
type PostgresOrderStore struct{ db *sql.DB }
func (s *PostgresOrderStore) Save(ctx context.Context, o Order) error { /* SQL here */ return nil }
```
**Trap:** full hexagonal ceremony (ports package, adapters package, a mapper per layer's own DTO) for a small script with one backend that will never change. Apply it where a real second adapter (a test fake counts) justifies the seam — otherwise call the DB directly (KISS, `simplicity.md#2`).

## 7. Interfaces at boundaries, not everywhere

**Definition.** Put an interface exactly at a boundary with more than one real implementation, or one that needs faking in a test — a port (§6), a repository, an external API client. Not in front of every internal class "for testability" when there is one implementation and no seam-crossing reason.
**Why / check:** an interface with one implementation is pure indirection: a reader jumps call site → interface → implementation for zero substitution benefit. Name its second implementation (real, or a test fake standing in for a slow/external dependency); if none exists, delete the interface and call the concrete type.
**Example:** §D/§6's `OrderStore` earns its place — Postgres and an in-memory fake are two real implementations. A `UserFormatter` interface with only `DefaultUserFormatter` behind it, never faked, would not.
**Trap:** "program to interfaces" read as a blanket rule instead of a boundary rule — the source of interface-itis (an `IFooService` for every `FooService`, never faked, never swapped).

## 8. Immutability

**Definition.** Prefer values that cannot change after construction; produce a new value instead of mutating in place, especially for anything shared across function calls, threads, or time (config, domain value objects, cache entries).
**Why / check:** a mutable object shared between two callers is an implicit channel neither may know about — one caller's edit becomes the other's surprise; immutable data is also safe to share across threads with no locking. Does a shared object have a setter, a public mutable field, or a method that mutates it unasked? Prefer construction-time-only values plus a `with...`/copy method for changes.
**Example (two short cuts):**
```ts
// TypeScript: readonly + a wither, not a setter
interface Money { readonly cents: number; readonly currency: string; }
function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error("currency mismatch");
  return { cents: a.cents + b.cents, currency: a.currency };
}
```
```python
# Python: frozen dataclass — mutation raises instead of silently succeeding
from dataclasses import dataclass, replace
@dataclass(frozen=True, slots=True)
class Money:
    cents: int
    currency: str
discounted = replace(price, cents=price.cents - 100)  # new value, price is untouched
```
**Trap (the immutability tax):** deep-cloning large structures "to be safe" when nothing ever mutates them, or making every short-lived, single-owner scratch value immutable where mutation is simpler and unobserved. Apply it where sharing/aliasing is real; a tight loop's private accumulator can stay a plain mutable local.

## 9. Pure core, imperative shell

**Definition.** Push I/O (HTTP, DB, clock, randomness, filesystem) to a thin outer layer ("the shell"); make the inner layer with your actual decision logic a set of **pure functions** — same input, same output, no side effects — that the shell calls and then acts on.
**Why / check:** pure functions are trivially unit-testable (no mocks or fakes: call it, assert the output) and reusable; pushing I/O to the edges keeps the hard-to-test part small. Can you test this logic with plain input/output assertions, no mock, no fake clock? If the "business logic" itself calls `Date.now()` or hits the network, extract the decision into a pure function and have the shell pass the already-fetched value in.
**Example (TypeScript):**
```ts
// bad: the discount rule is entangled with the clock — untestable without mocking Date
function applyDiscount(price: number): number {
  const isBlackFriday = new Date().getMonth() === 10 && new Date().getDate() === 29;
  return isBlackFriday ? price * 0.7 : price;
}

// good: pure core takes the fact it needs as a plain argument; the shell supplies "now"
function applyDiscount(price: number, today: Date): number {
  const isBlackFriday = today.getMonth() === 10 && today.getDate() === 29;
  return isBlackFriday ? price * 0.7 : price;
}
// shell: applyDiscount(price, new Date());  test: applyDiscount(100, new Date(2026, 10, 29)) === 70
```
**Trap:** chasing 100% purity into code whose job is orchestration (call the DB, then email, then log) — that is supposed to be the imperative shell; forcing a "pure effects list" shape onto it is usually more ceremony than the I/O it hid.

## 10. Anti-patterns → fixes (consolidated)

| Anti-pattern | Principle | Fix |
|---|---|---|
| Class split into 5 one-method classes for "SRP" | S | Merge back; one *reason to change*, not one method |
| Plugin seam built for the 1st variant | O | Write the `if`; add the seam at the 2nd–3rd variant |
| Subclass overrides a method to throw/no-op | L | Model behavior via composition, not taxonomy |
| One fat interface every implementer half-stubs | I | Split into role interfaces along the fault line |
| Domain imports the ORM/HTTP client directly | D / §6 | Own the interface on the domain side; inject the adapter |
| Interface with one implementation, never faked | §7 | Delete it; call the concrete type |
| `a.getB().getC().doThing()` train wreck | LoD | Ask the immediate friend; return only the result |
| Method both mutates and returns the "current" value | CQS | Split into a command and a separate query |
| Full hexagonal layering for a 1-backend script | §6 | Call the DB directly; add ports at a real 2nd adapter |
| Deep-cloning everything defensively, no aliasing risk | Immutability | Keep private scratch state plainly mutable |
| Business rule reads the clock/network itself | §9 | Pass the fetched value in; keep the rule pure |

## 11. Review checklist (copy into your Completion Report or PR description)

```
- [ ] SOLID: one stated reason to change per module; new variants via a seam only at the 2nd+ real case; no subtype narrows the base's contract; interfaces are role-shaped; domain owns its abstractions (§2)
- [ ] Coupling/cohesion: no unrelated modules touched; no control-coupling parameter added (§1)
- [ ] Composition preferred over inheritance unless the relationship is a genuine, stable is-a (§3)
- [ ] No train-wreck chains reaching through a behavioral object's internals (§4)
- [ ] No method both mutates and returns a value under an innocent-sounding name (§5)
- [ ] Domain/use-case code has zero direct infrastructure imports; ports exist only where a 2nd adapter is real (§6–7)
- [ ] Shared/long-lived values are immutable; private scratch state may stay mutable (§8)
- [ ] New business logic is a pure function the shell calls, not entangled with I/O (§9)
```

## 12. References
- Robert C. Martin, SOLID essays — https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html
- Barbara Liskov, "Data Abstraction and Hierarchy" (1987) — origin of LSP · Bertrand Meyer, *OOSC* — CQS
- Karl Lieberherr, Law of Demeter — https://www.ccs.neu.edu/home/lieber/LoD.html
- Alistair Cockburn, "Hexagonal Architecture" — https://alistair.cockburn.us/hexagonal-architecture/
- Sandi Metz, *Practical Object-Oriented Design* — composition, role interfaces
- Gary Bernhardt, "Boundaries" (talk) — functional core, imperative shell
- Martin Fowler, "InversionOfControl"/"DependencyInjection" — https://martinfowler.com/articles/injection.html
- Companion: `.agents/guides/principles/simplicity.md` (KISS, DRY, YAGNI, rule of three)
