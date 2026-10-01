# Lessons ledger

Append-only memory of verified, reusable lessons for this workspace. It is NOT always-on: search it before planning.
- Search: `node .agents/scripts/lessons.mjs search <query>` or `node .agents/scripts/lessons.mjs list --scope <scope>`
- Add: `node .agents/scripts/lessons.mjs add --scope <scope> --text "When X, do Y because Z" --evidence "<path:line | command | URL>"`
- Vote: `node .agents/scripts/lessons.mjs vote <id> helpful|harmful` (never edit the counters by hand).
- Line format: `- [L-NNNN] scope:<scope> | +<helpful> -<harmful> | <YYYY-MM-DD> | <lesson> | evidence: <where>`
- Scopes: `platform`, `project`, `tooling`, `user`, or a stack id (`typescript`, `solidjs`, `rust`, ...).
- One lesson per line: a trigger, an action and a reason. No secrets, tokens, personal data or file contents.
- Never rewrite or delete lines to tidy up. Retire an obsolete lesson: `node .agents/scripts/lessons.mjs retire <id> --reason "<why>"`.
- Promotion: helpful >= 2 and harmful 0 (or a verified high-severity fact) -> `.agents/rules/90-lessons.md` (at most 4,500 B) by the scribe in the LEARN phase (`/reflect`); other agents only search.
- Seeds L-0001..L-0007 were verified while building the kit and promoted as high-severity facts (L-0005 and L-0006 were facts about the kit's original host app and were dropped from the template).

## Active
- [L-0001] scope:platform | +0 -0 | 2026-09-24 | When you call invoke_subagent, end your turn (or do only independent work) and wait for the subagent's send_message reply before answering, because the call is async and returns before the result exists | evidence: .agents/docs/antigravity-spec.md (Custom agents; probe runs: parent answered null before the child replied)
- [L-0002] scope:tooling | +0 -0 | 2026-09-24 | On this machine run Python as `python`, never `python3` (a Microsoft Store stub that only prints "Python was not found"); set PYTHONUTF8=1 for scripts that print Unicode | evidence: `python3 --version` -> Store stub message; `python --version` -> Python 3.14.2
- [L-0003] scope:platform | +0 -0 | 2026-09-24 | When adding a rule, put it directly in .agents/rules/ (no subfolders) with YAML frontmatter holding a valid trigger (always_on, glob, model_decision, manual); write globs as ONE quoted comma string of basename patterns like "**/*.ts,**/*.tsx", because other forms are silently ignored | evidence: .agents/docs/antigravity-spec.md (Rules; probes 4-5)
- [L-0004] scope:tooling | +0 -0 | 2026-09-24 | To search code use `node .agents/scripts/search.mjs` (or `git grep` inside a git repo), because `rg`, `grep` and `gh` are not installed for PowerShell | evidence: PowerShell Get-Command rg, grep, gh -> not found
- [L-0007] scope:platform | +0 -0 | 2026-09-24 | When testing the kit headless, bind `agy -p` to a project (`--new-project` or `--project`), because in an unregistered folder it runs in a scratch dir without workspace customizations | evidence: .agents/docs/antigravity-spec.md (Discovery / loading)

## Retired
