---
trigger: always_on
description: "Curated, verified lessons for this workspace (platform, project, tooling), promoted from .agents/memory/lessons.md. Owner: the scribe (LEARN phase)."
---
# Curated lessons

Promoted from `.agents/memory/lessons.md` (helpful >= 2 and harmful 0, or a verified high-severity fact). Keep this file at most 4,500 B. Only the scribe changes it (LEARN phase, via `/reflect`).

## Platform (Antigravity)
- `invoke_subagent` is async: after calling it, end your turn or do only independent work, and answer only after the subagent's message arrives. (L-0001)
- Rules live flat in `.agents/rules/` with YAML frontmatter and a valid `trigger`. `globs` is one quoted comma string of basename patterns (`"**/*.ts,**/*.tsx"`); YAML lists and patterns with folders never match. (L-0003)
- Headless `agy -p` loads workspace customizations only when bound to a project (`--new-project` or `--project`). (L-0007)

## Project
- None recorded yet.

## Tooling (this machine)
- Run Python as `python`, never `python3` (a Microsoft Store stub). Set `$env:PYTHONUTF8 = "1"` for scripts that print Unicode. (L-0002)
- `rg`, `grep` and `gh` are not installed: search with `node .agents/scripts/search.mjs` (or `git grep` inside a git repo). (L-0004)

## User preferences
- None recorded yet.

---
Hardest: wait for subagent messages (L-0001) · `python`, not `python3` (L-0002).
