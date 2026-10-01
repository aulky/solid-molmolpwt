---
name: {{name}}
description: {{description}}
disable-slash-command: true
disable-model-invocation: true
metadata:
  icon: {{icon}}
---
<!-- DRAFT (inert): skills load only from .agents/skills/<name>/SKILL.md, one level deep, so this file under
_drafts/ is never indexed. The two disable-* keys are a second safety net. Promote only after approval with:
node .agents/skills/capture-skill/scripts/skill-draft.mjs promote {{name}} --confirm -->

# {{title}}

Used by: TODO: `orchestrator` (planning, dispatch) and/or worker TypeNames (`implementer`, `test-engineer`, ...)

TODO: one sentence on what this skill achieves. Then state the default and its escape hatch, e.g.
"Use <tool>. Only if <condition>, use <alternative>."

## When to use
- TODO: trigger situation 1, in the words a user would type
- TODO: trigger situation 2

Do NOT use for:
- TODO: a nearby task, and the skill to use instead (`/other-skill`)

## Checklist
Copy this and tick items as you go:
```
- [ ] TODO: gate 1 (a precondition that must hold)
- [ ] TODO: gate 2 (a result you can observe)
- [ ] `node .agents/scripts/verify.mjs` passes after the last edit
- [ ] Report written
```

## Procedure
1. **TODO: step name.** TODO: the exact command or action that worked in the original run.
   - Verify: TODO: a command and its expected output, or an observable state.
2. **TODO: step name.** TODO: the action.
   - Verify: TODO
3. **Verify.** Run `node .agents/scripts/verify.mjs` and follow `/verify` for failures.
   - Verify: `VERIFY: PASS` after the last edit.

## Pitfalls
- TODO: the failure hit during the original run → the fix that worked (with the reason)

## Output
```
## TODO: Report title
- Changed: `<path>` — <why>
- Verification: `<command>` → <result>
- Not done / risks: <list or "none">
```

## References
- TODO: repo paths in backticks, or relative links to files in this skill's references/ folder

## Provenance
- Captured: {{date}} by /capture-skill from a successful run.
- Evidence: TODO: commands that ran and their results, files changed, and what the task was
- Status: draft
