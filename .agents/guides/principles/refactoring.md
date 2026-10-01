# Refactoring — engineering guide
> Scope: refactor vs rewrite, Chesterton's fence via git history, characterization tests, small safe steps, mechanical vs semantic changes, the catalog, strangler fig, IDE and codemod tooling — each as a check on your own diff. Protocol and invariants: `.agents/rules/topic-refactoring.md`. Why code exists: `git-historian` subagent or the installed `commit-archaeologist` skill. When to extract at all: `.agents/guides/principles/simplicity.md` (rule of three).
> Last verified: 2026-09 — catalog names (refactoring.com/catalog); `ast-grep run` flags (ast-grep docs); `gopls rename -h` (gopls v0.23, Go 1.26); `gofmt -r`, `git diff -G <base>` and `git log -L --no-patch` run on git 2.52; Rector CLI (getrector.com); LibCST `initialize`/`codemod` (codemods tutorial); OpenFeature `getBooleanValue` (js-sdk README); Vitest 4.1 `toMatchInlineSnapshot` (installed package).

## 0. Definition: two hats

**Refactoring** is a change to the structure of code that keeps its observable behaviour (Fowler). Observable behaviour includes return values, side effects, thrown errors and their messages, ordering, rounding, defaults, public signatures, log lines other systems parse, and performance within agreed limits.

**Two hats (Kent Beck):** at any moment you are either refactoring or changing behaviour, never both in one step. Mixed diffs make a regression look like intent, and reviewers cannot tell which lines they must think hard about.

**Check on your diff.**
- Did any test assertion change? Before the first refactor step, record the base: `git rev-parse HEAD` → `<base-sha>`. Then `git diff --stat -G "expect\(|assert|should|t\.(Error|Fatal)|want" <base-sha> -- "*test*" "*spec*"` lists test files whose changed lines touch assertions, staged or committed included (a bare `git diff` sees only unstaged edits and prints nothing after `git add` or a commit). Expect empty output (a moved symbol may change an import line only). The regex is a heuristic: also read every test file in `git diff --stat <base-sha>`. New characterization tests (§3) go in their own earlier commit; take `<base-sha>` after it, so the check covers refactor steps only. Not a git repo: re-read each test file you edited.
- Did any exported signature change? `node .agents/scripts/search.mjs "^export (async )?function|^export (class|interface|type|const)" <changed files>` before and after; for Go, exported identifiers start with a capital; for PHP and Python, public methods.
- Does the same set of tests pass before and after, with the same count? Record the summary line (for example `Tests 42 passed`) from both runs in your report.

## 1. Refactor or rewrite?

Default to refactoring. A rewrite discards years of bug fixes that live only in the code (Spolsky), runs two systems in parallel for months, and usually ships late with regressions.

| Situation | Choice |
|---|---|
| Code works, is hard to change, has users | Refactor in steps (§4) |
| Large component, must keep running while replaced | Strangler fig (§7) |
| Platform or runtime is dead or unsupportable | Rewrite behind a strangler seam, slice by slice |
| Small (under ~200 lines), fully specified by tests | Rewrite is fine; the tests are the spec |
| Prototype nobody depends on | Rewrite freely |

**Check before proposing a rewrite:** list the behaviours the old code has, including odd ones (special cases, legacy formats, bug-compatible outputs). If you cannot list them, you cannot rewrite safely; write characterization tests (§3) first. Also search the repo for an earlier attempt (`.agents/rules/topic-new-project.md`, graveyard check).

**Trap.** "It's easier to start over" said after reading the code for ten minutes. Difficulty reading code is a reason to refactor it, not to discard it.

## 2. Chesterton's fence, with git history

**Definition.** Do not remove a fence until you know why it was put up. In code: a strange condition, a retry loop, a `sleep`, a magic number, a duplicated branch, a `HACK` comment. Find its reason before you delete or "simplify" it.

**Check (run these, quote what you find):**
```bash
git log -L 40,60:src/billing/tax.ts --no-patch --format="%h %ad %an %s" --date=short   # history of these lines
git log -S "retryCount" --oneline -- src/        # commits that added or removed this string
git log -G "sleep\(" --oneline -- src/           # commits whose diff lines match a regex
git blame -w -C -L 40,60 -- src/billing/tax.ts   # -w ignore whitespace, -C follow moved lines
git log --follow --oneline -- src/billing/tax.ts  # history across renames
git show <sha>                                     # full message: issue refs (#412), reverts
```
All work in PowerShell and POSIX shells. Also search tests that cover the lines, and any issue number in the message. Not a git repository: search tests, docs and comments, then ask the user.

**Record the result before acting:**
```text
Fence:     retry loop, src/storage/upload.py:88-97
Evidence:  a1b2c3d 2024-03-02 "retry: S3 eventual consistency (#412)"; test_upload_retry covers it
Inference: (Inferred) still needed; the S3 client version has not changed since
Decision:  keep; add a comment linking #412
```

**Trap.** Treating "no one remembers" as evidence of uselessness, or grepping once and declaring code dead while it is called via reflection, config strings, templates, routes, serialized job names or an external client.

## 3. Characterization tests: pin current behaviour first

**Definition.** A characterization test (Michael Feathers) records what the code does *now*, not what it should do. It is the safety net that makes refactoring legacy code possible.

**How.** Call the code with representative and edge inputs (empty, zero, negative, unicode, maximum, missing optional fields). Assert the *actual* output, even when it looks wrong; mark suspected bugs with a comment and report them instead of fixing them mid-refactor. For large outputs use a snapshot or golden file.

**Check.** Coverage of the lines you will touch: run the tests with coverage (`vitest run --coverage`, `pytest --cov`, `go test -cover`, `vendor/bin/pest --coverage`; most need a coverage plugin or driver installed) or break the code on purpose for a moment and confirm a test fails.

```ts
// TypeScript (Vitest): record the current output once, then review the recorded value
import { expect, test } from "vitest";
test("formatInvoice: current behaviour, empty lines", () => {
  expect(formatInvoice({ lines: [], currency: "EUR" })).toMatchInlineSnapshot();
});
```
```python
# Python (pytest): table of inputs and the outputs the code produces today
import pytest
@pytest.mark.parametrize("raw, current", [
    ("", None),
    ("2024-02-30", None),          # current behaviour: invalid dates return None, no error
    ("2024-01-05T10:00", "2024-01-05"),
])
def test_parse_date_characterization(raw, current):
    assert parse_date(raw) == current
```
```go
// Go: golden file; regenerate deliberately with: go test ./internal/report -update
var update = flag.Bool("update", false, "rewrite golden files")

func TestRenderGolden(t *testing.T) {
	got := Render(sampleReport())
	golden := filepath.Join("testdata", "render.golden")
	if *update {
		if err := os.WriteFile(golden, got, 0o644); err != nil { t.Fatal(err) }
	}
	want, err := os.ReadFile(golden)
	if err != nil { t.Fatal(err) }
	if !bytes.Equal(got, want) { t.Errorf("output changed:\n%s", got) }
}
```

**Traps.** Snapshots of nondeterministic data (timestamps, random IDs, map iteration order): normalise them first. Giant snapshots nobody reads: assert the few fields that matter. Updating snapshots (`vitest run -u`, `-update`) to make a refactor pass: that is changing the spec, which is forbidden during a refactor.

## 4. Small safe steps with verification

**Loop.** One catalog step (§6) → fast check → tests for the area → next step. Keep the code compiling and green after every step.
1. Fast check after each step: `node .agents/scripts/verify.mjs --quick` (format, lint, typecheck).
2. Tests for the touched area after each semantic step (§5): the project's test runner, filtered to the area (`bunx vitest run src/billing`, `pytest tests/billing`, `go test ./internal/billing/...`, `vendor/bin/pest tests/Billing`).
3. Full `node .agents/scripts/verify.mjs` at the end.
4. Red after a step: undo that step and take a smaller one. Do not debug forward through three stacked changes. In git, commit each green step so `git restore <path>` or `git diff` isolates the last one.

**Public or widely used APIs: parallel change (expand → migrate → contract).** Add the new form beside the old; make the old one delegate to the new and mark it deprecated; migrate callers in batches; remove the old form last, in its own change. Every intermediate state compiles and ships.

**Tangled code: Mikado method.** Try the change; when it breaks things, note the prerequisites, revert, and do the prerequisites first (leaves of the graph), each as its own green step.

**Check.** Could you stop after any step and ship? If a step leaves the build red, it was too large.

## 5. Mechanical vs semantic changes

**Mechanical:** rename, move, reformat, reorder imports, a codemod applied uniformly. No logic changes; the tool and the compiler prove most of it. **Semantic:** anything that restructures logic (merge functions, replace a conditional, change a loop into a pipeline, reorder statements with side effects). Semantic steps need tests and careful review.

**Rules.**
- Never mix both in one commit or step. A 300-file rename is easy to review only if nothing else hides in it.
- Mechanical commits state the command that produced them, so a reviewer can regenerate and compare.
- Formatting-only commits go into `.git-blame-ignore-revs`; run `git config blame.ignoreRevsFile .git-blame-ignore-revs` so blame skips them.

**Check.** For a mechanical step: does `git diff --stat` touch only the files the tool reported, and is every hunk the same shape? For a semantic step: is it small enough to explain in one sentence?

## 6. The catalog (names from Fowler, *Refactoring*, 2nd ed.)

| Refactoring | Use when | Watch out for |
|---|---|---|
| Extract Function / Extract Variable | a block needs a comment to explain it | captured mutable state; early returns |
| Inline Function / Inline Variable | the name says no more than the body | callers relying on side effects once |
| Change Function Declaration (rename, reorder params) | the name misleads | dynamic callers, public API: use parallel change |
| Rename Variable / Rename Field | a name lies | serialized field names, DB columns, JSON keys |
| Move Function / Move Field | it uses another module's data more than its own | barrel files, re-exports, path aliases (`~/*`) |
| Introduce Parameter Object | the same group of args travels together | object identity and mutation |
| Replace Conditional with Polymorphism | the same switch on type repeats in 2+ places | a single switch is fine as is |
| Replace Nested Conditional with Guard Clauses | deep nesting hides the main path | order of checks may be behaviour |
| Split Phase | one function parses and computes | intermediate data shape |
| Replace Primitive with Object | a string or number carries rules (money, email) | equality, serialization |
| Remove Flag Argument | a boolean selects the callee's behaviour | callers passing variables, not literals |
| Separate Query from Modifier | a getter also changes state | callers that relied on the side effect |
| Remove Dead Code | proven unreferenced (§2, §8) | reflection, config, external callers |

**Extract Function (TypeScript).**
```ts
// bad: one function computes, calculates dates and formats
function statement(inv: Invoice): string {
  let total = 0;
  for (const l of inv.lines) total += l.qty * l.price;
  const due = new Date(inv.issued); due.setDate(due.getDate() + 30);
  return `${inv.customer}: ${total} due ${due.toISOString().slice(0, 10)}`;
}
// good: each piece has a name and a test; output is byte-identical
const totalOf = (inv: Invoice) => inv.lines.reduce((s, l) => s + l.qty * l.price, 0);
function dueDate(issued: Date): Date { const d = new Date(issued); d.setDate(d.getDate() + 30); return d; }
function statement(inv: Invoice): string {
  return `${inv.customer}: ${totalOf(inv)} due ${dueDate(inv.issued).toISOString().slice(0, 10)}`;
}
```
Semantic trap: "simplifying" `dueDate` to `issued.getTime() + 30 * 86_400_000` is not a refactor. `setDate` counts local calendar days, fixed milliseconds do not across a daylight-saving change. Prove "same output" with a characterization test; do not assume it.

**Introduce Parameter Object (Python), done as a parallel change.**
```python
# bad: every caller passes the pair, and some pass it in the wrong order
def readings_outside(station: Station, low: float, high: float) -> list[Reading]: ...

# good: the pair becomes a concept that owns its rule
@dataclass(frozen=True)
class TempRange:
    low: float
    high: float
    def contains(self, t: float) -> bool:
        return self.low <= t <= self.high

def readings_outside_range(station: Station, r: TempRange) -> list[Reading]:
    return [x for x in station.readings if not r.contains(x.temp)]

def readings_outside(station, low, high):  # step 2: old form delegates; delete after callers move
    return readings_outside_range(station, TempRange(low, high))
```

**Replace Conditional with Polymorphism (PHP), only because the switch repeats.**
```php
// bad: the same match on $type appears in cost(), etaDays() and label()
function cost(Shipment $s): int {
    return match ($s->type) { 'standard' => 500, 'express' => 1500, 'pickup' => 0 };
}
// good: one class per variant; adding a method means one new class, no hunt for switches
interface ShippingMethod { public function cost(): int; public function etaDays(): int; }
final class Express implements ShippingMethod {
    public function cost(): int { return 1500; }
    public function etaDays(): int { return 1; }
}
```

**Replace Nested Conditional with Guard Clauses (Go).**
```go
// bad: the main path is three levels deep
func payAmount(e Employee) Money {
	if !e.Separated {
		if !e.Retired { return normalPay(e) } else { return retiredPay(e) }
	} else { return Money{} }
}
// good: exceptional cases leave early; same checks, same order
func payAmount(e Employee) Money {
	if e.Separated { return Money{} }
	if e.Retired { return retiredPay(e) }
	return normalPay(e)
}
```

## 7. Strangler fig for large replacements

**Definition.** Grow the new implementation around the old one and move traffic slice by slice until the old one can be deleted (Fowler, "Strangler Fig Application"). **Branch by abstraction** is the in-process version: introduce an interface over the old code, add the new implementation behind it, switch callers, delete the old.

**Steps.** 1) Create one seam every caller goes through (facade, router, interface). 2) Pin behaviour with characterization tests at the seam. 3) Route one slice (an endpoint, a tenant, a region) to the new code behind a flag. 4) Optionally shadow-run: call both, return the old result, log differences. 5) Widen slice by slice. 6) Delete the old path and the flag.

```ts
// the seam: callers only ever call quote(); the routing decision lives in one place
export async function quote(req: QuoteRequest): Promise<Quote> {
  // flagClient = OpenFeature.getClient(); owner: pricing, remove by 2026-12
  const useV2 = await flagClient.getBooleanValue("quote-v2", false, { region: req.region });
  return useV2 ? quoteV2(req) : legacyQuote(req);
}
```

**Check.** Does every caller go through the seam (search for direct calls to the legacy function)? Is there a dated plan to delete the old path? Are new features added to the new path only?

**Trap.** Strangling with no deletion step: two implementations forever, with fixes applied to one of them.

## 8. Tooling: prefer semantic tools over text replacement

Text search-and-replace renames comments, strings and unrelated symbols with the same name, and misses dynamic references. Prefer, in order: IDE or language-server refactorings (they understand scope), then syntax-aware codemods, then text replacement with a reviewed diff.

| Stack | Rename / move | Codemod (preview first) |
|---|---|---|
| Any | IDE rename (TypeScript server, Pyright/Pylance, gopls, rust-analyzer, Intelephense/PhpStorm) | `ast-grep run -p 'oldFn($A)' -r 'newFn($A)' -l ts src` (shows diff; `-i` interactive, `-U` apply all) |
| TS/JS | IDE rename; ts-morph script | jscodeshift or ts-morph transforms |
| Python | IDE rename; rope | once per repo `python -m libcst.tool initialize .` (writes `.libcst.codemod.yaml`), then `python -m libcst.tool codemod <module.Command> src` |
| Go | `gopls rename -d file.go:12:6 NewName` (`-w` to write) | `gofmt -r "a[b:len(a)] -> a[b:]" -d .` (`-w` to write); gopls extract/inline code actions |
| Rust | rust-analyzer rename | `cargo clippy --fix`, `cargo fix` (both edit files; commit first) |
| PHP | IDE rename | `vendor/bin/rector process src --dry-run`, then without `--dry-run` |

**Quoting.** ast-grep metavariables (`$A`, `$$$ARGS`) must be in single quotes in PowerShell and POSIX shells. Inside double quotes the shell expands `$A` to an empty string, and the codemod silently matches or rewrites the wrong code.

**After any tool run.**
- Search for leftovers the tool cannot see: `node .agents/scripts/search.mjs "\bOldName\b"` over the whole workspace (strings, configs, templates, docs, SQL, routes, serialized names).
- Read the diff; confirm it is the only kind of change (§5).
- Run `node .agents/scripts/verify.mjs`.

**Trap.** Running a codemod over the whole repo in one go when it has only been tried on one file; run it on one directory, review, then widen.

## 9. Misapplications and over-engineering traps

- **Drive-by refactoring:** renaming or restructuring code outside the task in a bug-fix or feature diff. Mention it under "Not done / risks" instead (`.agents/rules/01-engineering-standards.md`, scope discipline).
- **Refactoring toward a guessed future:** extracting interfaces, plugins or base classes for variants that do not exist yet. Refactor toward the change you are about to make ("make the change easy, then make the easy change" — Kent Beck).
- **Merging look-alikes:** two functions that look identical but change for different reasons (duplicate code, different knowledge). Keep them apart (`simplicity.md`, DRY).
- **Polymorphism for one switch:** a class hierarchy to replace a single `match` that appears once.
- **Unbounded refactor:** no stated goal or stop point. Write the goal ("adding a shipping method touches one file") and stop when it is met.
- **Test edits to go green:** changing assertions or updating snapshots during a refactor. The test is right until proven otherwise; fix the refactor.

## 10. Review checklist (copy into the Completion Report or PR)

- [ ] Goal and boundary stated; the diff contains no behaviour change (or the behaviour change is a separate, approved step)
- [ ] Tests covering the touched code existed or were added as characterization tests first
- [ ] Same tests pass before and after (summary lines quoted); no assertion or snapshot changed since `<base-sha>` (§0)
- [ ] Every deleted or rewritten odd piece has a Chesterton's-fence record (§2)
- [ ] Mechanical and semantic changes are separate; codemod commands stated
- [ ] Renames and moves: whole-workspace search for the old name shows no leftovers
- [ ] Public APIs changed via parallel change (old form delegates, deprecated, removal planned)
- [ ] `node .agents/scripts/verify.mjs --quick` after each step; full verify passes at the end

## 11. References

- Martin Fowler — Refactoring (2nd ed.) and catalog: https://refactoring.com/catalog/
- Martin Fowler — Strangler Fig: https://martinfowler.com/bliki/StranglerFigApplication.html ; Branch by abstraction: https://martinfowler.com/bliki/BranchByAbstraction.html ; Parallel change: https://martinfowler.com/bliki/ParallelChange.html
- Michael Feathers — Working Effectively with Legacy Code (characterization tests, seams)
- Joel Spolsky — Things You Should Never Do, Part I: https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/
- Mikado method: https://mikadomethod.info/
- Git: `git log -L`, `-S`, `-G`: https://git-scm.com/docs/git-log ; blame ignore-revs: https://git-scm.com/docs/git-blame
- ast-grep rewrite: https://ast-grep.github.io/guide/rewrite-code.html ; gopls refactorings: https://go.dev/gopls/features/transformation ; Rector: https://getrector.com/documentation ; LibCST codemods: https://libcst.readthedocs.io/en/latest/codemods_tutorial.html ; Vitest snapshots: https://vitest.dev/guide/snapshot
