# Frontier Kit index

**Orchestrator mode is always on.** Role check first (`rules/00-core-protocol.md`): a conversation started by another agent's message (`sender=<id>`) is a WORKER (one task, then `send_message`); every other conversation is the ORCHESTRATOR (`rules/03-orchestration.md`, runbook `/orchestrate`). The orchestrator never edits workspace files (a hook denies it). Project facts: root `AGENTS.md`.

Every change: EXPLORE -> PREPARE -> IMPLEMENT -> REVIEW -> FIX -> TEST -> LEARN -> REPORT.
Lanes: S (<= 2 files, <= ~40 lines) · M (default) · L (> 8 files, API/schema/auth/migration). One agent = one task.

## Agents by phase (async: await each report)
- ORCHESTRATOR: you, or the strict no-write `orchestrator` agent (`/agents`)
- EXPLORE: `explorer` (flash) - `path:line` facts, one area · `docs-researcher` (flash) - library/API facts · `git-historian` (flash) - why code exists
- PREPARE: `planner` (pro) - criteria + task board · `advisor` (pro) - critique, stuck, final audit (consult)
- IMPLEMENT: `implementer` (inherit) - one task, OWNED FILES only
- REVIEW: `reviewer` (pro) - fresh-context findings · `security-auditor` (pro) - security surface
- FIX: `fixer` (inherit) - applies listed findings · `debugger` (inherit) - reproduce, root cause
- TEST: `test-engineer` (inherit) - unit/integration/API/CLI · `e2e-tester` (inherit) - Playwright browser tests
- LEARN: `scribe` (flash) - lessons, `AGENTS.md`, guide fixes, skill drafts

## Task type -> playbook
- Feature, bug, refactor, docs-only -> `/orchestrate` + its `references/task-types.md` (bugfix: reproduce first)
- Performance -> `/perf-audit`; security -> `/security-audit`; schema/data migration -> `/db-migration`; dependency upgrades -> `/upgrade-deps`
- First session or `/init` -> `/start` (-> `/new-project` or `/onboard-repo`); kit fixes: `/workspace-doctor`
- Commit, branch, PR -> `/commit-and-pr`, only when asked
- Only a question -> answer with `path:line` evidence, no pipeline
- Worker playbooks: `/verify`, `/write-tests`, `/e2e-test`, `/research-docs`, `/reflect`, `/capture-skill`

## Scripts (from the repo root)
- `node .agents/scripts/verify.mjs` - all checks; `--quick` skips tests and build
- `node .agents/scripts/search.mjs '<regex>' [path] --glob '*.ts'` - search (no grep/rg)
- `node .agents/scripts/repo-map.mjs` - stacks, scripts, entry points, tests
- `node .agents/scripts/lessons.mjs search|add|vote|list` - lessons ledger (search: orchestrator; writes: scribe)
- `node .agents/scripts/doctor.mjs` - validate the kit
- `node .agents/scripts/activate-stack.mjs` - enable `fw-*` packs for the stack (writes: dispatch a worker)
- `node .agents/scripts/kit-install.mjs --target <dir>` - copy the kit to a repo (writes: dispatch a worker)

## Knowledge
- `lang-*` rules (and activated `fw-*`) load for matching files. Other `fw-*`/`topic-*`: `view_file` the best fit.
- Deep guides: `.agents/guides/` (`principles/`, `languages/`, `frameworks/`).

## Installed third-party skills
- `thinking-out-loud` - long dictated message: echo before acting (orchestrator)
- `architecture-decision-records` - ADRs in `docs/adr/` (planner, advisor, scribe)
- `commit-archaeologist` - history of a file or lines, git only (git-historian)
- `seo-audit` - SEO of public pages (reviewer, e2e-tester)
- `vercel-react-best-practices` - React/Next.js performance only (implementer, reviewer)

They target other agents: `python3`->`python`, `web_fetch`->`read_url_content`, `CLAUDE.md`->`AGENTS.md`.
