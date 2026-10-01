---
name: reflect
description: The LEARN-phase playbook. Turns a pipeline's worker "Lesson candidates" and outcomes (FIX rounds, failed-then-passed checks, user corrections) into the lessons ledger (lessons.mjs add/vote), promotes proven ones into 90-lessons.md within its 4.5 KB budget, retires stale ones, flags procedures for /capture-skill, and ends with a Learn Report. Use at the end of every pipeline (scribe), or for a periodic lesson clean-up.
metadata:
  icon: 🪞
---

# Reflect: turn a pipeline into lessons, without bloating the rules

Used by: `scribe` (LEARN phase). `.agents/agents/scribe.md` is authoritative: its steps 1-5 = reflect steps 2-6,
its step 8 = reflect step 7, and its Output format is the Learn Report (step 8). The orchestrator runs only step 1
(gather the inputs, read-only) and puts them into the scribe's brief.

The kit learns in small, itemized deltas:
- One lesson per line in the ledger `.agents/memory/lessons.md`, with an id and helpful/harmful counters.
- Only proven lessons move into the always-on `.agents/rules/90-lessons.md`.

Never rewrite either file wholesale. Wholesale rewrites collapse detail into vague summaries.

## Role check (read first)
| You are | You do | You never |
|---|---|---|
| ORCHESTRATOR (LEARN phase, or the user typed `/reflect`) | step 1, then dispatch ONE `scribe` with a LEARN brief (`.agents/skills/orchestrate/references/briefs.md` §scribe) and wait for its Learn Report | run `lessons.mjs add/vote/retire` or edit `90-lessons.md` / `AGENTS.md` yourself, because those are workspace writes |
| WORKER `scribe` | the Procedure in `.agents/agents/scribe.md` (authoritative; its steps 1-5 = steps 2-6 here, its step 8 = step 7 here), then its Output format = the Learn Report | ask another agent, edit files outside OWNED FILES, promote a skill draft |
| Any other WORKER | nothing here: put a one-line `Lesson candidates:` entry in your Worker Report | run `lessons.mjs add` yourself |

## LEARN phase inputs (what the scribe's brief must contain)
- Every worker's `Lesson candidates:` line, verbatim, with its T-id and agent.
- Pipeline outcomes: FIX rounds and their root causes; checks that failed then passed (command + key output);
  quality-gate or pipeline-gate blocks; BLOCKED / ESCALATE events.
- User corrections, quoted.
- Lesson ids searched in EXPLORE (`lessons.mjs search`) and whether each helped or misled.
- New project facts (scripts, routes, env vars, dependencies) and guide or skill statements a worker proved wrong.
- Optional, for a periodic clean-up: the `session-stats.mjs` output (step 1).

## When to use
- LEARN phase of every pipeline (never skipped; "nothing new" is a valid result).
- The Stop hook said `LEARNING: a check failed and you fixed it` in a worker: the worker's `Lesson candidates`
  line reaches the scribe through this phase.
- Periodically, to promote and prune: `lessons.mjs stats` shows promotion candidates, or `90-lessons.md` is near its cap.

Do NOT use for:
- Turning a whole procedure into a skill. `/reflect` only flags it; `/capture-skill` writes the draft.
- Changing other rules, skills or agents (language packs, core rules). The scribe lists the change under
  `Proposed edits (not owned)`; the orchestrator turns an approved one into an IMPLEMENT task (docs-only task
  type). The built-in `/learn` is not used for kit edits in orchestrator mode, because its approved edits
  would be made by the orchestrator itself, without REVIEW.

Appending to the ledger needs no permission. List every edit to `90-lessons.md` in the Learn Report.

## Checklist
Copy this and tick items as you go:
```
- [ ] Inputs collected (brief lines + optional session-stats), each with its evidence
- [ ] Candidates filtered: reusable, non-obvious, actionable, evidenced, not a duplicate (searched)
- [ ] At most 3 lessons added, each "When X, do Y because Z" with evidence
- [ ] Votes cast only for lessons the brief says helped or misled
- [ ] Promotion candidates moved into 90-lessons.md (grouped, "(L-NNNN)" suffix), file <= 4,500 bytes
- [ ] Stale or harmful lessons retired; 90-lessons.md bullets for them removed
- [ ] doctor passes; skill candidate drafted or noted (or "none")
- [ ] Learn Report written
```

## Procedure
1. **Gather the inputs (orchestrator).** Collect the items listed under "LEARN phase inputs" from the worker
   reports you received. For a periodic clean-up also run the read-only
   `node .agents/skills/reflect/scripts/session-stats.mjs` - it summarizes `.agents/.state/sessions.jsonl`
   (unverified finishes, verify failures, gate blocks, tool errors), the newest conversation's state (failed
   checks, fail→pass, repeated failures), ledger health and the `90-lessons.md` size - and paste its SIGNAL lines.
   Paste everything verbatim into the scribe brief's CONTEXT; the scribe has no conversation history.
   - Verify: every item has its evidence (command + output, `path:line`, or quote) and its source T-id.
2. **Filter the candidates (scribe).** List each input item as an event with its evidence. Keep an event only
   if all five hold:
   (a) it will recur beyond this task;
   (b) it is non-obvious, meaning a competent engineer new to this repo would get it wrong;
   (c) it is actionable as "When X, do Y because Z";
   (d) it has evidence;
   (e) it is not already in the ledger. Check with `node .agents/scripts/lessons.mjs search <keyword>`.
   If it is already there, vote instead (step 4).
   Reject: task diaries ("fixed the nav bug"), generic advice ("write tests"), guesses, and anything with
   secrets, tokens, personal data or file contents. Note each rejection on the report's `Evidence:` line as
   `rejected: <candidate> (<diary | generic | duplicate of L-NNNN | no evidence>)`.
   ```text
   bad : Be careful with the dev server.
   good: When e2e tests fail with a webServer timeout on Windows, stop the stray `bun run dev` task first, because the port stays bound after a cancelled run.
   ```
   - Verify: at most 3 candidates remain. Zero is a valid outcome ("nothing new").
3. **Add each lesson.**
   `node .agents/scripts/lessons.mjs add --scope <scope> --text "When X, do Y because Z" --evidence "<cmd | path:line | quote>"`
   - Scopes: `platform`, `project`, `tooling`, `user`, or a stack id (`typescript`, `solidjs`, `rust`, `laravel`, ...).
   - Verify: the command printed the new id `L-NNNN`, and `node .agents/scripts/lessons.mjs list --scope <scope>` shows it.
4. **Vote** on the existing lessons the brief says were applied in this pipeline.
   - The lesson helped: `lessons.mjs vote <id> helpful`.
   - Following it caused a problem: `lessons.mjs vote <id> harmful`, and say why in the report.
   - Never bulk-vote, never vote on lessons nobody used, and never edit counters by hand.
   - Verify: `lessons.mjs list` shows the new counters.
5. **Promote.** Run `node .agents/scripts/lessons.mjs promote-candidates` (helpful ≥ 2, harmful 0, not yet
   curated). A verified high-severity fact may be promoted at once; say why in the report.
   For each candidate:
   - View `.agents/rules/90-lessons.md`.
   - Add one bullet of 200 characters or less under the matching heading (`Platform`, `Project`,
     `Tooling`, `User preferences`), ending with `(L-NNNN)`.
   - Use `replace_file_content` on that section only. Never rewrite the file, and keep the frontmatter
     (`trigger: always_on`, `description`) and the footer intact.
   - If the new bullet is one of the hardest invariants, update the footer line too.
   - Verify:
     1. The size is ≤ 4,500 bytes (aim for ≤ 4,000). Check it with
        `node -e "console.log(require('fs').statSync('.agents/rules/90-lessons.md').size)"`, or read the
        bytes-used line that `promote-candidates` prints.
     2. `node .agents/scripts/doctor.mjs --quiet` reports no error for the file.
6. **Prune** when the file is over its budget, when a lesson has harmful ≥ 1, when a lesson is obsolete
   (search shows the code or tool it names is gone), or when a hook or rule now enforces it.
   - Retire the lesson in the ledger: `node .agents/scripts/lessons.mjs retire <id> --reason "<why>"`.
     Never delete ledger lines or renumber ids.
   - Remove its bullet from `90-lessons.md`. The ledger keeps the history.
   - Over budget with nothing stale: merge two bullets about the same topic into one, keeping both ids.
   - Verify: `lessons.mjs stats` counts add up, and the size check from step 5 passes.
7. **Check for a reusable procedure.** Did this pipeline follow a procedure of 4 or more steps that succeeded,
   is likely to recur, and is not covered by an existing skill? Check the routing list in `.agents/GEMINI.md`
   and the folders in `.agents/skills/`. If so and `.agents/skills/_drafts/**` is in your OWNED FILES, follow
   `/capture-skill` steps 1-6 to write the draft. Otherwise put `candidate: <name> — <1-line reason>` under
   Skill drafts (the orchestrator may dispatch `/capture-skill <name>`).
8. **Report** with the Learn Report below, with the `node .agents/scripts/doctor.mjs --quiet` summary on the
   Doctor line. The AGENTS.md and Guides lines come from the scribe's own steps (`.agents/agents/scribe.md`).
   The orchestrator grades the report and copies the lesson ids into the Completion Report's `Learn:` line.

## Output
The Learn Report IS the scribe's Worker Report. Workers: use the Output format in `.agents/agents/scribe.md`
exactly; it is authoritative. The block below copies it field for field (no extra heading, no extra lines):
```text
## scribe: <PASS | FAIL | BLOCKED> — <T-id>
Result: <recorded | nothing new>
Added: <L-NNNN (scope) — text | none>
Voted: <L-NNNN helpful|harmful — why | none>
Promoted to 90-lessons.md: <L-NNNN | none> — size <bytes>/4500
Retired: <L-NNNN — reason | none>
AGENTS.md: <section — line added or fixed | no change>
Guides: <path:line — correction + proof | none>
Skill drafts: <.agents/skills/_drafts/<name>/SKILL.md — check result | candidate: <name> — why | none>
Proposed edits (not owned): <file — change | none>
Doctor: `node .agents/scripts/doctor.mjs --quiet` -> <DOCTOR: summary line; errors in my files: none | list>
Evidence: <command -> key output lines>; rejected: <candidate (reason)> | none
Files touched: <list | none>
Lesson candidates: none (recorded above)
```

## References
- Ledger format and commands: `.agents/memory/lessons.md` header, and `node .agents/scripts/lessons.mjs --help`
- Signals script (read-only): `node .agents/skills/reflect/scripts/session-stats.mjs --help`
- Worker contract: `.agents/agents/scribe.md`. LEARN phase, gate and brief: `.agents/rules/03-orchestration.md`,
  `/orchestrate`, `.agents/skills/orchestrate/references/briefs.md` §scribe
- Curated always-on lessons: `.agents/rules/90-lessons.md`. Size checks: `node .agents/scripts/doctor.mjs`
- Next step for procedures: `/capture-skill`
