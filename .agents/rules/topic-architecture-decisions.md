---
trigger: model_decision
description: "Apply when choosing technologies, databases, protocols or architecture patterns, adding a major dependency or service, writing or superseding ADRs (docs/adr/), or asked why a past choice was made."
---
# Architecture decisions and ADRs - topic rule (formerly `topic-adr.md`, still cited by ADR-0001)
Principles guides: `.agents/guides/principles/architecture.md`, `.agents/guides/principles/documentation.md`. ADR templates: the installed `architecture-decision-records` skill.
Who does what: the `planner` (PREPARE) drafts drivers, options and the ADR task; `docs-researcher` verifies versions, limits, prices; `advisor` critiques (consult type: judgment call); the orchestrator asks the user; an `implementer` writes the ADR file (docs-only task, OWNED FILES `docs/adr/NNNN-<slug>.md` + `docs/adr/README.md`); a `reviewer` checks it (section `docs-only` of `.agents/skills/orchestrate/references/task-types.md`).

## Is it significant? (at least one true -> an ADR)
- Hard to reverse (more than a day to undo) or it affects several modules or teams.
- New framework, database, ORM, state library, auth provider, queue, cloud service or protocol.
- Changes a public API style, the security architecture, or which component owns which data.
Skip for bug fixes, minor/patch upgrades, implementation details and config tweaks.

## Deciding (PREPARE)
1. Read prior decisions: `docs/adr/README.md` and related ADRs (`node .agents/scripts/search.mjs '<keyword>' docs/adr`), root `AGENTS.md`, `node .agents/scripts/lessons.mjs search <topic>`. Never contradict an Accepted ADR silently: propose superseding it.
2. Drivers: **Must** (hard) and **Should** (preference), with numbers (load, latency, data size, skills, budget).
3. Options: at least 2 real ones, including "keep what we have". Each: pros, honest cons, cost, ops burden, reversibility, lock-in. Prefer a built-in capability of the current stack over a new service.
4. Advisor critique of the options table; apply or rebut each point. Then the orchestrator asks the user. No IMPLEMENT task for the decision before acceptance or an explicit go-ahead.

## Recording (existing ADRs and `docs/adr/README.md` win; these are defaults)
- File `docs/adr/NNNN-kebab-title.md`: 4 digits, sequential, never reused. Next number = highest + 1: `node .agents/scripts/search.mjs '^# ADR-\d{4}' docs/adr`.
- Heading `# ADR-NNNN: <Title>`, then `Status:`, `Date:` (YYYY-MM-DD), `Deciders:` lines. Status: Proposed, Accepted, Rejected, Deprecated, `Superseded by ADR-NNNN`.
- Sections: Context (quantified) - Decision Drivers - Considered Options (>= 2, Pros/Cons) - Decision (one sentence, scope + version) - Rationale - Consequences (Positive / Negative / Risk + Mitigation) - Related Decisions. Small decisions: Context / Decision / Consequences or one Y-statement. Max 1-2 pages.
- Superseding: a NEW ADR whose Context cites the old one and what changed; technology swaps add a migration plan (dual-write -> backfill + validate -> switch reads -> remove old path). After acceptance only the old Status line changes.
- Same change: index row `| ADR | Title | Status | Date |` in `docs/adr/README.md`, relative links (`[0007](0007-use-sqlite.md)`); never replace its guideline sections.
- Human steps (team review, tickets): user TODOs in the report.
- "Why was X chosen?": search `docs/adr` and cite number + status. None -> `git-historian` reconstructs it from history, labelled Inferred; offer a retroactive ADR.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER adopt a new framework, database or service without the user's approval - years of maintenance. Instead: options table + recommendation + Proposed ADR.
2. NEVER set Status Accepted unless your brief quotes the user's acceptance - the user decides. Instead: Proposed, and the orchestrator asks.
3. NEVER edit the body of an Accepted ADR, delete a Rejected/Superseded one, or renumber - the record and links are the point. Instead: a superseding ADR.
4. NEVER present one option as the only one, or state a limit, version or price from memory. Instead: >= 2 options; verify and cite, or label "unverified".
5. NEVER add microservices, event buses or caches "for scale" without a measured need. Instead: modular monolith first.
6. NEVER write vague decisions ("consider X"). Instead: "We will use X for Y", with scope and version.

## Pitfalls Flash models get wrong
- Recommending the most popular tool instead of the one the drivers point to; pros only for the favourite.
- Forgetting migration cost and team skills; deciding inside a large feature diff instead of asking first.

## Output template (to the user, via the orchestrator)
```markdown
Decision needed: <one line>
Drivers: Must <...>; Should <...>
| Option | Pros | Cons | Cost / ops | Reversibility |
|---|---|---|---|---|
Recommendation: <option>, because <driver>; accepting <downside>. Advisor: <verdict, what changed>
Next: ADR `docs/adr/NNNN-<slug>.md` (Proposed). Accept?
```

## Example - bad -> good
```markdown
<!-- BAD: docs/adr/adr-sqlite.md -->
We should probably consider using SQLite. Status: Accepted
<!-- GOOD: docs/adr/0007-use-sqlite-for-local-storage.md -->
# ADR-0007: Use SQLite for local-first storage
Status: Proposed
Date: 2026-09-25
Deciders: <user to confirm>
## Context
Single-user desktop app, <= ~50k rows, must work offline.
## Considered Options
- SQLite - Pros: embedded, SQL. Cons: one writer at a time.
- IndexedDB - Pros: built in. Cons: weak querying.
## Decision
We will use SQLite as the only datastore for v1.
## Consequences
- Negative: no multi-device sync. Risk: sync later. Mitigation: repository interface.
```

## Before finishing
- [ ] Prior ADRs checked; drivers and >= 2 options; facts verified or labelled; advisor consulted or skip reason stated
- [ ] ADR Proposed, number/heading/Status per conventions, index row updated, no Accepted body edited
- [ ] No implementation before acceptance; human TODOs listed
