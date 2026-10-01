# Simplicity — engineering guide
> Scope: KISS, DRY, YAGNI, AHA/rule of three, essential vs. accidental complexity, deletion as a feature — written as checks an agent runs on its own diff. Quick pointer: `.agents/rules/01-engineering-standards.md`. Companion: `.agents/guides/principles/design-principles.md`.
> Last verified: 2026-09 — these are stable, decades-old software-engineering principles (Fowler, Hunt & Thomas, Metz, Brooks, Hickey), not version-dependent claims. Code syntax checked against current stable TypeScript, Python 3.12+, Go 1.22+, Rust 1.75+, PHP 8.3+; where a language feature has a minimum version, it is named.

## 1. Mental model

Complexity, not typing speed, is what makes software expensive: every future reader (including you, next session) must load a mental model of the code before touching it, and every extra concept in that model is a place a change can break something unrelated. Simplicity work is not aesthetic — it is the single highest-leverage thing you can do to a diff.

"Simple" is not "easy." Easy means familiar or close at hand; simple means few interleaved concepts (Rich Hickey, "Simple Made Easy"). A framework you know well can still be complex; a small hand-written function can be simple even if it took longer to write than importing a library would have.

Every principle below has the same shape: a **definition**, **why it matters**, a **check** you can actually run or answer on a real diff (not "does this feel clean"), **bad → good examples**, the **over-engineering trap** that misapplying the principle produces, and a **checklist** line. If you cannot answer a check with a concrete fact — a count, a grep hit, a name, a diff line — do not claim compliance; say what you could not verify.

## 2. KISS — Keep It Simple

**Definition.** Prefer the solution with the fewest moving parts that fully satisfies the requirement. Not "the shortest code" — the one with the least state, the fewest branches, the fewest abstraction layers a reader must hold in mind at once.

**Why it matters.** Cyclomatic complexity and defect density correlate; every added branch, layer, or indirection is a place a future change can go wrong, and a bug report you or the small model will have to trace through it later.

**How to check (on your diff):**
- Can you explain the new function in one sentence without an "and" that hides a second responsibility?
- Count nesting depth: more than 3 levels of `if`/`for` in one function → extract or invert with early returns.
- Did you introduce an abstraction (interface, factory, config layer, plugin point) with exactly one implementation and no second caller in sight? That is a KISS violation, not future-proofing (see YAGNI, §4).
- Would a reviewer need to open more than 2 extra files to understand this change? If yes, can the diff be flattened?

**Example — bad → good (Python):**
```python
# bad: a generic "processor" for one concrete case; 3 layers to add two numbers
class ProcessorStrategy:
    def process(self, a, b): raise NotImplementedError

class AdditionStrategy(ProcessorStrategy):
    def process(self, a, b): return a + b

class Calculator:
    def __init__(self, strategy: ProcessorStrategy):
        self.strategy = strategy
    def calculate(self, a, b):
        return self.strategy.process(a, b)

result = Calculator(AdditionStrategy()).calculate(2, 3)

# good: the requirement is "add two numbers"
def add(a: int, b: int) -> int:
    return a + b

result = add(2, 3)
```

**Over-engineering traps:**
- Config-driven everything: a JSON/YAML "rules engine" for logic that is three `if` branches and changes twice a year.
- Generic naming ("Manager", "Processor", "Handler", "Helper") is often a signal that a real, simple, specific name was avoided in favor of a vague abstraction.
- Defensive layers "in case requirements change" — that is YAGNI territory, not KISS.

**Checklist:** `- [ ] no branch/layer added beyond what today's requirement needs; nesting ≤ 3; every abstraction has ≥ 2 real callers or a named near-term one`

## 3. DRY — duplicate knowledge, not code

**Definition.** Hunt & Thomas: "every piece of knowledge must have a single, unambiguous, authoritative representation." DRY is about **knowledge** — a business rule, a schema, a constant, an algorithm's rationale — not about identical-looking lines of code. Two code blocks that happen to look alike but encode unrelated decisions are not a DRY violation.

**Why it matters.** When one rule lives in two places, they drift: someone fixes the tax calculation in the checkout module and the invoice module silently keeps the old one. The cost of duplicated knowledge is a bug that reproduces only in the copy nobody remembered to update.

**How to check:**
- Ask "if this rule changes, how many places need to change?" If the true answer is more than one and they are not intentionally independent, that is a DRY violation — regardless of whether the code even looks similar.
- Ask the inverse for code that looks duplicated: "do these two blocks change **for the same reason**?" If no — one is a discount rule, the other is a shipping rule, and they only coincidentally read alike today — leave them separate (see the trap below).
- Search for the same literal (a magic number, a regex, a status string) appearing in more than one file: `node .agents/scripts/search.mjs "\"pending_review\"" src` (POSIX/PowerShell alike, since it's a Node script) — a repeated literal not sourced from one constant is a knowledge duplication candidate.

**Example — bad → good (TypeScript):**
```ts
// bad: the "valid discount range" rule is knowledge duplicated in two files
// checkout.ts
if (discount < 0 || discount > 0.5) throw new Error("invalid discount");
// admin-pricing.ts
if (discount < 0 || discount > 0.5) throw new Error("bad discount value");

// good: one authoritative representation of the rule
export const MAX_DISCOUNT = 0.5;
export function assertValidDiscount(discount: number): void {
  if (discount < 0 || discount > MAX_DISCOUNT) {
    throw new Error(`discount must be between 0 and ${MAX_DISCOUNT}`);
  }
}
// both call sites: assertValidDiscount(discount);
```

**Misapplication trap — the wrong abstraction.** Sandi Metz: "prefer duplication over the wrong abstraction." A premature shared helper that tries to serve two call sites whose rules later diverge grows extra parameters and `if (isSpecialCase)` branches until it is unreadable, and every future change risks the other caller. When two blocks stop changing for the same reason, **un-DRY them**: inline the shared helper back into its two call sites rather than adding a flag. Coincidental similarity (two 3-line blocks that both happen to loop and add) is not knowledge duplication — leave it.

**Checklist:** `- [ ] no business rule/constant/schema is hand-copied into a second location; shared helpers exist only where callers change for the same reason`

## 4. YAGNI — You Aren't Gonna Need It

**Definition.** Build the capability the current, real requirement needs — not the one you predict a future ticket might need. Extension points, config flags, and generic parameters earn their place when a second real caller exists, not when one is merely plausible.

**Why it matters.** Speculative generality has a cost today (more code to read, test, and maintain) for a benefit that may never arrive, and if it does arrive, it rarely arrives in the shape you guessed — so the unused flexibility gets rewritten anyway, at which point it was pure waste plus the deletion effort.

**How to check:**
- For every parameter, interface, or config option you added: is there a call site that uses a second value today? If not, it is speculative — drop it (or, if truly imminent, note it as a one-line TODO with the ticket, not shipped code).
- Did the task ask for this? If a change is not traceable to the request or an existing failing test, it is scope creep, not delivery — flag it in the Completion Report instead of adding it silently.
- Grep your diff for unused generality: unused type parameters, `options` objects with one field ever populated, `strategy`/`provider` parameters with exactly one implementation registered.

**Example — bad → good (Go):**
```go
// bad: a pluggable "notifier" interface for a single, fixed channel (email)
type Notifier interface{ Send(ctx context.Context, msg string) error }
type EmailNotifier struct{ /* ... */ }
func (e *EmailNotifier) Send(ctx context.Context, msg string) error { /* smtp send */ return nil }
func NotifyUser(n Notifier, msg string) error { return n.Send(context.Background(), msg) }
// only ever called as: NotifyUser(&EmailNotifier{}, "your order shipped")

// good: today's one real requirement, nothing speculative
func NotifyUserByEmail(ctx context.Context, msg string) error {
    return sendEmail(ctx, msg) // add an interface WHEN a second channel is a real, ticketed requirement
}
```

**Over-engineering traps:**
- "Just in case" config: a `.env` flag with one valid value in production, ever.
- Multi-tenancy, plugin systems, or i18n scaffolding added before a second tenant/plugin/locale is a committed requirement.
- Confusing YAGNI with "skip error handling" or "skip tests" — YAGNI is about **speculative features**, never about correctness, security, or the tests the current behavior needs.

**Checklist:** `- [ ] every parameter/interface/flag added has a real second caller or ticketed near-term need; nothing added beyond the task's request`

## 5. AHA / Rule of Three

**Definition.** Rule of three (Don Roberts): tolerate duplication twice; abstract on the third occurrence, once the real shape of the variation is known. AHA — "Avoid Hasty Abstractions" (Kent C. Dodds) — restates it as a bias: prefer duplication over a guessed abstraction, and let the abstraction emerge from real, observed repetition rather than from anticipation.

**Why it matters.** The first two occurrences rarely reveal the true axis of variation. Abstracting after one or two copies means guessing that shape, which is exactly how a DRY effort produces the "wrong abstraction" trap in §3. Waiting for the third real instance turns the abstraction into an observation, not a prediction.

**How to check:**
- Count real occurrences of the pattern you are about to abstract — in this diff and in the existing codebase (`node .agents/scripts/search.mjs "<distinctive fragment>" src`). Fewer than three → duplicate this once more and move on; do not abstract yet.
- When you do abstract on the third occurrence, verify the abstraction's parameters come from the actual differences between the three real call sites — not from imagined future ones.

**Example — bad → good (Rust):**
```rust
// bad: abstracting after seeing exactly one call site, guessing the future shape
trait Formatter<T> { fn format(&self, value: &T) -> String; }
struct UserFormatter;
impl Formatter<User> for UserFormatter {
    fn format(&self, u: &User) -> String { format!("{} <{}>", u.name, u.email) }
}
// no second implementor exists yet

// good: write the concrete function; introduce the trait when a real second type needs it
fn format_user(u: &User) -> String {
    format!("{} <{}>", u.name, u.email)
}
// on the third concrete "format a domain object as a label" case, extract a shared trait
// from the three real signatures — not before.
```

**Over-engineering traps:**
- Abstracting on the second occurrence "to be safe" — this is the most common Flash-model failure mode: seeing two similar blocks and immediately generalizing before a third data point exists.
- Treating the rule of three as a hard rule rather than a heuristic: three near-identical 40-line blocks with a subtle but real behavioral difference should stay separate, or be split by that difference, not merged.

**Checklist:** `- [ ] no abstraction introduced before 3 real occurrences exist; the abstraction's parameters match the actual observed differences`

## 6. Essential vs. accidental complexity

**Definition.** Fred Brooks ("No Silver Bullet"): essential complexity is inherent to the problem itself (a tax engine must encode tax law; a scheduler must encode real conflicts) and cannot be removed, only managed. Accidental complexity is complexity the tooling, architecture, or team introduced on top of the problem — boilerplate, leaky abstractions, a framework fighting the domain — and it can and should be removed.

**Why it matters.** Effort spent simplifying essential complexity is often wasted (the domain genuinely is that complicated) or dangerous (hiding a real rule loses correctness). Effort spent removing accidental complexity is close to free money: same behavior, less code, fewer failure points.

**How to check:**
- For any complex-looking code, ask: "if I deleted this, would the software violate a real business rule, or would nothing observable change?" The former is essential; the latter is accidental — a deletion candidate (§7).
- Is the complexity coming from the problem (many valid states a real invoice can be in) or from the solution (three layers of indirection to call one HTTP client)? Name which, in the diff or the Completion Report, rather than treating "complex" as one undifferentiated judgment.
- Boilerplate check: does this framework/pattern require N lines of ceremony (registration, DI wiring, generated glue) for one line of actual behavior? That ratio is a proxy for accidental complexity worth challenging.

**Example — bad → good (PHP):**
```php
// bad: accidental complexity — three abstraction layers between the route and one query
interface RepositoryFactoryInterface { public function make(): RepositoryInterface; }
interface RepositoryInterface { public function find(int $id): ?array; }
final class UserRepositoryFactory implements RepositoryFactoryInterface {
    public function make(): RepositoryInterface { return new UserRepository(); }
}
final class UserRepository implements RepositoryInterface {
    public function find(int $id): ?array { return DB::table('users')->find($id); }
}
$user = (new UserRepositoryFactory())->make()->find($id);

// good: the essential complexity (look up a user) with none of the ceremony
function findUser(int $id): ?array {
    return DB::table('users')->find($id);
}
$user = findUser($id);
// introduce a repository interface WHEN a second real data source (a test double, a
// second backend) needs to swap in — see design-principles.md §7 dependency direction.
```

**Over-engineering traps:**
- "Enterprise" boilerplate copied from a tutorial for a team of one repo with one backend.
- Treating essential complexity as a target to minimize — e.g., silently dropping an edge case a real tax rule requires, to make the code "simpler." That is a correctness bug wearing a simplicity costume.

**Checklist:** `- [ ] complexity in this diff is named as essential (kept, because the domain requires it) or accidental (removed); no domain rule was dropped in the name of simplicity`

## 7. Deletion as a feature

**Definition.** The cheapest code to maintain, secure, and reason about is code that does not exist. Deleting dead code, unused flags, and superseded paths is a deliverable in its own right, not just cleanup — it is the mirror image of YAGNI applied after the fact.

**Why it matters.** Every unreachable branch is still compiled, still reviewed by habit, still a candidate for a future bug, and still adds to what a small model must read to understand the file. Feature flags that never got removed after their rollout are a classic source of "why does this still check `if (flags.oldCheckout)`" confusion months later.

**How to check (concrete commands):**
- TypeScript/JS: `npx knip` or `npx ts-prune` for unused exports; ESLint `no-unused-vars`.
- Python: `vulture .` for unreachable/unused code.
- Go: `go vet ./...` plus `staticcheck ./...` (U1000 unused code); unused imports are a compile error already.
- Rust: `cargo build` warnings for `dead_code`; `cargo machete` for unused dependencies.
- PHP: `vendor/bin/phpstan analyse` (unreachable statement, dead catch) plus a repo grep for a flag name to confirm every branch it guards is still reachable.
- Any language: grep for a feature-flag name across the repo (`node .agents/scripts/search.mjs "old_checkout_flag"`) — if every call site now takes the same branch, delete the flag and the dead branch together.

**Example — bad → good (any language, sketch):**
```
# bad: a flag frozen at "true" in every environment for 8 months, both branches still live
if feature_flag("new_pricing"):
    price = compute_price_v2(order)
else:
    price = compute_price_v1(order)   # unreachable in practice; still maintained, still tested

# good: once the flag is confirmed always-on (config, not just code-read), delete the old path
price = compute_price_v2(order)
```

**Traps (the deletion-specific one — Chesterton's fence):** deletion is only safe once you know *why* the code exists. Before deleting: check recent history/blame for the commit that added it, check whether a test exercises the "dead" branch on purpose (a documented edge case, not truly dead), and check for a flag whose value is only ever `true` in the code you can see but may still be flipped by config/ops elsewhere. When in doubt, this is exactly the `git-historian` subagent's job (`.agents/agents/git-historian.md`) — ask why before removing. Full protocol: `.agents/rules/01-engineering-standards.md`.

**Checklist:** `- [ ] before deleting, checked history/tests for the reason the code exists; after deleting, verify.mjs still passes; no flag left permanently pinned to one value without removing its dead branch`

## 8. Anti-patterns → fixes (consolidated)

| Anti-pattern | Principle violated | Fix |
|---|---|---|
| Generic "Manager"/"Processor" class wrapping one concrete behavior | KISS | Inline the concrete function; name it for what it does |
| Shared helper with `if (isSpecialCase)` branches serving diverging callers | DRY (wrong abstraction) | Split back into two functions per Sandi Metz's rule |
| Interface/strategy/plugin point with exactly one implementation | KISS + YAGNI | Delete the interface; add it at the second real implementation |
| Config flag with one value ever used in production | YAGNI | Remove the flag; hard-code the one real behavior |
| Abstraction written after seeing 2 similar blocks | AHA / rule of three | Duplicate once more; abstract from 3 real shapes |
| Framework ceremony (DI container, factory-of-factory) for a 1-backend repo | Essential vs. accidental | Call the concrete implementation directly |
| Feature flag frozen at one value for months, both branches still present | Deletion as a feature | Confirm via config/ops, then delete flag + dead branch |
| "Simplifying" by dropping a real edge case a business rule requires | Essential complexity mistaken for accidental | Restore the rule; simplify the *code*, not the *domain* |

## 9. Full review checklist (copy into your Completion Report or PR description)

```
- [ ] KISS: every abstraction/layer/branch added is needed by today's requirement (§2)
- [ ] DRY: no business rule/constant duplicated across files; no shared helper serving callers that no longer change for the same reason (§3)
- [ ] YAGNI: no speculative parameter, interface, or flag without a real second caller (§4)
- [ ] AHA: no abstraction introduced before 3 real occurrences existed (§5)
- [ ] Essential vs. accidental: complexity kept is domain-required; complexity removed was ceremony, not a dropped rule (§6)
- [ ] Deletion: dead code/flags checked against history before removal; verify.mjs passes after (§7)
```

## 10. References
- Martin Fowler, *Refactoring* (2nd ed.) — https://martinfowler.com/books/refactoring.html
- Andrew Hunt & David Thomas, *The Pragmatic Programmer* — DRY definition (ch. 2) https://pragprog.com/titles/tpp20/
- Sandi Metz, "The Wrong Abstraction" — https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction
- Kent C. Dodds, "AHA Programming" — https://kentcdodds.com/blog/aha-programming
- Fred Brooks, "No Silver Bullet" (1986) — essential vs. accidental complexity
- Rich Hickey, "Simple Made Easy" (2011 talk) — https://www.infoq.com/presentations/Simple-Made-Easy/
- Martin Fowler, "Yagni" — https://martinfowler.com/bliki/Yagni.html
- Chesterton's fence / deletion protocol: `.agents/rules/01-engineering-standards.md`
- Design-level companion: `.agents/guides/principles/design-principles.md` (SOLID, coupling, boundaries)
