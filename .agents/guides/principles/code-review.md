# Code review — engineering guide for AI agents
> Scope: review order, severity labels, actionable comments, self-review, reviewing AI-generated code, what not to nitpick, review checklists — language-agnostic, for reviewing a diff (your own or another agent's). Quick card: `.agents/rules/03-orchestration.md` (REVIEW gate); reviewer subagent: `.agents/agents/reviewer.md`; checklist: `.agents/skills/orchestrate/references/review-checklist.md`.
> Last verified: 2026-09 — process guidance (Google's Engineering Practices code-review docs, Conventional Comments) checked live: `google/eng-practices` is archived (2025-11-21) but its docs remain published and current at google.github.io/eng-practices; conventionalcomments.org checked live: format `<label> [decorations]: <subject>`, labels praise, nitpick, suggestion, issue, todo, question, thought, chore, note (plus typo, polish, quibble), decorations (blocking), (non-blocking), (if-minor). Neither is version-dependent.

## 0. How this guide works
Each section is one property of an effective review: what it means, why skipping it lets real bugs or wasted cycles through, a concrete **check**, a short example, and where it gets over-applied. This applies whether you're the author reviewing your own diff first (§4) or reviewing someone else's (including another agent's, §5).

## 1. Review order: design → correctness → security → tests → readability
**Definition:** review in a fixed priority order, most expensive-to-fix first: (1) **design** — is this the right approach, does it belong here at all; (2) **correctness** — does it do what it claims, including edge cases; (3) **security** — can this be exploited or leak data; (4) **tests** — do they actually verify the behavior, not just exist; (5) **readability/style** — is it easy to follow (largely delegated to a formatter/linter, §6).

**Why it matters:** reviewing style first produces the classic bad review — ten naming comments on a PR whose approach gets rejected next round, wasting the author's rewrite; finding a security or correctness gap only after a full line-by-line style pass means the reviewer's limited attention was spent in the wrong order and the real risk almost shipped.

**How to check:** did you form a verdict on the *approach* (right problem, right place, could it be simpler) before commenting on naming or formatting? Did you check for the diff's security-relevant classes (new input, new auth check, new secret/log line) independent of a full line read? Is there at least one comment — or an explicit "tests look right, cover case X" — on the tests, not just the implementation?

| Order | Ask |
|---|---|
| 1. Design | Is this the right approach? Does it belong in this module? |
| 2. Correctness | Does it work for the stated inputs and their edge cases? |
| 3. Security | New input validated? New auth/authz check right? Secrets/PII safe? |
| 4. Tests | Do new tests cover the new behavior and would they fail if it broke? |
| 5. Readability | Is it easy to follow — after a formatter/linter already ran? |

**Example (Rust) — a correctness/security bug the fixed order catches before style comments would:**
```rust
// bad: reads cleanly (a style-first pass would approve it), but panics on any
// request missing the header — an availability bug, and untrusted input besides
let user_id: i64 = req.headers().get("x-user-id").unwrap().to_str().unwrap().parse().unwrap();

// good: fail closed with a real error instead of unwrap()-panicking on untrusted input
let user_id: i64 = req.headers().get("x-user-id")
    .and_then(|h| h.to_str().ok())
    .and_then(|s| s.parse().ok())
    .ok_or(Error::BadRequest("missing or invalid x-user-id"))?;
```

**Misapplication / over-engineering trap:** running the full five-step order on a one-line config typo fix — the order protects scarce attention on a nontrivial diff; a trivial change doesn't need a design discussion.

## 2. Severity levels — say how blocking a comment is
**Definition:** label every comment with what it is and how blocking it is. A widely used vocabulary is Conventional Comments, format `<label> [decorations]: <subject>`. Labels: **praise** (something good, said explicitly), **nitpick** (trivial preference), **suggestion** (proposed improvement), **issue** (a specific problem), **todo** (small necessary change), **question** (needs an answer, not necessarily a change), **thought**, **chore**, **note**. Blocking status is a *decoration*, not a label: `(blocking)` must be resolved before merge, `(non-blocking)` must not hold up the merge, `(if-minor)` fix only if trivial. So write `issue (blocking): ...` and `suggestion (non-blocking): ...`.

**Why it matters:** an unlabeled pile of comments forces the author to guess what's mandatory — they either address all 30 including trivia (wasted cycles) or guess wrong and ship a real blocker unresolved.

**How to check:** does every comment start with a label? Is `(blocking)` reserved for correctness, security, and stated-requirement gaps — never for a personal style preference (§6)? Bad → good:
```diff
- Use a constant here.
+ suggestion (non-blocking): `86400` appears 3x; extract `const SECONDS_PER_DAY = 86_400`
+ so a future unit change (e.g. to ms) cannot miss one of the call sites.
- This loop looks wrong.
+ issue (blocking): off-by-one: `for i in range(len(xs) - 1)` skips the last item, so the
+ final invoice line is never totalled. Use `for x in xs:`.
```

**Misapplication / over-engineering trap:** inventing a 7-level severity taxonomy for a two-person team's internal PRs — `issue (blocking)` / `suggestion (non-blocking)` / `nitpick` cover nearly everything; more granularity than that mostly goes unread.

## 3. Writing actionable comments
**Definition:** name the specific problem, the concrete consequence, and — where non-trivial — a direction for the fix. Not a bare judgment ("this is bad," "I don't like this").

**Why it matters:** "this feels off" gives the author nothing to act on and starts a clarifying round-trip; a comment that names the line, the consequence, and a fix is actionable without one.

**How to check:** could the author act on this without a follow-up question? Does it name the specific behavior and *why* it's a problem, not just that it is one? For a one-line fix, did you use the tool's inline "suggested change" instead of prose?

**Example (Python diff) — bad → good comment:**
```diff
  def get_user(user_id):
      return db.query(f"SELECT * FROM users WHERE id = {user_id}")
```
> bad: "this is unsafe"
>
> good: `issue (blocking): SQL injection` — `user_id` is interpolated directly into the query string. Use a parameterized query: `db.query("SELECT * FROM users WHERE id = %s", (user_id,))` (placeholder is `%s` for psycopg/MySQL drivers, `?` for sqlite3).

**Misapplication / over-engineering trap:** writing a full alternate implementation in every comment, even for a one-line style nit — a suggestion block or a one-line pointer is enough there; save prose for correctness/design comments where the "why" genuinely isn't obvious.

## 4. Self-review before requesting
**Definition:** read your own diff in the review tool (the diff view, not your editor's file tree) before asking anyone — human or agent — to look at it, the same way you'd read someone else's PR.

**Why it matters:** authors reliably catch their own leftover debug output, an accidentally reverted fix, or an unrelated file when they read the change *as a diff* — a view they skip entirely when working straight from the editor; a reviewer's first comment being "why is this debug line here" burns a review round-trip on something 30 seconds of self-review would have caught.

**How to check:** did you open the diff view before requesting review? Does the PR description say *why* (the diff already shows *what*)? Is the change scoped to what was asked — no unrelated formatting-only file, no leftover debug output? One command catches leftover debug output across common languages:
```
node .agents/scripts/search.mjs 'console\.log\(|(?<![.\w])(dd|dump)\(|var_dump\(|dbg!\(|breakpoint\(\)|pdb\.set_trace|fmt\.Println\(.*DEBUG|# ?DEBUG' <changed files>
```
(catches JS/TS `console.log`, PHP/Laravel `dd()`/`dump()`/`var_dump()`, Rust `dbg!`, Python `breakpoint()`/`pdb.set_trace`, Go debug `Println`, and a `# DEBUG` marker; the lookbehind skips method calls such as Python `json.dump(`. Single quotes work in PowerShell and POSIX shells.)

**Misapplication / over-engineering trap:** treating self-review as a substitute for a second reviewer on anything beyond a trivial change — self-review catches typos and scope creep, not blind spots in your own design reasoning, which is exactly what a second person is for.

## 5. Reviewing AI-generated code
**Definition:** code from (or heavily assisted by) an AI coding agent gets the *same* review bar as human-written code, plus checks for failure modes distinct to it: plausible-looking but hallucinated APIs or config keys, changes broader than what was asked, tests weakened or deleted to make a suite pass, and generated tests that just restate the implementation's current behavior instead of a stated requirement.

**Why it matters:** generated code is often fluent and confidently formatted, which makes reviewers anchor on "this looks professional" and under-scrutinize it — backwards, since fluency doesn't correlate with correctness for a model that can also fabricate a plausible-sounding API that doesn't exist, or quietly narrow a test to make it pass.

**How to check:** does every new API call, config key, or flag actually exist — checked against the library's real docs/types, not "looks right"? Does the diff's size match the stated task (no unrequested drive-by refactors — `.agents/guides/principles/simplicity.md`)? Did a test get weakened/skipped/deleted rather than the code fixed?
```
node .agents/scripts/search.mjs '\.(skip|only|skipIf|todo)\(|@pytest\.mark\.(skip|skipif|xfail)|t\.Skip(f|Now)?\(|#\[ignore|@ts-ignore|# type: ignore|eslint-disable|//nolint' <changed test files>
```
The kit's Stop hook (`.agents/hooks/quality-gate.mjs`) also flags added skips and suppressions automatically; the search lets you catch them before it does.

Would a new test fail if the implementation were subtly wrong, or does it only restate what the code currently does?

**Example (Go) — a tautological generated test vs. one that checks the requirement:**
```go
// bad: re-derives `want` with the implementation's own formula, so the same wrong
// formula passes on both sides, and pct > 100 (negative price) is never checked
func TestApplyDiscount(t *testing.T) {
    price, pct := int64(10_000), int64(10)
    want := price - price*pct/100
    if got := ApplyDiscount(price, pct); got != want {
        t.Fatalf("got %d, want %d", got, want)
    }
}

// good: fixed values taken from the requirement, including the edge it must satisfy
func TestApplyDiscount(t *testing.T) {
    if got := ApplyDiscount(10_000, 10); got != 9_000 { // spec: 10% off 100.00 is 90.00
        t.Fatalf("ApplyDiscount(10000, 10) = %d, want 9000", got)
    }
    if got := ApplyDiscount(5_000, 200); got != 0 { // spec: never below zero
        t.Fatalf("ApplyDiscount(5000, 200) = %d, want 0 (clamped)", got)
    }
}
```

**Misapplication / over-engineering trap:** distrustful line-by-line re-derivation of every generated diff as if it must be wrong, erasing the speed benefit — apply the normal bar plus the handful of AI-specific checks above, not a categorically slower process.

## 6. What not to nitpick
**Definition:** don't spend review comments on anything a tool already enforces (formatting, import order, quote style), or on a genuine style preference with no measurable cost (two equally idiomatic constructs) — reserve attention for design, correctness, security, and test quality.

**Why it matters:** a thread with 15 formatting comments trains authors to dread review and reviewers to eventually rubber-stamp without reading; it also delays a merge over something a formatter would fix for free in CI.

**How to check:** before commenting on formatting/import order/naming style, would a formatter/linter already run by the project's `verify.mjs`/CI (Biome, Prettier, gofmt, rustfmt+clippy, ruff, Pint) have caught it — if so, that's a CI-config gap, not a review comment. Is your comment about the code being *wrong*, or just not how you'd have written it — the latter is a nitpick (§2), not a blocker.

**Misapplication / over-engineering trap:** swinging to zero comments to "avoid nitpicking" — silence on a genuinely confusing name or an untested edge case isn't tact, it's a missed review; spend comments where they change an outcome, not on a target comment count in either direction.

## 7. Review checklists: codify recurring mistakes, don't rely on memory
**Definition:** a review checklist is a codified, reusable list of the mistakes a specific stack or team actually makes repeatedly — OWASP items for a diff touching auth, a language's pitfalls list (`.agents/guides/languages/<id>.md`), a framework's footgun list (`.agents/guides/frameworks/<id>.md`) — run deliberately *before* free-form reading, not the same thing as the per-comment severity label (§2, which classifies a comment you already decided to write) or the generic closing checklist every guide in this kit ends with.

**Why it matters:** free-form review reliably catches what the reviewer happens to think of that day; a checklist catches the class of bug the team has been burned by before, on every diff, independent of who's reviewing or how tired they are — the entire point of writing an incident's lesson down once instead of re-learning it per reviewer.

**How to check:** does this diff's stack/language/framework have a known checklist on file? Did you run it — even mentally, item by item — before reading the diff top to bottom for whatever catches your eye? When a review misses something a checklist item would have caught, did the checklist get updated, or does the same class of bug wait to recur?

**Misapplication / over-engineering trap:** a checklist that grows without bound becomes theater — reviewers stop reading past item 5 and rubber-stamp the rest, or worse, treat "checklist passed" as a substitute for actual judgment on a diff the checklist wasn't written to anticipate; keep it short, specific to real recurring mistakes, and prune items that stop firing.

## Checklist (copyable)
- [ ] Reviewed in order: design, then correctness, then security, then tests, then readability
- [ ] Every comment has a label and blocking decoration where it matters (`issue (blocking)`, `suggestion (non-blocking)`, `nitpick`, `question`, `praise`)
- [ ] Comments name the specific problem and consequence, with a direction for non-trivial fixes
- [ ] The diff was read in the review tool's diff view before requesting review; scope matches the task; no leftover debug output
- [ ] AI-generated code: new APIs/config keys verified to exist; no unrequested scope creep; no weakened/skipped tests
- [ ] New or generated tests would fail if the behavior were wrong, not just restate the current implementation
- [ ] No comment exists that an existing formatter/linter already enforces in CI
- [ ] At least one explicit comment (or "looks right") on test coverage, not only on the implementation
- [ ] A known checklist for this stack/language (OWASP, `.agents/guides/languages/<id>.md`) was run before free-form reading

## References
- Google Engineering Practices — code review: https://google.github.io/eng-practices/review/ (repo archived 2025-11-21; docs still published)
- Conventional Comments: https://conventionalcomments.org/
- Google, "The Standard of Code Review": https://google.github.io/eng-practices/review/reviewer/standard.html · "What to look for": https://google.github.io/eng-practices/review/reviewer/looking-for.html
- Related: `.agents/guides/principles/simplicity.md` (scope discipline, KISS/YAGNI checks reused in §5), `testing-strategy.md` (what "tests actually verify the behavior" means), `.agents/agents/reviewer.md` (fresh-context reviewer subagent used by `/review-changes`)
