# Dependency management — engineering guide for AI agents
> Scope: choosing, pinning, updating, auditing, and hygienically organizing third-party dependencies across ecosystems — as checks you run on your own diff. Quick pointer: `.agents/rules/01-engineering-standards.md` (dependency hygiene); situational rule: `.agents/rules/topic-dependencies.md`. Companion: `.agents/guides/principles/security.md` §12 (supply-chain security slice).
> Last verified: 2026-09 — audit tools current (govulncheck = Go team; pip-audit = PyPA/OSV; cargo-audit = RustSec; `composer audit` built in; `npm audit`/`bun audit` built in). Dependabot (GitHub changelogs): minimum package age GA 2025-07-01, default 3-day cooldown 2026-07-14, cross-directory `group-by: dependency-name` 2026-02-24. uv `--locked` vs `--frozen` (docs.astral.sh), npm lacks `workspace:` (npm/cli#8845), Bundler `--deployment` deprecated (Bundler UPGRADING). Never state a package version from memory (§9).

## 0. How this guide works
Every dependency you add is code you did not write but now ship, debug, and secure with your own authority. Each section below: definition, why it matters, a **check** for your diff, examples, the over-engineering trap.

## 1. Choosing a dependency
**Definition:** before adding a package, evaluate it on maintenance health, license compatibility, footprint, and security posture — the same rigor you'd apply to code you're about to write yourself, because you are now responsible for it either way.
**Why it matters:** an abandoned single-maintainer package is a future incident (unpatched CVE, broken build on the next runtime) that lands on you; a copyleft license (GPL/AGPL) in a proprietary product can force source disclosure.
**How to check:**
- Maintenance: last release date, open-issue trend, commit recency on the registry page (npm/PyPI/crates.io/Packagist, or `npm view <pkg> time.modified`) — untouched for 2+ years with open security issues is a risk signal, not an automatic disqualifier for a stable, feature-complete tool (a finished parser needs no churn).
- License: does the license (check `license` field or `LICENSE` file) permit your project's distribution model? Flag GPL/AGPL/SSPL for review before adding to a proprietary codebase; MIT/Apache-2.0/BSD are the common safe defaults.
- Size/footprint: for a frontend bundle, does one function's worth of behavior pull in a multi-megabyte dependency tree (`npm ls <pkg> --all` or a bundle-analyzer)? For a CLI/backend, does it drag in a large transitive tree for a narrow need?
- Security posture: does it have zero known unpatched advisories (run the ecosystem's audit command, §6, *before* adding, not after)? Does it avoid unnecessary install-time scripts (`postinstall` running arbitrary code)?
- Could the standard library or an existing dependency already do this? `node .agents/scripts/search.mjs "<capability>" package.json` and check what's already installed before adding a new one.
**Trap:** rejecting every small, well-maintained package "to avoid a dependency" — a 40-line, actively-maintained, zero-dependency utility with a clear API and tests usually beats an untested reimplementation you now own forever; the concern is unmaintained/bloated/insecure dependencies, not dependencies as a category.
**Checklist:** `- [ ] license compatible; maintenance signal checked; footprint proportional to the need; audit run clean before adding; not already covered by an existing dependency`

## 2. Pinning & lockfiles
**Definition:** a manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, `composer.json`, `go.mod`) declares an acceptable *range*; a lockfile (`bun.lock`/`package-lock.json`, `uv.lock`/`poetry.lock`, `Cargo.lock`, `composer.lock`; Go: `go.mod` holds the exact MVS-selected versions, `go.sum` their hashes) records the *exact* resolved versions (and often hashes) that installed and were tested. Both are committed; only the package manager edits the lockfile.
**Why it matters:** without a lockfile, "works on my machine" becomes literal — two installs of the same manifest, days apart, can resolve different transitive versions; without hash verification, a compromised registry can serve different bytes for the same version string.
**How to check:** is the lockfile committed? Does CI/deploy install in a mode that uses it verbatim and fails on drift, never a bare resolve-and-install: `npm ci` / `bun install --frozen-lockfile` / `pnpm install --frozen-lockfile` / `pip install -r requirements.txt --require-hashes` or `uv sync --locked` (errors if `uv.lock` is stale; `--frozen` skips that check) / `cargo build --locked` / `composer validate` then `composer install --no-dev` (install only *warns* on a stale lock) / `bundle config set --local frozen true` then `bundle install` (the `--deployment` flag is deprecated)? Was a dependency edit made by hand-editing the lockfile rather than through the package manager? (Per this kit's hooks: editing a lockfile directly triggers a "revert; use the package manager" pending note — always run `add`/`install`/`update`, never hand-patch.)
**Example — bad → good (npm):**
```bash
# bad: no lockfile committed, or CI runs a resolving install
echo "package-lock.json" >> .gitignore
npm install   # may re-resolve to newer transitive versions each run

# good: lockfile committed, CI installs exactly what's locked
git add package-lock.json
npm ci        # fails loudly if package.json and the lockfile disagree
```
**Example — bad → good (Python, hash-pinned installs):**
```bash
# bad: nothing verifies the downloaded bytes match what was reviewed
pip install -r requirements.txt

# good: requirements.txt has per-package hashes (pip-compile --generate-hashes);
# install refuses any file that doesn't match
# <package>==<version from pip-compile> --hash=sha256:<64-hex digest written by the tool>
pip install -r requirements.txt --require-hashes
```
**Trap:** pinning every transitive dependency to an exact version by hand in the manifest (defeats the lockfile's purpose and fights the resolver on every future update) — let the lockfile do exact-pinning; the manifest should still declare a reasonable range (§3).
**Checklist:** `- [ ] lockfile committed; CI/deploy installs frozen/verbatim; no hand-edited lockfile`

## 3. Semver realities
**Definition:** semantic versioning (`MAJOR.MINOR.PATCH`) is a promise the *maintainer* makes about compatibility, not a guarantee enforced by any tool — and range operators mean different things in different ecosystems.
**Why it matters:** trusting `^1.4.0` assumes no maintainer ever ships an accidental breaking minor (common in practice); Go resolves differently from npm; and a semver-"safe" range can still break behavior without any API change.
**How to check, per ecosystem:**
| Ecosystem | Default range written | What actually gets installed |
|---|---|---|
| npm/bun/pnpm | `^1.4.0` | Highest `1.x.x` at install/update time — a minor bump can land unreviewed |
| Cargo | `1.4.0` (implicit caret) | Same caret semantics as npm: highest compatible `1.x.y` |
| Go modules | `v1.4.0` (exact, MVS) | Minimal Version Selection: the *lowest* version satisfying all `go.mod` requirements — Go does not auto-float to the latest minor like npm |
| Composer (PHP) | `^1.4` | Highest `1.x` — same caret semantics as npm |
| pip/uv (Python) | `>=1.4,<2.0` or exact `==1.4.0` | Whatever the resolver picks within range; locked only via `uv.lock`/`poetry.lock`/hashed requirements, or pip's experimental `pip lock` (`pylock.toml`, PEP 751) |
Ask, for any new range: does `^`/`~` genuinely mean "any of these is safe for us", or should this pin exact and bump deliberately (§4)? Has the changelog for the actual resolved version, not just the range, been glanced at before merging?
**Trap:** pinning every dependency to an exact version everywhere "for maximum safety" — this defeats automatic patch/security updates and multiplies manual bump work; use exact pins for the few dependencies where a minor bump has actually broken you before, ranges plus a lockfile (§2) for everything else.
**Checklist:** `- [ ] range semantics understood per ecosystem; exact pins reserved for dependencies with a track record of breaking minors`

## 4. Update cadence
**Definition:** dependencies are updated on a deliberate rhythm — routine patch/minor updates on autopilot (with CI as the safety net), major/breaking updates as a planned, reviewed task — rather than never, or in one giant batch under deadline pressure.
**Why it matters:** never updating piles up unpatched CVEs *and* update risk (the eventual jump spans dozens of breaking changes at once); updating constantly with no review makes every merge a gamble.
**How to check:** does a routine (automated PR + CI, §5) exist for patch/minor bumps, so they don't pile up for months? For a major bump, is there a single-dependency PR (not bundled with feature work) that reads the changelog/migration guide, runs the full test suite, and can be reverted independently? Is there a stated maximum staleness (e.g. "no direct dependency more than N major versions behind") the team actually looks at?
**Trap:** a "big bang" quarterly upgrade of everything — when it breaks you bisect thirty updates under pressure; one major at a time is cheaper in aggregate.
**Checklist:** `- [ ] patch/minor updates flow through automation + CI; major updates are isolated, reviewed, changelog-read, single-dependency PRs`

## 5. Automated updates (Dependabot / Renovate)
**Definition:** a bot opens PRs for outdated dependencies on a schedule, running your CI against each one, so a human reviews a diff plus a green/red check instead of researching versions by hand.
**Why it matters:** "someone remembers to check" never happens reliably; a bot gives a standing review queue with a test signal, closing §4's "never updated" failure.
**How to check, either tool:**
- Is CI required to pass before an update PR can merge, and does CI actually run the ecosystem's full suite (not just a smoke test) on these PRs?
- Are updates grouped sensibly (by workspace/package, or by risk level) so a flood of individual PRs doesn't get rubber-stamped unread? Dependabot groups by name pattern, dependency type and semver level; with `directories:` plus `group-by: dependency-name` (2026-02, same ecosystem) it opens one PR per dependency across directories. It supports a configurable minimum package age (GA July 2025); since a July 2026 change it also defaults to a 3-day cooldown before opening a version-update PR at all (previously opt-in), cutting exposure to an unvetted release — security updates are exempt and open immediately. Renovate groups via `packageRules` and has a `lockFileMaintenance` job that refreshes transitive dependencies on a schedule even without a manifest change.
- Are major-version PRs routed differently from patch/minor (e.g. auto-merge patch/minor once CI is green, but require manual review for major) rather than treating every bot PR identically?
**Example — minimal config intent (Dependabot, `.github/dependabot.yml`):**
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule: { interval: "weekly" }
    groups:
      minor-and-patch:
        update-types: ["minor", "patch"]
```
**Trap:** auto-merging every bot PR (majors included) with no CI gate or changelog read — risk moves from stale to unreviewed; the bot proposes, CI plus a human decides beyond patch/minor.
**Checklist:** `- [ ] bot configured with CI required to merge; sensible grouping; major bumps routed to manual review`

## 6. Audits per ecosystem
**Definition:** an audit command checks your resolved dependency tree against a vulnerability database (usually OSV or an ecosystem-specific advisory feed) and reports known CVEs/advisories affecting versions you actually have installed.
**Why it matters:** a lockfile makes versions reproducible, not *safe* — a pinned version can carry a known critical RCE; only the audit checks real vulnerability data.
**How to check — run before adding a new dependency and on a schedule (ideally via §5's bot or a CI job), per ecosystem:**
| Ecosystem | Command | Notes |
|---|---|---|
| Node/npm | `npm audit` | `bun audit` / `pnpm audit` equivalents; `--omit=dev` to scope to production deps |
| Python | `pip-audit` | PyPA-maintained, OSV-backed; run against the locked environment (`pip-audit -r requirements.txt`) |
| Rust | `cargo audit` | RustSec Advisory Database; add `cargo deny` for license + duplicate-version checks too |
| Go | `govulncheck ./...` | Official Go team tool; reports only vulnerabilities in code paths you actually call, not just modules you depend on |
| PHP | `composer audit` | Built into Composer; checks `composer.lock` against known advisories |
| Ruby | `bundle audit` (bundler-audit gem) | Checks `Gemfile.lock` against the Ruby Advisory DB |
| Java/Kotlin | `mvn org.owasp:dependency-check-maven:check` or Gradle OWASP plugin | Slower, broader (CVE-based, not just language-ecosystem advisories) |
| .NET | `dotnet list package --vulnerable` | Built into the SDK |
A finding is not automatically a "drop everything" — triage by: is the vulnerable code path actually reachable from your usage (govulncheck answers this precisely for Go; for others, check if you call the affected function/module)? Is a patched version available now, or do you need a temporary mitigation?
**Example — bad → good (Go, CI gate):**
```bash
# bad: build and deploy proceed even with known-vulnerable, reachable code paths
go build ./...

# good: audit runs in CI and fails the build on a reachable finding
govulncheck ./...   # exits non-zero only for vulnerabilities your code actually calls
```
**Trap:** treating every finding as equally urgent, blocking all work until zero remain, including low-severity issues in dev-only tooling never shipped to production — triage by severity and reachability; a critical RCE in a production dependency is not the same urgency as a moderate advisory in a build-time-only linter.
**Checklist:** `- [ ] ecosystem audit command run before adding a dependency and on a recurring schedule; findings triaged by severity + reachability, not just counted`

## 7. Vendoring
**Definition:** vendoring copies a dependency's source directly into your repository instead of fetching it from a registry at install time (Go's `vendor/` directory, a git submodule, or a literal source copy).
**Why it matters:** vendoring removes a runtime dependency on the registry being reachable/unchanged (useful for offline/air-gapped builds) at the cost of owning every future patch to that copy — security fixes upstream no longer reach you automatically.
**How to check:** is there a real, current need — air-gapped/offline builds, a registry that's proven unreliable, a regulatory requirement for full source-in-repo — or is this "just in case" (see `simplicity.md` §4, YAGNI)? If vendoring, is there still a documented process for pulling upstream security fixes into the vendored copy, not just a one-time copy that silently rots?
**Example (Go, the common legitimate case):** `go mod vendor` populates `vendor/` from `go.sum`-verified modules, checked in alongside `go.mod`/`go.sum` — a supported, low-maintenance form because tooling keeps the vendored copy in lockstep with the lockfile; the tree is regenerated by the tool, never hand-edited.
**Trap:** hand-copying a dependency's source to make one small modification "just this once" — a silent fork with no path to upstream fixes, invisible to whoever reviews the diff months later; either submit the fix upstream, or maintain it as an explicit, documented fork/patch (e.g. `patch-package`, `pnpm.patchedDependencies`) so the divergence is visible and re-appliable.
**Checklist:** `- [ ] vendoring has a real, current reason (not "just in case"); if vendored, a process exists for pulling upstream fixes forward`

## 8. Monorepo workspace hygiene
**Definition:** in a workspace (npm/pnpm/yarn/bun workspaces, a Cargo workspace, a Go multi-module repo), shared dependencies resolve to one location and one lockfile at the repo root — packages declare what they import, not what happens to be hoisted and reachable by accident.
**Why it matters:** "phantom dependencies" (an undeclared library that resolves only because a *sibling's* install hoisted it into a shared `node_modules`) break when hoisting changes or the sibling drops it — and the bug surfaces in an unrelated package's change.
**How to check:** does every package's manifest list every module it directly imports, even if a workspace-mate already depends on it (not relying on hoisting to make an undeclared import resolve)? Is there exactly one lockfile at the workspace root (not one per package, which can silently drift to different versions of a shared dependency)? For pnpm/Yarn/Bun, does an internal cross-package dependency use the workspace protocol (`"workspace:*"`), not a range that could resolve to the published registry copy? npm has no `workspace:` protocol (fails with `EUNSUPPORTEDPROTOCOL`): declare the sibling with a range matching its local version and npm links it.
**Example — bad → good (pnpm/Yarn/Bun workspace, package.json snippet):**
```jsonc
// bad: package B uses lodash but never declares it — works only because
// package A's install happened to hoist lodash where B's require() can reach it
{ "name": "@app/b", "dependencies": { "@app/a": "^1.0.0" } }

// good: every direct import is declared; internal dependency uses the workspace protocol
{ "name": "@app/b", "dependencies": { "@app/a": "workspace:*", "lodash": "^4.17.0" } }
```
**Trap:** running `npm dedupe`/manually flattening `node_modules` to "fix" a phantom-dependency bug — that treats the symptom; the fix is declaring the real dependency in the package that uses it, so it survives the next hoisting or lockfile-algorithm change untouched.
**Checklist:** `- [ ] every package declares what it imports; one lockfile at workspace root; internal deps use the workspace protocol`

## 9. Never invent versions
**Definition:** when you need to state or write a dependency version — in a manifest, in prose, in a recommendation — the version comes from a source you actually checked (the current lockfile, `npm view <pkg> versions`/the registry page, an installed package's own `package.json`/`Cargo.toml`/metadata, or a search you just ran), never from memory or a plausible-looking guess.
**Why it matters:** training data has a cutoff; a guessed version either fails to resolve (best case) or resolves to a real but wrong release, and a guessed *recommendation* ("version Y fixes this") sends a human chasing a fix that never existed.
**How to check:** before writing any version number, did you run one of: read the project's own lockfile/manifest for what's already pinned, `npm view <pkg> version` / `pip index versions <pkg>` / `cargo search <pkg>` / the registry's web page, or check an installed copy under `node_modules`/`vendor`/the language's package cache? If none of those were done, do not state a version — write the guidance version-agnostically ("use the latest patch release of the 2.x series" or "check the lockfile") instead of guessing a number.
**Example — bad → good (any ecosystem):**
```text
bad:  "zod": "^3.99.0"          <- typed from memory; may not exist, or may be long outdated
good: run `npm view zod version` (or read bun.lock / package.json), then write exactly what it printed
```
**Trap:** treating this rule as only about the final manifest edit — the same discipline applies to any version claim in comments, docs, or a chat answer; a confidently typed "add version X" that was never looked up is the same failure whether or not it lands in a committed file.
**Checklist:** `- [ ] every stated version came from the lockfile, registry, an installed package, or a just-run search — never memory`

## Full review checklist (copy into your Completion Report or PR description)
```text
- [ ] New dependency: license compatible, maintenance/footprint checked, audit clean, not already covered (§1)
- [ ] Lockfile committed; CI/deploy installs frozen/verbatim; no hand-edited lockfile (§2)
- [ ] Range semantics understood per ecosystem; exact pins only where minors have broken before (§3)
- [ ] Patch/minor updates automated; major updates isolated, reviewed, changelog-read (§4, §5)
- [ ] Automated-update bot requires CI green; majors routed to manual review (§5)
- [ ] Ecosystem audit run before adding and on a schedule; findings triaged by severity/reachability (§6)
- [ ] Vendoring (if any) has a real reason and a path for upstream fixes (§7)
- [ ] Every package declares its own imports; one lockfile per workspace; workspace protocol used internally (§8)
- [ ] No version number in this diff or report was invented — each came from a lockfile/registry/install (§9)
```

## References
- npm workspaces / lockfiles — https://docs.npmjs.com/cli/v10/using-npm/workspaces · Go Modules reference (MVS) — https://go.dev/ref/mod
- Semantic Versioning 2.0.0 — https://semver.org/
- Dependabot version updates — https://docs.github.com/en/code-security/dependabot/dependabot-version-updates
- Renovate docs (grouping, lockFileMaintenance) — https://docs.renovatebot.com/
- govulncheck — https://go.dev/blog/vuln · pip-audit — https://github.com/pypa/pip-audit · cargo-audit / RustSec — https://rustsec.org/ · Composer audit — https://getcomposer.org/doc/03-cli.md#audit
- OWASP A03:2025 Software Supply Chain Failures — https://top10.owasp.org/2025 (see `security.md` §2, §12)
- Related: `.agents/guides/principles/security.md` §12, `.agents/guides/principles/simplicity.md` §4 (YAGNI, vendoring trap), `.agents/rules/topic-dependencies.md`
