# ADR-0001: Adopt the Antigravity Frontier Kit

## Status

Accepted

## Date

2026-09-28

## Deciders

The repository owner (directed and reviewed this decision live across the build session); implemented by
the assistant on request. This ADR is written retroactively, after the kit was designed and built, to record
why it exists and what it trades off — the standing invariant in `.agents/rules/topic-adr.md` ("never set
`Accepted` yourself") does not apply here because the decision itself, and every phase of its execution, was
made and continuously confirmed by the user, not inferred by the agent.

## Context

The kit was originally developed inside a small SolidStart 2 + Tailwind CSS 4 scaffold, used as ground zero for
a broader goal: make Google Antigravity, running a low-tier Gemini Flash model, perform like a frontier
coding agent (comparable to Opus/Sonnet-class or GPT-class models) — not just here, but reusably across the
user's other repositories (Laravel/PHP, Rust APIs, other SolidJS apps).

Gemini Flash is materially weaker at unaided long-horizon agentic coding than frontier models. Left with only
a generic system prompt, it:

- forgets to verify its own edits (empirically confirmed: the kit's research notes, techniques T1, citing
  Anthropic's and SWE-agent's findings that verification loops close most of the gap to larger models),
- degrades sharply as instructions pile up (IFScale: a weak model dropped to ~7-10% instruction-following
  at 500 rules, research notes anti-pattern #2), and
- has no persistent memory of project-specific lessons between sessions.

Before designing anything, we spent significant effort establishing ground truth about the actual platform,
because its public documentation conflicts with its real behavior in several load-bearing ways. Empirical
probes against a live `agy` CLI 1.2.10 session (see `.agents/docs/antigravity-spec.md`) found:

- **Rule glob matching is basename-only.** A pattern with any directory component (`src/**`, `docs/adr/**`)
  never matches; only `**/<basename-glob>` works. The public docs do not mention this.
- **Rules directories are scanned flat.** `.agents/rules/<sub>/x.md` is silently ignored.
- **A `PreToolUse` hook that returns `{}` denies the tool call** (fails closed) — an empty or malformed hook
  response is not a pass-through.
- **`invoke_subagent` is asynchronous.** It returns immediately with a conversation id; the caller must wait
  for the subagent's `send_message` before using its result, or it will act on a result that does not exist yet.
- Antigravity's own rules budget is small: 24,000 bytes per file, and a shared 20,000-token budget across all
  `always_on` and global rules, after which the largest files are silently demoted to path pointers.

Separately, we surveyed the evidence on what actually makes weaker models reliable agents (Anthropic's and
OpenAI's published agentic-coding guidance, SWE-agent/Agentless ablations, IFScale, "lost in the middle",
context-rot research — full citation list in the kit's original research notes). The consistent finding:
**deterministic mechanisms (hooks, scripts, verification gates) beat advisory prose**, and **a lean, high-signal
always-on layer beats a large one**, with the rest of the guidance loaded progressively on demand.

## Decision Drivers

- **Must** work within the verified platform constraints above (basename globs, flat rule dirs, fail-closed
  hooks, async subagents, the 20k-token rules budget) — anything that silently doesn't work is worse than not
  having it.
- **Must** make verification and quality gates deterministic rather than advisory, since a weak model will not
  reliably self-police from prose alone.
- **Must** keep the always-on context small and high-signal; everything else must be progressively disclosed.
- **Should** be reusable across the user's other repositories, not hand-tuned to this one.
- **Should** cover many languages/frameworks, but the user explicitly capped the initial set to the common
  ones actually in use (2026-09-28), rather than every language researched — see the `Scope` section below.
- **Should** be evidence-based: every technique traced to a cited source; every platform claim empirically
  verified, not assumed from documentation alone.

## Considered Options

### Option 1: A single large `AGENTS.md` / `GEMINI.md` with prose guidance

- **Pros**: simplest to write; no platform-specific knowledge needed.
- **Cons**: exactly the anti-pattern the research warns against for weak models (instruction-following decays
  as the file grows; no deterministic verification; nothing progressively disclosed; a monolithic file blows
  past the 24 KB per-file cap almost immediately for genuinely useful content).

### Option 2: Hand-tune each repository separately, ad hoc, as problems come up

- **Pros**: no upfront investment; content only for what's actually hit.
- **Cons**: no reuse across repos; no consistent verification gate; every repo re-learns the same platform
  quirks (basename globs, async subagents) the hard way; nothing to `doctor.mjs`-validate against.

### Option 3 (chosen): A layered, reusable "Frontier Kit" under `.agents/`

Rules split by budget tier (always-on core, glob-triggered language/framework packs, `model_decision`
situational rules, a curated always-on lessons ledger), deep guides loaded on demand, skills as low-freedom
runbooks (replacing deprecated Antigravity workflows), custom subagents for read-only/fresh-context work,
lifecycle hooks that make verification and feedback deterministic, plain Node scripts for polyglot
verify/search/doctor/lessons/activate-stack/install, and a lessons ledger for continuous learning across
sessions. Architecture summary: `.agents/docs/architecture.md`.

- **Pros**: respects every verified platform constraint; deterministic gates via hooks instead of hoping the
  model remembers; always-on budget kept to ~7.3k of the 9k-token target (`node .agents/scripts/doctor.mjs`);
  reusable via `.agents/scripts/kit-install.mjs --target <repo>`; extensible (`/workspace-doctor`) without
  redesigning the layering.
- **Cons**: real upfront design and build cost (this ADR exists because of it); an ongoing maintenance surface
  (rule/skill/agent/hook files that must stay internally consistent — mitigated by `doctor.mjs`); some
  platform facts are pinned to Antigravity CLI 1.2.10 and may drift as the product changes.

## Decision

Adopt the layered Frontier Kit architecture (`.agents/docs/architecture.md`) as a permanent `.agents/`
workspace, and make it reusable across other repositories via `kit-install.mjs`.

### Scope (as of this ADR; expand only on request)

**Languages** (`rules/lang-*.md` + `guides/languages/*.md`): TypeScript, JavaScript, Python, Rust, Go, PHP,
SQL, Shell, PowerShell, HTML, CSS.

**Frameworks** (`rules/fw-*.md` + `guides/frameworks/*.md`, activated per repo by `activate-stack.mjs`):
SolidJS, SolidStart, React, Next.js, Astro, Tailwind CSS, generic Node servers, FastAPI, Laravel, Rust web
(axum/actix/rocket), Go web (net/http and common routers).

**Principles** (`guides/principles/*.md`, kept in full regardless of language/framework scope): simplicity,
design principles, clean code, error handling, testing strategy, code review, security, dependency
management, performance, concurrency, API design, database design, architecture, refactoring, git workflow,
documentation, observability, accessibility.

An earlier build pass researched a much larger language/framework list (Java, Kotlin, C#, C/C++, Swift, Dart,
Ruby, Elixir, Scala, Haskell, Zig, Lua, Vue/Nuxt, SvelteKit, Angular, React Native, Flutter, Django,
Spring Boot, ASP.NET Core, Rails, Phoenix, Remotion). Those files were deleted rather than kept dormant, on
the user's explicit instruction to scope down to what's actually used; the kit's original research notes retain the full
research (focus areas, verified facts, doubtful claims already resolved) so re-adding any of them later is a
`workspace-doctor` task, not new research.

## Consequences

### Positive

- Verification is a Stop-hook gate (`.agents/hooks/quality-gate.mjs`), not a suggestion: the agent cannot
  claim a task done with unverified edits sitting on top of the last passing check.
- The always-on layer stays small by construction (`doctor.mjs` errors above ~16k tokens, warns above 9k),
  so instruction-following should not decay the way it does with monolithic prompt files.
- Every technique encoded traces to a cited source (the kit's original research notes), and every platform
  claim was empirically probed rather than trusted from documentation — both are checkable, not assumed.
- The same kit installs into a different repository's `.agents/` and self-adapts via `activate-stack.mjs`.

### Negative

- The kit itself is now a maintenance surface: rule/skill/agent/hook files can drift out of sync with each
  other (dangling `guides/` references, stale byte budgets). Mitigation: `node .agents/scripts/doctor.mjs`
  checks this and the `/workspace-doctor` skill exists specifically to fix it.
- Coverage is intentionally narrower than technically possible. A task in an unscoped language (e.g. Java)
  gets no dedicated pack yet; the agent falls back to the always-on principles guides and general judgment.
- Antigravity-specific facts (tool argument names, hook payload shape, glob matching) are pinned to what CLI
  1.2.10 does today. If a future Antigravity release changes this behavior, the kit's rules/hooks may silently
  rely on stale assumptions until re-verified.

### Risks and mitigations

- **Risk**: the platform's behavior changes in a later Antigravity release (e.g. glob matching becomes
  path-aware). **Mitigation**: `.agents/docs/antigravity-spec.md` is dated
  and sourced; re-run the same probe methodology (build a throwaway workspace, run `agy -p` headless turns,
  inspect `transcript_full.jsonl`) before trusting old claims after an Antigravity upgrade.
- **Risk**: building 60+ files via many parallel subagents repeatedly hit the account's API rate limit
  (429s), losing partial work. **Mitigation**: batch subagent work into small sequential groups (4 at a time)
  rather than firing everything concurrently, and design build scripts to be resumable (re-run only what
  actually failed, verified via each Workflow run's `journal.jsonl`, not by re-doing everything).

## Implementation Notes

- Always-on core: `.agents/rules/00-core-protocol.md` through `03-delegation-and-learning.md`, plus the
  curated `90-lessons.md`. Root `AGENTS.md` and `.agents/GEMINI.md` are also always-on (project facts and the
  kit's own routing index, respectively).
- Extension points, each with an exact template: `.agents/skills/workspace-doctor/SKILL.md`.
- Reuse in another repository: `node .agents/scripts/kit-install.mjs --target <path> [--dry-run]`.

## Related Decisions

None yet — this is the first ADR of this kit.

## References

- The kit's original research notes (the full design contract, the verified platform spec with probes,
  binary strings, changelog and live docs, and the evidence-based playbook of weak-model agentic techniques
  with full source citations: Anthropic, OpenAI, Google, and peer-reviewed/arXiv research). They are kept
  outside the published repo.
- `.agents/docs/antigravity-spec.md` — the condensed, verified Antigravity platform facts.
- `.agents/docs/architecture.md` — summary of the kit's layers, budgets and file map.
- Antigravity official docs: `https://antigravity.google/docs/rules`, `/docs/skills`, `/docs/hooks`,
  `/docs/subagents`.
