# Root `AGENTS.md` template

Copy the block below, then replace every `<FILL: ...>` with a verified fact and delete this line and
the blockquote note. Target: **at most 3,500 bytes** total (`wc -c AGENTS.md`, or
`node .agents/skills/onboard-repo/scripts/check-agents-md.mjs`). This file is injected on EVERY turn -
project facts only, no advice, no kit documentation (that lives in `.agents/GEMINI.md`).

Rules while filling it in:
- Every version/command comes from a manifest, lockfile or `repo-map.mjs` output you actually read this
  session - never from memory. If `repo-map.mjs` could not detect something, write `<FILL: unknown -
  check manually>` rather than guessing, or drop the bullet.
- One line per fact. Cut generic framework knowledge (the kit's `guides/` and `fw-*.md` packs already
  cover that) - keep only what is true of THIS repo and would surprise a new session.
- Fold non-obvious pitfalls ("gotchas": a stale second lockfile, a broken `python3` stub, "not a git
  repo", missing CLI tools, a platform quirk) into `## Conventions` as their own bullets, or add a
  trailing `## Gotchas` (or `## Never`) section if there are more than two or three - either satisfies
  `check-agents-md.mjs`, which only WARNs if it finds neither.
- No YAML frontmatter on this file (a standalone `AGENTS.md`/`GEMINI.md` takes none - `.agents/docs/antigravity-spec.md`).
- Project facts only. NEVER add orchestrator, pipeline, agent-roster or skill-routing text here: it is
  injected on every turn next to `.agents/GEMINI.md` and `rules/03-orchestration.md`, which already carry it,
  and a second copy drifts. Kit behaviour -> `.agents/`; project facts -> here.
- Who writes it: an `implementer` during `/onboard-repo`; the `scribe` adds new facts (scripts, routes, env
  vars, dependencies) in a pipeline's LEARN phase. The orchestrator never edits it.

```markdown
# Project facts: <FILL: repo/package name>

Facts about this repository only, checked against its files on <FILL: YYYY-MM-DD>. Kit behaviour lives
in `.agents/GEMINI.md` and `.agents/rules/`. Refresh this file with `/onboard-repo` when the stack changes.

## Stack
- <FILL: language(s) + framework(s) and their exact versions from the manifest, e.g. "Laravel 11, PHP 8.3">
- <FILL: package manager, from the lockfile that is actually present - not the one you'd expect>
- <FILL: runtime/toolchain versions from .nvmrc / rust-toolchain.toml / go.mod / pyproject.toml, etc.>
- <FILL: any load-bearing config that changes how the project is built, e.g. "no tailwind.config.* - v4 uses @theme in app.css">

## Layout
- <FILL: `<dir>/` - what lives there, one line each, only the directories an agent will actually touch>
- <FILL: entry point(s) - where execution starts>
- <FILL: where tests live>
- <FILL: directories that are NOT product code (generated output, this kit's own `.agents/`, scratch notes)>

## Commands (<FILL: package manager>; run from the repo root, one per call)
- Install: `<FILL>`
- Dev / run: `<FILL>`
- Build: `<FILL>`
- Typecheck / lint / format: `<FILL>`
- Test (unit, then e2e if separate): `<FILL>`
- Everything: `<FILL: project's own all-in-one script if one exists, else>` `node .agents/scripts/verify.mjs`

## Conventions
- <FILL: idioms specific to this codebase - naming, error handling, import aliases, state management>
- <FILL: style/formatting tool and where its config lives>
- <FILL: gotchas - stale lockfiles, broken/missing CLI tools, "not a git repo", OS quirks, anything a
  fresh session would get wrong on the first try>
```

## Where each fact comes from
| Section | Primary source | Command |
|---|---|---|
| Stack | manifest + lockfile (never memorized versions) | `node .agents/scripts/repo-map.mjs` |
| Layout | repo-map's tree + entry-point detection | `node .agents/scripts/repo-map.mjs --json` (`.entryPoints`, `.routeDirs`, `.tests.locations`, `.config`) |
| Commands | manifest scripts repo-map already parsed per root | `node .agents/scripts/repo-map.mjs --json` (`.roots[].scripts`) |
| Conventions / gotchas | what you noticed while mapping - stale second lockfile, missing tool, unusual layout | your own observations this session, plus anything already in `.agents/memory/lessons.md` |

## Sizing it down to fit 3,500 bytes
1. Drop a bullet before you shorten a sentence - a missing fact is a smaller problem than a vague one.
2. Merge Layout bullets for sibling directories with the same one-line description.
3. Move anything reusable across many repos (a language idiom, not a repo fact) out entirely - it belongs
   in `.agents/guides/` or a `rules/lang-*.md`/`rules/fw-*.md` pack, not here.
4. A big monorepo: describe the repo-map roots and the shared tooling here, one line per package; drop
   per-package detail that does not fit. Never create a nested `AGENTS.md` (SKILL.md invariant 4).
