# Clean code — engineering guide for AI agents
> Scope: naming, function shape, parameters, comments, magic values, formatting, dead code, consistency, readability — language-agnostic, for any diff. Quick card: `.agents/rules/01-engineering-standards.md`.
> Last verified: 2026-09 — this guide names no time-sensitive version numbers; formatter/linter names match the already-verified tool choices in `.agents/guides/languages/*.md` (Biome, ruff, gofmt, rustfmt/clippy, Pint/PHP-CS-Fixer); the project's own config (e.g. `biome.json`) wins. Re-check a specific tool's version in its own language guide or the lockfile before citing one.

## 0. How this guide works
Each section is one property of readable code: what it means, why it costs real defects or review time when missing, a concrete **check** you can run against your own diff (a grep command or a yes/no question), a bad→good pair, and where the check gets over-applied into busywork. Run the checks below against the diff you are about to finish with, not only when reviewing someone else's.

`node .agents/scripts/search.mjs <regex> [path] --glob <pattern>` is the standard search command referenced throughout (no `rg` on this machine).

## 1. Naming
**Definition:** a name is documentation that never goes stale if it stays true. `unpaidInvoices` beats `list2`; `timeoutMs` beats `timeout`; `isRetryable` beats `flag`.
**Why it matters:** the reader (human or the next agent) spends most of their time understanding, not writing. A wrong or vague name is a lie that survives every refactor of the body.
**How to check:**
- `node .agents/scripts/search.mjs "\b(data|info|obj|item|temp|tmp|foo|bar|val|thing|manager|helper|util|handler)\d*\b" <changed files>` — flags filler nouns; each hit should justify itself or get renamed.
- Ask per new identifier: "if I only saw this name at a call site, could I guess what it returns or does, and its unit?" Booleans read as a yes/no question (`isActive`, `hasChildren`, `canRetry`); functions are verbs (`computeTotal`, not `total`); collections are plural or suffixed (`orders`, `orderById`).
- Check units and sign are in the name where they are not in the type: `sizeBytes`, `elapsedMs`, `radiusCm`.
**Example — bad → good (TypeScript):**
```ts
// bad: what is d? what unit? what does the function actually do?
function chk(d: number, u: any) { return d > u.max; }

// good: self-explanatory at the call site
function exceedsDailyLimit(spentTodayCents: number, account: Account): boolean {
  return spentTodayCents > account.dailyLimitCents;
}
```
**Misapplication / over-engineering trap:** renaming unrelated identifiers while fixing an unrelated bug (scope creep — see rule 1 in `01-engineering-standards.md`); Hungarian-notation prefixes (`strName`, `iCount`) that the type system already tells you; abbreviating to save keystrokes in a codebase your editor auto-completes for you.

## 2. Small, focused functions
**Definition:** one function, one level of abstraction, one reason to change. If describing what it does needs "and", split it.
**Why it matters:** small functions are independently testable, name themselves, and keep diffs small when one responsibility changes. Long functions accumulate hidden coupling between unrelated steps.
**How to check:**
- Count branches and nesting: more than ~3 levels of indentation, or a function that scrolls past one screen (~40-50 lines), is a split candidate. Cyclomatic-complexity gates: ESLint `complexity`, `radon cc -n C` (Python), `gocyclo -over 10 .` (Go), cargo clippy `too_many_lines` (enable via `clippy::pedantic`) or `excessive_nesting` (default-on `complexity` lint; needs `excessive-nesting-threshold` set in `clippy.toml`) — not `cognitive_complexity`, which Clippy deliberately keeps in `restriction` (opt-in only, not part of `pedantic`) because it warns the metric isn't a reliable measurement — PHPStan/PHPMD complexity rules.
- Ask: "does this function do only what its name promises, with no side quest buried in the middle (logging, caching, retry, formatting) that a reader must skip past?"
- Early returns instead of nested `if/else`; guard clauses at the top.
**Example — bad → good (Python):**
```python
# bad: validation, computation and formatting tangled in one function
def process(order):
    if order.items:
        total = 0
        for item in order.items:
            if item.qty > 0:
                total += item.qty * item.price
        return f"${total:.2f}"
    return None

# good: one job per function, early return, no nested nouns
def order_total(order: Order) -> Decimal:
    if not order.items:
        raise ValueError("order has no items")
    return sum(item.qty * item.price for item in order.items if item.qty > 0)

def format_currency(amount: Decimal) -> str:
    return f"${amount:.2f}"
```
**Misapplication / over-engineering trap:** fragmenting one cohesive algorithm into many one-line indirections that are each called exactly once and never reused ("wrapper of a wrapper" — it moves the same complexity into call-stack depth instead of removing it); a hard "10 lines max" rule applied to a naturally linear sequence (e.g. a state machine's `switch`) where splitting hides the control flow instead of clarifying it.

## 3. Parameters
**Definition:** arity, order, and the type of each parameter are part of the function's readability. A call site is read far more often than the signature.
**Why it matters:** `schedule(true, false, null, 3)` tells the reader nothing at the call site; a bug in argument order is a silent type-compatible swap that compiles and ships.
**How to check:**
- `node .agents/scripts/search.mjs "\bfunction\s+\w+\([^)]{60,}\)" <changed files>` (or the language's equivalent pattern) to catch long parameter lists; more than ~4 positional parameters, or two-or-more of the same primitive type in a row, is a smell.
- Boolean parameters: does the call site read as a sentence, or would a reader have to open the signature to know what `true` means? Prefer an enum, a named/keyword argument, or splitting into two functions.
- Are there output parameters (a mutated argument used to "return" a second value)? Prefer returning a tuple/struct/record.
**Example — bad → good (Go):**
```go
// bad: two bools read as noise at the call site: connect(cfg, true, false)
func connect(cfg Config, retry bool, verbose bool) (*Conn, error) { /* ... */ }

// good: a self-describing options struct with defaults via zero value
type ConnectOptions struct {
    Retry   bool
    Verbose bool
}

func Connect(cfg Config, opts ConnectOptions) (*Conn, error) { /* ... */ }
// call site: Connect(cfg, ConnectOptions{Retry: true})
```
**Misapplication / over-engineering trap:** building an options-struct, builder, or functional-options API for a function that takes two arguments and will never grow — that is YAGNI, not clarity; splitting a genuinely cohesive triple (`x, y, z` coordinates) into named-only arguments when positional order is the domain convention.

## 4. Comments (why, not what)
**Definition:** a comment earns its place by saying something the code cannot: the reason for a non-obvious decision, a trade-off, a link to the ticket/spec that forced an odd shape, or a warning about a trap the next editor will hit.
**Why it matters:** a comment that restates the next line goes stale the moment the line changes, because nothing forces the two to stay in sync; the reader then must trust neither.
**How to check:**
- For every new comment, ask: "if I deleted the line(s) below, would this comment become false or meaningless?" If the comment only narrates ("increment i", "loop over users"), delete it or replace it with a better name.
- Does the comment explain **why** (a constraint, a workaround, a rejected alternative) rather than **what** (which the code already shows)?
- Public API surface: does the doc-comment describe the contract (preconditions, error cases, units) rather than restate the function name in prose?
**Example — bad → good (Rust):**
```rust
// bad: restates the code; adds no information
// increment the retry counter
retry_count += 1;

// good: explains the non-obvious constraint that motivated the code
// The upstream API rate-limits at 5 req/s per docs §3.2; back off before
// the 6th attempt instead of waiting for a 429 to arrive.
if retry_count >= 5 {
    std::thread::sleep(BACKOFF);
}
```
**Misapplication / over-engineering trap:** a "document every public function" mandate applied mechanically produces empty JSDoc/docstrings (`/** Gets the name. */ getName()`) that add noise and false confidence without adding information; the opposite extreme — banning comments outright — throws away the one place to record *why* a genuinely surprising line exists (keep those, delete the narrating ones).

## 5. Magic values
**Definition:** a literal number or string whose meaning is implicit and duplicated wherever it is used: `86400`, `"admin"`, `0x1F`, a hard-coded URL or column index.
**Why it matters:** when the value's meaning or the value itself must change, every silent copy is a place a fix can be missed; a named constant makes every use site self-explaining and gives grep one place to find them all.
**How to check:**
- `node .agents/scripts/search.mjs "\b(86400|3\.14159|0x[0-9A-Fa-f]{2,}|\"admin\"|\"production\")\b" <changed files>` as a starting pattern set; more generally, grep for any bare numeric literal other than `0`, `1`, `-1` inside new logic.
- Ask: "if this value changed, would I have to hunt for every copy, or is there exactly one named place to edit?" Two or more occurrences of the same non-trivial literal is the signal to extract a constant.
- Enum-like strings (`"pending" | "active" | "closed"`) belong in a union/enum/const set the compiler or linter can check, not repeated string literals.
**Example — bad → good (PHP):**
```php
// bad: 86400 and "admin" mean nothing without external knowledge, and are
// copied at every call site that needs "one day" or "the admin role"
if ($user->role === 'admin' && time() - $session->createdAt > 86400) {
    // ...
}

// good: named once, meaning visible at every use site
const SESSION_MAX_AGE_SECONDS = 86400; // one day
const ROLE_ADMIN = 'admin';

if ($user->role === ROLE_ADMIN && time() - $session->createdAt > SESSION_MAX_AGE_SECONDS) {
    // ...
}
```
**Misapplication / over-engineering trap:** naming every literal including self-evident ones (`const ZERO = 0; const ONE_HUNDRED_PERCENT = 100;`) or extracting a constant used exactly once with no shared meaning to protect — that adds an indirection to read without adding safety. Extract when the value is non-obvious, reused, or likely to change as a unit.

## 6. Formatting via tools, not by hand
**Definition:** whitespace, line breaks, quote style, trailing commas and import order are mechanical decisions a formatter applies deterministically; they are not a matter of taste to negotiate line-by-line in review.
**Why it matters:** hand-formatting produces diffs that mix substance with style, makes every review slower, and drifts from the rest of the codebase the moment someone else's editor reformats differently.
**How to check:** run the project's formatter and confirm it reports no changes; if it changes lines you did not touch, you formatted by hand or touched files outside scope.

| Language | Format | Lint |
|---|---|---|
| TS / JS (Biome; runner per lockfile) | `npx biome format --write <files>` | `npx biome lint <files>` |
| Python | `ruff format .` | `ruff check .` |
| Go | `gofmt -w <file>` | `go vet ./...` |
| Rust | `cargo fmt` | `cargo clippy -- -D warnings` |
| PHP | `vendor/bin/pint` | `vendor/bin/phpstan analyse` |

**Misapplication / over-engineering trap:** running a repo-wide reformat as a side effect of an unrelated change — that is a drive-by refactor (rule 1, `01-engineering-standards.md`) even though the tool did the work, because it still bloats the diff and can hide real changes in noise. Format only the files your task touched, with the project's own config; never introduce a personal formatter config that fights the shared one.

## 7. Dead code
**Definition:** code that cannot execute (after an unconditional `return`/`throw`/`panic`), or that nothing calls or imports: unused functions, commented-out blocks, orphaned feature-flag branches whose flag is gone.
**Why it matters:** dead code still gets read, still gets "fixed" by future edits, and hides how much of the file actually matters. It is a lie about what runs.
**How to check:**
- `node .agents/scripts/search.mjs "^\s*//.*[;{}]\s*$" <changed files>` as a rough commented-out-code detector; read each hit — a real prose comment rarely ends in `;` or `}`.
- Unused-symbol tooling per language: `knip`/`ts-prune` (TS), `ruff check` codes `F401`/`F841` (Python), `go vet`/`staticcheck` unused, `cargo clippy` `dead_code`, PHPStan unused-symbol rules.
- For code that only your change made unreachable or unused (the old branch of a now-simplified `if`, a helper only the old code path called): remove it in the same diff — do not leave it "just in case".
**Example — bad → good (Rust):**
```rust
// bad: unreachable branch left behind, and a commented-out old version
fn discount(total: f64) -> f64 {
    return total * 0.9;
    // let d = total * 0.85; // old rate, kept in case we revert
    #[allow(unreachable_code)]
    total
}

// good: only the code that runs
fn discount(total: f64) -> f64 {
    total * 0.9
}
```
**Misapplication / over-engineering trap:** deleting code that only *looks* unused — a public API another package calls, code invoked via reflection/dependency injection/a route table, or a documented compatibility shim — without checking callers first (Chesterton's fence: search usages, check git history, ask if unsure). "Dead" and "not called from the files I looked at" are not the same claim.

## 8. Consistency
**Definition:** match the file's, module's and project's existing conventions (naming casing, import order, error-handling shape, test structure) even where you would personally choose differently.
**Why it matters:** a codebase with two competing styles for the same thing costs every future reader a decision ("which pattern do I follow here?") that consistency would have removed for free.
**How to check:** before writing new code in a file, skim a neighboring function or an existing test for its casing convention, error pattern, and layout, and copy it. Ask: "does my addition look like it was written by the same person who wrote the rest of this file?"
**Example:** a file that always returns `{ ok, error }` result objects gets a new function that also returns `{ ok, error }`, not a thrown exception, even if the agent's default preference is exceptions — the file's existing pattern wins (per `01-engineering-standards.md`, "follow the project and say so in the report" when standards conflict).
**Misapplication / over-engineering trap:** "fixing" the whole file's style to your preferred pattern while making an unrelated change (scope creep again); or, conversely, adding a second competing pattern next to the first instead of extending the one already there, which is worse than either alone.

## 9. Readability metrics an agent can compute
These are proxies, not goals in themselves — a function can pass every threshold and still be unclear, or fail one and be the clearest way to write that logic (see traps above). Use them to flag candidates for the checks in sections 1-8, not as a pass/fail gate on their own.

| Metric | Rough threshold to look twice | How to get it |
|---|---|---|
| Function length | > ~40-50 lines | line count between signature and closing brace/`end`/dedent |
| Nesting depth | > 3 levels of indentation | visual scan, or linter (`complexity`, `max-depth`) |
| Cyclomatic complexity | > 10 | ESLint `complexity`, `radon cc`, `gocyclo`, clippy `too_many_lines`/`excessive_nesting`, PHPMD |
| Parameter count | > 4 positional | signature scan (§3) |
| File length | > ~300-400 lines for one concern | `wc -l <file>` / line count |
| Duplication | same non-trivial block ≥ 3 times | `jscpd`, manual grep for the distinctive line |

## Checklist (copyable)
- [ ] Every renamed/new identifier answers "what is this, in what unit" without opening its body
- [ ] No function mixes unrelated concerns (validation + computation + formatting + I/O) that a reader must mentally separate
- [ ] No parameter list needs the signature open to read a call site; no unexplained booleans
- [ ] Every comment explains why, not what; none would go stale if the next line changed
- [ ] No repeated literal with implicit meaning; enum-like strings are a checked type
- [ ] The project's formatter reports a clean diff; no by-hand alignment or reflow
- [ ] No commented-out code, no unreachable branch, no orphaned code your change made unused
- [ ] New code matches the surrounding file's existing conventions, not a competing style
- [ ] `node .agents/scripts/verify.mjs` (format + lint) passes on the changed files

## References
- Martin, *Clean Code* (naming, functions, comments) — chapters 2-4
- Google style guides (per-language, formatting-by-tool rationale): https://google.github.io/styleguide/
- Biome: https://biomejs.dev/ · Ruff: https://docs.astral.sh/ruff/ · gofmt: https://pkg.go.dev/cmd/gofmt · rustfmt/clippy: https://github.com/rust-lang/rustfmt, https://doc.rust-lang.org/clippy/ · Pint: https://laravel.com/docs/pint
- Related guides: `.agents/guides/principles/simplicity.md`, `.agents/guides/principles/design-principles.md`, `.agents/guides/principles/refactoring.md` (not yet written)
