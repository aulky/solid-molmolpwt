# Documentation — engineering guide for AI agents
> Scope: doc types (Diataxis), README essentials, writing for scanners, examples that run, API doc comments (TSDoc/JSDoc, Python docstrings, godoc, rustdoc, PHPDoc), ADRs, changelogs, docs next to code, reviewing docs. Quick card: `.agents/rules/topic-docs-writing.md`; ADR files: `.agents/rules/topic-architecture-decisions.md` and `/architecture-decision-records`; changelog entries: `/commit-and-pr`. Code comments inside function bodies: `.agents/guides/principles/clean-code.md`.
> Last verified: 2026-09 — diataxis.fr (four types), keepachangelog.com (spec 1.1.0 is current), MADR (4.0.0 is current), go.dev/doc/comment and pkg.go.dev/testing (Example functions), Rust API Guidelines (C-FAILURE, C-EXAMPLE, C-QUESTION-MARK), tsdoc.org, pytest exit/doctest docs. All checked live; no tool versions are asserted beyond these.

## 0. How to use this guide
Each section: definition -> why it matters -> **how to check** (questions and commands for your own diff) -> examples -> misapplication traps. The rule under all of them: **documentation is a claim about the code, and a wrong claim is worse than none.** Every command you document, you ran; every version you state, you checked in the manifest or lockfile; every fact you do not know, you ask for or mark `TODO(<owner>): <missing fact>`.

Commands below work in PowerShell and POSIX shells unless marked.

## 1. Pick the doc type first (Diataxis)
**Definition:** Diataxis separates four reader needs, each with its own form:

| Type | Reader need | Form | Test |
|---|---|---|---|
| Tutorial | learning, by doing | a guaranteed-success lesson, one path, no choices | a newcomer finishes it without help |
| How-to guide | a task, now | numbered steps toward one goal; assumes competence | title reads "How to <goal>" |
| Reference | facts, while working | complete, dry, structured like the code (tables, signatures, defaults) | every public item appears once |
| Explanation | understanding | prose about why, trade-offs, history, alternatives | contains no steps |

**Why it matters:** mixed pages fail everyone. A tutorial that stops to explain design history loses the learner; a reference page padded with narrative hides the default value the expert came for. Most "our docs are bad" complaints are type-mixing, not missing words.

**How to check:** name the type of the page you are writing in one word. Then scan it: steps inside an explanation -> move them to a how-to and link. Paragraphs of rationale inside reference -> move to explanation. A how-to that teaches basics -> link a tutorial instead.

**Misapplication trap:** four empty folders (`tutorials/ how-to/ reference/ explanation/`) for a 300-line library. Diataxis is a lens per page, not a site layout; a small project needs a README (mixed on purpose, §2) plus generated API reference.

## 2. README essentials
**Definition:** the README is the landing page. On its first screen (about 25 lines) a stranger learns: what it is (one sentence), who it is for, why they would use it, and how to start (install + one working command with its output). Below that, in this order when they apply: usage examples, configuration (table), development setup (how to run tests), links to deeper docs, license, how to contribute or get help.

**Why it matters:** most visitors read only the first screen, then decide. A README that opens with badges, a logo and "Welcome!" spends that screen on nothing.

**How to check:**
- Does the first sentence name the thing and what it does, with no adjectives like "powerful", "modern", "seamless"?
- Is there a copy-pasteable quick start, and did you run it in a clean checkout this session?
- Are requirements stated with sources: runtime version from `package.json` `engines`, `go.mod`, `rust-version` in `Cargo.toml`, `requires-python` in `pyproject.toml`, `composer.json` `require.php`?
- Commands that differ by OS show both (PowerShell and POSIX), e.g. setting an env var: `$env:PORT = "3000"` vs `export PORT=3000`.
- Relative links resolve (§8).

```markdown
<!-- BAD -->
# Welcome to SuperCache!
A blazing-fast, next-generation caching solution for modern applications.

<!-- GOOD -->
# supercache
In-process LRU cache for Node.js with per-key TTL and size-based eviction.
For services that need to cut repeated database reads without running Redis.

    npm install supercache

    import { Cache } from "supercache";
    const c = new Cache({ maxBytes: 50_000_000 });
    c.set("user:1", user, { ttlMs: 60_000 });

Requires Node 20+. API reference: docs/api.md.
```

**Misapplication trap:** a 3,000-line README that documents every option. Keep it a landing page; full reference goes to generated docs or `docs/`.

## 3. Write for scanners: the first-sentence rule
**Definition:** readers scan: headings, the first sentence of each paragraph, the first words of list items, bold text, code and numbers. So every heading is a label someone with a question would search for, and every paragraph and doc comment opens with its point.

**Why it matters:** a doc comment's first sentence is often the *only* text shown — in IDE hovers, godoc/pkg.go.dev index lists, rustdoc module summaries, TypeDoc tables. If that sentence is "This function is used to...", the reader learns nothing.

**How to check (each paragraph, heading and doc comment in your diff):**
- Read only the first sentence. Does it state the point (what it does, what to do, what is true)?
- Heading test: would someone type this heading's words into a search? "Configure auth", not "Next steps on your journey".
- Specifics test: a sentence that could be pasted unchanged into any other project's docs is filler. Replace it with a number, command, path, error message or limit, or delete it.
- Plain words: use, help, show, start — not leverage, utilize, facilitate, robust. Active voice; imperative for steps.
- One idea per paragraph; numbered lists only for sequences.

**Misapplication trap:** chopping explanation pages into bullet fragments. Explanation (Diataxis) needs connected prose; the rule is "point first", not "no prose".

## 4. Examples that run
**Definition:** every code example in docs is executed somewhere: as a doctest, a Go `Example` function, a rustdoc test, or a script CI runs. An example no machine runs is out of date already, you just do not know it yet.

**Why it matters:** readers copy examples verbatim. A renamed parameter in a stale README example costs every new user an hour and makes them distrust the rest of the page.

| Language | Mechanism | Command |
|---|---|---|
| Rust | code blocks in `///` docs are doc-tests | `cargo test --doc` |
| Go | `func ExampleParse()` in `*_test.go` with `// Output:` comment; shown on pkg.go.dev | `go test ./...` (examples without an output comment compile but do not run) |
| Python | `>>>` blocks in docstrings | `python -m doctest -v path/to/mod.py` or `pytest --doctest-modules` |
| TypeScript/JS | no built-in: put example code in a tested file (e.g. `examples/*.ts` covered by a test or `tsc --noEmit`) and include or copy it | the repo's test/typecheck command |

**How to check:** for each code block you added or changed: which command executes it? If none, run it by hand now and say so in the Completion Report ("README quick start run in a fresh clone: exit 0"). Examples use the real public API (`import { Cache } from "supercache"`), not internal paths.

**Example (Go) — bad: prose example that nobody compiles:**
```go
// Parse parses a duration. Example: Parse("1h30m") returns 90 minutes.
```
**Good: an Example function the test runner executes and pkg.go.dev displays:**
```go
func ExampleParse() {
	d, err := duration.Parse("1h30m")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(d.Minutes())
	// Output: 90
}
```

**Misapplication trap:** doctests as the main test suite. Doctests prove the docs are true; unit tests prove the code is correct.

## 5. API doc comments by language
**Definition:** document every public item (exported function, type, method, module) with: a one-sentence summary starting with what it does; parameters and return only when the name and type do not already say it; errors/exceptions and panics; side effects, units, ranges, thread-safety; an example for non-trivial items. Do not restate the type system.

**How to check (on your diff):** list each new or changed public symbol (`export`, `pub`, capitalized Go identifier, public `def`/`class`, PHP `public function`). For each: doc present? First sentence is a summary? Every error/exception it can raise documented? Signature changed -> doc updated in the same commit? Linters when the repo has them: ruff `D` rules (pydocstyle) for Python, `#![warn(missing_docs)]` plus `cargo doc --no-deps` for Rust, `revive`'s `exported` rule for Go, `eslint-plugin-jsdoc` for JS/TS.

**TypeScript (TSDoc; JSDoc tags are the same idea):**
```ts
// BAD: restates the signature, hides the important facts
/**
 * Gets the user.
 * @param {string} id - the id
 * @returns {Promise<User>} the user
 */
export async function getUser(id: string): Promise<User> { /* ... */ }

// GOOD: summary, the non-obvious contract, the failure mode; types left to TypeScript
/**
 * Loads a user by id, reading through the 60 s in-memory cache.
 *
 * @param id - UUID v7 as issued by `createUser`.
 * @returns The user; soft-deleted users are excluded.
 * @throws {@link NotFoundError} If no active user has this id.
 */
export async function getUser(id: string): Promise<User> { /* ... */ }
```
Keep `{type}` annotations only in plain `.js` files checked by TypeScript (`checkJs`); in `.ts` they duplicate the signature and drift. Use `@deprecated <what to use instead>` so editors strike through call sites.

**Python (PEP 257; follow the repo's Google or NumPy section style):**
```python
# BAD: summary describes, not prescribes; no mention of the exception
def parse_price(text):
    """This function is used for parsing prices."""

# GOOD: imperative summary line, units, errors, a runnable example
def parse_price(text: str) -> int:
    """Return the price in cents from a string like "12.50" or "12,50".

    Raises:
        ValueError: If the text has more than two decimal places.

    >>> parse_price("12,50")
    1250
    """
```

**Go (go.dev/doc/comment):** the comment starts with the identifier's name and is a full sentence; `Deprecated:` paragraphs are recognized by tools and pkg.go.dev.
```go
// BAD
// this func will retry stuff
func Retry(ctx context.Context, n int, f func() error) error

// GOOD
// Retry calls f up to n times, waiting 100ms, 200ms, 400ms... between attempts.
// It returns nil on the first success, ctx.Err() if ctx is done, or the last
// error from f wrapped with the attempt count.
func Retry(ctx context.Context, n int, f func() error) error
```

**Rust (Rust API Guidelines):** sections `# Errors`, `# Panics`, `# Safety` (for `unsafe fn`), `# Examples`; examples use `?`, not `unwrap()`, with hidden `#` lines for setup, and run as doc-tests.
```rust
/// Reads the config file at `path` and applies environment overrides.
///
/// # Errors
///
/// Returns [`ConfigError::Io`] if the file cannot be read and
/// [`ConfigError::Parse`] if it is not valid TOML.
///
/// # Examples
///
/// ```
/// # fn main() -> Result<(), myapp::ConfigError> {
/// let cfg = myapp::load_config("tests/fixtures/app.toml")?;
/// assert_eq!(cfg.port, 8080);
/// # Ok(())
/// # }
/// ```
pub fn load_config(path: &str) -> Result<Config, ConfigError> { /* ... */ }
```

**PHP (PHPDoc):** document what native types cannot say — `@return list<User>`, `@param array<string, int> $weights`, `@throws UserNotFound` — which static analysers (PHPStan, Psalm) read. Omit `@param string $name` when the native type already says `string $name`.

**Misapplication traps:** docblocks on every private helper and getter ("Gets the name.") train readers to skip comments. Implementation steps belong in code or commit messages. A comment that adds no fact beyond the signature (typical of generated docs): delete it.

## 6. Architecture Decision Records (ADRs)
**Definition:** a short, numbered, immutable record of one significant decision: context (forces, constraints, with numbers), the decision (one specific sentence), options considered, and consequences (including the downside accepted). Formats: Nygard's original (Status / Context / Decision / Consequences) or MADR 4.0.0 (Context and Problem Statement, Decision Drivers, Considered Options, Decision Outcome, Consequences, optional Confirmation). This kit's defaults: `docs/adr/NNNN-kebab-title.md`, rules in `.agents/rules/topic-architecture-decisions.md`.

**Why it matters:** code shows *what* was chosen, never *what was rejected and why*. Without the record, the next person (or agent) re-opens the debate or "fixes" a deliberate trade-off.

**When to write one (check):** the choice is costly to reverse (datastore, framework, protocol, auth model, public API shape, repo structure), or people disagreed, or you chose the less obvious option. Not for library-internal choices a PR description covers.

**How to check an ADR diff:** at least two real options with pros and cons? Decision specific enough to verify ("Use PostgreSQL 17 for order data; analytics stays in BigQuery"), not "use a relational DB"? Negative consequences stated? Status set (`Proposed` until a human accepts)? Superseding: a *new* ADR, and the old one's Status changes to `Superseded by ADR-NNNN` — the old text is never rewritten. Index in `docs/adr/README.md` updated in the same change.

**Misapplication traps:** ADRs written after the fact to justify a choice with invented alternatives. Ten-page ADRs (keep to 1-2 pages). An ADR per minor library pick. An agent marking its own ADR `Accepted` — acceptance is a human decision.

## 7. Changelogs (Keep a Changelog)
**Definition:** `CHANGELOG.md`, newest release first, each version `## [1.4.0] - 2026-09-30` (ISO 8601 date), an `## [Unreleased]` section on top that collects entries as work lands, and entries grouped under `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Written for *users* of the software, not its developers.

**Why it matters:** users upgrading need "what breaks, what I must change, what is new", in one place. A dump of commit subjects gives them "refactor internals", "bump deps" and "fix typo" instead.

```markdown
<!-- BAD: a git log paste -->
- fix stuff (a1b2c3d)
- refactor cache
- update deps

<!-- GOOD -->
## [Unreleased]
### Changed
- **Breaking:** `Cache.get` now returns `undefined` instead of `null` for missing keys. Replace `=== null` checks.
### Fixed
- Entries with `ttlMs: 0` no longer expire immediately; 0 now means "no TTL" as documented (#212).
### Security
- Keys are no longer included in debug logs (#219).
```

**How to check:** user-visible change in the diff (API, CLI flag, config key, behavior, default, supported versions) -> an `Unreleased` entry in the same PR, under the right heading. Breaking changes start with **Breaking:** and give the migration step. Internal refactors, test changes and CI tweaks do not appear. Generated changelogs (from Conventional Commits) still get a human edit pass before release.

**Misapplication trap:** a hand-kept changelog for an internal service nobody upgrades; commit history plus deploy notes is enough.

## 8. Keep docs close to code, and keep them true
**Definition:** docs live in the same repo as the code they describe, change in the same PR, and go through the same review and CI (docs as code). The nearer the doc is to the code, the less it drifts: doc comment > README in the package folder > `docs/` > external wiki.

**Why it matters:** a separate wiki is updated by nobody, because no PR touches it. Drift is silent: nothing fails when a documented flag is renamed.

**How to check (on every diff that renames or removes something):**
- Search docs for the old name: `node .agents/scripts/search.mjs -w oldFlagName` (or `git grep -n -w oldFlagName` in a git repo). Every hit in `*.md`, doc comments and examples is updated in the same change.
- New config key, env var, CLI flag or endpoint -> it appears in the reference table.
- Relative links: for each `](relative/path)` you added, confirm the target file exists.
- API reference is generated from doc comments (TypeDoc, rustdoc, pkg.go.dev, Sphinx autodoc, phpDocumentor) rather than hand-copied.

**Never** name a docs file `AGENTS.md` or `GEMINI.md` in an Antigravity workspace: those names are loaded as agent rules.

**Misapplication trap:** duplicating the same facts in README, docs site and doc comments "for convenience". Keep one source of truth and link to it.

## 9. Reviewing documentation
**Definition:** review docs like code: correctness first, then completeness for the stated reader, then clarity; style last.

**How to check (reviewer questions, in order):**
1. **True?** Run the commands; compare stated defaults and versions with the code/manifest. Any claim without a source?
2. **Right type and reader?** One Diataxis type, one audience, stated or obvious.
3. **Complete for the task?** Can the reader finish without a question? Prerequisites listed? Error cases and how to recover?
4. **Scannable?** First sentences carry the point; headings are searchable labels; code fences have language tags.
5. **Maintainable?** No duplicated facts, no screenshots of text, no versions that will silently rot.

When asked to review someone's prose, quote the exact sentence, say where the reader stumbles, and offer an optional fix. Do not rewrite the whole document.

## 10. Anti-patterns -> fixes
| Anti-pattern | Fix |
|---|---|
| "This function is used to..." summaries | Start with the verb or the identifier: "Returns...", "Retry calls..." |
| `@param {string} id - the id` in TypeScript | Drop types; document only non-obvious meaning, units, constraints |
| Example no one runs | Doctest, Go Example, rustdoc test, or a tested example file |
| README opens with badges and adjectives | First sentence: what + for whom; then a working quick start |
| Changelog = `git log` paste | User-facing entries under Keep a Changelog headings |
| Rename without updating docs | Search the old name; fix every hit in the same PR |
| Invented numbers or benchmarks | Ask the owner or mark `TODO(<owner>)` |

## 11. Review checklist (copy into the Completion Report for doc changes)
- [ ] Each page has one Diataxis type and one reader; README first screen = what, who, why, how to start
- [ ] Every command shown was run this session (both PowerShell and POSIX forms where they differ)
- [ ] Every version or default matches the manifest, lockfile or code; no invented facts (gaps marked `TODO(<owner>)`)
- [ ] New/changed public symbols have doc comments; first sentence is a summary; errors/panics/throws documented
- [ ] Code examples are executed by doctest / Example / doc-test / a tested file, or were run by hand and reported
- [ ] Renamed or removed names searched in docs; all hits updated; relative links resolve
- [ ] User-visible change -> `CHANGELOG.md` `Unreleased` entry; breaking changes include the migration step
- [ ] Significant, hard-to-reverse decision -> ADR with >= 2 options, `Status: Proposed`
- [ ] No file named `AGENTS.md` or `GEMINI.md` created for docs

## 12. References
- Diataxis: https://diataxis.fr/
- Keep a Changelog 1.1.0: https://keepachangelog.com/en/1.1.0/ · Semantic Versioning: https://semver.org/
- ADRs: Nygard, "Documenting Architecture Decisions" https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions · MADR: https://adr.github.io/madr/ · https://adr.github.io/
- Go doc comments: https://go.dev/doc/comment · Go examples: https://pkg.go.dev/testing#hdr-Examples
- Rust API Guidelines, documentation: https://rust-lang.github.io/api-guidelines/documentation.html · rustdoc book: https://doc.rust-lang.org/rustdoc/
- PEP 257 docstrings: https://peps.python.org/pep-0257/ · doctest: https://docs.python.org/3/library/doctest.html
- TSDoc: https://tsdoc.org/ · JSDoc: https://jsdoc.app/ · PHPDoc: https://docs.phpdoc.org/
- Google developer documentation style guide: https://developers.google.com/style
- Related: `.agents/guides/principles/git-workflow.md` (commit messages, Conventional Commits feeding changelogs), `.agents/guides/principles/clean-code.md` (inline comments), `.agents/guides/principles/api-design.md` (API contracts)
