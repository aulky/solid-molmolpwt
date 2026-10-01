---
trigger: model_decision
description: "Apply when restructuring code without changing behaviour (rename, extract, move, split, dedupe, simplify), or before deleting or rewriting code that looks dead, odd, or like a workaround."
---
# Refactoring - topic rule
Principles guide: `.agents/guides/principles/refactoring.md` - read it for the refactoring catalog and larger restructurings. Pipeline: `/orchestrate`, section `refactor` of `.agents/skills/orchestrate/references/task-types.md` (history by `git-historian`, baseline and characterization tests by `test-engineer` before and after, one catalog step per `implementer` task). History tool: the installed `commit-archaeologist` skill.

## Skip when
The task is a feature or bug fix and the code around it is merely untidy. Do not refactor unrequested code; report it as `OUT OF SCOPE:` instead.

## Protocol
1. Scope: state the goal (what becomes easier) and the boundary (files or modules). A step is a refactor OR a behaviour change, never both.
2. Chesterton's fence - before deleting or rewriting odd code (workaround, `TODO`/`HACK`/`FIXME`, duplicate logic, strange condition, magic value), find out why it exists:
   - `git log -L <start>,<end>:<path> --no-patch --format="%h %ad %an %s" --date=short`
   - `git log --follow --format="%h %ad %s" --date=short -- <path>`
   - `git blame -L <start>,<end> -- <path>`; look for reverts, issue refs (`#123`), and tests that cover it.
   - Not a git repository: search tests, docs and comments; still unexplained -> report `INPUT GAP:` (the orchestrator asks the user) and do not delete it.
   - Record: evidence, inference (labelled Inferred), confidence (high/medium/low), what would confirm it.
3. Safety net: run the existing tests for the area and compare with the brief's `Baseline:`. Thin coverage and no characterization tests yet -> report `INPUT GAP:` (a test-engineer task pins CURRENT behaviour first, odd outputs included); never refactor blind.
4. Take small catalog steps: rename, extract function or variable, inline, move, introduce parameter object, replace conditional with a table or polymorphism, split phase. After EACH step run `node .agents/scripts/verify.mjs --quick` (typecheck + lint); full verify at the end.
5. Before a rename, move or delete, find every reference: `node .agents/scripts/search.mjs '\bOldName\b'` over the whole workspace. Include strings, configs, templates, docs, dynamic imports, reflection, serialized data and public API consumers.
6. Stop when the goal is met. Worker Report: the structural change and the evidence that behaviour is unchanged (same tests passing before and after).

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER change behaviour during a refactor (error messages, ordering, rounding, defaults, public signatures) - regressions become indistinguishable from intent. Instead: a separate, approved behaviour-change step.
2. NEVER edit test assertions to make a refactor pass - tests are the spec. Instead: fix the refactor. Tests that reach into moved private internals may be updated mechanically; say so in the report.
3. NEVER delete "dead" code without proof it is unreferenced (search + history) - reflection, config and external callers are invisible to a quick grep.
4. NEVER big-bang rewrite. Instead: strangler steps - new path beside the old, migrate callers one by one, delete the old path last.
5. Rule of three: do not extract a shared abstraction from two similar snippets unless they must change together.

## Pitfalls Flash models get wrong
- "While I'm here" renames across 20 files in a bug-fix diff.
- Merging two functions that look alike but differ in one edge case.
- Moving a file and missing a re-export, barrel file or path alias (`~/*`).
- Deleting a retry loop or sleep that exists because of a documented race.

## Example - bad -> good
```text
BAD:  "Cleaned up utils.ts" - 14 files changed, exports renamed, a "weird" retry loop
      removed, 2 tests edited until green.
GOOD: step 1  characterization test: parseDate("") -> null (current behaviour)
      step 2  extract parseIsoDate()                    verify --quick PASS
      step 3  move it to date.ts, update 6 imports found by search.mjs   verify --quick PASS
      kept    retry loop: git log -L shows a1b2c3d "retry: S3 eventual consistency (#412)"
      final   node .agents/scripts/verify.mjs          VERIFY: PASS
```

## Before finishing
- [ ] Behaviour unchanged: the same tests pass before and after (name them)
- [ ] Every deleted or rewritten odd piece has a recorded history check
- [ ] No unrequested files touched; full verify passes
