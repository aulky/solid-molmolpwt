# ADR-0002: Always-on orchestrator mode with a 7-phase pipeline

## Status

Accepted

## Date

2026-09-30

## Deciders

The repository owner (stated the requirements and chose this operating model); implemented by the assistant on
request. Status is Accepted under invariant 2 of `.agents/rules/topic-architecture-decisions.md` ("unless your
brief quotes the user's acceptance"): the user directed this decision; it was not inferred by the agent.
The user's requirements, in substance:

1. Always orchestrator mode: one core agent plans and assigns; other agents execute tasks.
2. One agent runs exactly one task, never more. One task may be run by several agents for output quality.
3. Every change follows EXPLORE -> PREPARE -> IMPLEMENT -> REVIEW -> FIX -> TEST -> LEARN (TEST = Playwright for
   browser behaviour, tools/commands otherwise; LEARN = update the `.agents` docs and memory).
4. Goal: minimize gaps and errors caused by agents; clean up skills, rules, hooks, agents and docs to match.

## Context

ADR-0001 adopted the layered Frontier Kit. Its operating model was a single agent: the default agent did the work
itself, picked a skill per task shape (`/feature`, `/bugfix`, `/refactor`, `/review-changes`) and delegated only
read-only research or fresh-context review through `/delegate` and `rules/03-delegation-and-learning.md`.

That left the weak model's main failure modes in place. One Gemini Flash context explored, planned, wrote code,
reviewed its own code and tested it, so it reviewed with the same blind spots it wrote with; review and tests were
advisory steps a long turn could drop; and lessons were recorded only when the model remembered to.

Verified platform facts make a different model possible (`.agents/docs/antigravity-spec.md`):

- Custom agents in `.agents/agents/<name>.md` get their own model tier and a restricted `tools` list, so a worker
  can be denied `invoke_subagent` and read-only workers can be denied write tools.
- `invoke_subagent` is asynchronous; each child replies once via `send_message`.
- The transcript shows who is who: a child's step 0 is a `SYSTEM_MESSAGE` with `sender=<parent>`, the parent sees
  `Created the following subagents:` with the child ids, and each reply arrives as `sender=<childId>`. Hooks can
  therefore tell the orchestrator from a worker and see which phases ran.
- A custom agent cannot be made the persistent default; it is selected per session with `/agents` or
  `agy --agent <name>`. The default agent must therefore behave as the orchestrator by itself.

## Decision Drivers

- **Must** implement the four user requirements above literally: always-on orchestrator, one task per agent,
  the exact 7 phases, learning written back into the kit.
- **Must** hold with the default agent, since a custom agent cannot be the persistent default.
- **Must** make the pipeline checkable, not advisory: a missing REVIEW, TEST, verify or LEARN is detected by a
  hook, like the existing verify gate.
- **Should** keep small changes cheap, so "orchestrator never edits" does not push the model to cheat.
- **Should** stay within the always-on budget (9,000-token target) and every verified platform constraint.

## Considered Options

### Option 1: Keep the single agent, add more skills and prose

- **Pros**: no new agents or hooks; lowest cost per task.
- **Cons**: self-review blind spots remain; more always-on prose is exactly what degrades a weak model; does not
  meet requirements 1 and 2.

### Option 2: Antigravity's built-in `/boost` or `/teamwork-preview`

- **Pros**: vendor-maintained multi-agent execution; no kit code.
- **Cons**: paid-plan features; they do not use this kit's rules, gates, briefs or lessons; the phases and the
  one-task rule are not under our control or visible in a Completion Report. Kept as a documented alternative for
  very large autonomous campaigns.

### Option 3 (chosen): Kit-native orchestrator mode

A role check in the always-on core (`sender=` first step -> WORKER, else ORCHESTRATOR); an orchestrator that never
edits workspace files and dispatches one-task briefs; 13 single-task workers mapped to the 7 phases; lanes S/M/L
to scale agent count to risk; hooks v2 that detect the role, track dispatches and replies, and gate the end of an
orchestrator turn on the pipeline; a `scribe` worker that owns the LEARN phase.

- **Pros**: fresh-context review and testing on every change; each worker's context stays small and single-purpose;
  pipeline completeness is enforced by a hook; works on every plan and with the default agent; every phase is
  visible in the Completion Report.
- **Cons**: more agent calls and wall-clock time per change; more kit surface to keep consistent; depends on the
  transcript shape of subagent messages.

## Decision

Adopt Option 3. Orchestrator mode is always on for every conversation in this kit. Every change runs
EXPLORE -> PREPARE -> IMPLEMENT -> REVIEW -> FIX -> TEST -> LEARN, then the orchestrator's own verification and
Completion Report. The skills `feature`, `delegate`, `bugfix`, `refactor` and `review-changes` and the rule
`03-delegation-and-learning.md` are replaced by `/orchestrate` (with `references/briefs.md`, `task-types.md`,
`review-checklist.md`) and `rules/03-orchestration.md`. A strict `orchestrator` agent without write tools is
available per session via `/agents` or `agy --agent orchestrator`.

## Consequences

### Positive

- Code is always reviewed by a context that did not write it, and tested by a worker whose only job is testing
  (Playwright for browser flows, tools otherwise).
- Briefs force explicit acceptance criteria, owned files and DONE WHEN, so gaps surface in PREPARE, not after.
- The PIPELINE GATE blocks an orchestrator from finishing after implementation work with REVIEW, TEST, a passing
  verify or LEARN missing (max 2 blocks, never while a worker is still running).
- LEARN runs on every pipeline, so lessons, `AGENTS.md` facts and guide corrections accumulate systematically.

### Negative

- Higher cost and latency per change; the kit defaults to waves of at most 3 workers because
  the Antigravity subagent quota is shared.
- The default agent keeps its write tools, so "never edit" is enforced by rules, a per-file warning and the gates,
  not by the platform. Only the strict `orchestrator` agent removes the tools, and it must be picked per session.
- More files to keep in sync (14 agents, hooks phase map, `kit-install.mjs` lists); `doctor.mjs` checks them.

### Risks and mitigations

- **Risk**: an Antigravity update changes the subagent transcript shape and role detection fails.
  **Mitigation**: unknown role turns the pipeline gate off rather than blocking wrongly; hook tests use synthetic
  transcripts of the verified shape; re-verify per `.agents/docs/antigravity-spec.md` after upgrades.
- **Risk**: a weak orchestrator answers before a worker's reply arrives. **Mitigation**: rules and `/orchestrate`
  require ending the turn with a status board; the phase ledger shows how many workers are still outstanding.
- **Risk**: workers drift beyond their task. **Mitigation**: `OWNED FILES` in every brief, workers without
  `invoke_subagent`, `INPUT GAP:` / `OUT OF SCOPE:` reports, and orchestrator grading by rerunning evidence.

## Implementation Notes

- Contract: `.agents/docs/architecture.md` (supersedes the single-agent parts of the original design).
- Always-on: `.agents/GEMINI.md`, `.agents/rules/00-core-protocol.md` (role check, worker protocol),
  `.agents/rules/03-orchestration.md` (orchestrator protocol).
- Runbook: `.agents/skills/orchestrate/`. Agents: `.agents/agents/` (orchestrator + 13 workers).
- Hooks v2: `.agents/hooks/lib.mjs`, `track-tools.mjs`, `inject-context.mjs`, `quality-gate.mjs`; tests in
  `.agents/hooks/test/hooks.test.mjs`.
- Overview for humans: `.agents/README.md`, `.agents/docs/architecture.md`.

## Related Decisions

- Amends ADR-0001 (`0001-adopt-antigravity-frontier-kit.md`): the layered kit stays; only its single-agent
  operating model is replaced. ADR-0001 remains Accepted.

## References

- The kit's original orchestrator-mode design notes (kept outside the published repo); the binding contract
  now lives in `.agents/docs/architecture.md`.
- `.agents/docs/antigravity-spec.md` - verified platform facts (async subagents,
  agent `tools` restriction, subagent transcript shape, agent selection).
- `.agents/docs/architecture.md` - roles, pipeline, lanes, hooks.
