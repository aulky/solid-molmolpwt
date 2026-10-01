---
name: capture-skill
description: Turns a procedure that a pipeline just proved (4+ steps, likely to recur) into a new skill draft under .agents/skills/_drafts/<name>/SKILL.md, inert until the user approves promotion. The scribe's LEARN-phase playbook for skills. Use for "make this a skill", "capture this workflow", or when /reflect flags a skill candidate.
metadata:
  icon: 🧵
---

# Capture skill: turn a successful run into a reusable draft

Used by: `scribe` (LEARN phase) writes and checks the draft. The orchestrator asks the user about promotion and,
on yes, dispatches the promotion as a separate task (step 7). No one else runs these steps.

Default: write one draft, from one real run, with real evidence. Only if the procedure is a single
one-line command, skip this — a skill is not worth the overhead of a file.

A draft is inert by construction: skills load one level under `.agents/skills/<name>/SKILL.md`, so
`.agents/skills/_drafts/<name>/SKILL.md` is never scanned, and its frontmatter also carries
`disable-slash-command: true` plus `disable-model-invocation: true` as a second safety net. Nothing here
edits the live skill set. Promotion is a separate, visible step that needs the user's yes.

## Inputs and outputs
- Input (in the scribe's brief, pasted by the orchestrator): the procedure's source run - the task, the worker
  reports' commands with their key output lines, files changed, what failed first and the fix. The scribe has
  no conversation history: the brief's evidence is the only allowed source.
- Required OWNED FILES: `.agents/skills/_drafts/<name>/**`. Missing -> report the candidate under `Skill drafts:`
  as `candidate: <name> — <why>` and stop; do not write elsewhere.
- Output: the draft folder, plus the Capture Report lines (below) in the Learn Report's `Skill drafts:` line or,
  for a dedicated capture task, in the Worker Report body.

## When to use
- LEARN phase: the pipeline followed a procedure of 4 or more steps that succeeded, is likely to recur in this
  repo or another one, and no existing skill or rule already covers it (check `.agents/GEMINI.md`'s routing list
  and `.agents/skills/`).
- `/reflect` step 7 flagged `/capture-skill <name>` with a reason.
- The user asks to "make this a skill", "write this up so we don't rediscover it", or similar. The orchestrator
  then dispatches one `scribe` with the evidence and the draft folder as OWNED FILES.

Do NOT use for:
- A one-off fix with no recurring shape. It is a lesson instead: `/reflect` steps 2-3.
- A change to an existing skill, rule or agent. The scribe lists it under `Proposed edits (not owned)`; the
  orchestrator plans it as an IMPLEMENT task (docs-only task type). Never fork a duplicate skill for a
  near-identical case.
- Editing the 5 kept third-party skills (`architecture-decision-records`, `commit-archaeologist`, `seo-audit`,
  `thinking-out-loud`, `vercel-react-best-practices`), or the project facts in the root `AGENTS.md`.
- Promoting a draft nobody has re-read end to end in this pipeline (see step 6).

## Checklist
Copy this and tick items as you go:
```
- [ ] Source run identified from the brief: task, files touched, commands run and their results
- [ ] Name chosen: lowercase-hyphen, not a built-in command, no existing skill/draft owns it
- [ ] Draft scaffolded: `skill-draft.mjs new <name>`
- [ ] Every TODO replaced with the real procedure (steps come from the evidence, not from memory)
- [ ] "Used by:" line names the orchestrator and/or the worker TypeNames that will follow it
- [ ] Provenance filled: date, evidence (commands + results, files changed), status left as "draft"
- [ ] `skill-draft.mjs check <name>` run; hard gates pass, soft issues listed or fixed
- [ ] Draft re-read in full and reads correctly to someone who did not see the original run
- [ ] Capture Report written; promotion left to the orchestrator and the user
```

## Procedure
1. **Confirm this is worth capturing.** State the procedure in one sentence: "when <trigger>, do
   <ordered steps> to reach <result>". If you cannot state it in one sentence, it is not ready yet —
   report it as a lesson candidate instead (`/reflect`), or capture a narrower slice.
   - Verify: you can name every step, in order, from the evidence in your brief (worker commands and their
     outputs), not from a generic best-practice guess.
2. **Pick a name and check for collisions.** Lowercase-hyphen, specific to the procedure
   (`db-backfill-batches`, not `helper`). It must not be a built-in command (`plan`, `learn`, `rewind`,
   `fork`, `browser`, `model`, `agents`, `skills`, `hooks`, `help`, `config`, `usage`, `permissions`,
   `effort`) and must not already name a skill or a draft.
   - Verify: `node .agents/skills/capture-skill/scripts/skill-draft.mjs list` does not show the name, and
     `.agents/skills/<name>/` does not exist.
3. **Scaffold the draft.**
   `node .agents/skills/capture-skill/scripts/skill-draft.mjs new <name> [--title "<Title>"]`
   This copies [references/skill-template.md](references/skill-template.md) to
   `.agents/skills/_drafts/<name>/SKILL.md` with `name`, today's date and the title filled in; the
   description, icon, the `Used by:` line and every step are left as `TODO` for you to write from the real run.
   - Verify: the command prints the new file's path and byte size.
4. **Write it from evidence, not from memory of "best practice".** Fill in, in order:
   - `Used by:` — who follows it in orchestrator mode: the orchestrator (planning, dispatch) and/or worker
     TypeNames (`implementer`, `test-engineer`, ...). A step a worker follows must never tell it to delegate,
     ask another agent, or edit files outside its OWNED FILES.
   - The one-sentence default + escape hatch, `## When to use` / `Do NOT use for` (be as specific as the
     sentence in step 1).
   - `## Checklist` — the copyable gates from the run.
   - `## Procedure` — the exact commands or tool calls that worked, each with a `Verify:` line stating
     what was actually observed (a command's output, an exit code, a file's new content) — never
     "should work".
   - `## Pitfalls` — what actually failed on the first try and the fix, with the reason.
   - `## Output` — the report template used, or the Worker Report body lines it produces.
   - `## References` — repo paths in backticks, or links into this draft's own `references/` if you add
     supporting files (a script, a longer cookbook) — bulk goes there, not into `SKILL.md`.
   - `## Provenance` — fill `Evidence:` with real commands and their results, files changed, and the
     original task in one line (with its T-ids). Leave `Status: draft`.
   - Keep the file at or under 250 lines; move bulk into `references/<name>/...` under the draft folder
     (it travels with it on promotion).
   - Verify: no sentence in the procedure describes something that is not backed by the brief's evidence or a
     command you ran yourself.
5. **Run the gate.** `node .agents/skills/capture-skill/scripts/skill-draft.mjs check <name>`.
   - Hard failures (bad frontmatter, `name` not matching the folder, over the line cap) must be fixed —
     they block promotion even with `--force`.
   - Soft issues (leftover `TODO`, missing icon, a missing section) should be fixed too; each one you
     leave is something the user must accept with `--force` at promotion time.
   - Verify: `CHECK: PASS` (soft issues are your call, but read every one).
6. **Re-read the whole draft** as if you had not seen the original run. Cut anything vague, restate any
   step that would confuse someone new to this repo — the same fresh-eyes discipline the `reviewer` worker
   applies to code (`.agents/skills/orchestrate/references/review-checklist.md`), applied here to prose.
   - Verify: every `Verify:` line names a concrete, checkable thing.
7. **Promotion (never by the scribe).** The scribe stops after step 6 and reports the draft. Promotion makes
   the skill live and slash-invocable, so it needs the user's explicit yes.
   - Orchestrator: show the user the Capture Report and the `check` output, and ask. On yes, dispatch one
     lane-S task: an `implementer` with OWNED FILES `.agents/skills/_drafts/<name>/**` and
     `.agents/skills/<name>/**`, OBJECTIVE "promote the approved draft <name>", and DONE WHEN "the promote
     command printed PROMOTE: DONE and doctor shows no error for the skill"; then a `reviewer` reads the
     promoted SKILL.md; then a `test-engineer` with the docs-only TEST brief
     (`.agents/skills/orchestrate/references/task-types.md` §docs-only: "run every command the promoted SKILL.md
     shows and report the output", plus `node .agents/scripts/verify.mjs` and `node .agents/scripts/doctor.mjs
     --quiet`), because TEST is never skipped after IMPLEMENT; then a `scribe` records the outcome in LEARN.
   - Implementer command: `node .agents/skills/capture-skill/scripts/skill-draft.mjs promote <name> --confirm`
     (add `--force` only if the brief says the user accepted the listed soft issues). It moves the folder
     to `.agents/skills/<name>/`, strips the two `disable-*` keys and the DRAFT comment, marks
     `Provenance` promoted, and runs the kit doctor.
   - On "not yet" or no answer: leave it under `_drafts/`. It is inert and safe to leave for later — say so
     in the Completion Report.
   - Verify: the tool prints one of `PROMOTE: DONE (doctor clean for this skill)`,
     `PROMOTE: DONE, but doctor found N warning(s) above - review them` (skill is live; report the
     warnings), or `PROMOTE: DONE, but doctor found N error(s) above - fix them next` (fix inside OWNED
     FILES, then re-run `node .agents/scripts/doctor.mjs` to confirm — no need to re-promote).
8. **Report** using the template below.

## Output
Scribe: the first line goes on the Learn Report's `Skill drafts:` line; a dedicated capture or promotion task puts
the whole block in its Worker Report body.
```
## Capture Report
- Draft: `.agents/skills/_drafts/<name>/SKILL.md` | promoted to `.agents/skills/<name>/SKILL.md`
- Source run: <1-sentence task this was captured from, with T-ids>
- Used by: <orchestrator | worker TypeNames>
- Check: `skill-draft.mjs check <name>` -> <CHECK: PASS | PASS (n soft issues) | FAIL>
- Promotion: awaiting user decision | promoted (doctor clean) | promoted (doctor warned: <finding>) | promoted (doctor found error: <finding>) | left as draft: <reason>
- Not done / risks: <list or "none">
```

## References
- Template: [references/skill-template.md](references/skill-template.md) (placeholders, `Used by:` line,
  draft-safety frontmatter, Provenance block)
- Script: `node .agents/skills/capture-skill/scripts/skill-draft.mjs --help` (`new`, `list`, `check`,
  `promote`; every command takes `--root <dir>` for use in another repo after `kit-install.mjs`)
- Worker contract: `.agents/agents/scribe.md`. LEARN phase and the orchestrator's rules:
  `.agents/rules/03-orchestration.md`, `/orchestrate`
- Kit validation the promote step runs: `.agents/scripts/doctor.mjs --help`
- Precursor: `/reflect` (flags the candidate in LEARN).
