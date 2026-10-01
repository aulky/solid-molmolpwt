# Architecture Decision Records

This directory holds the Architecture Decision Records (ADRs) for the Antigravity Frontier Kit
(`.agents/`) itself. A project's own ADRs live in its root `docs/adr/`.

## Index

| ADR | Title | Status | Date |
|---|---|---|---|
| [0001](0001-adopt-antigravity-frontier-kit.md) | Adopt the Antigravity Frontier Kit | Accepted | 2026-09-28 |
| [0002](0002-orchestrator-mode-pipeline.md) | Always-on orchestrator mode with a 7-phase pipeline | Accepted | 2026-09-30 |

## Creating a new ADR

1. Read this file and any ADRs related to your topic first (`node .agents/scripts/search.mjs '<keyword>' .agents/docs/adr`).
2. Pick the next 4-digit number: highest existing + 1. Never reuse or renumber a number.
3. Pick a template from `.agents/skills/architecture-decision-records/SKILL.md` — Standard (MADR-style)
   for significant, multi-option decisions; Lightweight for small ones; Y-statement for one-liners.
4. New ADRs start with status Proposed (the `## Status` section, or a `Status:` line in the
   Lightweight template). Only the user (or the team) moves a status to `Accepted` or `Rejected` —
   an agent never sets `Accepted` on its own, unless its brief quotes the user's acceptance.
5. Add or update the row in the index table above in the same change.
6. To change an `Accepted` ADR's decision, write a **new** ADR that supersedes it and cites what changed;
   never edit the body of an accepted ADR. Only its status value changes, to `Superseded by ADR-MMMM`.

## Status values

`Proposed` -> `Accepted` or `Rejected`. `Accepted` -> `Deprecated` or `Superseded by ADR-NNNN`.

Full conventions and the step-by-step protocol an agent follows here:
`.agents/rules/topic-architecture-decisions.md` (and the `architecture-decision-records` skill for templates).
